(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.C2_ATTEMPT_DATA = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PARTIAL_PRACTICE_TYPE = "partial-practice";

  function plainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function hasAnswer(value) {
    return String(value ?? "").trim().length > 0;
  }

  function hasGrade(partData, gradeState) {
    if (!partData) return false;
    if (partData.type === "partial") {
      return typeof gradeState === "number"
        && Number.isFinite(gradeState)
        && gradeState >= 0
        && gradeState <= Number(partData.weight || 0);
    }
    return gradeState === "correct" || gradeState === "incorrect";
  }

  function getObjectiveAttemptCompletion(sectionMeta, answersValue, gradedStatesValue) {
    const answers = plainObject(answersValue);
    const gradedStates = plainObject(gradedStatesValue);
    const questions = [];
    const answeredQuestions = [];
    const gradedQuestions = [];
    const attemptedParts = [];

    Object.entries(plainObject(sectionMeta?.parts)).forEach(([partKey, partData]) => {
      let partHasGrade = false;
      for (let question = Number(partData.startQ); question <= Number(partData.endQ); question += 1) {
        questions.push(question);
        if (hasAnswer(answers[question])) answeredQuestions.push(question);
        if (hasGrade(partData, gradedStates[question])) {
          gradedQuestions.push(question);
          partHasGrade = true;
        }
      }
      if (partHasGrade) attemptedParts.push(partKey);
    });

    return {
      totalQuestions: questions.length,
      answeredQuestions,
      gradedQuestions,
      attemptedParts,
      missingAnswers: questions.filter(question => !answeredQuestions.includes(question)),
      missingGrades: questions.filter(question => !gradedQuestions.includes(question)),
      isComplete: questions.length > 0
        && answeredQuestions.length === questions.length
        && gradedQuestions.length === questions.length
    };
  }

  function getAnsweredPartKeys(sectionMeta, answersValue) {
    const answers = plainObject(answersValue);
    return Object.entries(plainObject(sectionMeta?.parts))
      .filter(([, partData]) => {
        for (let question = Number(partData.startQ); question <= Number(partData.endQ); question += 1) {
          if (hasAnswer(answers[question])) return true;
        }
        return false;
      })
      .map(([partKey]) => partKey);
  }

  function getAttemptMeta(item) {
    return plainObject(plainObject(item?.answers).meta);
  }

  function isPartialPracticeAttempt(item) {
    const meta = getAttemptMeta(item);
    return meta.attemptType === PARTIAL_PRACTICE_TYPE
      || meta.practiceMode === "partial"
      || item?.attemptType === PARTIAL_PRACTICE_TYPE;
  }

  function isScoredAttempt(item) {
    return Boolean(item)
      && !isPartialPracticeAttempt(item)
      && Number(item.total) > 0
      && Number.isFinite(Number(item.scaleScore));
  }

  function getScoredAttempts(history, section) {
    return (Array.isArray(history) ? history : []).filter(item => {
      return isScoredAttempt(item) && (!section || item.section === section);
    });
  }

  function getAttemptedQuestionNumbers(item, sectionMeta) {
    const gradedStates = plainObject(item?.gradedStates);
    const questions = [];
    Object.values(plainObject(sectionMeta?.parts)).forEach(partData => {
      for (let question = Number(partData.startQ); question <= Number(partData.endQ); question += 1) {
        if (hasGrade(partData, gradedStates[question])) questions.push(question);
      }
    });
    return questions;
  }

  function getAttemptedPartKeys(item, sectionMeta) {
    const attemptedQuestions = new Set(getAttemptedQuestionNumbers(item, sectionMeta));
    return Object.entries(plainObject(sectionMeta?.parts))
      .filter(([, partData]) => {
        for (let question = Number(partData.startQ); question <= Number(partData.endQ); question += 1) {
          if (attemptedQuestions.has(question)) return true;
        }
        return false;
      })
      .map(([partKey]) => partKey);
  }

  return {
    PARTIAL_PRACTICE_TYPE,
    hasAnswer,
    hasGrade,
    getObjectiveAttemptCompletion,
    getAnsweredPartKeys,
    isPartialPracticeAttempt,
    isScoredAttempt,
    getScoredAttempts,
    getAttemptedQuestionNumbers,
    getAttemptedPartKeys
  };
});
