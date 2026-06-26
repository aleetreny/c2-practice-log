# C2 Practice Log

Single-owner Cambridge C2 practice tracker. The app lets you fill mock answer sheets, save attempts, and review progress by section and exam part.

## Persistence

The browser keeps a local backup in `localStorage`. When the owner signs in, progress is synced through server-side API routes:

- `POST /api/login` creates an httpOnly owner session cookie.
- `GET /api/history` reads the private progress store.
- `PUT /api/history` saves the current history.

The progress store is a private GitHub file at `data/progress.json`. Each online save is committed to GitHub, and existing online progress is backed up under `data/backups/` before replacement. The GitHub token is only used by the server-side API, never by the browser.

## Required Environment Variables

```bash
APP_PASSWORD=owner-login-password
SESSION_SECRET=long-random-session-secret
GITHUB_DATA_TOKEN=github-token-with-repo-contents-write-access
GITHUB_DATA_REPO=aleetreny/c2-practice-log
GITHUB_DATA_BRANCH=main
GITHUB_DATA_PATH=data/progress.json
GITHUB_BACKUP_ON_WRITE=true
```

## Local Check

```bash
npm run check
```
