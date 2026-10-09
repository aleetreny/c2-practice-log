const assert = require("node:assert/strict");

const url = "https://c2-writing-feedback.alejandrotreny100.workers.dev/api/writing-feedback";
const answer = [
  "The value of university education cannot be reduced to getting a job.",
  "Practical experience helps students understand the challenges they will face,",
  "whereas theoretical study gives them the tools to evaluate evidence and adapt",
  "when technologies change. For example, an economist who understands",
  "statistical assumptions can judge whether a model is useful instead of",
  "simply reproducing software commands. Both approaches reinforce each other.",
  "Therefore universities should combine projects based on real problems",
  "with rigorous conceptual teaching. That balance prepares graduates to",
  "contribute at work while continuing to learn throughout their careers."
].join(" ");

async function main() {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://c2practicelog.com"
    },
    body: JSON.stringify({
      part: "part1",
      task: {
        type: "essay",
        prompt: "Write an essay about whether universities should prioritise practical skills or theoretical knowledge.",
        sourceTexts: [],
        targetWordRange: { min: 240, max: 280 }
      },
      answer
    }),
    signal: AbortSignal.timeout(90000)
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(`Live Worker returned HTTP ${response.status} (${payload.error || "unspecified"})`);
  }
  assert.equal(response.headers.get("access-control-allow-origin"), "https://c2practicelog.com");
  const data = await response.json();
  assert.equal(data.estimated, true);
  for (const criterion of ["content", "comm", "org", "lang"]) {
    assert.ok(Number.isInteger(data.assessment?.criteria?.[criterion]?.score));
    assert.ok(data.assessment.criteria[criterion].score >= 0 && data.assessment.criteria[criterion].score <= 5);
    assert.ok(data.assessment.criteria[criterion].feedback.length > 0);
  }
  assert.ok(data.assessment.overallFeedback.length > 0);
  console.log("PASS deployed Cloudflare Worker returned valid Gemini C2 Writing feedback.");
  console.log("Scores:", Object.fromEntries(Object.entries(data.assessment.criteria).map(([key, value]) => [key, value.score])));
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
