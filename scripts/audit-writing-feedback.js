const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const app = read("app.js");
const examBank = read("exam-bank.js");
const index = read("index.html");
const config = read("writing-feedback-config.js");
const styles = read("styles.css");
const worker = read("workers/writing-feedback/src/index.mjs");
const workerConfig = JSON.parse(read("workers/writing-feedback/wrangler.jsonc"));
const gitignore = read(".gitignore");

assert.match(app, /requestWritingAiFeedback/);
assert.match(app, /writingAiFeedback/);
assert.match(app, /AI feedback is temporarily unavailable\. You can continue with manual assessment\./);
assert.match(app, /key: "content", label: "Content"/);
assert.match(app, /key: "comm", label: "Communicative Achievement"/);
assert.match(app, /key: "org", label: "Organisation"/);
assert.match(app, /key: "lang", label: "Language"/);
assert.match(examBank, /getActiveExamBankWritingTask/);
assert.match(index, /writing-feedback-config\.js/);
assert.match(index, /styles\.css\?v=claude-writing-feedback-1/);
assert.match(config, /C2_WRITING_FEEDBACK_API_URL = ""/);

for (const frontend of [app, index, config]) {
  assert.doesNotMatch(frontend, /ANTHROPIC_API_KEY|x-api-key|api\.anthropic\.com/i, "Anthropic credentials and API calls stay server-side");
}

assert.match(worker, /ANTHROPIC_API_KEY/);
assert.match(worker, /output_config:[\s\S]*type: "json_schema"/);
assert.match(worker, /untrusted data/);
assert.match(worker, /MAX_REQUEST_BYTES/);
assert.match(worker, /AI_FEEDBACK_LIMITER/);
assert.match(worker, /https:\/\/aleetreny\.github\.io/);
assert.match(worker, /https:\/\/c2practicelog\.com/);
assert.match(worker, /https:\/\/www\.c2practicelog\.com/);
assert.doesNotMatch(worker, /Access-Control-Allow-Origin.{0,20}\*/i);
assert.equal(workerConfig.workers_dev, true);
assert.equal(workerConfig.vars.ANTHROPIC_MODEL, "claude-sonnet-5");
assert.equal(workerConfig.ratelimits[0].simple.limit, 10);
assert.match(gitignore, /^\.dev\.vars$/m);
assert.match(gitignore, /^\.dev\.vars\.\*$/m);
assert.match(styles, /@media \(max-width: 600px\)[\s\S]*writing-ai-criteria/);
assert.match(styles, /overflow-wrap: anywhere/);

const writingBank = require(path.join(root, "exam-bank-data.js")).writing;
global.STATE = {
  examBankSession: {
    section: "writing",
    writingTest: writingBank[0],
    part2Task: writingBank[0].part2Tasks[0]
  }
};
require(path.join(root, "exam-bank.js"));
const part1Task = global.getActiveExamBankWritingTask("part1");
const part2Task = global.getActiveExamBankWritingTask("part2");
assert.equal(part1Task.type, "essay");
assert.equal(part1Task.sourceTexts.length, 2, "Part 1 AI context should include both source texts");
assert.ok(part1Task.prompt && part1Task.targetWordRange.min === 240 && part1Task.targetWordRange.max === 280);
assert.ok(part2Task.prompt && part2Task.targetWordRange.min === 280 && part2Task.targetWordRange.max === 320);
assert.ok(["article", "email-letter", "report", "review"].includes(part2Task.type));

console.log("Writing feedback architecture audit passed: static UI, private Worker secret, fixed rubric, strict origins and responsive styles verified.");
