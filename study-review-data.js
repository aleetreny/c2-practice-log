(function initialiseStudyReviewData(root) {
  const STUDY_DATA_VERSION = 3;
  const TRACKED_PARTS = [
    { id: "reading:part1", section: "reading", partKey: "part1", startQ: 1, endQ: 8 },
    { id: "useOfEnglish:part2", section: "useOfEnglish", partKey: "part2", startQ: 9, endQ: 16 },
    { id: "useOfEnglish:part3", section: "useOfEnglish", partKey: "part3", startQ: 17, endQ: 24 },
    { id: "useOfEnglish:part4", section: "useOfEnglish", partKey: "part4", startQ: 25, endQ: 30 }
  ];

  function plainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function getTrackedPart(section, question) {
    return TRACKED_PARTS.find(part => part.section === section && question >= part.startQ && question <= part.endQ) || null;
  }

  function isFullCredit(gradeState, maxPoints) {
    return gradeState === "correct" || (typeof gradeState === "number" && gradeState >= maxPoints);
  }

  function isMissedAnswer(gradeState, maxPoints) {
    return gradeState === "incorrect" || (typeof gradeState === "number" && gradeState < maxPoints);
  }

  function shouldIncludeInErrorLog(gradeState, maxPoints, note, includeCorrectWithoutNotes = false) {
    return isMissedAnswer(gradeState, maxPoints)
      || Boolean(String(note || "").trim())
      || (includeCorrectWithoutNotes && isFullCredit(gradeState, maxPoints));
  }

  function normalizeCorrectAnswer(value) {
    return String(value || "").trim().toLocaleUpperCase("en-GB");
  }

  function getUppercaseInputState(value, selectionStart, selectionEnd) {
    const source = String(value || "");
    const sourceLength = source.length;
    const start = Number.isInteger(selectionStart)
      ? Math.max(0, Math.min(selectionStart, sourceLength))
      : sourceLength;
    const end = Number.isInteger(selectionEnd)
      ? Math.max(start, Math.min(selectionEnd, sourceLength))
      : start;

    return {
      value: source.toLocaleUpperCase("en-GB"),
      selectionStart: source.slice(0, start).toLocaleUpperCase("en-GB").length,
      selectionEnd: source.slice(0, end).toLocaleUpperCase("en-GB").length
    };
  }

  function normalizeStudySearch(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("en-GB")
      .trim();
  }

  function matchesTrackedErrorSearch(error, query) {
    const normalizedQuery = normalizeStudySearch(query);
    if (!normalizedQuery) return true;
    const haystack = normalizeStudySearch([
      `Q.${error?.question ?? ""}`,
      error?.question,
      error?.section,
      error?.sectionName,
      error?.partKey,
      error?.partName,
      error?.answer,
      error?.correctAnswer,
      error?.note,
      error?.gradeState
    ].join(" "));
    return haystack.includes(normalizedQuery);
  }

  function cleanCorrectAnswerLine(line) {
    return String(line || "")
      .replace(/^\s*(?:correct(?:\s+answer)?|answer|respuesta(?:\s+correcta)?|soluci[oó]n)\s*[:\-–—]\s*/i, "")
      .trim();
  }

  function parseLegacyCorrectAnswerLine(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed || trimmed.length > 500) return null;
    const hasExplicitPrefix = /^(?:correct(?:\s+answer)?|answer|respuesta(?:\s+correcta)?|soluci[oó]n)\s*[:\-–—]/i.test(trimmed);
    const content = cleanCorrectAnswerLine(trimmed);
    const delimited = content.match(/^(.+?)(\s+(?:—|–|=|-)\s+|,\s+|:\s+)(.+)$/u);
    const candidate = (delimited ? delimited[1] : content).trim();
    const letters = candidate.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || [];
    const isUppercaseAnswer = letters.length > 0 && candidate === candidate.toLocaleUpperCase("en-GB");

    if (!hasExplicitPrefix && !isUppercaseAnswer) return null;
    return {
      answer: candidate,
      remainder: delimited ? delimited[3].trim() : ""
    };
  }

  function isLegacyCorrectAnswerLine(line) {
    return Boolean(parseLegacyCorrectAnswerLine(line));
  }

  function splitLegacyStudyNote(note, fallbackAnswer, gradeState, maxPoints = 1) {
    const original = typeof note === "string" ? note.replace(/\r\n?/g, "\n").trim() : "";
    const lines = original ? original.split("\n") : [];
    const firstContentIndex = lines.findIndex(line => line.trim());
    const firstLine = firstContentIndex >= 0 ? lines[firstContentIndex].trim() : "";
    const parsedFirstLine = parseLegacyCorrectAnswerLine(firstLine);
    const matchedLegacy = Boolean(parsedFirstLine);

    if (matchedLegacy) {
      const remainingLines = lines.flatMap((line, index) => {
        if (index !== firstContentIndex) return [line];
        return parsedFirstLine.remainder ? [parsedFirstLine.remainder] : [];
      });
      return {
        correctAnswer: normalizeCorrectAnswer(parsedFirstLine.answer),
        note: remainingLines.join("\n").trim(),
        matchedLegacy: true,
        inferredFromAnswer: false,
        original
      };
    }

    const canInfer = isFullCredit(gradeState, maxPoints) && String(fallbackAnswer || "").trim();
    return {
      correctAnswer: canInfer ? normalizeCorrectAnswer(fallbackAnswer) : "",
      note: original,
      matchedLegacy: false,
      inferredFromAnswer: Boolean(canInfer),
      original
    };
  }

  function getCorrectAnswers(item) {
    const stored = plainObject(plainObject(plainObject(item).answers).meta).correctAnswers;
    return Object.fromEntries(
      Object.entries(plainObject(stored))
        .map(([question, answer]) => [question, normalizeCorrectAnswer(answer)])
        .filter(([, answer]) => answer)
    );
  }

  function migrateHistoryStudyData(history, metadata) {
    const source = Array.isArray(history) ? history : [];
    const audit = {
      attempts: 0,
      gradedAnswers: 0,
      migratedAnswers: 0,
      inferredCorrectAnswers: 0,
      unresolvedAnswers: 0,
      missingPartTexts: 0,
      legacyNotesPreserved: 0,
      issues: []
    };
    let changed = false;

    const migratedHistory = source.map(originalItem => {
      if (!originalItem || !["reading", "useOfEnglish"].includes(originalItem.section)) return originalItem;

      const answers = { ...plainObject(originalItem.answers) };
      const originalMeta = plainObject(answers.meta);
      const meta = { ...originalMeta };
      const notes = { ...plainObject(meta.errorNotes) };
      const correctAnswers = { ...plainObject(meta.correctAnswers) };
      const legacyErrorNotes = { ...plainObject(meta.legacyErrorNotes) };
      const gradedStates = plainObject(originalItem.gradedStates);
      const partTexts = originalItem.section === "reading"
        ? plainObject(meta.readingPartTexts)
        : plainObject(meta.useOfEnglishPartTexts);
      let itemChanged = false;
      let hasTrackedGrade = false;

      TRACKED_PARTS.filter(part => part.section === originalItem.section).forEach(part => {
        const partData = metadata?.[part.section]?.parts?.[part.partKey];
        const maxPoints = Number(partData?.weight) || (part.partKey === "part4" ? 2 : 1);

        for (let question = part.startQ; question <= part.endQ; question += 1) {
          const gradeState = gradedStates[question];
          const hasGrade = gradeState === "correct" || gradeState === "incorrect" || Number.isFinite(gradeState);
          if (!hasGrade) continue;

          hasTrackedGrade = true;
          audit.gradedAnswers += 1;
          const storedCorrectAnswer = typeof correctAnswers[question] === "string" ? correctAnswers[question].trim() : "";
          const existingCorrectAnswer = normalizeCorrectAnswer(storedCorrectAnswer);
          const legacyNote = typeof notes[question] === "string" ? notes[question] : "";

          if (storedCorrectAnswer && storedCorrectAnswer !== existingCorrectAnswer) {
            correctAnswers[question] = existingCorrectAnswer;
            itemChanged = true;
          }

          if (!existingCorrectAnswer) {
            const split = splitLegacyStudyNote(legacyNote, answers[question], gradeState, maxPoints);
            if (split.correctAnswer) {
              correctAnswers[question] = normalizeCorrectAnswer(split.correctAnswer);
              itemChanged = true;
              if (split.matchedLegacy) {
                audit.migratedAnswers += 1;
                if (!(question in legacyErrorNotes)) {
                  legacyErrorNotes[question] = split.original;
                  audit.legacyNotesPreserved += 1;
                }
                if (split.note) notes[question] = split.note;
                else delete notes[question];
              } else if (split.inferredFromAnswer) {
                audit.inferredCorrectAnswers += 1;
              }
            } else {
              audit.unresolvedAnswers += 1;
              if (audit.issues.length < 50) {
                audit.issues.push({
                  type: "missing-correct-answer",
                  attemptId: originalItem.id,
                  section: originalItem.section,
                  partKey: part.partKey,
                  question
                });
              }
            }
          }

          if (!String(partTexts[part.partKey] || "").trim()) {
            audit.missingPartTexts += 1;
          }
        }
      });

      if (!hasTrackedGrade) return originalItem;
      audit.attempts += 1;

      if (Object.keys(correctAnswers).length > 0) meta.correctAnswers = correctAnswers;
      if (Object.keys(notes).length > 0) meta.errorNotes = notes;
      else delete meta.errorNotes;
      if (Object.keys(legacyErrorNotes).length > 0) meta.legacyErrorNotes = legacyErrorNotes;
      if (meta.studyDataVersion !== STUDY_DATA_VERSION) {
        meta.studyDataVersion = STUDY_DATA_VERSION;
        itemChanged = true;
      }

      if (!itemChanged) return originalItem;
      changed = true;
      answers.meta = meta;
      return { ...originalItem, answers };
    });

    return { history: migratedHistory, changed, audit };
  }

  function extractStudyReviewPrompt(referenceText, question, startQ, endQ) {
    const fullText = String(referenceText || "").replace(/\r\n?/g, "\n").trim();
    if (!fullText) return { text: "", mode: "missing" };

    const lines = fullText.split("\n");
    const markerPattern = number => new RegExp(`^\\s*(?:Q(?:uestion)?\\.?\\s*)?${number}(?:\\s*[.):\\-–—]|\\s+)`, "i");
    const startIndex = lines.findIndex(line => markerPattern(question).test(line));

    if (startIndex >= 0) {
      let endIndex = lines.length;
      for (let index = startIndex + 1; index < lines.length; index += 1) {
        let isNextQuestion = false;
        for (let candidate = question + 1; candidate <= endQ; candidate += 1) {
          if (markerPattern(candidate).test(lines[index])) {
            isNextQuestion = true;
            break;
          }
        }
        if (isNextQuestion) {
          endIndex = index;
          break;
        }
      }

      const excerpt = lines.slice(startIndex, endIndex).join("\n").trim();
      if (excerpt) return { text: excerpt, mode: "question" };
    }

    return { text: fullText, mode: "part" };
  }

  function getStudyReviewPrompt(referenceText, partKey, question, startQ, endQ) {
    const fullText = String(referenceText || "").replace(/\r\n?/g, "\n").trim();
    if (!fullText) return { text: "", mode: "missing" };
    if (partKey !== "part4") return { text: fullText, mode: "part" };
    return extractStudyReviewPrompt(fullText, question, startQ, endQ);
  }

  const api = {
    STUDY_DATA_VERSION,
    TRACKED_PARTS,
    getTrackedPart,
    isFullCredit,
    isMissedAnswer,
    shouldIncludeInErrorLog,
    normalizeCorrectAnswer,
    getUppercaseInputState,
    normalizeStudySearch,
    matchesTrackedErrorSearch,
    parseLegacyCorrectAnswerLine,
    isLegacyCorrectAnswerLine,
    splitLegacyStudyNote,
    getCorrectAnswers,
    migrateHistoryStudyData,
    extractStudyReviewPrompt,
    getStudyReviewPrompt
  };

  root.C2_STUDY_REVIEW = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
