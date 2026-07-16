const fs = require("node:fs");
const path = require("node:path");
const { normalizeMigrationRow, validatePublicProfile } = require("./neon-data-utils");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseMode() {
  const modes = ["--dry-run", "--validate", "--restore"].filter(mode => process.argv.includes(mode));
  assert(modes.length === 1, "Choose exactly one of --dry-run, --validate or --restore");
  return modes[0];
}

function readBackup() {
  const backupPath = path.resolve(process.env.PUBLIC_PROFILE_BACKUP_FILE || "public-profile-backup/latest.json");
  return JSON.parse(fs.readFileSync(backupPath, "utf8"));
}

async function restore(rows) {
  const databaseUrl = process.env.NEON_DATABASE_URL;
  const ownerEmail = String(process.env.PUBLIC_PROFILE_OWNER_EMAIL || "").trim().toLowerCase();
  assert(databaseUrl, "NEON_DATABASE_URL is required for --restore");
  assert(ownerEmail, "PUBLIC_PROFILE_OWNER_EMAIL is required for --restore");

  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(databaseUrl);
  const owners = await sql`
    select id
    from neon_auth."user"
    where lower(email) = ${ownerEmail}
  `;
  assert(owners.length === 1, `Expected exactly one owner profile, found ${owners.length}`);
  const ownerId = String(owners[0].id);
  const ids = rows.map(row => String(row.id));
  const conflicts = await sql.query(`
    select id
    from public.c2_attempts
    where id = any($1::text[])
      and user_id <> $2
  `, [ids, ownerId]);
  assert(conflicts.length === 0, "Restore refused because one or more IDs belong to another user");

  const queries = rows.map(source => {
    const row = normalizeMigrationRow({ ...source, user_id: ownerId });
    return sql`
      insert into public.c2_attempts (
        id, user_id, section, correct, total, percentage, scale_score,
        answers, graded_states, attempted_at, created_at, updated_at,
        migration_version
      ) values (
        ${row.id}, ${ownerId}, ${row.section}, ${row.correct}, ${row.total},
        ${row.percentage}, ${row.scale_score}, ${JSON.stringify(row.answers)}::jsonb,
        ${JSON.stringify(row.graded_states)}::jsonb, ${row.attempted_at}::timestamptz,
        ${row.created_at}::timestamptz, ${row.updated_at}::timestamptz,
        'public-backup-restore-v1'
      )
      on conflict (id) do update set
        section = excluded.section,
        correct = excluded.correct,
        total = excluded.total,
        percentage = excluded.percentage,
        scale_score = excluded.scale_score,
        answers = excluded.answers,
        graded_states = excluded.graded_states,
        attempted_at = excluded.attempted_at,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        migration_version = excluded.migration_version
      where public.c2_attempts.user_id = ${ownerId}
    `;
  });
  await sql.transaction([
    sql`select set_config('c2.restore_mode', 'on', true)`,
    ...queries
  ], { isolationLevel: "Serializable" });

  const [{ count }] = await sql`
    select count(*)::integer as count
    from public.c2_attempts
    where user_id = ${ownerId}
      and id = any(${ids}::text[])
  `;
  assert(Number(count) === rows.length, "Restore verification count mismatch");
  return Number(count);
}

async function main() {
  const mode = parseMode();
  const validation = validatePublicProfile(readBackup());
  const summary = {
    mode,
    valid: true,
    attemptCount: validation.attemptCount,
    learningStateCount: validation.learningStateCount,
    rowCount: validation.rows.length,
    checksum: validation.checksum
  };

  if (mode === "--restore") summary.restoredRows = await restore(validation.rows);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
  console.error(`Public profile restore failed: ${error.message}`);
  process.exitCode = 1;
});
