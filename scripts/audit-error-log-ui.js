const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function getFunctionSource(name) {
  const match = appSource.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `Expected ${name} to exist.`);
  return match[0];
}

assert.doesNotMatch(appSource, /class="profile-avatar"/, "The account button must not render the initial avatar.");
assert.match(appSource, /class="candidate-status"/, "The account button must expose its compact sync status.");
assert.match(
  appSource,
  /getStudyReviewCandidates\(\{ \.\.\.setup, parts: \[part\.id\] \}\)/,
  "Per-part review counts must inherit the selected mistakes/all scope."
);
assert.match(appSource, /function filterTrackedPartErrors\(/, "Part correction modals must provide search filtering.");
assert.match(appSource, /matchesTrackedErrorSearch\(error, query\)/, "Error search must use the shared matcher.");
assert.match(appSource, /id="ue-error-scope-select"/, "Correction modals must offer an isolated result scope.");
assert.match(appSource, /getTrackedErrorEntries\(\{ includeCorrectWithoutNotes \}\)/, "The all-results scope must be requested explicitly.");
assert.match(appSource, /function focusErrorLogPartColumn\(/, "Opening a part text must focus its source column.");
assert.match(appSource, /function clearErrorLogPartFocus\(/, "Closing a part text must restore all columns.");
assert.match(appSource, /panelId === "ue-modal-part-text-panel"/, "The correction modal must use its compact text header.");
assert.match(appSource, /class="ue-part-text-floating-close"/, "The compact text panel must retain a close control.");
assert.match(appSource, /data-error-section=/);
assert.match(appSource, /normalizeCorrectAnswerInput\(this\)/, "Correction editors must uppercase answers while typing.");
assert.match(appSource, /input\.setSelectionRange\(/, "Uppercase conversion must restore the correction cursor position.");
assert.match(appSource, /getUppercaseInputState\(/, "Cursor restoration must account for uppercase length changes.");
assert.equal((appSource.match(/autocapitalize="characters" spellcheck="false"/g) || []).length, 2, "Both correction inputs must request uppercase keyboard input.");
assert.match(appSource, /normalizeCorrectAnswer\(STATE\.answers\[qNum\]\)/, "Auto-seeded correct answers must be canonical uppercase.");
assert.match(appSource, /function filterAllAttemptsModal\(/, "All saved work must support filtering by section.");
assert.match(appSource, /id="all-attempts-section-filter"/, "The saved-work modal must expose its section filter.");
assert.match(appSource, /renderHistoryListV2HTML\(null, sectionFilter\)/, "Saved-work filtering must stay local to the modal list.");
assert.doesNotMatch(getFunctionSource("filterTrackedPartErrors"), /STATE\./, "Correction modal filters must not alter dashboard state.");
assert.doesNotMatch(getFunctionSource("filterAllAttemptsModal"), /STATE\./, "Saved-work modal filters must not alter dashboard state.");

assert.match(stylesSource, /\.candidate-status\s*\{/);
assert.match(stylesSource, /\.ue-errors-workspace\.text-open \.ue-part-register-grid\s*\{/);
assert.match(stylesSource, /\.ue-error-search-row\s*\{/);
assert.match(stylesSource, /\.all-attempts-filter-row\s*\{/);
assert.match(stylesSource, /\.ue-all-errors-workspace\.text-open\s*\{[^}]*minmax\(500px, 0\.95fr\)/s, "Correction text should receive a wider column.");
assert.match(stylesSource, /@media \(max-width: 1040px\)[^]*?\.ue-all-errors-workspace\s*\{\s*overflow:\s*hidden;/, "Responsive corrections must not add an outer scrollbar.");
assert.match(stylesSource, /\.ue-all-errors-workspace\.text-open \.ue-all-errors-list\s*\{\s*display:\s*none;/, "Responsive text view must hide the list instead of stacking two scroll regions.");
assert.match(stylesSource, /text-transform:\s*uppercase;/);

console.log("Error Log UI audit passed: scoped filters, saved-work sections, uppercase corrections and column focus verified.");
