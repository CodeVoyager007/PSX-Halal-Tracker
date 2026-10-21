# Sign-in email templates

Supabase sends the sign-in emails, so their design lives in the Supabase dashboard,
not in this repository's code. To apply it:

1. Supabase dashboard → **Authentication → Emails → Templates**.
2. **Magic Link** template (returning users):
   - Subject: `Your sign-in link for PSX Halal Tracker`
   - Body: paste the whole of `sign-in.html`.
3. **Confirm signup** template (first-time users):
   - Subject: `Welcome to PSX Halal Tracker: confirm your email`
   - Body: paste the same `sign-in.html`.
4. Save each.

`{{ .ConfirmationURL }}` and `{{ .Email }}` are filled in by Supabase. If the site
moves to a new domain, update the links and the logo URL in the file.
