const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const bank = require(path.join(root, "exam-bank-data.js"));
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const moduleSource = fs.readFileSync(path.join(root, "exam-bank.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ignoreSource = fs.readFileSync(path.join(root, ".gitignore"), "utf8");

assert.equal(bank.version, 2);
assert.match(bank.sourceDigest, /^[a-f0-9]{16}$/);
assert.equal(bank.useOfEnglish.length, 44, "expected 44 Use of English sets");
assert.equal(bank.reading.length, 12, "expected 12 Reading tests");
assert.equal(bank.listening.length, 33, "expected 33 Listening tests");
assert.equal(bank.writing.length, 14, "expected 14 Writing sets");

const uoeFull = bank.useOfEnglish.filter(test => test.kind === "full");
const uoePart4 = bank.useOfEnglish.filter(test => test.kind === "part4");
assert.equal(uoeFull.length, 24, "expected 24 full Use of English papers");
assert.equal(uoePart4.length, 20, "expected 20 Part 4 drills");
bank.useOfEnglish.forEach((test, index) => {
  assert.equal(test.number, index + 1);
  const expectedParts = test.kind === "full" ? ["part2", "part3", "part4"] : ["part4"];
  assert.deepEqual(Object.keys(test.parts), expectedParts, `${test.id} parts`);
  const expectedQuestions = test.kind === "full" ? 22 : 6;
  assert.equal(Object.keys(test.answers).length, expectedQuestions, `${test.id} answer key`);
  expectedParts.forEach(partKey => {
    assert.ok(test.parts[partKey].passage.length > 80, `${test.id} ${partKey} source text`);
    assert.equal(test.parts[partKey].questions.length, partKey === "part4" ? 6 : 8);
  });
});

const readingIds = new Set();
let readingQuestionCount = 0;
bank.reading.forEach((test, index) => {
  assert.equal(test.number, index + 1);
  assert.ok(!readingIds.has(test.id), `duplicate Reading id ${test.id}`);
  readingIds.add(test.id);
  const expected = {
    part1: { count: 8, first: 1, last: 8 },
    part5: { count: 6, first: 31, last: 36 },
    part6: { count: 7, first: 37, last: 43 },
    part7: { count: 10, first: 44, last: 53 }
  };
  assert.deepEqual(Object.keys(test.parts), Object.keys(expected), `${test.id} part set`);
  Object.entries(expected).forEach(([partKey, shape]) => {
    const part = test.parts[partKey];
    assert.equal(part.questions.length, shape.count, `${test.id} ${partKey} question count`);
    assert.equal(part.questions[0].number, shape.first);
    assert.equal(part.questions.at(-1).number, shape.last);
    readingQuestionCount += part.questions.length;
  });
  [test.parts.part1, test.parts.part5].filter(Boolean).forEach(part => part.questions.forEach(question => {
    assert.equal(question.options.length, 4, `${test.id} Q.${question.number} options`);
    assert.deepEqual(question.options.map(option => option.value), ["A", "B", "C", "D"]);
  }));
  assert.deepEqual(test.parts.part6.paragraphs.map(paragraph => paragraph.label), ["A", "B", "C", "D", "E", "F", "G", "H"]);
  for (let question = 37; question <= 43; question += 1) assert.ok(test.parts.part6.passage.includes(`[${question}]`), `${test.id} missing gap ${question}`);
  const part7Labels = new Set(test.parts.part7.sections.map(section => section.label));
  assert.ok(part7Labels.size >= 4, `${test.id} Part 7 sections`);
  assert.equal(Object.keys(test.answers).length, 31, `${test.id} answer key`);
  assert.equal(test.missingPart1, undefined);
});
assert.equal(readingQuestionCount, 372);
assert.equal(bank.reading[11].parts.part1.title, "The rise of podcasts");
assert.deepEqual(Object.fromEntries(Object.entries(bank.reading[11].answers).filter(([question]) => Number(question) <= 8)), {
  1: "D", 2: "A", 3: "D", 4: "B", 5: "B", 6: "C", 7: "B", 8: "A"
});

assert.deepEqual(bank.listening.map(test => test.number), Array.from({ length: 33 }, (_, index) => index + 1));
assert.deepEqual(bank.listening.map(test => test.sourceTest), [...Array.from({ length: 23 }, (_, index) => index + 1), ...Array.from({ length: 10 }, (_, index) => index + 26)]);
assert.equal(new Set(bank.listening.map(test => test.apiIndex)).size, 33);
assert.equal(new Set(bank.listening.map(test => test.playlistId)).size, 1);
bank.listening.forEach(test => {
  assert.match(test.playlistId, /^PL[\w-]+$/);
  assert.ok(Number.isInteger(test.apiIndex));
  assert.equal(test.playlistPosition, test.apiIndex + 1);
  assert.match(test.watchUrl, /^https:\/\/www\.youtube\.com\/playlist\?list=/);
});

let writingTaskCount = 0;
const writingSourcePart1Ids = new Set();
const writingSourcePart2Ids = new Set();
bank.writing.forEach((test, index) => {
  assert.equal(test.number, index + 1);
  assert.equal(test.part1.texts.length, 2, `${test.id} Part 1 source texts`);
  assert.ok(test.part1.texts.every(text => text.body.length > 80), `${test.id} complete Part 1 text`);
  assert.match(test.part1Topic, /^\S+$/, `${test.id} one-word Part 1 topic`);
  assert.equal(test.part2Tasks.length, 1, `${test.id} paired Part 2`);
  const task = test.part2Tasks[0];
  assert.ok(task.prompt.length > 80, `${test.id} complete Part 2 prompt`);
  assert.match(task.topic, /^\S+$/, `${test.id} one-word Part 2 topic`);
  writingSourcePart1Ids.add(test.sourcePart1Id);
  writingSourcePart2Ids.add(task.sourceId);
  writingTaskCount += 2;
});
assert.equal(writingSourcePart1Ids.size, 14);
assert.equal(writingSourcePart2Ids.size, 14);
assert.equal(writingTaskCount, 28);

assert.ok(indexSource.indexOf("exam-bank-data.js") < indexSource.indexOf("app.js"), "bank data must load before app");
assert.ok(indexSource.indexOf("exam-bank.js") > indexSource.indexOf("app.js"), "bank controller must load after app");
assert.match(appSource, /key: "examBank", label: "Exams"/);
assert.doesNotMatch(appSource, /renderExamBankHomeFeatureHTML/);
assert.match(moduleSource, /startUseOfEnglishBankTest/);
assert.match(moduleSource, /finishReadingBankTest/);
assert.match(moduleSource, /dropReadingParagraph/);
assert.match(moduleSource, /cuePlaylist/);
assert.doesNotMatch(moduleSource, /Already in your log/);
assert.doesNotMatch(moduleSource, /Practise the paper, not just the answer sheet/);
assert.ok(fs.existsSync(path.join(root, "data", "reading-part1-test12.json")), "sanitised Test 12 Part 1 source must be committed");

for (const sourceName of [
  "cambridge_c2_reading_12_tests_polished.md",
  "c2_listening_youtube_embeds.md",
  "c2_listening_youtube_embeds_corrected.md",
  "c2_listening_playlist_indexes.json",
  "C2_Proficiency_Writing_Practice_Bank.md",
  "C2_Writing_Part_1_Practice_4_Tests.md"
]) {
  assert.ok(ignoreSource.split(/\r?\n/).includes(sourceName), `${sourceName} must be ignored`);
}

console.log(`Exam bank audit passed: ${bank.useOfEnglish.length} Use of English sets, ${bank.reading.length} Reading tests / ${readingQuestionCount} questions, ${bank.listening.length} Listening tests and ${writingTaskCount} Writing tasks.`);
