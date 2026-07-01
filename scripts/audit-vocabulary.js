const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const dataSource = fs.readFileSync(path.join(root, "vocabulary-data.js"), "utf8");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const enrichment = JSON.parse(fs.readFileSync(path.join(root, "data", "vocabulary-enrichment.json"), "utf8"));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${dataSource};globalThis.entries=VOCABULARY_SEED;`, sandbox);
const entries = sandbox.entries;

function fail(message, details = []) {
  console.error(`FAIL: ${message}`);
  details.slice(0, 20).forEach(detail => console.error(`  ${detail}`));
  process.exitCode = 1;
}

const personal = entries.filter(entry => entry.sources.includes("My Vocabulary List"));
const testable = entries.filter(entry => !entry.sources.includes("My Vocabulary List"));
const genericPrefixes = ["In her notes, she chose", "During the discussion, she used"];
const normalise = value => String(value).trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
const duplicateGroups = new Map();
testable.forEach(entry => {
  const key = normalise(entry.example);
  duplicateGroups.set(key, [...(duplicateGroups.get(key) || []), entry.id]);
});
const duplicates = [...duplicateGroups.entries()].filter(([, ids]) => ids.length > 1);
const missingMeanings = testable.filter(entry => !entry.meaning.trim());
const missingExamples = testable.filter(entry => !entry.example.trim());
const genericExamples = testable.filter(entry => genericPrefixes.some(prefix => entry.example.startsWith(prefix)));
const incompleteExamples = testable.filter(entry => entry.example.trim().split(/\s+/).length < 7 || !/[.!?]["'’”)]?$/.test(entry.example.trim()));
const schemaLeaks = entries.filter(entry => ["category", "categories", "topic", "topics"].some(key => Object.hasOwn(entry, key)));
const knownTypos = /(apprehes|commandements|impresss|mountan|addittion|afeccionate|allowence|cacaphony|cirscum|dishearting|enlong|errrand|fidgert|lenghty|ocurrence|ominuous|pesantry|repetable|self-pitty|submmersion|synonimous|unprecendented|\bmeannes\b)/i;
const typoEntries = entries.filter(entry => knownTypos.test(entry.term));
const sourceCounts = Object.values(enrichment).reduce((counts, value) => {
  const source = value.exampleSource || "notion/wordnet";
  counts[source] = (counts[source] || 0) + 1;
  return counts;
}, {});

if (entries.length !== 2598) fail(`Expected 2,598 total entries; found ${entries.length}.`);
if (testable.length !== 2315 || personal.length !== 283) fail(`Expected 2,315 testable and 283 personal entries; found ${testable.length} and ${personal.length}.`);
if (missingMeanings.length) fail("Testable entries without a definition.", missingMeanings.map(entry => `${entry.id}: ${entry.term}`));
if (missingExamples.length) fail("Testable entries without an example.", missingExamples.map(entry => `${entry.id}: ${entry.term}`));
if (genericExamples.length) fail("Generic scaffold examples remain.", genericExamples.map(entry => `${entry.id}: ${entry.example}`));
if (incompleteExamples.length) fail("Examples must be complete contextual sentences of at least seven words.", incompleteExamples.map(entry => `${entry.id}: ${entry.example}`));
if (duplicates.length) fail("Example sentences must be unique.", duplicates.map(([example, ids]) => `${ids.join(", ")}: ${example}`));
if (schemaLeaks.length) fail("Removed category/topic fields leaked into the generated database.", schemaLeaks.map(entry => entry.id));
if (typoEntries.length) fail("Known source typos remain in displayed terms.", typoEntries.map(entry => `${entry.id}: ${entry.term}`));
if (/\["context",\s*"In context"|Complete an expression inside its example|setup\.mode\s*===\s*"context"/.test(appSource)) fail("The removed In context mode is still reachable.");

const frontStart = appSource.indexOf("function renderVocabularyReviewFront");
const frontEnd = appSource.indexOf("\nfunction ", frontStart + 10);
const reviewFrontSource = appSource.slice(frontStart, frontEnd);
if (frontStart < 0 || /entry\.example/.test(reviewFrontSource)) fail("Recall front can leak the example sentence.");

const collectionCounts = Object.fromEntries(["wordFormation", "patterns", "idioms", "curated", "official"].map(collection => [collection, testable.filter(entry => entry.collection === collection).length]));
console.log(JSON.stringify({
  total: entries.length,
  testable: testable.length,
  personalExcluded: personal.length,
  uniqueExamples: duplicateGroups.size,
  collections: collectionCounts,
  exampleSources: sourceCounts
}, null, 2));
if (!process.exitCode) console.log("Vocabulary audit passed.");
