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
- Split-screen source and answer panels, timer and automatic marking for Part 3
- Guided final review for open-cloze Part 2 answers and accurate 0–2 self-marking for Part 4 transformations
- Full papers feed the normal scale-score history; focused drills stay outside aggregate score metrics

### Reading

- 12 complete 44-mark papers combining Parts 1, 5, 6 and 7
- 372 rendered questions with checked answer keys
- Split-screen source text and question panels modelled on computer-based exam software
- Part 6 paragraphs can be dragged directly into the original text and removed back to a stable A–H bank
- Part navigation, live completion counts, timer and automatic marking
- Every paper uses all 44 available marks, including the complete Part 1 source added to Test 12
- Full source text, submitted answers and answer key preserved in the saved attempt

### Listening

- 33 full video-led tests displayed consecutively as Tests 1–33
- Playlist positions are resolved through the YouTube IFrame Player API; incomplete source Tests 24 and 25 are skipped internally
- The video supplies the audio and on-screen questions while the app keeps a 30-answer sheet alongside it
- Local question numbers 1–30 with answer keys mapped internally to global questions 54–83
- Automatic Correct/Missed marking for Parts 1, 3 and 4; Part 2 accepts `/` alternatives and stays open for manual confirmation beside the model answer
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
- Browser backups are namespaced by the Neon Auth user ID.
- Neon Postgres Row Level Security keeps each user's online rows private.
- Signing out immediately returns to the public demo.

The published demo and exam-bank assets contain study material only. Session tokens, passwords and Neon database credentials are never included.

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
- Responsive layout, public About guide and a focused seven-step tour of the main navigation

## Guided public tour

The **About** button opens a concise explanation of the public demo and private-account boundary. Its short guided tour introduces the live interface without covering or repositioning the page:

- Practice
- Exams
- Progress
- Writing
- Vocabulary
- Review
- profile and account creation

The compact panel stays in the corner while each top-level page opens normally. It supports Back/Next buttons, Left/Right arrow keys and Escape.

## Run locally

The application is framework-free. Node.js 20 or newer is only required for data generation and audits.

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

## Neon backend

Authentication and persistence use Managed Better Auth and the Neon Data API directly from the static frontend. The application contains only the public Auth and Data API URLs; it never contains a PostgreSQL connection string, an administrative key or a server credential.

The complete, repeatable database definition is in `neon/schema.sql`. It creates:

- `public.c2_attempts`, preserving the existing IDs, dates, scores and JSON payloads;
- `public.c2_user_mappings`, which records the explicit legacy-to-Neon user mapping without storing an email address;
- forced Row Level Security with separate SELECT, INSERT, UPDATE and DELETE policies based on `auth.user_id()`;
- explicit grants for `authenticated` and no private-data grants for `anonymous`.

Neon Auth manages email/password sign-up, persistent sessions, refresh and password recovery. Password hashes from the previous provider were not compatible with Managed Better Auth, so the migrated identity keeps the same email and establishes a new password through the one-time-code recovery flow. The Data API forwards the Auth JWT and PostgreSQL enforces row ownership. Demo mode never initializes an account workspace or reads private rows.

Account data remains usable when cloud sync is unavailable. The original namespaced browser keys are retained, and every relevant change also refreshes a consolidated, versioned per-user backup with a SHA-256 checksum. The one-time local migration copies data from the legacy user namespace only after the authenticated Neon mapping is returned by RLS; it verifies the copy and retains the original keys.

## Intentional public owner backup

`public-profile-backup/` is an intentionally public, human-readable copy of Aleetreny's study data. It includes attempts, answers, corrections, vocabulary and review state. It excludes email addresses, passwords, password hashes, sessions, cookies, access/refresh tokens, database URLs and every other user's data.

`.github/workflows/public-profile-backup.yml` runs weekly or through `workflow_dispatch`. It requires these repository secrets:

- `NEON_DATABASE_URL`: an owner connection used only inside GitHub Actions;
- `PUBLIC_PROFILE_OWNER_EMAIL`: the exact owner identity to export.

The workflow queries exactly one matching Neon Auth user, writes stable JSON, validates checksums and commits only `public-profile-backup/`. Generate or validate the files locally with:

```bash
npm run backup:public-profile
npm run restore:public-profile -- --validate
```

`scripts/restore-public-profile.js` supports `--dry-run`, `--validate` and `--restore`. Restore mode requires the same two private environment variables, refuses IDs owned by another user and can target a temporary Neon branch by supplying that branch's `NEON_DATABASE_URL`.

## Deployment

Production is served by GitHub Pages from `gh-pages`. The deploy branch contains only browser assets and needs no build step. After changing JavaScript or CSS, update its query-string version in `index.html` so returning visitors receive the new files.

For a fork, also update:

- `NEON_CONFIG` and the Managed Better Auth trusted domains
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

`npm run check` validates JavaScript syntax, all 44 Use of English sets, all 12 Reading papers and keys, all 33 Listening records, all 28 Writing tasks, vocabulary integrity, Writing resources, migrations, partial practice, Error Log behaviour, the public demo/account boundary, Neon RLS declarations, local migration hooks, backup checksums, restoration input and secret exclusion.

The exam-bank audit proves question ranges, all 12 Reading Part 1 keys, Part 6 gaps, Part 7 section references, playlist indexes and unique Writing pairings. The public-demo audit rejects session and refresh-token fields.

## Disclaimer

This independent educational project is not affiliated with or endorsed by Cambridge University Press & Assessment. Cambridge names are used only to identify the exam format. Listening media is hosted by YouTube and remains subject to the availability and terms of its respective channel.

## License

[MIT](LICENSE)
