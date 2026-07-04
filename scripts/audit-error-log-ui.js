const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

assert.doesNotMatch(appSource, /class="profile-avatar"/, "The account button must not render the initial avatar.");
assert.match(appSource, /class="candidate-status"/, "The account button must expose its compact sync status.");
assert.match(
  appSource,
  /getStudyReviewCandidates\(\{ \.\.\.setup, parts: \[part\.id\] \}\)/,
  "Per-part review counts must inherit the selected mistakes/all scope."
);
assert.match(appSource, /function filterTrackedPartErrors\(/, "Part correction modals must provide search filtering.");
assert.match(appSource, /matchesTrackedErrorSearch\(error, query\)/, "Error search must use the shared matcher.");
assert.match(appSource, /function focusErrorLogPartColumn\(/, "Opening a part text must focus its source column.");
assert.match(appSource, /function clearErrorLogPartFocus\(/, "Closing a part text must restore all columns.");
assert.match(appSource, /data-error-section=/);
assert.match(appSource, /normalizeCorrectAnswerInput\(this\)/, "Correction editors must uppercase answers while typing.");
assert.match(appSource, /normalizeCorrectAnswer\(STATE\.answers\[qNum\]\)/, "Auto-seeded correct answers must be canonical uppercase.");

assert.match(stylesSource, /\.candidate-status\s*\{/);
assert.match(stylesSource, /\.ue-errors-workspace\.text-open \.ue-part-register-grid\s*\{/);
assert.match(stylesSource, /\.ue-error-search-row\s*\{/);
assert.match(stylesSource, /text-transform:\s*uppercase;/);

console.log("Error Log UI audit passed: account button, scoped counts, search, uppercase corrections and column focus verified.");
