import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * One-click unsubscribe (RFC 8058). Mail clients POST here from the
 * List-Unsubscribe header without showing a page. GET is deliberately not
 * handled so link scanners cannot unsubscribe people.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unsubscribe_digest", { token });
  if (error || !data) return NextResponse.json({ error: "invalid token" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
