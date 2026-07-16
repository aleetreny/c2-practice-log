const fs = require("node:fs");
const path = require("node:path");
const {
  countBySection,
  isLearningStateRow,
  migrationContentChecksum,
  normalizeMigrationRow,
  sha256,
  stableJson
} = require("./neon-data-utils");

const EXPORT_DIR = path.resolve(process.env.MIGRATION_EXPORT_DIR || ".migration-private");
const EXPECTED_RECORDED_CHECKSUM = "be1d84dfbec914194bb8cc8c6385d6912775f5e2c741c26c0a559402256147f2";

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, name), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateExport() {
  const manifest = readJson("migration-manifest.json");
  const rows = readJson("supabase-c2-attempts.json");
  const usersExport = readJson("supabase-users.json");

  for (const [name, metadata] of Object.entries(manifest.files || {})) {
    const actual = sha256(fs.readFileSync(path.join(EXPORT_DIR, name)));
    assert(actual === metadata.sha256, `SHA-256 mismatch for ${name}`);
  }
  assert(manifest.normalizedContentSha256 === EXPECTED_RECORDED_CHECKSUM, "Recorded source checksum changed");
  assert(Array.isArray(rows) && rows.length === manifest.rowCount, "Export row count mismatch");
  assert(Array.isArray(usersExport.users) && usersExport.users.length === manifest.userCount, "Export user count mismatch");
  assert(Array.isArray(usersExport.identities) && usersExport.identities.length === manifest.identityCount, "Export identity count mismatch");
  assert(rows.filter(isLearningStateRow).length === manifest.vocabularyStateCount, "Learning-state row count mismatch");
  assert(rows.filter(row => !isLearningStateRow(row)).length === manifest.attemptCount, "Attempt count mismatch");
  assert(stableJson(countBySection(rows)) === stableJson(manifest.rowsBySection), "Rows-by-section mismatch");
  assert(new Set(rows.map(row => row.user_id)).size === manifest.userCount, "Rows-by-user mismatch");

  return { manifest, rows, usersExport };
}

async function getSql() {
  const databaseUrl = process.env.NEON_DATABASE_URL;
  assert(databaseUrl, "NEON_DATABASE_URL is required");
  const { neon } = await import("@neondatabase/serverless");
  return neon(databaseUrl);
}

async function main() {
  const { manifest, rows, usersExport } = validateExport();
  const neonUserId = String(process.env.NEON_AUTH_USER_ID || "").trim();
  assert(/^[0-9a-f-]{36}$/i.test(neonUserId), "NEON_AUTH_USER_ID is required");
  assert(usersExport.users.length === 1, "This migration requires an explicit user map for multi-user exports");

  const legacyUser = usersExport.users[0];
  const legacyUserId = String(legacyUser.id);
  const email = String(legacyUser.email || "").trim().toLowerCase();
  assert(email, "Exported user email is missing");
  assert(rows.every(row => String(row.user_id) === legacyUserId), "Unexpected user ID in exported rows");

  const sql = await getSql();
  const mappingQuery = sql`
    insert into public.c2_user_mappings (
      neon_user_id,
      legacy_supabase_user_id,
      email_sha256,
      migration_version
    ) values (
      ${neonUserId}::uuid,
      ${legacyUserId}::uuid,
      ${sha256(email)},
      'supabase-to-neon-v1'
    )
    on conflict (neon_user_id) do update set
      legacy_supabase_user_id = excluded.legacy_supabase_user_id,
      email_sha256 = excluded.email_sha256,
      migration_version = excluded.migration_version
  `;
  const rowQueries = rows.map(source => {
    const row = normalizeMigrationRow(source);
    return sql`
      insert into public.c2_attempts (
        id, user_id, legacy_supabase_user_id, section, correct, total,
        percentage, scale_score, answers, graded_states, attempted_at,
        created_at, updated_at, migration_version
      ) values (
        ${row.id}, ${neonUserId}, ${legacyUserId}::uuid, ${row.section},
        ${row.correct}, ${row.total}, ${row.percentage}, ${row.scale_score},
        ${JSON.stringify(row.answers)}::jsonb, ${JSON.stringify(row.graded_states)}::jsonb,
        ${row.attempted_at}::timestamptz, ${row.created_at}::timestamptz,
        ${row.updated_at}::timestamptz, 'supabase-to-neon-v1'
      )
      on conflict (id) do nothing
    `;
  });
  await sql.transaction([mappingQuery, ...rowQueries], { isolationLevel: "Serializable" });

  const destinationRows = await sql.query(`
    select
      id,
      legacy_supabase_user_id::text as user_id,
      section,
      correct,
      total,
      percentage,
      scale_score,
      answers,
      graded_states,
      attempted_at,
      created_at,
      updated_at
    from public.c2_attempts
    where user_id = $1
    order by id
  `, [neonUserId]);

  const sourceChecksum = migrationContentChecksum(rows);
  const destinationChecksum = migrationContentChecksum(destinationRows);
  const sourceIds = rows.map(row => String(row.id)).sort();
  const destinationIds = destinationRows.map(row => String(row.id)).sort();
  assert(destinationRows.length === rows.length, "Destination row count mismatch");
  assert(JSON.stringify(destinationIds) === JSON.stringify(sourceIds), "Destination ID set mismatch");
  assert(sourceChecksum === destinationChecksum, "Normalized source/destination content mismatch");
  assert(stableJson(countBySection(destinationRows)) === stableJson(manifest.rowsBySection), "Destination section counts mismatch");

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceProject: manifest.sourceProject,
    destinationProject: {
      provider: "Neon",
      id: "young-meadow-13868248",
      name: "C2 Practice Log",
      region: "aws-eu-central-1",
      branchId: "br-delicate-wind-asdi2956",
      database: "neondb"
    },
    legacyUserId,
    neonUserId,
    rowCount: destinationRows.length,
    attemptCount: destinationRows.filter(row => !isLearningStateRow(row)).length,
    vocabularyStateCount: destinationRows.filter(isLearningStateRow).length,
    rowsBySection: countBySection(destinationRows),
    recordedSourceChecksum: manifest.normalizedContentSha256,
    normalizedMigrationChecksum: destinationChecksum,
    verified: true
  };
  fs.writeFileSync(path.join(EXPORT_DIR, "neon-migration-report.json"), stableJson(report, 2));
  manifest.destinationProject = report.destinationProject;
  fs.writeFileSync(path.join(EXPORT_DIR, "migration-manifest.json"), stableJson(manifest, 2));

  console.log(JSON.stringify({
    verified: true,
    users: 1,
    rows: report.rowCount,
    attempts: report.attemptCount,
    learningStateRows: report.vocabularyStateCount,
    normalizedMigrationChecksum: destinationChecksum
  }, null, 2));
}

main().catch(error => {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
});
