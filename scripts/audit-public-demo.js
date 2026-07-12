const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const demoSource = fs.readFileSync(path.join(root, "demo-data.js"), "utf8");
const sandbox = {};
sandbox.globalThis = sandbox;
vm.runInNewContext(demoSource, sandbox, { filename: "demo-data.js" });

const demo = sandbox.C2_DEMO_DATA;
assert.ok(demo && demo.version === 1, "demo snapshot should expose version 1 data");
assert.equal(demo.history.length, 84, "demo snapshot should preserve all 84 real attempts");
assert.ok(demo.vocabularyEntries.length > 0, "demo snapshot should include personal vocabulary examples");
assert.ok(Object.keys(demo.vocabularyReviewStats).length > 0, "demo snapshot should include vocabulary review examples");
assert.ok(Object.keys(demo.errorReviewStats).length > 0, "demo snapshot should include exercise review examples");

function assertNoSensitiveKeys(value, trail = "demo") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!/^(access_token|refresh_token|password|session)$/i.test(key), `${trail}.${key} must not be published`);
    assertNoSensitiveKeys(child, `${trail}.${key}`);
  }
}

assertNoSensitiveKeys(demo);
assert.ok(!demoSource.includes("c2_supabase_session"), "demo asset must not contain the session storage key");
assert.ok(!demoSource.includes("refresh_token"), "demo asset must not contain refresh tokens");

const demoScriptIndex = indexSource.indexOf("demo-data.js");
const appScriptIndex = indexSource.indexOf("app.js");
assert.ok(demoScriptIndex > -1 && demoScriptIndex < appScriptIndex, "demo data must load before the app");

assert.match(appSource, /ACCOUNT_STORAGE_PREFIX\s*=\s*"c2_account"/, "account backups should be namespaced");
assert.match(appSource, /function activateDemoWorkspace\(\)/, "demo workspace activation should exist");
assert.match(appSource, /function activateAccountWorkspace\(\)/, "account workspace activation should exist");
assert.match(
  appSource,
  /await signInWithSupabase\(email, password\);\s*activateAccountWorkspace\(\);\s*await hydrateRemoteHistory\(\);/,
  "sign in must clear the demo before remote hydration"
);
assert.match(
  appSource,
  /if \(session\.access_token\) \{\s*activateAccountWorkspace\(\);\s*await hydrateRemoteHistory\(\);/,
  "immediate sign up must clear the demo before remote hydration"
);

for (const tab of ["home", "dashboard", "writingLab", "vocabulary", "vocabularyReview"]) {
  assert.ok(appSource.includes(`data-tour-tab=\"${tab}\"`) || appSource.includes(`key: "${tab}"`), `tour should cover ${tab}`);
}
assert.match(appSource, /const ABOUT_TOUR_STEPS = \[/, "guided tour steps should exist");
assert.match(appSource, /Your private workspace starts empty/, "tour should explain account isolation");

console.log(`Public demo audit passed: ${demo.history.length} attempts, ${demo.vocabularyEntries.length} personal vocabulary entries, ${Object.keys(demo.vocabularyReviewStats).length} vocabulary ratings and ${Object.keys(demo.errorReviewStats).length} error ratings.`);
