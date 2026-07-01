const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const enrichmentPath = path.join(root, "data", "vocabulary-enrichment.json");
const source = fs.readFileSync(path.join(root, "vocabulary-data.js"), "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${source};globalThis.seed=VOCABULARY_SEED;`, sandbox);
const seed = Object.fromEntries(sandbox.seed.map(entry => [entry.id, entry]));
const enrichment = JSON.parse(fs.readFileSync(enrichmentPath, "utf8"));
const genericPrefixes = ["In her notes, she chose", "During the discussion, she used"];

const canonicalTerms = {
  "notion-2019": "(Amateur) Amateurishly",
  "notion-2105": "(Apprehension) Apprehensive",
  "notion-2082": "(Command) Commandments",
  "notion-1986": "(Impression) Impressionable",
  "notion-2046": "(Method) Methodical",
  "notion-2025": "(Minimum) Minimal effort",
  "notion-2047": "(Mount) Mountainous",
  "notion-1761": "Addition",
  "notion-1728": "Affectionate",
  "notion-0872": "Allowance",
  "notion-0704": "Cacophony",
  "notion-1913": "Circumstantial",
  "notion-1963": "Coincidental",
  "notion-0701": "Disheartening",
  "notion-0613": "Elongation",
  "notion-1010": "Errand",
  "notion-0534": "Eye-watering",
  "notion-0713": "Fidget",
  "notion-1664": "Heartily",
  "notion-1731": "Lengthy",
  "notion-0551": "Lies along a bell curve",
  "notion-1893": "Occurrence",
  "notion-1846": "Ominous",
  "notion-1662": "Predominantly",
  "notion-1765": "Repeatable",
  "notion-0457": "Self-aggrandisement",
  "notion-0451": "Self-pity",
  "notion-1137": "Sensuous",
  "notion-1460": "Slackened",
  "notion-1966": "Submersion",
  "notion-1843": "Synonymous",
  "notion-1923": "Unprecedented"
};

for (const [id, term] of Object.entries(canonicalTerms)) {
  if (enrichment[id]) enrichment[id].term = term;
}

function answerTerm(term) {
  let value = String(term || "").replace(/^\([^)]*\)\s*/, "").trim();
  value = value.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  return value.split(/\s+\/\s+|::/)[0].trim();
}

function lookupCandidates(term) {
  const base = answerTerm(term)
    .replace(/\b(?:sth|sb|something|someone|somebody)\b/gi, "")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  const candidates = [base];
  if (/^to be\s+/i.test(base)) candidates.push(base.replace(/^to be\s+/i, ""));
  if (/^be\s+/i.test(base)) candidates.push(base.replace(/^be\s+/i, ""));
  if (/^to\s+/i.test(base)) candidates.push(base.replace(/^to\s+/i, ""));
  const words = base.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  if (words.length === 1) candidates.push(words[0]);
  return [...new Set(candidates.filter(value => value.length >= 3))];
}

async function fetchEntry(term) {
  const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term.toLowerCase())}`, {
    headers: { "user-agent": "C2-Practice-Log vocabulary enrichment" },
    signal: AbortSignal.timeout(12000)
  });
  if (response.status === 429 || response.status >= 500) throw new Error(`retry:${response.status}`);
  if (!response.ok) return null;
  const payload = await response.json();
  const definitions = payload.flatMap(item => item.meanings || []).flatMap(meaning => meaning.definitions || []);
  return definitions.find(definition => definition.example)?.example || "";
}

async function lookup(term) {
  for (const candidate of lookupCandidates(term)) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const example = await fetchEntry(candidate);
        if (example) return { example, candidate };
        break;
      } catch (error) {
        if (!String(error.message).startsWith("retry:") || attempt === 2) break;
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  return null;
}

async function main() {
  if (process.argv.includes("--terms-only")) {
    fs.writeFileSync(enrichmentPath, `${JSON.stringify(enrichment, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ correctedTerms: Object.keys(canonicalTerms).length }, null, 2));
    return;
  }
  const targets = Object.entries(enrichment).filter(([, value]) => genericPrefixes.some(prefix => value.example?.startsWith(prefix)));
  let cursor = 0;
  let matched = 0;
  async function worker() {
    while (cursor < targets.length) {
      const index = cursor++;
      const [id, value] = targets[index];
      const term = value.term || seed[id].term;
      const result = await lookup(term);
      if (result) {
        value.example = result.example;
        value.exampleSource = `dictionaryapi.dev:${result.candidate}`;
        matched += 1;
      }
      if ((index + 1) % 25 === 0) console.log(`Checked ${index + 1}/${targets.length}; matched ${matched}`);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  await Promise.all([worker(), worker()]);
  fs.writeFileSync(enrichmentPath, `${JSON.stringify(enrichment, null, 2)}\n`, "utf8");
  const remaining = Object.values(enrichment).filter(value => genericPrefixes.some(prefix => value.example?.startsWith(prefix))).length;
  console.log(JSON.stringify({ targets: targets.length, matched, remaining }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
