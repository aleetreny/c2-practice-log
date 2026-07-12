# C2 Practice Log

A Cambridge C2 Proficiency exam simulator and study workspace: real Use of English, Reading, Listening and Writing practice banks, answer sheets, guided correction, progress analytics and adaptive review in one static web app.

**Live app:** [aleetreny.github.io/c2-practice-log](https://aleetreny.github.io/c2-practice-log/)

## The learning loop

Practice Log is built around the work that happens after answering a question:

1. Choose a real paper from **Exams**, or open a blank answer sheet from **Practice**.
2. Work under timed conditions in a computer-based-exam layout.
3. Mark automatically where an answer key is available, or lock and self-correct the sheet.
4. Save correct answers, useful notes and Writing feedback.
5. Track scale-score trends and weak exam parts in **Progress**.
6. Bring language and recurring mistakes back through **Review**.

## Real exam repository

The `Exams` workspace turns the application into a reusable practice library without changing the existing history model.

### Use of English

- 24 full papers covering Parts 2, 3 and 4
- 20 additional focused Part 4 drills
- All 44 source sets reconstructed from real logged exercises but presented as fresh, unattempted practice
- Split-screen source and answer panels, timer and automatic marking for Parts 2 and 3
- Accurate 0–2 self-marking against the supplied key for Part 4 transformations
- Full papers feed the normal scale-score history; focused drills stay outside aggregate score metrics

### Reading

- 12 complete 44-mark papers combining Parts 1, 5, 6 and 7
- 372 rendered questions with checked answer keys
- Split-screen source text and question panels modelled on computer-based exam software
- Part 6 paragraphs can be dragged directly into the original text and removed back to a stable A–H bank
- Part navigation, live completion counts, timer and automatic marking
- Full papers use all 44 available marks; the incomplete Test 12 retains a clearly labelled normalised estimate
- Full source text, submitted answers and answer key preserved in the saved attempt

### Listening

- 33 full video-led tests displayed consecutively as Tests 1–33
- Playlist positions are resolved through the YouTube IFrame Player API; incomplete source Tests 24 and 25 are skipped internally
- The video supplies the audio and on-screen questions while the app keeps a 30-answer sheet alongside it
- Local question numbers 1–30, manual Correct/Missed grading, corrected-answer fields and notes
- Wide-screen working mode, top-mounted Grade action and a direct playlist fallback

### Writing

- 14 paired task sets and 28 tasks in total
- Four additional Part 1 essays combined deterministically with the existing 14 Part 2 tasks
- Two source texts shown beside the Part 1 editor
- Compact one-word topic previews avoid revealing source-text titles or full prompts
- 90-minute timer, live word limits, Writing toolkit and copyable assessment prompt
- Cambridge criteria controls for Content, Communicative Achievement, Organisation and Language

The bank contains no Speaking material.

## Public demo and private accounts

Visitors who are not signed in see an interactive snapshot of Aleetreny's preparation data: 84 saved practices plus example corrections, vocabulary and review history. They can also explore every exam-bank paper.

The public demo and account workspaces are deliberately separate:

- Demo changes are temporary and disappear on reload.
- A newly created account starts with no attempts, personal vocabulary or review ratings.
- Browser backups are namespaced by the Supabase user ID.
- Supabase Row Level Security keeps each user's online rows private.
- Signing out immediately returns to the public demo.

The published demo and exam-bank assets contain study material only. Session tokens, passwords and Supabase credentials are never included.

## Other features

- Blank answer sheets for Use of English, Reading, Listening and Writing
- Full and focused partial-practice modes
- Guided self-correction, correct-answer fields and error notes
- Cambridge scale-score conversion and grade bands
- Progress dashboard with trends, pass rate, part breakdowns and saved-attempt review
- Writing lab with essay planning, situation language and text-type guidance
- Searchable curated vocabulary plus a personal language bank
- Browser-based pronunciation
- Adaptive vocabulary and exercise-error review
- Email/password accounts with cloud sync and offline browser backup
- Responsive layout, public About guide and interactive seven-step tour

## Run locally

The application is framework-free. Node.js 18 or newer is only required for data generation and audits.

```bash
git clone https://github.com/aleetreny/c2-practice-log.git
cd c2-practice-log
python -m http.server 4173
```

Open [http://localhost:4173](http://localhost:4173), then run:

```bash
npm run check
```

No package installation or frontend build is required.

## Rebuilding the exam bank

The original Markdown imports are intentionally ignored by Git. The generated, browser-ready `exam-bank-data.js` is committed and deterministic.

To regenerate it, place these files at the repository root:

```text
cambridge_c2_reading_12_tests_polished.md
c2_listening_youtube_embeds_corrected.md
c2_listening_playlist_indexes.json
C2_Proficiency_Writing_Practice_Bank.md
C2_Writing_Part_1_Practice_4_Tests.md
```

Use of English and the first 11 Reading Part 1 sources are recovered from the sanitised `demo-data.js` snapshot, which remains committed because it also powers the public demo. The final corrected Part 1 source is stored separately in `data/reading-part1-test12.json`; candidate answers and account data are excluded.

Then run:

```bash
npm run build:exam-bank
npm run audit:exam-bank
```

The generator rejects incomplete Reading structures, missing logged answer keys, inconsistent Listening playlist indexes and any Writing pairing that does not contain 14 unique tasks on each side. A source digest in the generated asset makes accidental drift visible.

## Supabase setup

Authentication and persistence use Supabase directly from the static frontend. Create a project, enable email/password authentication and run:

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

Update `SUPABASE_CONFIG` near the top of `app.js` with the project URL and anon key, then add the production and development URLs to the allowed Auth redirects.

The anon key is expected in a browser application. Its safety depends on Row Level Security; never publish a `service_role` key.

## Deployment

Production is served by GitHub Pages from `gh-pages`. The deploy branch contains only browser assets and needs no build step. After changing JavaScript or CSS, update its query-string version in `index.html` so returning visitors receive the new files.

For a fork, also update:

- `SUPABASE_CONFIG` and allowed Auth redirects
- the live and clone URLs in this README
- the public demo snapshot, if different example data is desired
- the Listening URLs, if using a different video collection

## Project map

```text
index.html                    App shell and asset loading
app.js                        Shared UI, auth, persistence and analytics
exam-bank.js                  Exam library and objective-paper simulators
exam-bank.css                 Exam library and computer-based-paper layouts
exam-bank-data.js             Generated Use of English, Reading, Listening and Writing bank
demo-data.js                  Sanitised public account snapshot
data/reading-part1-test12.json  Sanitised final Reading Part 1 source and key
questions.js                  Exam metadata and answer-sheet definitions
attempt-data.js               Completion and partial-practice rules
study-review-data.js          Review selection and study-data migration
vocabulary-data.js            Built-in vocabulary bank
writing-data.js               Writing lab content
styles.css                    Core responsive application styles
scripts/build-exam-bank-data.js  Deterministic source/log importer
scripts/audit-*.js            Data, UI, privacy and isolation audits
```

## Quality and privacy checks

`npm run check` validates JavaScript syntax, all 44 Use of English sets, all 12 Reading papers and keys, all 33 Listening records, all 28 Writing tasks, vocabulary integrity, Writing resources, migrations, partial practice, Error Log behaviour and the public demo/account boundary.

The exam-bank audit proves question ranges, all 12 Reading Part 1 keys, Part 6 gaps, Part 7 section references, playlist indexes and unique Writing pairings. The public-demo audit rejects session and refresh-token fields.

## Disclaimer

This independent educational project is not affiliated with or endorsed by Cambridge University Press & Assessment. Cambridge names are used only to identify the exam format. Listening media is hosted by YouTube and remains subject to the availability and terms of its respective channel.

## License

[MIT](LICENSE)
