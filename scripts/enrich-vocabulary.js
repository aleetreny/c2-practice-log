const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "vocabulary-data.js"), "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${source};globalThis.seed=VOCABULARY_SEED;`, sandbox);
const entries = sandbox.seed;
let wordnet = null;
try {
  const natural = require("natural");
  const wordnetDb = require("wordnet-db");
  wordnet = new natural.WordNet(wordnetDb.path);
} catch {
  wordnet = null;
}

const normalize = value => String(value || "").toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']+/g, " ").trim();

const idiomOverrides = new Set(`
a bit down in the dumps|a bit of a grey area|a chink in the armour|a chip off the old block|a faint glimmer of light|a grain of truth|a shot in the dark|a stroke of genius|around the bend|as clear as mud|as dull as ditchwater|as mad as a box of frogs|as sly as a fox|as tough as old boots|at a loss|at the crack of dawn|bark up the wrong tree|be at a loss|be hard up|be in a tight spot|be in the dark|be in the groove|be on the same wavelength|be out of line|be thrown of balance|be up in arms|become a scapegoat|black and white|bring out the best in|bring up the rear|bury your head in the sand|by all means|by and large|by the same token|chalk and cheese|chuffed to bits|come to think of it|cut and dried|don't say boo to a goose|down to a fine art|fall on deaf ears|fight like cat and dog|get a monkey off your back|get on like a house on fire|get out of hand|get something off your chest|get the brush off|get your back up|getting nowhere fast|go down like a lead balloon|go down the rabbit hole|go off without a hitch|go out on a limb|go to the dogs|go without saying|have a knack of|have sth up your sleeve|head over heels in love|in a nutshell|in fits and starts|in your mind's eye|it is news to me|it's back to the drawing board|it's nothing short of a miracle|jump on the bandwagon|keep something under wraps|keep something under your hat|leave someone lost for words|leave your mark on the world|make a beeline for|meet in the middle|money for nothing|more to sth sb than meets the eye|not get a wink of sleep|off the wall|on a whim|on edge|on second thoughts|on the face of it|on the same wavelength|out of the question|out of the woods|out of touch|pay dividends|pay lip service to something|pay the price|pay through the nose|poke fun at|scared me out of my wits|see eye to eye|shed or throw light on|skeletons in the cupboard closet|sleep like a log|start with a clean slate|step up to the plate|stick out like a sore thumb|straight out of the window|stroll down memory lane|take sth on the chin|take the world by storm|talk to a brick wall|talk your ear off|tell somebody where to get off|the dead of night|the ins and outs|throw your hat in the ring|to all intents and purposes|to be a breath of fresh air|to be at loggerheads|to be in the know|to be no mean feat|to be your bread and butter|to get your wires crossed|to go down a storm|to have a chip on your shoulder|to have a head start|to reinvent the wheel|touch and go|watch someone like a hawk|with a pinch of salt|
a key sticking point|a lost cause|a stretch|a wild goose chase|achilles' heel|all or nothing|as dull ditch water|be a tight squeeze|be a total blast|be top drawer|beg borrow or steal|blank canvas|blood run cold|blood sweat and tears|boom and bust|bottom line|break the ice|burning the midnight oil|catch my drift|catch red handed|come clean|cover all the bases|curve ball|fall flat|fight like a cat and dog|fits and starts|give them creeps|give you the chills|go round the bend|goblin mode|gold dust|hard and fast rules|have green fingers|have give the upper hand|here there and everywhere|high and dry|hook line and sinker|ins and outs|it's a slow burner|leaps and bounds|long shot|make my blood boil|master stroke|never the twains shall meet|part and parcel|put her money where her mouth is|rack your brain|rack your brains|red herrings|ring hollow|ring true|ruffle some feathers|scratch the surface|seek and ye shall find|slim pickings|sooner or later|stand one's ground|stepping stone|strike a chord|stuck between a rock and a hard place|tell someone a thing or two|that's all well and good but|the be all and end all|this too shall pass|tip the scales|turn a blind eye|upset the apple cart|watch like a hawk
`.split("|").map(normalize).filter(Boolean));

const patternOverrides = new Set(`
that suit sb just fine|bear no resemblance to someone something|bowl someone over|can't account for|come up with the solution|don't approve of|get acquainted with|i'm not averse to|in abeyance|in arrears|make allowances for|make amends|on target|out of bounds|go on record as saying that|boast about|come about|deter sth|go without|hailed sth sb|hazard an opinion|hone sth|make a leap|pay a compliment|play host|put forward|put forward ideas proposals|soften cushion the blow|spark backlash|stagger sb|stumble across|stumble across something|tick along|winning streak|tight knit communities|low emissions zones|offshore wind farms|derelict buildings|climate emergency|hostage crises|inherent risks|marine habitats|potting soil|sheer scale|tree lined streets|woodland habitats
`.split("|").map(normalize).filter(Boolean));

const manualDefinitions = {
  ambitiousness: "the quality of having a strong desire to succeed or achieve something",
  buoyant: "cheerful and optimistic, or able to stay afloat",
  endurance: "the ability to continue through difficulty, pain or fatigue",
  fittings: "small parts or fixtures attached to furniture, equipment or a building",
  idealist: "a person guided by ideals, sometimes more than by practical considerations",
  immodest: "lacking humility or revealing more of the body than is considered appropriate",
  instantaneous: "happening immediately, without any noticeable delay",
  memorabilia: "objects kept because they are connected with memorable people or events",
  nationalised: "brought under the ownership or control of the state",
  physicist: "a scientist who studies physics",
  restful: "having a quiet and relaxing effect",
  vengeful: "showing a strong desire for revenge",
  amid: "in the middle of or surrounded by",
  "burning the midnight oil": "working late into the night"
};

function currentCollection(entry) {
  const sources = entry.sources || [];
  const families = entry.families || [entry.family];
  if (sources.includes("My Vocabulary List")) return "personal";
  if (sources.includes("Word Formation")) return "wordFormation";
  if (families.includes("idioms")) return "idioms";
  if (families.includes("patterns")) return "patterns";
  if (sources.includes("Official Wordlist")) return "official";
  return "curated";
}

function auditedCollection(entry) {
  const key = normalize(entry.term);
  if (patternOverrides.has(key)) return "patterns";
  if (idiomOverrides.has(key)) return "idioms";
  return currentCollection(entry);
}

function answerTerm(entry) {
  let value = String(entry.term || "").replace(/\*+/g, "").trim();
  const familyMatch = value.match(/^\([^)]*\)\s*(.+)$/);
  if (familyMatch) value = familyMatch[1];
  value = value.replace(/\s*\([^)]*(?:no |noun|adj|verb|adverb)[^)]*\)\s*$/i, "").trim();
  value = value.split(/\s+\/\s+|\/|::/)[0].trim();
  return value || entry.term;
}

function materialize(value) {
  return String(value)
    .replace(/\((?:something|someone|somebody|sth|sb)[^)]*\)/gi, "the issue")
    .replace(/\b(?:something|sth)\b/gi, "the issue")
    .replace(/\b(?:someone|somebody|sb)\b/gi, "the new manager")
    .replace(/\bone['’]s\b/gi, "her")
    .replace(/\byour\b/gi, "her")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureObject(phrase) {
  return /\b(?:to|with|for|on|of|in|at|from|into|over|about|against|by|upon)\s*$/i.test(phrase) ? `${phrase} the revised proposal` : phrase;
}

function fallbackExample(entry, collection, pos = "") {
  const target = materialize(answerTerm(entry));
  if (collection === "idioms" || collection === "patterns") {
    return `During the discussion, she used the expression “${target}” to make her point.`;
  }
  return `In her notes, she chose “${target}” as the most precise wording for the situation.`;
}

async function dictionaryLookup(term) {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term.toLowerCase())}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (response.status === 429 || response.status >= 500) {
        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
        continue;
      }
      if (!response.ok) return null;
      const payload = await response.json();
      const definitions = payload.flatMap(item => item.meanings || []).flatMap(meaning => (meaning.definitions || []).map(definition => ({ ...definition, pos: meaning.partOfSpeech || "" })));
      return {
        definition: definitions.find(item => item.definition)?.definition || "",
        example: definitions.find(item => item.example)?.example || "",
        pos: definitions.find(item => item.pos)?.pos || ""
      };
    } catch {
      if (attempt === 2) return null;
    }
  }
  return null;
}

function wordnetLookup(term) {
  if (!wordnet) return Promise.resolve(null);
  return new Promise(resolve => wordnet.lookup(term, results => {
    if (!results?.length) return resolve(null);
    const result = results[0];
    const gloss = result.gloss || "";
    const quotes = [...gloss.matchAll(/"([^"]+)"/g)].map(match => match[1]);
    const root = answerTerm({ term }).toLowerCase().replace(/[^a-z]/g, "").slice(0, 5);
    const example = quotes.find(value => value.toLowerCase().replace(/[^a-z]/g, "").includes(root)) || "";
    resolve({
      definition: gloss.split(/;\s*"/)[0].trim(),
      example,
      pos: ({ n: "noun", v: "verb", a: "adjective", s: "adjective", r: "adverb" })[result.pos] || ""
    });
  }));
}

async function mapConcurrent(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index], index);
      if ((index + 1) % 100 === 0) console.log(`Looked up ${index + 1}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return output;
}

(async () => {
  const nonPersonal = entries.filter(entry => currentCollection(entry) !== "personal");
  if (wordnet) await wordnetLookup("example");
  const lookups = await mapConcurrent(nonPersonal, wordnet ? 32 : 8, async entry => ({ entry, dictionary: wordnet ? await wordnetLookup(answerTerm(entry)) : await dictionaryLookup(answerTerm(entry)) }));
  const enrichment = {};
  for (const { entry, dictionary } of lookups) {
    const collection = auditedCollection(entry);
    const meaning = entry.meaning || manualDefinitions[normalize(answerTerm(entry))] || dictionary?.definition || "";
    const example = entry.example || dictionary?.example || fallbackExample(entry, collection, dictionary?.pos || "");
    enrichment[entry.id] = { collection, meaning, example };
  }
  const outputPath = path.join(root, "data", "vocabulary-enrichment.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(enrichment, null, 2)}\n`, "utf8");
  const values = Object.values(enrichment);
  console.log(JSON.stringify({ entries: values.length, missingMeaning: values.filter(item => !item.meaning).length, missingExample: values.filter(item => !item.example).length, dictionaryHits: lookups.filter(item => item.dictionary).length, dictionaryExamples: lookups.filter(item => item.dictionary?.example).length, idioms: values.filter(item => item.collection === "idioms").length, patterns: values.filter(item => item.collection === "patterns").length }, null, 2));
})();
