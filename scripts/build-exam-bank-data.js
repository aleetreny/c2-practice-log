const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const READING_SOURCE = path.join(ROOT, "cambridge_c2_reading_12_tests_polished.md");
const LISTENING_SOURCE = path.join(ROOT, "c2_listening_youtube_embeds_corrected.md");
const LISTENING_INDEX_SOURCE = path.join(ROOT, "c2_listening_playlist_indexes.json");
const WRITING_SOURCE = path.join(ROOT, "C2_Proficiency_Writing_Practice_Bank.md");
const WRITING_EXTRA_SOURCE = path.join(ROOT, "C2_Writing_Part_1_Practice_4_Tests.md");
const DEMO_SOURCE = path.join(ROOT, "demo-data.js");
const READING_PART1_EXTRA_SOURCE = path.join(ROOT, "data", "reading-part1-test12.json");
const OUTPUT = path.join(ROOT, "exam-bank-data.js");

function readSource(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing source file: ${path.basename(filePath)}`);
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function parseDemoSnapshot(source) {
  const context = {};
  vm.runInNewContext(source, context, { filename: path.basename(DEMO_SOURCE) });
  const history = context.C2_DEMO_DATA?.history;
  if (!Array.isArray(history)) throw new Error("Demo snapshot: history is unavailable");
  return history;
}

function cleanBlock(value) {
  return String(value || "")
    .replace(/^---\s*$/gm, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitNumberedSections(source, headingPattern) {
  const matches = [...source.matchAll(headingPattern)];
  return matches.map((match, index) => ({
    number: Number(match[1]),
    suffix: String(match[2] || "").trim(),
    body: source.slice(match.index + match[0].length, matches[index + 1]?.index ?? source.length).trim()
  }));
}

function sectionBetween(source, startHeading, endHeading) {
  const start = source.search(startHeading);
  if (start < 0) return "";
  const afterStart = source.slice(start).replace(startHeading, "");
  const end = endHeading ? afterStart.search(endHeading) : -1;
  return cleanBlock(end >= 0 ? afterStart.slice(0, end) : afterStart);
}

function firstHeading(block, level = 3) {
  const match = block.match(new RegExp(`^#{${level}}\\s+(.+)$`, "m"));
  return match ? match[1].trim() : "";
}

function splitAtHeading(block, heading) {
  const marker = `${"#".repeat(heading.level || 3)} ${heading.text}`;
  const index = block.indexOf(marker);
  return index >= 0
    ? [cleanBlock(block.slice(0, index)), cleanBlock(block.slice(index + marker.length))]
    : [cleanBlock(block), ""];
}

function parseQuestions(block, minimum, maximum, optionLetters = "ABCD") {
  const lines = block.split("\n");
  const questions = [];
  let current = null;
  let currentOption = null;

  function flushOption() {
    if (!current || !currentOption) return;
    current.options.push({
      value: currentOption.value,
      text: cleanBlock(currentOption.lines.join(" "))
    });
    currentOption = null;
  }

  function flushQuestion() {
    if (!current) return;
    flushOption();
    current.prompt = cleanBlock(current.promptLines.join(" "));
    delete current.promptLines;
    questions.push(current);
    current = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const questionMatch = line.match(/^(\d+)\.\s*(.*)$/);
    if (questionMatch) {
      const number = Number(questionMatch[1]);
      if (number >= minimum && number <= maximum) {
        flushQuestion();
        current = { number, promptLines: [questionMatch[2]], options: [] };
        continue;
      }
    }

    const optionMatch = line.match(new RegExp(`^([${optionLetters}])\\.\\s*(.*)$`));
    if (current && optionMatch) {
      flushOption();
      currentOption = { value: optionMatch[1], lines: [optionMatch[2]] };
      continue;
    }

    if (!line || !current) continue;
    if (currentOption) currentOption.lines.push(line);
    else current.promptLines.push(line);
  }

  flushQuestion();
  return questions;
}

function parseLetteredBlocks(block, headingLevel = 4) {
  const headingRegex = new RegExp(`^#{${headingLevel}}\\s+([A-H])(?:\\.\\s*)?(.*)$`, "gm");
  const matches = [...block.matchAll(headingRegex)];
  return matches.map((match, index) => ({
    label: match[1],
    title: String(match[2] || "").trim(),
    text: cleanBlock(block.slice(match.index + match[0].length, matches[index + 1]?.index ?? block.length))
  }));
}

function parseParagraphOptions(block) {
  const matches = [...block.matchAll(/^([A-H])\.\s+(.+)$/gm)];
  return matches.map((match, index) => ({
    label: match[1],
    text: cleanBlock([
      match[2],
      block.slice(match.index + match[0].length, matches[index + 1]?.index ?? block.length)
    ].join("\n"))
  }));
}

function parseAnswerKey(answerBlock, partNumber) {
  const block = sectionBetween(
    answerBlock,
    new RegExp(`^### Part ${partNumber}\\s*$`, "m"),
    /^### Part \d+\s*$/m
  );
  return Object.fromEntries([...block.matchAll(/(\d+)\s+([A-H])/g)].map(match => [match[1], match[2]]));
}

function parseReadingTests(source) {
  return splitNumberedSections(source, /^# Test (\d+)\s+—\s*(.*)$/gm).map(test => {
    const part5Block = sectionBetween(test.body, /^## Part 5\s*$/m, /^## Part 6\s*$/m);
    const part6Block = sectionBetween(test.body, /^## Part 6\s*$/m, /^## Part 7\s*$/m);
    const part7Block = sectionBetween(test.body, /^## Part 7\s*$/m, /^## Answer Key\s*$/m);
    const answerBlock = sectionBetween(test.body, /^## Answer Key\s*$/m, null);

    const part5Title = firstHeading(part5Block);
    const [part5Lead, part5AfterTitle] = splitAtHeading(part5Block, { level: 3, text: part5Title });
    const [part5Passage, part5QuestionBlock] = splitAtHeading(part5AfterTitle, { level: 3, text: "Questions 31–36" });

    const part6Title = firstHeading(part6Block);
    const [part6Lead, part6AfterTitle] = splitAtHeading(part6Block, { level: 3, text: part6Title });
    const [part6Passage, part6ParagraphBlock] = splitAtHeading(part6AfterTitle, { level: 3, text: "Paragraphs A–H" });

    const part7Headings = [...part7Block.matchAll(/^###\s+(.+)$/gm)];
    const part7PromptTitle = part7Headings[0]?.[1]?.trim() || "Which section mentions the following?";
    const part7ArticleTitle = part7Headings[1]?.[1]?.trim() || `Reading Test ${test.number} Part 7`;
    const [part7Lead, part7AfterPrompt] = splitAtHeading(part7Block, { level: 3, text: part7PromptTitle });
    const [part7QuestionBlock, part7SectionsBlock] = splitAtHeading(part7AfterPrompt, { level: 3, text: part7ArticleTitle });

    const answers = {
      ...parseAnswerKey(answerBlock, 5),
      ...parseAnswerKey(answerBlock, 6),
      ...parseAnswerKey(answerBlock, 7)
    };

    const parsed = {
      id: `reading-${test.number}`,
      number: test.number,
      title: `Reading Test ${test.number}`,
      sourceTitle: test.suffix,
      parts: {
        part5: {
          number: 5,
          title: part5Title,
          instructions: cleanBlock(part5Lead),
          passage: cleanBlock(part5Passage),
          questions: parseQuestions(part5QuestionBlock, 31, 36, "ABCD")
        },
        part6: {
          number: 6,
          title: part6Title,
          instructions: cleanBlock(part6Lead),
          passage: cleanBlock(part6Passage),
          paragraphs: parseParagraphOptions(part6ParagraphBlock),
          questions: Array.from({ length: 7 }, (_, index) => ({ number: 37 + index, prompt: `Gap ${37 + index}` }))
        },
        part7: {
          number: 7,
          title: part7ArticleTitle,
          questionHeading: part7PromptTitle,
          instructions: cleanBlock(part7Lead),
          questions: parseQuestions(part7QuestionBlock, 44, 53, ""),
          sections: parseLetteredBlocks(part7SectionsBlock)
        }
      },
      answers
    };

    validateReadingTest(parsed);
    return parsed;
  });
}

function parseReadingPart1OptionRow(line) {
  const normalized = String(line || "").replace(/\s*\|\s*/g, " ").trim();
  const match = normalized.match(/^(\d+)\s+A\s+(.+?)\s+B\s+(.+?)\s+C\s+(.+?)\s+D\s+(.+)$/);
  if (!match) return null;
  return {
    number: Number(match[1]),
    prompt: `Gap ${match[1]}`,
    options: ["A", "B", "C", "D"].map((value, index) => ({ value, text: match[index + 2].trim() }))
  };
}

function parseReadingPart1Attempts(history) {
  return history
    .filter(attempt => attempt.section === "reading" && attempt.answers?.meta?.readingPartTexts?.part1)
    .sort((a, b) => a.date - b.date)
    .map((attempt, index) => {
      const source = cleanBlock(attempt.answers.meta.readingPartTexts.part1);
      const lines = source.split("\n");
      const parsedRows = lines.map((line, lineIndex) => ({ lineIndex, question: parseReadingPart1OptionRow(line) })).filter(item => item.question);
      const questions = parsedRows.map(item => item.question);
      const firstOptionLine = parsedRows[0]?.lineIndex ?? lines.length;
      const titleIndex = lines.findIndex(line => line.trim());
      const title = lines[titleIndex]?.trim() || `Reading Part 1 source ${index + 1}`;
      const passage = cleanBlock(lines.slice(titleIndex + 1, firstOptionLine).join("\n"));
      const answers = Object.fromEntries(Array.from({ length: 8 }, (_, offset) => {
        const question = offset + 1;
        return [question, String(attempt.answers.meta.correctAnswers?.[question] || "").trim().toUpperCase()];
      }));

      if (questions.length !== 8 || questions[0]?.number !== 1 || questions.at(-1)?.number !== 8) {
        throw new Error(`Reading Part 1 source ${index + 1}: expected Q.1–8`);
      }
      if (questions.some(question => question.options.length !== 4)) {
        throw new Error(`Reading Part 1 source ${index + 1}: every question must have four options`);
      }
      if (Object.values(answers).some(answer => !/^[A-D]$/.test(answer))) {
        throw new Error(`Reading Part 1 source ${index + 1}: incomplete answer key`);
      }

      return {
        sourceAttemptId: attempt.id,
        part: {
          number: 1,
          title,
          instructions: "Read the text and decide which answer (A, B, C or D) best fits each gap.",
          passage,
          questions
        },
        answers
      };
    });
}

function parseSupplementalReadingPart1(source) {
  const parsed = JSON.parse(source);
  if (typeof parsed.source !== "string" || !parsed.correctAnswers || typeof parsed.correctAnswers !== "object") {
    throw new Error("Supplemental Reading Part 1: source text or correction key is missing");
  }
  const [result] = parseReadingPart1Attempts([{
    id: "reading-part1-supplemental-12",
    section: "reading",
    date: 0,
    answers: {
      meta: {
        readingPartTexts: { part1: parsed.source },
        correctAnswers: parsed.correctAnswers
      }
    }
  }]);
  if (!result) throw new Error("Supplemental Reading Part 1 could not be parsed");
  return result;
}

function attachReadingPart1(readingTests, part1Sources) {
  if (part1Sources.length !== 12) throw new Error(`Reading Part 1: expected 12 sources, found ${part1Sources.length}`);
  return readingTests.map((test, index) => {
    const source = part1Sources[index];
    if (!source) throw new Error(`${test.id}: missing paired Reading Part 1 source`);
    return {
      ...test,
      parts: { part1: source.part, ...test.parts },
      answers: { ...source.answers, ...test.answers },
      part1SourceAttemptId: source.sourceAttemptId
    };
  });
}

function validateReadingTest(test) {
  const expected = { part5: [6, 31, 36], part6: [7, 37, 43], part7: [10, 44, 53] };
  for (const [partKey, [count, first, last]] of Object.entries(expected)) {
    const questions = test.parts[partKey].questions;
    if (questions.length !== count || questions[0]?.number !== first || questions.at(-1)?.number !== last) {
      throw new Error(`${test.id} ${partKey}: expected Q.${first}–${last}, found ${questions.map(item => item.number).join(", ")}`);
    }
  }
  if (test.parts.part5.questions.some(question => question.options.length !== 4)) {
    throw new Error(`${test.id} part5: every question must have four options`);
  }
  if (test.parts.part6.paragraphs.length !== 8) throw new Error(`${test.id} part6: expected eight paragraphs`);
  if (test.parts.part7.sections.length < 4) throw new Error(`${test.id} part7: expected at least four sections`);
  if (Object.keys(test.answers).length !== 23) throw new Error(`${test.id}: expected 23 answer-key entries`);
}

const USE_OF_ENGLISH_PARTS = {
  part2: { number: 2, start: 9, end: 16, title: "Open cloze", weight: 1 },
  part3: { number: 3, start: 17, end: 24, title: "Word formation", weight: 1 },
  part4: { number: 4, start: 25, end: 30, title: "Key word transformations", weight: 2 }
};

function parseUseOfEnglishBank(history) {
  const attempts = history
    .filter(attempt => attempt.section === "useOfEnglish" && attempt.answers?.meta?.useOfEnglishPartTexts?.part4)
    .sort((a, b) => a.date - b.date);
  const fullPapers = attempts.filter(attempt => ["part2", "part3", "part4"].every(partKey => attempt.answers.meta.useOfEnglishPartTexts[partKey]));
  const part4Drills = attempts.filter(attempt => !attempt.answers.meta.useOfEnglishPartTexts.part2 && !attempt.answers.meta.useOfEnglishPartTexts.part3);
  if (fullPapers.length !== 24 || part4Drills.length !== 20) {
    throw new Error(`Use of English logs: expected 24 full papers and 20 Part 4 drills, found ${fullPapers.length} and ${part4Drills.length}`);
  }

  return [...fullPapers, ...part4Drills].map((attempt, index) => {
    const texts = attempt.answers.meta.useOfEnglishPartTexts;
    const partKeys = Object.keys(USE_OF_ENGLISH_PARTS).filter(partKey => texts[partKey]);
    const parts = Object.fromEntries(partKeys.map(partKey => {
      const config = USE_OF_ENGLISH_PARTS[partKey];
      return [partKey, {
        number: config.number,
        title: config.title,
        instructions: partKey === "part2"
          ? "Think of the single word which best fits each gap."
          : partKey === "part3"
            ? "Use the word given in capitals to form a word that fits each gap."
            : "Complete the second sentence using three to eight words, including the key word given.",
        passage: cleanBlock(texts[partKey]),
        questions: Array.from({ length: config.end - config.start + 1 }, (_, offset) => ({
          number: config.start + offset,
          prompt: partKey === "part4" ? `Transformation ${config.start + offset}` : `Gap ${config.start + offset}`
        }))
      }];
    }));
    const answers = Object.fromEntries(partKeys.flatMap(partKey => {
      const config = USE_OF_ENGLISH_PARTS[partKey];
      return Array.from({ length: config.end - config.start + 1 }, (_, offset) => {
        const question = config.start + offset;
        return [question, String(attempt.answers.meta.correctAnswers?.[question] || "").trim()];
      });
    }));
    if (Object.values(answers).some(answer => !answer)) throw new Error(`Use of English source ${index + 1}: incomplete answer key`);
    const isFull = partKeys.length === 3;
    const drillNumber = index - fullPapers.length + 1;
    return {
      id: `use-of-english-${index + 1}`,
      number: index + 1,
      kind: isFull ? "full" : "part4",
      title: isFull ? `Use of English Paper ${index + 1}` : `Part 4 Drill ${drillNumber}`,
      sourceAttemptId: attempt.id,
      parts,
      answers
    };
  });
}

function parseWritingTaskBlock(block, headingRegex) {
  const matches = [...block.matchAll(headingRegex)];
  return matches.map((match, index) => ({
    title: String(match[1] || "").trim(),
    body: cleanBlock(block.slice(match.index + match[0].length, matches[index + 1]?.index ?? block.length))
  }));
}

function normalizeWritingType(value) {
  const label = String(value || "").trim();
  const normalized = label.toLowerCase();
  const type = normalized.includes("letter") || normalized.includes("email")
    ? "email-letter"
    : normalized.includes("report")
      ? "report"
      : normalized.includes("review")
        ? "review"
        : "article";
  return { type, label: label || "Article" };
}

function parseWritingTests(source) {
  return splitNumberedSections(source, /^# Practice Test (\d+)(?:\s+—\s*(.*))?$/gm).map(test => {
    const part1Block = sectionBetween(test.body, /^## Part 1\s+—\s+Essay\s*$/m, /^## Part 2(?:\s+—\s+.*)?\s*$/m);
    const part2HeadingMatch = test.body.match(/^## Part 2(?:\s+—\s+(.*))?\s*$/m);
    const part2Block = part2HeadingMatch
      ? cleanBlock(test.body.slice(part2HeadingMatch.index + part2HeadingMatch[0].length))
      : "";
    const textMatches = [...part1Block.matchAll(/^### Text (\d+)(?:\s+—\s*(.*))?\s*$/gm)];
    const firstTextIndex = textMatches[0]?.index ?? part1Block.length;
    const instructions = cleanBlock(part1Block.slice(0, firstTextIndex));
    const texts = textMatches.map((match, index) => ({
      number: Number(match[1]),
      title: String(match[2] || `Text ${match[1]}`).trim(),
      body: cleanBlock(part1Block.slice(match.index + match[0].length, textMatches[index + 1]?.index ?? part1Block.length).replace(/\nWrite your essay\.\s*$/i, ""))
    }));

    let part2Tasks = [];
    const questionMatches = [...part2Block.matchAll(/^### Question (\d+)\s+—\s*(.+)\s*$/gm)];
    if (questionMatches.length > 0) {
      part2Tasks = questionMatches.map((match, index) => {
        const writingType = normalizeWritingType(match[2]);
        return {
          id: `writing-${test.number}-q${match[1]}`,
          question: Number(match[1]),
          ...writingType,
          prompt: cleanBlock(part2Block.slice(match.index + match[0].length, questionMatches[index + 1]?.index ?? part2Block.length).replace(/\nWrite your \*\*[^*]+\*\*\.\s*$/i, ""))
        };
      });
    } else if (part2Block) {
      const writingType = normalizeWritingType(part2HeadingMatch?.[1]);
      part2Tasks = [{
        id: `writing-${test.number}-q2`,
        question: 2,
        ...writingType,
        prompt: cleanBlock(part2Block.replace(/\nWrite your (?:article|letter) in \*\*280–320 words\*\*\.\s*$/i, ""))
      }];
    }

    const parsed = {
      id: `writing-${test.number}`,
      number: test.number,
      title: test.suffix || `Writing Practice Test ${test.number}`,
      part1: {
        title: "Compulsory Essay",
        instructions,
        texts
      },
      part2Tasks
    };
    validateWritingTest(parsed);
    return parsed;
  });
}

function validateWritingTest(test) {
  if (test.part1.texts.length !== 2) throw new Error(`${test.id}: expected two Part 1 texts`);
  if (test.part1.texts.some(text => !text.body)) throw new Error(`${test.id}: empty Part 1 text`);
  const expectedPart2Counts = [3, 3, 3, 3, 0, 0, 0, 0, 1, 1];
  if (test.part2Tasks.length !== expectedPart2Counts[test.number - 1]) {
    throw new Error(`${test.id}: expected ${expectedPart2Counts[test.number - 1]} Part 2 tasks, found ${test.part2Tasks.length}`);
  }
}

function parseAdditionalWritingPart1(source) {
  return splitNumberedSections(source, /^## Practice Test (\d+)(?:\s+—\s*(.*))?$/gm).map(test => {
    const block = sectionBetween(test.body, /^### Part 1\s*$/m, null);
    const textMatches = [...block.matchAll(/^### Text (\d+)\s*$/gm)];
    const firstTextIndex = textMatches[0]?.index ?? block.length;
    const instructions = cleanBlock(block.slice(0, firstTextIndex));
    const texts = textMatches.map((match, index) => {
      const textBlock = cleanBlock(block.slice(match.index + match[0].length, textMatches[index + 1]?.index ?? block.length));
      const titleMatch = textBlock.match(/^####\s+(.+)$/m);
      const title = titleMatch?.[1]?.trim() || `Text ${match[1]}`;
      return {
        number: Number(match[1]),
        title,
        body: cleanBlock(textBlock.replace(/^####\s+.+$/m, ""))
      };
    });
    if (texts.length !== 2 || texts.some(text => !text.body)) {
      throw new Error(`Additional Writing Part 1 source ${test.number}: expected two complete texts`);
    }
    return {
      sourceId: `writing-extra-${test.number}`,
      title: test.suffix || `Additional Writing Part 1 ${test.number}`,
      part1: { title: "Compulsory Essay", instructions, texts }
    };
  });
}

const WRITING_PART1_TOPICS = [
  "Music", "Cinema", "Food", "Reading", "Museums", "Advertising", "Photography",
  "Gangs", "Conservation", "Environment", "Sport", "Food", "Inequality", "Censorship"
];

const WRITING_PART2_TOPICS = {
  "writing-1-q2": "Friendship",
  "writing-1-q3": "Culture",
  "writing-1-q4": "Tourism",
  "writing-2-q2": "Languages",
  "writing-2-q3": "Countryside",
  "writing-2-q4": "Technology",
  "writing-3-q2": "Leisure",
  "writing-3-q3": "History",
  "writing-3-q4": "Inheritance",
  "writing-4-q2": "Travel",
  "writing-4-q3": "Sport",
  "writing-4-q4": "Comedy",
  "writing-9-q2": "Globalisation",
  "writing-10-q2": "Environment"
};

function pairWritingTests(baseTests, additionalPart1) {
  const part1Sources = [
    ...baseTests.map(test => ({ sourceId: test.id, title: test.title, part1: test.part1 })),
    ...additionalPart1
  ];
  const part2Sources = baseTests.flatMap(test => test.part2Tasks);
  if (part1Sources.length !== 14 || part2Sources.length !== 14) {
    throw new Error(`Writing pairing: expected 14 Part 1 and 14 Part 2 sources, found ${part1Sources.length} and ${part2Sources.length}`);
  }

  // Fixed shuffle: pairings stay stable so saved attempt IDs and prompts never drift between builds.
  const part2Order = [9, 0, 12, 4, 7, 2, 10, 5, 13, 1, 8, 3, 11, 6];
  return part1Sources.map((source, index) => {
    const sourceTask = part2Sources[part2Order[index]];
    const number = index + 1;
    const task = {
      ...sourceTask,
      id: `writing-${number}-q2`,
      question: 2,
      sourceId: sourceTask.id,
      topic: WRITING_PART2_TOPICS[sourceTask.id] || "Ideas"
    };
    return {
      id: `writing-${number}`,
      number,
      title: `Writing Practice Set ${number}`,
      sourcePart1Id: source.sourceId,
      part1Topic: WRITING_PART1_TOPICS[index],
      part1: source.part1,
      part2Tasks: [task]
    };
  });
}

function parseListeningTests(indexSource, documentationSource) {
  const parsed = JSON.parse(indexSource);
  if (!/^PL[\w-]+$/.test(parsed.playlist_id || "")) throw new Error("Listening: invalid playlist ID");
  if (!documentationSource.includes(parsed.playlist_id)) throw new Error("Listening: Markdown and JSON playlist IDs do not match");
  if (!Array.isArray(parsed.tests) || parsed.tests.length !== 33) {
    throw new Error(`Listening: expected 33 playlist entries, found ${parsed.tests?.length || 0}`);
  }
  return parsed.tests.map((entry, index) => ({
    id: `listening-${index + 1}`,
    number: index + 1,
    sourceTest: entry.test,
    title: `C2 Proficiency Listening Test ${index + 1}`,
    playlistId: parsed.playlist_id,
    playlistPosition: entry.playlist_position,
    apiIndex: entry.api_index,
    watchUrl: entry.playlist_url
  }));
}

function build() {
  const readingSource = readSource(READING_SOURCE);
  const listeningSource = readSource(LISTENING_SOURCE);
  const listeningIndexSource = readSource(LISTENING_INDEX_SOURCE);
  const writingSource = readSource(WRITING_SOURCE);
  const writingExtraSource = readSource(WRITING_EXTRA_SOURCE);
  const demoSource = readSource(DEMO_SOURCE);
  const readingPart1ExtraSource = readSource(READING_PART1_EXTRA_SOURCE);
  const history = parseDemoSnapshot(demoSource);
  const readingPart1Sources = [...parseReadingPart1Attempts(history), parseSupplementalReadingPart1(readingPart1ExtraSource)];
  const reading = attachReadingPart1(parseReadingTests(readingSource), readingPart1Sources);
  const useOfEnglish = parseUseOfEnglishBank(history);
  const writing = pairWritingTests(parseWritingTests(writingSource), parseAdditionalWritingPart1(writingExtraSource));
  const data = {
    version: 2,
    sourceDigest: crypto.createHash("sha256")
      .update(readingSource)
      .update(listeningSource)
      .update(listeningIndexSource)
      .update(writingSource)
      .update(writingExtraSource)
      .update(demoSource)
      .update(readingPart1ExtraSource)
      .digest("hex")
      .slice(0, 16),
    useOfEnglish,
    reading,
    listening: parseListeningTests(listeningIndexSource, listeningSource),
    writing
  };

  const output = `(function(root){const data=${JSON.stringify(data)};root.C2_EXAM_BANK=Object.freeze(data);if(typeof module!=="undefined"&&module.exports)module.exports=data;})(typeof globalThis!=="undefined"?globalThis:this);\n`;
  fs.writeFileSync(OUTPUT, output, "utf8");
  console.log(JSON.stringify({
    output: path.relative(ROOT, OUTPUT),
    bytes: Buffer.byteLength(output),
    useOfEnglishSets: data.useOfEnglish.length,
    useOfEnglishFullPapers: data.useOfEnglish.filter(test => test.kind === "full").length,
    readingTests: data.reading.length,
    readingQuestions: data.reading.reduce((sum, test) => sum + Object.values(test.parts).reduce((partSum, part) => partSum + part.questions.length, 0), 0),
    readingPart1Sources: data.reading.filter(test => test.parts.part1).length,
    listeningTests: data.listening.length,
    writingTests: data.writing.length,
    writingTasks: data.writing.reduce((sum, test) => sum + 1 + test.part2Tasks.length, 0)
  }, null, 2));
}

build();
