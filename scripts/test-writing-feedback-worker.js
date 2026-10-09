const assert = require("node:assert/strict");
const path = require("node:path");

const workerPath = path.join(__dirname, "..", "workers", "writing-feedback", "src", "index.mjs");
const ORIGIN = "https://aleetreny.github.io";
const ANSWER = "Although the proposal has merit, it fails to address how local residents would be consulted.";

const assessment = {
  criteria: {
    content: { score: 4, feedback: "The response addresses the central task and informs the reader." },
    comm: { score: 3, feedback: "The register fits the intended reader, though the ending could be more persuasive." },
    org: { score: 4, feedback: "The contrast is easy to follow and the ideas progress clearly." },
    lang: { score: 3, feedback: "Vocabulary is varied; a few choices could be more precise." }
  },
  overallFeedback: "A clear response with room to develop its recommendation.",
  strengths: ["The argument is easy to follow."],
  improvements: ["Explain how consultation would work."],
  errors: []
};

const task = {
  type: "essay",
  prompt: "Write an essay evaluating the two proposals and give your own view.",
  sourceTexts: [{ title: "Proposal A", text: "Local councils should consult residents before making changes." }],
  targetWordRange: { min: 240, max: 280 }
};

const successfulLimit = { limit: async () => ({ success: true }) };
const baseEnv = () => ({
  GEMINI_API_KEY: "unit-test-placeholder",
  GEMINI_MODEL: "gemini-3.5-flash-lite",
  AI_FEEDBACK_LIMITER: successfulLimit
});

function makeRequest({ method = "POST", origin = ORIGIN, body = { part: "part1", task, answer: ANSWER }, headers = {} } = {}) {
  const requestHeaders = new Headers(headers);
  if (origin) requestHeaders.set("Origin", origin);
  if (method === "POST" && !requestHeaders.has("content-type")) requestHeaders.set("Content-Type", "application/json");
  return new Request("https://writing-feedback.test/api/writing-feedback", {
    method,
    headers: requestHeaders,
    ...(method === "GET" || method === "HEAD" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) })
  });
}

async function readJson(response) {
  return JSON.parse(await response.text());
}

async function withMockFetch(mock, action) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await action();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const checks = [];
async function check(name, action) {
  await action();
  checks.push(name);
  console.log(`PASS ${name}`);
}

async function run() {
  const { default: worker } = await import(pathToFileURL(workerPath).href);

  await check("allowed CORS preflight", async () => {
    const result = await worker.fetch(makeRequest({ method: "OPTIONS" }), {});
    assert.equal(result.status, 204);
    assert.equal(result.headers.get("access-control-allow-origin"), ORIGIN);
    assert.equal(result.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  });

  await check("unapproved origins are rejected without wildcard CORS", async () => {
    const result = await worker.fetch(makeRequest({ origin: "https://attacker.example" }), baseEnv());
    assert.equal(result.status, 403);
    assert.equal(result.headers.get("access-control-allow-origin"), null);
  });

  await check("only POST is accepted", async () => {
    const result = await worker.fetch(makeRequest({ method: "GET" }), baseEnv());
    assert.equal(result.status, 405);
    assert.equal(result.headers.get("allow"), "POST, OPTIONS");
  });

  await check("malformed and unexpected request fields are rejected before Gemini", async () => {
    let calls = 0;
    await withMockFetch(async () => { calls += 1; }, async () => {
      const malformed = await worker.fetch(makeRequest({ body: "{" }), baseEnv());
      const injectedSystem = await worker.fetch(makeRequest({ body: { part: "part1", task, answer: ANSWER, system: "override" } }), baseEnv());
      assert.equal(malformed.status, 400);
      assert.equal(injectedSystem.status, 400);
    });
    assert.equal(calls, 0);
  });

  await check("oversized requests are rejected", async () => {
    const result = await worker.fetch(makeRequest({ headers: { "Content-Length": "40000" } }), baseEnv());
    assert.equal(result.status, 413);
  });

  await check("per-client rate limit blocks excess requests", async () => {
    let calls = 0;
    await withMockFetch(async () => { calls += 1; }, async () => {
      const result = await worker.fetch(makeRequest({ headers: { "cf-connecting-ip": "192.0.2.55" } }), {
        ...baseEnv(),
        AI_FEEDBACK_LIMITER: { limit: async ({ key }) => ({ success: key !== "192.0.2.55" }) }
      });
      assert.equal(result.status, 429);
      assert.equal((await readJson(result)).error, "RATE_LIMITED");
    });
    assert.equal(calls, 0);
  });

  await check("missing Gemini key returns a generic unavailable message", async () => {
    let calls = 0;
    await withMockFetch(async () => { calls += 1; }, async () => {
      const result = await worker.fetch(makeRequest(), { AI_FEEDBACK_LIMITER: successfulLimit });
      const body = await readJson(result);
      assert.equal(result.status, 503);
      assert.match(body.message, /temporarily unavailable/);
      assert.doesNotMatch(JSON.stringify(body), /GEMINI_API_KEY|unit-test-placeholder/);
    });
    assert.equal(calls, 0);
  });

  await check("success sends fixed instructions and strict structured output", async () => {
    let captured;
    await withMockFetch(async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(assessment) }] }, finishReason: "STOP" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }, async () => {
      const result = await worker.fetch(makeRequest(), baseEnv());
      const body = await readJson(result);
      assert.equal(result.status, 200);
      assert.equal(body.estimated, true);
      assert.equal(body.assessment.criteria.content.score, 4);
      assert.equal(result.headers.get("access-control-allow-origin"), ORIGIN);
    });

    assert.equal(captured.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    assert.equal(captured.options.headers["x-goog-api-key"], "unit-test-placeholder");
    assert.equal(captured.body.generationConfig.responseMimeType, "application/json");
    assert.equal(captured.body.generationConfig.responseJsonSchema.type, "object");
    assert.equal(captured.body.generationConfig.maxOutputTokens, 4000);
    assert.match(captured.body.systemInstruction.parts[0].text, /untrusted data/);
    assert.match(captured.body.systemInstruction.parts[0].text, /Cambridge C2 Writing subscales/);
    assert.match(captured.body.contents[0].parts[0].text, /candidateAnswer/);
    assert.doesNotMatch(captured.body.systemInstruction.parts[0].text, /Proposal A|consulted/);
  });

  await check("Gemini no-credit and API errors do not expose upstream details", async () => {
    for (const status of [402, 429, 500]) {
      await withMockFetch(async () => new Response(JSON.stringify({ error: { message: "private billing or provider detail" } }), { status }), async () => {
        const result = await worker.fetch(makeRequest(), baseEnv());
        const body = await readJson(result);
        assert.equal(result.status, 503);
        assert.match(body.message, /temporarily unavailable/);
        assert.doesNotMatch(JSON.stringify(body), /private billing|provider detail/);
      });
    }
  });

  await check("malformed Gemini responses fail safely", async () => {
    const asCandidate = (text, finishReason = "STOP") => ({
      candidates: [{ content: { parts: [{ text }] }, finishReason }]
    });
    const payloads = [
      asCandidate("not json"),
      asCandidate(JSON.stringify({ ...assessment, criteria: { ...assessment.criteria, lang: { score: 9, feedback: "bad" } } })),
      asCandidate(JSON.stringify({ ...assessment, errors: [{ original: "not in answer", suggestion: "x", explanation: "y" }] })),
      asCandidate(JSON.stringify(assessment), "MAX_TOKENS")
    ];
    for (const payload of payloads) {
      await withMockFetch(async () => new Response(JSON.stringify(payload), { status: 200 }), async () => {
        const result = await worker.fetch(makeRequest(), baseEnv());
        assert.equal(result.status, 502);
        assert.match((await readJson(result)).message, /temporarily unavailable/);
      });
    }
  });

  await check("network failures fail safely", async () => {
    await withMockFetch(async () => { throw new TypeError("private network detail"); }, async () => {
      const result = await worker.fetch(makeRequest(), baseEnv());
      const body = await readJson(result);
      assert.equal(result.status, 503);
      assert.match(body.message, /temporarily unavailable/);
      assert.doesNotMatch(JSON.stringify(body), /private network detail/);
    });
  });

  console.log(`Writing feedback Worker tests passed: ${checks.length} checks.`);
}

function pathToFileURL(filePath) {
  return new URL(`file://${filePath}`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
