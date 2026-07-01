const fs = require("fs");
const path = require("path");
const vm = require("vm");

const dataPath = path.join(__dirname, "..", "writing-data.js");
const source = `${fs.readFileSync(dataPath, "utf8")}
globalThis.__writingData = {
  WRITING_ESSAY_STAGES,
  WRITING_ESSAY_SITUATIONS,
  WRITING_LANGUAGE_GROUPS,
  WRITING_UPGRADES,
  WRITING_GENRES,
  WRITING_SAFE_EXPRESSIONS
};`;
const context = {};
vm.createContext(context);
vm.runInContext(source, context, { filename: dataPath });

const data = context.__writingData;
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};
const present = value => typeof value === "string" && value.trim().length > 0;

expect(data.WRITING_ESSAY_STAGES.length === 4, "Essay map must contain four paragraphs.");
data.WRITING_ESSAY_STAGES.forEach((stage, index) => {
  expect(present(stage.id), `Essay stage ${index + 1} is missing an id.`);
  expect(present(stage.title), `Essay stage ${index + 1} is missing a title.`);
  expect(present(stage.example), `Essay stage ${index + 1} is missing a worked example.`);
  expect(Array.isArray(stage.moves) && stage.moves.length >= 2, `Essay stage ${index + 1} needs at least two moves.`);
});

const situations = data.WRITING_ESSAY_SITUATIONS;
expect(situations.length === 18, "Situation bank must contain 18 rhetorical situations.");
expect(new Set(situations.map(item => item.id)).size === situations.length, "Situation ids must be unique.");
const situationPhrases = situations.flatMap(item => item.phrases || []);
expect(situationPhrases.length === 54, "Situation bank must contain 54 phrases.");
expect(new Set(situationPhrases).size === situationPhrases.length, "Situation phrases must be unique.");
situations.forEach(item => {
  expect(present(item.title) && present(item.cue), `Situation ${item.id} needs a title and cue.`);
  expect(Array.isArray(item.positions) && item.positions.length > 0, `Situation ${item.id} needs a paragraph position.`);
});

const languageGroups = data.WRITING_LANGUAGE_GROUPS;
expect(languageGroups.length === 6, "Language bank must contain six groups.");
const languageEntries = languageGroups.flatMap(group => group.items || []);
expect(languageEntries.length === 30, "Language bank must contain 30 entries.");
languageEntries.forEach((entry, index) => {
  expect(Array.isArray(entry) && present(entry[0]), `Language entry ${index + 1} is missing a term.`);
  expect(Array.isArray(entry) && present(entry[1]), `Language entry ${index + 1} is missing a pattern.`);
  expect(Array.isArray(entry) && present(entry[2]), `Language entry ${index + 1} is missing a contextual example.`);
});

expect(data.WRITING_UPGRADES.length === 8, "Upgrade bank must contain eight replacements.");
expect(Object.keys(data.WRITING_GENRES).length === 5, "Format guide must contain five text types.");
Object.entries(data.WRITING_GENRES).forEach(([key, genre]) => {
  expect(present(genre.label), `${key} is missing a label.`);
  expect(Array.isArray(genre.structure) && genre.structure.length >= 4, `${key} needs a complete structure.`);
  expect(Array.isArray(genre.phrases) && genre.phrases.length >= 6, `${key} needs at least six useful phrases.`);
});
expect(data.WRITING_SAFE_EXPRESSIONS.length === 10, "Safe-expression bank must contain ten entries.");

if (failures.length) {
  console.error(`Writing data audit failed (${failures.length}):`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Writing data audit passed: ${data.WRITING_ESSAY_STAGES.length} essay stages, ` +
  `${situations.length} situations, ${situationPhrases.length} phrases, ` +
  `${languageEntries.length} language entries and ${Object.keys(data.WRITING_GENRES).length} text types.`
);
