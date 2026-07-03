const assert = require("node:assert/strict");
const {
  PARTIAL_PRACTICE_TYPE,
  getObjectiveAttemptCompletion,
  getAnsweredPartKeys,
  isPartialPracticeAttempt,
  isScoredAttempt,
  getScoredAttempts,
  getAttemptedQuestionNumbers,
  getAttemptedPartKeys
} = require("../attempt-data.js");
const vm = require("node:vm");
const fs = require("node:fs");

const metadataSource = fs.readFileSync(require.resolve("../questions.js"), "utf8");
const metadataContext = {};
vm.runInNewContext(`${metadataSource}\nthis.metadata = C2_EXAM_METADATA;`, metadataContext);
const metadata = metadataContext.metadata;

function fullAnswers(sectionMeta) {
  const answers = {};
  Object.values(sectionMeta.parts).forEach(part => {
    for (let question = part.startQ; question <= part.endQ; question += 1) answers[question] = "A";
  });
  return answers;
}

function fullGrades(sectionMeta) {
  const grades = {};
  Object.values(sectionMeta.parts).forEach(part => {
    for (let question = part.startQ; question <= part.endQ; question += 1) {
      grades[question] = part.type === "partial" ? part.weight : "correct";
    }
  });
  return grades;
}

const useOfEnglishAnswers = fullAnswers(metadata.useOfEnglish);
const useOfEnglishGrades = fullGrades(metadata.useOfEnglish);
const complete = getObjectiveAttemptCompletion(metadata.useOfEnglish, useOfEnglishAnswers, useOfEnglishGrades);
assert.equal(complete.isComplete, true, "A fully answered and graded paper must be scored.");
assert.equal(complete.gradedQuestions.length, 22);

const missingAnswer = { ...useOfEnglishAnswers };
delete missingAnswer[30];
assert.equal(
  getObjectiveAttemptCompletion(metadata.useOfEnglish, missingAnswer, useOfEnglishGrades).isComplete,
  false,
  "A graded but unanswered question must make the record partial."
);

const missingGrade = { ...useOfEnglishGrades };
delete missingGrade[30];
assert.equal(
  getObjectiveAttemptCompletion(metadata.useOfEnglish, useOfEnglishAnswers, missingGrade).isComplete,
  false,
  "An answered but ungraded question must make the record partial."
);

const part2Grades = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [9 + index, index === 0 ? "incorrect" : "correct"]));
const part2Completion = getObjectiveAttemptCompletion(metadata.useOfEnglish, {}, part2Grades);
assert.deepEqual(part2Completion.gradedQuestions, [9, 10, 11, 12, 13, 14, 15, 16]);
assert.deepEqual(part2Completion.attemptedParts, ["part2"]);
assert.equal(part2Completion.isComplete, false);
assert.deepEqual(getAnsweredPartKeys(metadata.useOfEnglish, { 9: "answer", 17: "  ", 25: "phrase" }), ["part2", "part4"]);

const emptyCompletion = getObjectiveAttemptCompletion(metadata.useOfEnglish, {}, {});
assert.equal(emptyCompletion.gradedQuestions.length, 0, "An empty correction cannot become a saved practice.");
assert.equal(emptyCompletion.isComplete, false);

const readingPart1Answers = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [1 + index, "A"]));
const readingPart1Grades = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [1 + index, "correct"]));
const readingPart1Completion = getObjectiveAttemptCompletion(metadata.reading, readingPart1Answers, readingPart1Grades);
assert.deepEqual(readingPart1Completion.attemptedParts, ["part1"]);
assert.equal(readingPart1Completion.isComplete, false, "Reading Part 1 alone must remain unscored.");

const part4Grades = { 25: 0, 26: 1, 27: 2 };
const part4Item = { section: "useOfEnglish", gradedStates: part4Grades };
assert.deepEqual(getAttemptedQuestionNumbers(part4Item, metadata.useOfEnglish), [25, 26, 27]);
assert.deepEqual(getAttemptedPartKeys(part4Item, metadata.useOfEnglish), ["part4"]);
assert.deepEqual(
  getAttemptedQuestionNumbers({ gradedStates: { 25: 3, 26: "0", 27: 0 } }, metadata.useOfEnglish),
  [27],
  "Invalid or stringified partial-credit grades must not be treated as valid corrections."
);

const partialItem = {
  section: "useOfEnglish",
  total: 0,
  scaleScore: 0,
  answers: { meta: { attemptType: PARTIAL_PRACTICE_TYPE } },
  gradedStates: part2Grades
};
const fullItem = { section: "useOfEnglish", total: 28, scaleScore: 210, answers: {}, gradedStates: useOfEnglishGrades };
assert.equal(isPartialPracticeAttempt(partialItem), true);
assert.equal(isScoredAttempt(partialItem), false);
assert.equal(isScoredAttempt(fullItem), true);
assert.deepEqual(getScoredAttempts([partialItem, fullItem]), [fullItem]);
assert.deepEqual(getScoredAttempts([partialItem, fullItem], "reading"), []);

const appSource = fs.readFileSync(require.resolve("../app.js"), "utf8");
assert.match(appSource, /C2_ATTEMPT_DATA\.getObjectiveAttemptCompletion/);
assert.match(appSource, /attemptType:\s*C2_ATTEMPT_DATA\.PARTIAL_PRACTICE_TYPE/);
assert.match(appSource, /function getScoredHistory/);
assert.match(appSource, /Partial correction:/);
assert.match(appSource, /function calculateOverallAccuracy\(\)[\s\S]*?getScoredHistory\(\)/);
assert.match(appSource, /function calculateAverageScaleScore\(\)[\s\S]*?getScoredHistory\(\)/);
assert.match(appSource, /function getSectionEvolutionMetrics\(section\)[\s\S]*?getScoredHistory\(section\)/);
assert.match(appSource, /function getAttemptDurationSeconds\(item = \{\}\) \{\s*if \(isPartialPracticeAttempt\(item\)\) return 0;/);
assert.match(appSource, /const durationSeconds = isPartialPractice \? 0 : getCurrentPracticeDurationSeconds\(\)/);
assert.match(appSource, /if \(isPartialPractice && !attemptedQuestions\.has\(q\)\) continue;/);
assert.match(appSource, /Partial practice saved/);

console.log("Partial-practice audit passed: completion, zero-point grades, scope and metric exclusion verified.");
