const fs = require("fs");
const path = require("path");

const exportRoot = process.argv[2];
const outputPath = process.argv[3] || path.resolve(__dirname, "..", "vocabulary-data.js");

if (!exportRoot || !fs.existsSync(exportRoot)) {
  throw new Error("Pass the extracted Notion export directory as the first argument.");
}

const pageConfig = {
  "01": { family: "patterns", source: "Patterns & Collocations", defaultTopic: "General patterns" },
  "02": { family: "vocabulary", source: "Curated Vocabulary", defaultTopic: "General vocabulary" },
  "03": { family: "idioms", source: "Idioms & Fixed Phrases", defaultTopic: "General idioms" },
  "05": { family: "wordFormation", source: "Word Formation", defaultTopic: "Word formation" },
  "06": { family: "vocabulary", source: "Official Wordlist", defaultTopic: "Official vocabulary" },
  "07": { family: "vocabulary", source: "My Vocabulary List", defaultTopic: "Personal vocabulary" }
};

const familyLabels = {
  vocabulary: "Vocabulary",
  patterns: "Patterns & Collocations",
  idioms: "Idioms & Fixed Phrases",
  wordFormation: "Word Formation"
};

function cleanMarkdown(value = "") {
  return value
    .replace(/<br\s*\/?\s*>/gi, " · ")
    .replace(/\*\*|__|\*|_/g, "")
    .replace(/\\\|/g, "|")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map(cleanMarkdown);
}

function isDividerRow(cells) {
  return cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function normalizeTerm(value) {
  return cleanMarkdown(value)
    .toLocaleLowerCase("en")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function inferOfficialFamily(topic) {
  const text = topic.toLowerCase();
  if (text.startsWith("idioms")) return "idioms";
  if (/(phrasal|collocation|prepositional|compound|binomial|multi-word|partitive|expressions and phrases|similes)/.test(text)) {
    return "patterns";
  }
  return "vocabulary";
}

function stripOfficialTopic(topic) {
  return topic.replace(/^Idioms:\s*/i, "").trim() || "General idioms";
}

function parseTablePage(filePath, pageNumber) {
  const config = pageConfig[pageNumber];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const entries = [];
  let topic = config.defaultTopic;
  let sectionLabel = "";
  let headers = null;

  for (const rawLine of lines) {
    const heading = rawLine.match(/^##\s+(.+)/);
    if (heading) {
      topic = cleanMarkdown(heading[1]);
      sectionLabel = topic;
      headers = null;
      continue;
    }

    if (!rawLine.trim().startsWith("|")) continue;
    const cells = splitTableRow(rawLine);
    if (!cells.length || isDividerRow(cells)) continue;

    const first = cells[0].toLowerCase();
    if (["term", "expression", "palabra", "word"].includes(first)) {
      headers = cells.map(cell => cell.toLowerCase());
      continue;
    }
    if (!headers || !cells[0]) continue;

    let family = config.family;
    let resolvedTopic = topic;
    let source = config.source;
    if (pageNumber === "03") {
      source = sectionLabel.toLowerCase().includes("official") ? "Official Wordlist" : "Personal notes";
      resolvedTopic = "General idioms";
    }
    if (pageNumber === "06") {
      family = inferOfficialFamily(topic);
      resolvedTopic = stripOfficialTopic(topic);
    }

    entries.push({
      term: cells[0],
      meaning: cells[1] || "",
      example: cells[2] || "",
      family,
      topic: resolvedTopic,
      sources: [source],
      notionPages: [pageNumber]
    });
  }
  return entries;
}

function parsePersonalPage(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  return lines
    .filter(line => /^-\s+/.test(line))
    .map(line => cleanMarkdown(line.replace(/^-\s+/, "")))
    .filter(Boolean)
    .map(raw => {
      const trailingNotes = [];
      let term = raw.replace(/\s*\(([^()]*)\)\s*\.?\s*$/g, (_, note) => {
        trailingNotes.unshift(cleanMarkdown(note));
        return "";
      }).trim();
      if (!term) term = raw;
      return {
        term,
        meaning: trailingNotes.join(" · "),
        example: "",
        family: "vocabulary",
        topic: "Personal vocabulary",
        sources: ["My Vocabulary List"],
        notionPages: ["07"]
      };
    });
}

function mergeEntries(entries) {
  const byTerm = new Map();
  entries.forEach(entry => {
    const key = normalizeTerm(entry.term);
    if (!key) return;
    const current = byTerm.get(key);
    if (!current) {
      byTerm.set(key, { ...entry, families: [entry.family] });
      return;
    }

    const richer = (entry.meaning.length + entry.example.length) > (current.meaning.length + current.example.length)
      ? entry
      : current;
    const other = richer === entry ? current : entry;
    byTerm.set(key, {
      ...richer,
      meaning: richer.meaning || other.meaning,
      example: richer.example || other.example,
      topics: unique([...(current.topics || [current.topic]), ...(entry.topics || [entry.topic])]),
      sources: unique([...current.sources, ...entry.sources]),
      notionPages: unique([...current.notionPages, ...entry.notionPages]),
      families: unique([...(current.families || [current.family]), ...(entry.families || [entry.family])]),
      family: current.family === entry.family ? current.family : richer.family
    });
  });

  return [...byTerm.values()]
    .map((entry, index) => ({
      id: `notion-${String(index + 1).padStart(4, "0")}`,
      term: entry.term,
      meaning: entry.meaning,
      example: entry.example,
      family: entry.family,
      families: unique(entry.families || [entry.family]),
      topic: entry.topic,
      topics: unique(entry.topics || [entry.topic]),
      sources: unique(entry.sources),
      notionPages: unique(entry.notionPages)
    }))
    .sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
}

const files = fs.readdirSync(exportRoot).filter(name => /^(01|02|03|05|06|07).*\.md$/i.test(name));
if (files.length !== 6) {
  throw new Error(`Expected 6 selected Notion pages, found ${files.length}.`);
}

const rawEntries = [];
for (const fileName of files) {
  const pageNumber = fileName.slice(0, 2);
  const filePath = path.join(exportRoot, fileName);
  rawEntries.push(...(pageNumber === "07" ? parsePersonalPage(filePath) : parseTablePage(filePath, pageNumber)));
}

const enrichmentPath = path.resolve(__dirname, "..", "data", "vocabulary-enrichment.json");
const enrichment = process.env.SKIP_VOCABULARY_ENRICHMENT === "1" || !fs.existsSync(enrichmentPath) ? {} : JSON.parse(fs.readFileSync(enrichmentPath, "utf8"));
const entries = mergeEntries(rawEntries).map(entry => {
  const override = enrichment[entry.id] || {};
  return {
    id: entry.id,
    term: override.term || entry.term,
    meaning: override.meaning || entry.meaning || "",
    example: override.example || entry.example || "",
    family: entry.family,
    families: entry.families,
    collection: override.collection || "",
    sources: entry.sources,
    notionPages: entry.notionPages
  };
});
const stats = {
  imported: entries.length,
  raw: rawEntries.length,
  duplicatesMerged: rawEntries.length - entries.length,
  byFamily: Object.fromEntries(Object.keys(familyLabels).map(key => [key, entries.filter(item => item.families.includes(key)).length]))
};

const banner = `// Generated from C2 Cloud pages 01-03 and 05-07. Page 04 is intentionally excluded.\n`;
const payload = `const VOCABULARY_SEED = ${JSON.stringify(entries, null, 2)};\n\nconst VOCABULARY_META = ${JSON.stringify({ familyLabels, stats }, null, 2)};\n`;
fs.writeFileSync(outputPath, banner + payload, "utf8");

console.log(JSON.stringify(stats, null, 2));
