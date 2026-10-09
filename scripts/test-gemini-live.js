const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const key = process.env.GOOGLE_API;
if (!key) {
  throw new Error("GOOGLE_API is not available to this GitHub Actions job. If it is an Environment secret, the job must reference that Environment.");
}

const ANSWER = `Universities should seek a balance between academic theory and professional practice, rather than treating them as mutually exclusive goals. Practical projects help students acquire the confidence to apply their learning, while theoretical study provides a foundation for adaptation and critical thinking.

For example, an economics student who understands statistical assumptions can evaluate an empirical model instead of merely repeating a software tutorial. However, studying those assumptions without applying them to real data would make it more difficult to discover the challenges of collecting evidence or interpreting ambiguous results.

Universities should therefore combine strong conceptual teaching with internships, projects and case studies. This would equip graduates to contribute from their first day at work without limiting their ability to learn as their professions evolve.`;

async function main() {
  const { default: worker } = await import(pathToFileURL(path.join(__dirname, "..", "workers", "writing-feedback", "src", "index.mjs")).href);
  const task = {
    type: "essay",
    prompt: "Write an essay discussing whether universities should prioritise practical skills or theoretical knowledge.",
    sourceTexts: [],
    targetWordRange: { min: 240, max: 280 }
  };
  const request = new Request("https://c2-writing-feedback.test/api/writing-feedback", {
    method: "POST",
    headers: {
      Origin: "https://c2practicelog.com",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ part: "part1", task, answer: ANSWER })
  });
  const response = await worker.fetch(request, {
    GEMINI_API_KEY: key,
    GEMINI_MODEL: "gemini-3.5-flash-lite",
    AI_FEEDBACK_LIMITER: { limit: async () => ({ success: true }) }
  });
  if (response.status !== 200) {
    throw new Error(`Live Gemini smoke test failed: Worker responded HTTP ${response.status} (see prior sanitized provider-status logs)`);
  }
  const data = await response.json();
  assert.equal(data.estimated, true);
  for (const criterion of ["content", "comm", "org", "lang"]) {
    assert.ok(Number.isInteger(data.assessment.criteria[criterion].score));
    assert.ok(data.assessment.criteria[criterion].score >= 0 && data.assessment.criteria[criterion].score <= 5);
    assert.ok(data.assessment.criteria[criterion].feedback.length > 0);
  }
  assert.ok(data.assessment.overallFeedback.length > 0);
  console.log("PASS live Gemini 3.5 Flash-Lite: structured C2 feedback on four criteria.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
