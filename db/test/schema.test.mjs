// Runs db/schema.sql on PGlite (Postgres in WebAssembly) with a stand-in for
// Supabase's auth schema, then checks every RLS rule as anon and as two users.
// Run: cd db/test && npm ci && npm test
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";

const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const db = new PGlite();
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) failures++; };
async function rejects(sql, msg, params = []) {
  try { await db.query(sql, params); ok(false, msg + " (was allowed)"); }
  catch (e) { ok(true, `${msg} -> ${e.message.split("\n")[0]}`); }
}

// Minimal stand-in for what Supabase provides before schema.sql runs
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
`);

await db.exec(schema);
await db.exec(schema);
ok(true, "schema.sql runs twice without error");

// Market data (as the pipeline would write it)
await db.exec(`
  INSERT INTO halal_universe (ticker, company_name, is_active) VALUES ('OGDC','Oil & Gas Dev', true), ('OLD','Delisted', false);
  INSERT INTO halal_universe (ticker, is_active) SELECT 'T' || g, true FROM generate_series(1, 60) g;
  INSERT INTO price_history (ticker, trade_date, close_price, volume) VALUES
    ('OGDC', CURRENT_DATE - 2, 100, 1000), ('OGDC', CURRENT_DATE - 1, 110, 2000);
  INSERT INTO technical_indicators (ticker, trade_date, rsi_14) VALUES ('OGDC', CURRENT_DATE - 1, 72.5);
  INSERT INTO auth.users (id, email) VALUES
    ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
    ('22222222-2222-2222-2222-222222222222', 'b@example.com');
`);
const U1 = "11111111-1111-1111-1111-111111111111", U2 = "22222222-2222-2222-2222-222222222222";

ok((await db.query("SELECT count(*)::int n FROM profiles")).rows[0].n === 2, "sign-up trigger creates profiles");
await db.exec(`UPDATE auth.users SET email = 'a2@example.com' WHERE id = '${U1}'`);
ok((await db.query(`SELECT email FROM profiles WHERE id = '${U1}'`)).rows[0].email === "a2@example.com", "email change syncs to profile");

const snap = (await db.query("SELECT * FROM latest_snapshot WHERE ticker = 'OGDC'")).rows[0];
ok(Number(snap.close_price) === 110 && Number(snap.prev_close) === 100 && Number(snap.change_1d_pct) === 10 && Number(snap.rsi_14) === 72.5,
   `latest_snapshot row correct (close ${snap.close_price}, prev ${snap.prev_close}, 1d ${snap.change_1d_pct}%, rsi ${snap.rsi_14})`);
ok((await db.query("SELECT count(*)::int n FROM latest_snapshot WHERE ticker = 'OLD'")).rows[0].n === 0, "latest_snapshot excludes inactive tickers");

// --- as signed-in user 1
await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${U1}', false);`);
ok((await db.query("SELECT count(*)::int n FROM latest_snapshot")).rows[0].n === 61, "signed-in user reads market data via view");
await db.query("INSERT INTO watchlists (ticker) VALUES ('OGDC')");
ok(true, "user adds active ticker to own watchlist (user_id defaults to auth.uid())");
await rejects("INSERT INTO watchlists (ticker) VALUES ('OLD')", "user cannot add inactive ticker");
await rejects(`INSERT INTO watchlists (user_id, ticker) VALUES ('${U2}', 'T1')`, "user cannot write another user's watchlist");
await db.query("UPDATE profiles SET digest_frequency = 'weekly'");
ok((await db.query("SELECT digest_frequency f FROM profiles")).rows[0].f === "weekly", "user updates own digest settings");
await rejects("UPDATE profiles SET email = 'x@evil.com'", "user cannot change profile email");
await rejects("UPDATE profiles SET unsubscribe_token = gen_random_uuid()", "user cannot change unsubscribe token");
ok((await db.query("SELECT count(*)::int n FROM profiles")).rows[0].n === 1, "user sees only own profile");
await rejects("INSERT INTO digest_log (user_id, digest_date, status) VALUES (auth.uid(), CURRENT_DATE, 'sent')", "user cannot write digest_log");
await rejects("INSERT INTO price_history (ticker, trade_date) VALUES ('OGDC', CURRENT_DATE)", "user cannot write market data");
for (let i = 1; i <= 49; i++) await db.query(`INSERT INTO watchlists (ticker) VALUES ('T${i}')`);
ok(true, "user fills watchlist to 50");
await rejects("INSERT INTO watchlists (ticker) VALUES ('T50')", "51st watchlist entry rejected");
await db.query("INSERT INTO portfolio (ticker, quantity, average_buy_price) VALUES ('OGDC', 10, 100)");
ok(true, "user adds own portfolio row");

// --- as signed-in user 2
await db.exec(`SELECT set_config('request.jwt.claim.sub', '${U2}', false);`);
ok((await db.query("SELECT count(*)::int n FROM watchlists")).rows[0].n === 0, "user 2 cannot see user 1's watchlist");
ok((await db.query("SELECT count(*)::int n FROM portfolio")).rows[0].n === 0, "user 2 cannot see user 1's portfolio");
await db.query("INSERT INTO portfolio (ticker, quantity, average_buy_price) VALUES ('OGDC', 5, 90)");
ok(true, "user 2 can hold the same ticker (unique per user, not global)");
const r = await db.query("DELETE FROM watchlists WHERE ticker = 'OGDC'");
ok(r.affectedRows === 0, "user 2 cannot delete user 1's watchlist rows");

// --- anonymous
await db.exec("RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claim.sub', '', false);");
ok((await db.query("SELECT count(*)::int n FROM halal_universe")).rows[0].n === 0, "anon cannot read market data");
ok((await db.query("SELECT count(*)::int n FROM profiles")).rows[0].n === 0, "anon cannot read profiles");
const dir = await db.query("SELECT * FROM company_directory()");
ok(dir.rows.length === 61 && !dir.rows.some((r) => r.ticker === "OLD"), "anon can list active companies via company_directory()");
ok(Object.keys(dir.rows[0]).sort().join() === "company_name,is_kmi_30,sector,ticker", "company_directory exposes no price or market-cap columns");
await db.exec("RESET ROLE");
const token = (await db.query(`SELECT unsubscribe_token t FROM profiles WHERE id = '${U1}'`)).rows[0].t;
await db.exec("SET ROLE anon");
const unsub = (await db.query("SELECT unsubscribe_digest($1) AS r", [token])).rows[0].r;
const bogus = (await db.query("SELECT unsubscribe_digest(gen_random_uuid()) AS r")).rows[0].r;
await db.exec("RESET ROLE");
const enabled = (await db.query(`SELECT digest_enabled e FROM profiles WHERE id = '${U1}'`)).rows[0].e;
const other = (await db.query(`SELECT digest_enabled e FROM profiles WHERE id = '${U2}'`)).rows[0].e;
ok(unsub === true && bogus === null && enabled === false && other === true, "anon unsubscribe by token affects only that user");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
