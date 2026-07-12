const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const READING_SOURCE = path.join(ROOT, "cambridge_c2_reading_12_tests_polished.md");
const LISTENING_SOURCE = path.join(ROOT, "c2_listening_youtube_embeds.md");
const WRITING_SOURCE = path.join(ROOT, "C2_Proficiency_Writing_Practice_Bank.md");
const OUTPUT = path.join(ROOT, "exam-bank-data.js");

function readSource(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing source file: ${path.basename(filePath)}`);
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
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

function parseListeningTests(source) {
  const entries = [];
  const pattern = /^\s*- test:\s*(\d+)\s*\n\s*youtube_id:\s*"([^"]+)"\s*\n\s*title:\s*"([^"]+)"\s*\n\s*watch_url:\s*"([^"]+)"\s*\n\s*embed_url:\s*"([^"]+)"/gm;
  for (const match of source.matchAll(pattern)) {
    entries.push({
      id: `listening-${match[1]}`,
      number: Number(match[1]),
      youtubeId: match[2],
      title: match[3],
      watchUrl: match[4],
      embedUrl: match[5]
    });
  }
  if (entries.length !== 33) throw new Error(`Listening: expected 33 videos, found ${entries.length}`);
  if (entries.some(entry => !/^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]+$/.test(entry.embedUrl))) {
    throw new Error("Listening: invalid privacy-enhanced embed URL");
  }
  return entries;
}

function build() {
  const readingSource = readSource(READING_SOURCE);
  const listeningSource = readSource(LISTENING_SOURCE);
  const writingSource = readSource(WRITING_SOURCE);
  const data = {
    version: 1,
    sourceDigest: crypto.createHash("sha256").update(readingSource).update(listeningSource).update(writingSource).digest("hex").slice(0, 16),
    reading: parseReadingTests(readingSource),
    listening: parseListeningTests(listeningSource),
    writing: parseWritingTests(writingSource)
  };

  const output = `(function(root){const data=${JSON.stringify(data)};root.C2_EXAM_BANK=Object.freeze(data);if(typeof module!=="undefined"&&module.exports)module.exports=data;})(typeof globalThis!=="undefined"?globalThis:this);\n`;
  fs.writeFileSync(OUTPUT, output, "utf8");
  console.log(JSON.stringify({
    output: path.relative(ROOT, OUTPUT),
    bytes: Buffer.byteLength(output),
    readingTests: data.reading.length,
    readingQuestions: data.reading.reduce((sum, test) => sum + Object.values(test.parts).reduce((partSum, part) => partSum + part.questions.length, 0), 0),
    listeningTests: data.listening.length,
    writingTests: data.writing.length,
    writingTasks: data.writing.reduce((sum, test) => sum + 1 + test.part2Tasks.length, 0)
  }, null, 2));
}

build();
