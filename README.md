# C2 Practice Log

A focused Cambridge C2 Proficiency workspace for completing mock answer sheets, correcting them carefully and turning every attempt into a practical study plan.

**Live app:** [aleetreny.github.io/c2-practice-log](https://aleetreny.github.io/c2-practice-log/)

## Why it exists

Mock scores are useful, but the correction behind them is where most of the learning happens. C2 Practice Log keeps the whole loop in one place:

1. Complete a paper with an optional timer.
2. Lock the answers and self-correct every item.
3. Save correct answers and short error notes.
4. Track Cambridge scale-score trends and weak exam parts.
5. Bring mistakes and vocabulary back through adaptive review.

## Public demo and private accounts

Visitors who are not signed in see a public, interactive snapshot of Aleetreny's real preparation data. It contains 84 saved practices plus example corrections, vocabulary and review history, so every area of the app is useful on first visit.

The demo and account workspaces are deliberately separate:

- Demo changes are temporary and disappear on reload.
- A newly created account starts with no attempts, personal vocabulary or review ratings.
- Browser backups are namespaced by the Supabase user ID.
- Supabase Row Level Security keeps each user's online rows private.
- Signing out immediately returns to the public demo.

The published demo asset contains study data only. Session tokens, passwords and Supabase user credentials are never included.

## Features

- Practice answer sheets for Use of English, Reading, Listening and Writing
- Full and partial-practice modes with a built-in timer
- Guided self-correction, model-answer fields and error notes
- Cambridge scale-score conversion and grade bands
- Progress dashboard with trends, pass rate, part breakdowns and attempt history
- Detailed saved-attempt editing and deletion
- Writing lab with essay planning, situation language and text-type guidance
- Searchable curated vocabulary plus a personal language bank
- Pronunciation using the browser speech engine
- Adaptive vocabulary and exercise-error review
- Email/password accounts with cloud sync and offline browser backup
- Responsive layout, public About guide and an interactive six-step tour

## Run locally

The app is intentionally framework-free. Node.js 18 or newer is only required for the audits.

```bash
git clone https://github.com/aleetreny/c2-practice-log.git
cd c2-practice-log
python -m http.server 4173
```

Open [http://localhost:4173](http://localhost:4173), then run the full validation suite separately:

```bash
npm run check
```

No package installation is required for the application itself.

## Supabase setup

Authentication and persistence use Supabase directly from the static frontend. Create a project, enable email/password authentication and run the following in the SQL editor:

```sql
create table public.c2_attempts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  section text not null,
  correct integer not null default 0,
  total integer not null default 0,
  percentage numeric not null default 0,
  scale_score integer not null default 0,
  answers jsonb not null default '{}'::jsonb,
  graded_states jsonb not null default '{}'::jsonb,
  attempted_at timestamptz not null default now()
);

alter table public.c2_attempts enable row level security;

create policy "Users manage their own C2 data"
on public.c2_attempts
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index c2_attempts_user_date_idx
on public.c2_attempts (user_id, attempted_at);
```

Then update `SUPABASE_CONFIG` near the top of `app.js` with the project URL and anon key. Add both the production URL and any local development URL to the allowed redirect URLs in Supabase Auth.

The anon key is designed to be present in a browser app. Its safety depends on Row Level Security; never place a `service_role` key in this repository.

## Deployment

The production site is served by GitHub Pages from the `gh-pages` branch. Because the project is static, deployment consists of publishing the repository files without a build step. After changing JavaScript or CSS, update the corresponding query-string version in `index.html` so returning visitors receive the new asset.

For a fork, also update:

- `SUPABASE_CONFIG` and the allowed Auth redirect URLs
- the live link and clone URL in this README
- the public demo snapshot if different example data is desired

## Project map

```text
index.html                 App shell and asset loading
app.js                     UI, authentication, persistence and analytics
demo-data.js               Sanitised public example snapshot
questions.js               Exam metadata and question definitions
attempt-data.js             Attempt completion and partial-practice rules
study-review-data.js        Review selection and migration logic
vocabulary-data.js          Built-in vocabulary bank
writing-data.js             Writing lab content
styles.css                  Responsive application styles
scripts/audit-*.js          Data, UI and isolation audits
data/vocabulary-*.json      Vocabulary enrichment source data
```

## Quality and privacy checks

`npm run check` validates JavaScript syntax, vocabulary integrity, writing resources, study-data migrations, partial practice, Error Log behaviour and the public demo/account boundary. The public-demo audit also rejects session and refresh-token fields in `demo-data.js`.

## License

[MIT](LICENSE)
