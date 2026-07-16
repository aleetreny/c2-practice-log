const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildPublicProfileFiles,
  migrationContentChecksum,
  stableJson,
  validatePublicProfile
} = require("./neon-data-utils");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const schemaSource = fs.readFileSync(path.join(root, "neon", "schema.sql"), "utf8");
const restoreSource = fs.readFileSync(path.join(root, "scripts", "restore-public-profile.js"), "utf8");
const workflowSource = fs.readFileSync(path.join(root, ".github", "workflows", "public-profile-backup.yml"), "utf8");

assert.ok(!appSource.includes("supabase.co"), "frontend must not call Supabase");
assert.ok(!appSource.includes("service_role"), "frontend must not contain service credentials");
assert.match(appSource, /NEON_CONFIG/, "frontend should declare Neon configuration");
assert.match(appSource, /migrateLegacyAccountLocalStorage/, "legacy localStorage migration should exist");
assert.match(appSource, /buildCurrentProfileExport/, "complete in-browser profile export should exist");
assert.match(appSource, /saveConsolidatedAccountBackup/, "consolidated local backup should exist");
assert.doesNotMatch(
  appSource.match(/function clearRegisteredDataFromLocalStorage\(\)[\s\S]*?\n\}/)?.[0] || "",
  /accountKeys\.migration/,
  "full reset must preserve the one-time migration marker"
);

assert.match(schemaSource, /enable row level security/i);
assert.match(schemaSource, /force row level security/i);
assert.match(schemaSource, /auth\.user_id\(\)/);
assert.match(schemaSource, /for select[\s\S]*for insert[\s\S]*for update[\s\S]*for delete/i);
assert.match(schemaSource, /revoke all on public\.c2_attempts from public, anonymous, authenticated/i);
assert.match(schemaSource, /current_setting\('c2\.restore_mode', true\) = 'on'/);
assert.match(restoreSource, /set_config\('c2\.restore_mode', 'on', true\)/);

assert.match(workflowSource, /workflow_dispatch:/);
assert.match(workflowSource, /schedule:/);
assert.match(workflowSource, /NEON_DATABASE_URL/);
assert.match(workflowSource, /PUBLIC_PROFILE_OWNER_EMAIL/);

const fixtureRows = [
  {
    id: "attempt-1",
    user_id: "11111111-1111-1111-1111-111111111111",
    section: "reading",
    correct: 4,
    total: 5,
    percentage: 80,
    scale_score: 205,
    answers: { 1: "A", meta: { note: "safe" } },
    graded_states: { 1: "correct" },
    attempted_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "vocabulary_state_legacy",
    user_id: "11111111-1111-1111-1111-111111111111",
    section: "writing",
    correct: 0,
    total: 1,
    percentage: 0,
    scale_score: 160,
    answers: {
      __kind: "vocabulary_state",
      entries: [{ id: "word-1", term: "lucid" }],
      archivedIds: [],
      reviewStats: {},
      vocabularyReviewSettings: {},
      errorReviewStats: {},
      errorReviewSettings: {},
      updatedAt: 1
    },
    graded_states: {},
    attempted_at: "2026-01-02T00:00:00.000Z",
    created_at: "2026-01-02T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z"
  }
];

const reorderedRows = fixtureRows.map(row => ({ ...row, answers: JSON.parse(stableJson(row.answers)) }));
assert.equal(migrationContentChecksum(fixtureRows), migrationContentChecksum(reorderedRows), "normalized checksums should be stable");

const files = buildPublicProfileFiles(fixtureRows, {
  generatedAt: "2026-01-03T00:00:00.000Z",
  profile: "Aleetreny"
});
const validation = validatePublicProfile(files["latest.json"]);
assert.equal(validation.attemptCount, 1);
assert.equal(validation.learningStateCount, 1);
assert.equal(files["manifest.json"].vocabularyCount, 1);

const serializedBackup = Object.values(files).map(value => stableJson(value)).join("\n");
for (const forbidden of ["access_token", "refresh_token", "postgresql://", "service_role", "@gmail.com"]) {
  assert.ok(!serializedBackup.toLowerCase().includes(forbidden), `public backup must exclude ${forbidden}`);
}

console.log("Neon migration, privacy and backup audit passed.");
