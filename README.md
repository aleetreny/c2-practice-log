# C2 Practice Log

Single-owner Cambridge C2 practice tracker. The app lets you fill mock answer sheets, save attempts, and review progress by section and exam part.

The Vocabulary and Review areas include the deduplicated C2 Cloud bank from Notion pages 01–03 and 05–07. New entries, edits, hidden entries, and review familiarity use the same authenticated Supabase store as practice attempts, with `localStorage` as the offline backup.

## Persistence

The deployed app runs on GitHub Pages and stores progress in Supabase.

- Supabase Auth handles sign in with email and password.
- `public.c2_attempts` stores one row per saved attempt.
- Row Level Security is enabled, so each authenticated user can only read and write their own attempts.
- The browser also keeps a `localStorage` copy as a temporary backup. After sign in, local attempts are merged into Supabase.

The frontend uses the Supabase anon key, which is safe to publish only because RLS policies protect the table. Never put a Supabase service role key in this app.

## Local Check

```bash
npm run check
```
