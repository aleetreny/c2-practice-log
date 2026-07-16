const fs = require("node:fs");
const path = require("node:path");
const { buildPublicProfileFiles, stableJson } = require("./neon-data-utils");

const OUTPUT_DIR = path.resolve(process.env.PUBLIC_PROFILE_BACKUP_DIR || "public-profile-backup");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const databaseUrl = process.env.NEON_DATABASE_URL;
  const ownerEmail = String(process.env.PUBLIC_PROFILE_OWNER_EMAIL || "").trim().toLowerCase();
  assert(databaseUrl, "NEON_DATABASE_URL is required");
  assert(ownerEmail, "PUBLIC_PROFILE_OWNER_EMAIL is required");

  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(databaseUrl);
  const owners = await sql`
    select id
    from neon_auth."user"
    where lower(email) = ${ownerEmail}
  `;
  assert(owners.length === 1, `Expected exactly one owner profile, found ${owners.length}`);

  const rows = await sql`
    select
      id,
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
    where user_id = ${String(owners[0].id)}
    order by attempted_at, id
  `;
  const files = buildPublicProfileFiles(rows, {
    generatedAt: process.env.BACKUP_GENERATED_AT || new Date(),
    profile: process.env.PUBLIC_PROFILE_NAME || "Aleetreny"
  });

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const [name, document] of Object.entries(files)) {
    fs.writeFileSync(path.join(OUTPUT_DIR, name), stableJson(document, 2));
  }

  const manifest = files["manifest.json"];
  console.log(JSON.stringify({
    verifiedOwnerCount: owners.length,
    attemptCount: manifest.attemptCount,
    vocabularyCount: manifest.vocabularyCount,
    checksum: manifest.checksum,
    files: Object.keys(files).length
  }, null, 2));
}

main().catch(error => {
  console.error(`Public profile export failed: ${error.message}`);
  process.exitCode = 1;
});
