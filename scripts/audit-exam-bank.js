const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const bank = require(path.join(root, "exam-bank-data.js"));
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const moduleSource = fs.readFileSync(path.join(root, "exam-bank.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ignoreSource = fs.readFileSync(path.join(root, ".gitignore"), "utf8");

assert.equal(bank.version, 1);
assert.match(bank.sourceDigest, /^[a-f0-9]{16}$/);
assert.equal(bank.reading.length, 12, "expected 12 Reading tests");
assert.equal(bank.listening.length, 33, "expected 33 Listening videos");
assert.equal(bank.writing.length, 10, "expected 10 Writing sets");

const readingIds = new Set();
let readingQuestionCount = 0;
bank.reading.forEach((test, index) => {
  assert.equal(test.number, index + 1);
  assert.ok(!readingIds.has(test.id), `duplicate Reading id ${test.id}`);
  readingIds.add(test.id);
  const expected = {
    part5: { count: 6, first: 31, last: 36, weight: 2 },
    part6: { count: 7, first: 37, last: 43, weight: 2 },
    part7: { count: 10, first: 44, last: 53, weight: 1 }
  };
  Object.entries(expected).forEach(([partKey, shape]) => {
    const part = test.parts[partKey];
    assert.equal(part.questions.length, shape.count, `${test.id} ${partKey} question count`);
    assert.equal(part.questions[0].number, shape.first);
    assert.equal(part.questions.at(-1).number, shape.last);
    readingQuestionCount += part.questions.length;
  });
  test.parts.part5.questions.forEach(question => {
    assert.equal(question.options.length, 4, `${test.id} Q.${question.number} options`);
    assert.deepEqual(question.options.map(option => option.value), ["A", "B", "C", "D"]);
  });
  assert.deepEqual(test.parts.part6.paragraphs.map(paragraph => paragraph.label), ["A", "B", "C", "D", "E", "F", "G", "H"]);
  for (let question = 37; question <= 43; question += 1) {
    assert.ok(test.parts.part6.passage.includes(`[${question}]`), `${test.id} missing gap ${question}`);
  }
  const part7Labels = new Set(test.parts.part7.sections.map(section => section.label));
  assert.ok(part7Labels.size >= 4, `${test.id} Part 7 sections`);
  assert.equal(Object.keys(test.answers).length, 23, `${test.id} answer key`);
  Object.entries(test.answers).forEach(([question, answer]) => {
    const number = Number(question);
    assert.ok(number >= 31 && number <= 53, `${test.id} invalid answer number ${question}`);
    if (number <= 36) assert.ok(["A", "B", "C", "D"].includes(answer));
    else if (number <= 43) assert.ok(["A", "B", "C", "D", "E", "F", "G", "H"].includes(answer));
    else assert.ok(part7Labels.has(answer), `${test.id} Q.${question} points to missing section ${answer}`);
  });
});
assert.equal(readingQuestionCount, 276);

const listeningNumbers = bank.listening.map(test => test.number);
assert.deepEqual(listeningNumbers, [...Array.from({ length: 23 }, (_, index) => index + 1), ...Array.from({ length: 10 }, (_, index) => index + 26)]);
assert.equal(new Set(bank.listening.map(test => test.youtubeId)).size, 33);
bank.listening.forEach(test => {
  assert.equal(test.embedUrl, `https://www.youtube-nocookie.com/embed/${test.youtubeId}`);
  assert.equal(test.watchUrl, `https://www.youtube.com/watch?v=${test.youtubeId}`);
});

const expectedPart2Counts = [3, 3, 3, 3, 0, 0, 0, 0, 1, 1];
let writingTaskCount = 0;
bank.writing.forEach((test, index) => {
  assert.equal(test.number, index + 1);
  assert.equal(test.part1.texts.length, 2, `${test.id} Part 1 source texts`);
  assert.ok(test.part1.texts.every(text => text.body.length > 80), `${test.id} has complete source text`);
  assert.equal(test.part2Tasks.length, expectedPart2Counts[index], `${test.id} Part 2 count`);
  assert.ok(test.part2Tasks.every(task => task.prompt.length > 80), `${test.id} has complete Part 2 prompts`);
  writingTaskCount += 1 + test.part2Tasks.length;
});
assert.equal(writingTaskCount, 24);

assert.ok(indexSource.indexOf("exam-bank-data.js") < indexSource.indexOf("app.js"), "bank data must load before app");
assert.ok(indexSource.indexOf("exam-bank.js") > indexSource.indexOf("app.js"), "bank controller must load after app");
assert.match(appSource, /key: "examBank", label: "Exams"/);
assert.match(appSource, /examBank: getActiveExamBankAttemptMeta/);
assert.match(moduleSource, /finishReadingBankTest/);
assert.match(moduleSource, /renderActiveExamBankListeningMediaHTML/);
assert.match(moduleSource, /Use of English and Reading Part 1 archive/);
assert.match(moduleSource, /normalised to the 44-mark Reading component/);

for (const sourceName of [
  "cambridge_c2_reading_12_tests_polished.md",
  "c2_listening_youtube_embeds.md",
  "C2_Proficiency_Writing_Practice_Bank.md"
]) {
  assert.ok(ignoreSource.split(/\r?\n/).includes(sourceName), `${sourceName} must be ignored`);
}

console.log(`Exam bank audit passed: ${bank.reading.length} Reading tests / ${readingQuestionCount} questions, ${bank.listening.length} Listening videos and ${writingTaskCount} Writing tasks.`);
