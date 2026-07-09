const assert = require("node:assert/strict");
const {
  parseLegacyCorrectAnswerLine,
  splitLegacyStudyNote,
  migrateHistoryStudyData,
  extractStudyReviewPrompt,
  getStudyReviewPrompt,
  shouldIncludeInErrorLog,
  normalizeCorrectAnswer,
  getUppercaseInputState,
  matchesTrackedErrorSearch,
  getStudyReviewRatingWeight,
  getStudyReviewCandidateWeight,
  selectWeightedStudyReviewItems
} = require("../study-review-data.js");

const metadata = {
  reading: { parts: { part1: { weight: 1 } } },
  useOfEnglish: {
    parts: {
      part2: { weight: 1 },
      part3: { weight: 1 },
      part4: { weight: 2 }
    }
  }
};

const split = splitLegacyStudyNote(
  "HAD I KNOWN\nInversion after a negative conditional.",
  "if I knew",
  0,
  2
);
assert.equal(split.correctAnswer, "HAD I KNOWN");
assert.equal(split.note, "Inversion after a negative conditional.");
assert.equal(split.matchedLegacy, true);

const inlineCorrection = parseLegacyCorrectAnswerLine("UNPRECEDENTED, no existe unprecedent");
assert.equal(inlineCorrection.answer, "UNPRECEDENTED");
assert.equal(inlineCorrection.remainder, "no existe unprecedent");
const inlineSplit = splitLegacyStudyNote("DUE / OWING - Given va sin to.", "given", "incorrect", 1);
assert.equal(inlineSplit.correctAnswer, "DUE / OWING");
assert.equal(inlineSplit.note, "Given va sin to.");

const history = [
  {
    id: "legacy-use-of-english",
    section: "useOfEnglish",
    answers: {
      9: "despite",
      25: "if I knew",
      meta: {
        errorNotes: {
          9: "DESPITE\nPreposition followed by a noun phrase.",
          25: "HAD I KNOWN\nUse inversion and omit if."
        },
        useOfEnglishPartTexts: {
          part2: "9. ______ the weather, the event continued.\n10. Another item.",
          part4: "25. I did not know, so I did not call.\n_____ I would have called.\n26. Next transformation."
        }
      }
    },
    gradedStates: { 9: "incorrect", 25: 1 }
  },
  {
    id: "correct-reading",
    section: "reading",
    answers: {
      1: "B",
      meta: {
        errorNotes: { 1: "The collocation rules out option A." },
        readingPartTexts: { part1: "1) A option B option C option D option" }
      }
    },
    gradedStates: { 1: "correct" }
  },
  {
    id: "unresolved",
    section: "useOfEnglish",
    answers: { 17: "creation", meta: { errorNotes: { 17: "Check the suffix." } } },
    gradedStates: { 17: "incorrect" }
  }
];

const migrated = migrateHistoryStudyData(history, metadata);
assert.equal(migrated.changed, true);
assert.equal(migrated.audit.migratedAnswers, 2);
assert.equal(migrated.audit.inferredCorrectAnswers, 1);
assert.equal(migrated.audit.unresolvedAnswers, 1);
assert.equal(migrated.history[0].answers.meta.correctAnswers[9], "DESPITE");
assert.equal(migrated.history[0].answers.meta.correctAnswers[25], "HAD I KNOWN");
assert.equal(migrated.history[0].answers.meta.errorNotes[9], "Preposition followed by a noun phrase.");
assert.equal(migrated.history[0].answers.meta.legacyErrorNotes[9], "DESPITE\nPreposition followed by a noun phrase.");
assert.equal(migrated.history[1].answers.meta.correctAnswers[1], "B");
assert.equal(migrated.history[1].answers.meta.errorNotes[1], "The collocation rules out option A.");

const secondPass = migrateHistoryStudyData(migrated.history, metadata);
assert.equal(secondPass.changed, false, "migration must be idempotent");

const questionPrompt = extractStudyReviewPrompt(
  "24. Previous item.\n25. I did not know.\n_____ I would have called.\n26. Next item.",
  25,
  25,
  30
);
assert.equal(questionPrompt.mode, "question");
assert.match(questionPrompt.text, /^25\./);
assert.doesNotMatch(questionPrompt.text, /26\./);

const partPrompt = extractStudyReviewPrompt("A complete cloze passage with (9) in context.", 9, 9, 16);
assert.equal(partPrompt.mode, "part");
assert.match(partPrompt.text, /complete cloze passage/);

const fullPartPrompt = getStudyReviewPrompt(
  "9. First gap.\n10. Second gap.",
  "part2",
  9,
  9,
  16
);
assert.equal(fullPartPrompt.mode, "part");
assert.match(fullPartPrompt.text, /10\. Second gap/);

const isolatedPart4Prompt = getStudyReviewPrompt(
  "25. First transformation.\n26. Second transformation.",
  "part4",
  25,
  25,
  30
);
assert.equal(isolatedPart4Prompt.mode, "question");
assert.doesNotMatch(isolatedPart4Prompt.text, /26\. Second transformation/);

assert.equal(shouldIncludeInErrorLog("incorrect", 1, ""), true);
assert.equal(shouldIncludeInErrorLog("correct", 1, "Useful note"), true);
assert.equal(shouldIncludeInErrorLog("correct", 1, ""), false);
assert.equal(shouldIncludeInErrorLog("correct", 1, "", true), true);
assert.equal(shouldIncludeInErrorLog(1, 2, ""), true);
assert.equal(shouldIncludeInErrorLog(2, 2, ""), false);
assert.equal(shouldIncludeInErrorLog(2, 2, "", true), true);
assert.equal(normalizeCorrectAnswer("  had I known  "), "HAD I KNOWN");
assert.deepEqual(getUppercaseInputState("HAD i KNOWN", 5, 5), {
  value: "HAD I KNOWN",
  selectionStart: 5,
  selectionEnd: 5
});
assert.deepEqual(getUppercaseInputState("A stra\u00dfe", 7, 7), {
  value: "A STRASSE",
  selectionStart: 8,
  selectionEnd: 8
});
assert.equal(matchesTrackedErrorSearch({ question: 25, answer: "if I knew", correctAnswer: "HAD I KNOWN", note: "Inversion" }, "q.25"), true);
assert.equal(matchesTrackedErrorSearch({ question: 25, answer: "if I knew", correctAnswer: "HAD I KNOWN", note: "Inversión" }, "inversion"), true);
assert.equal(matchesTrackedErrorSearch({ question: 25, answer: "if I knew", correctAnswer: "HAD I KNOWN", note: "Inversion" }, "resides"), false);

assert.equal(getStudyReviewRatingWeight(""), getStudyReviewRatingWeight("unsure"));
assert.ok(getStudyReviewRatingWeight("again") > getStudyReviewRatingWeight("unsure"));
assert.ok(getStudyReviewRatingWeight("known") > 0);
assert.ok(getStudyReviewRatingWeight("known") < getStudyReviewRatingWeight("unsure"));
const reviewStats = {
  knownNow: { lastRating: "known", again: 50, unsure: 12, known: 1 },
  againNow: { lastRating: "again", known: 50 },
  unsureNow: { lastRating: "unsure" }
};
assert.equal(
  getStudyReviewCandidateWeight({ key: "knownNow" }, reviewStats),
  getStudyReviewRatingWeight("known"),
  "Future probability must use only the latest rating, not older counts."
);
assert.equal(
  getStudyReviewCandidateWeight({ key: "unrated" }, reviewStats),
  getStudyReviewRatingWeight("unsure"),
  "Unrated cards must start at the same weight as unsure cards."
);
const randomSequence = [0.2, 0.9];
const weightedSelection = selectWeightedStudyReviewItems(
  [{ key: "knownNow" }, { key: "againNow" }, { key: "unrated" }],
  reviewStats,
  2,
  () => randomSequence.shift()
);
assert.deepEqual(weightedSelection.map(item => item.key), ["againNow", "unrated"]);
assert.equal(new Set(weightedSelection.map(item => item.key)).size, weightedSelection.length);

const lowercaseHistory = [{
  id: "lowercase-correction",
  section: "useOfEnglish",
  answers: { 9: "to", meta: { correctAnswers: { 9: "to" }, useOfEnglishPartTexts: { part2: "Full text" } } },
  gradedStates: { 9: "correct" }
}];
const normalizedHistory = migrateHistoryStudyData(lowercaseHistory, metadata);
assert.equal(normalizedHistory.history[0].answers.meta.correctAnswers[9], "TO");
assert.equal(normalizedHistory.changed, true);

console.log(
  `Study review audit passed: ${migrated.audit.migratedAnswers} legacy answers split, ` +
  `${migrated.audit.inferredCorrectAnswers} correct answers inferred and migration is idempotent.`
);
