const crypto = require("node:crypto");

const AUTH_URL = process.env.NEON_AUTH_URL;
const DATA_API_URL = process.env.NEON_DATA_API_URL;
const DATABASE_URL = process.env.NEON_DATABASE_URL;
const ORIGIN = process.env.TEST_APP_ORIGIN || "http://localhost:4173";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function responseJson(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
  return payload;
}

function cookieHeader(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  return values.map(value => value.split(";", 1)[0]).join("; ");
}

async function createUser(label, tag) {
  const email = `c2-rls-${label}-${tag}@example.com`;
  const password = `Rls-${crypto.randomBytes(18).toString("base64url")}!`;
  const response = await fetch(`${AUTH_URL}/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN
    },
    body: JSON.stringify({ email, password, name: `C2 RLS ${label.toUpperCase()} ${tag}` })
  });
  const cookies = cookieHeader(response);
  const payload = await responseJson(response);
  assert(payload?.user?.id, `Auth user ${label} was not created`);

  const sessionResponse = await fetch(`${AUTH_URL}/get-session`, {
    headers: { Cookie: cookies, Origin: ORIGIN }
  });
  await responseJson(sessionResponse);
  const token = sessionResponse.headers.get("set-auth-jwt") || response.headers.get("set-auth-jwt");
  assert(token, `JWT was not issued for user ${label}`);
  return { id: payload.user.id, token };
}

async function deleteTestUsers(users) {
  const ids = users.map(user => user.id);
  if (ids.length === 0) return;
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(DATABASE_URL);
  await sql.transaction([
    sql`delete from public.c2_attempts where user_id = any(${ids}::text[])`,
    sql`delete from public.c2_user_mappings where neon_user_id = any(${ids}::uuid[])`,
    sql`delete from neon_auth."user" where id = any(${ids}::uuid[])`
  ]);
}

async function dataRequest(user, path, options = {}) {
  const response = await fetch(`${DATA_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });
  return responseJson(response);
}

async function main() {
  assert(AUTH_URL && DATA_API_URL && DATABASE_URL, "NEON_AUTH_URL, NEON_DATA_API_URL and NEON_DATABASE_URL are required");
  const tag = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const users = [];
  try {
    const userA = await createUser("a", tag);
    users.push(userA);
    const userB = await createUser("b", tag);
    users.push(userB);
    const rowA = `rls-a-${tag}`;
    const rowB = `rls-b-${tag}`;

    const makeRow = (id, userId) => ({
      id,
      user_id: userId,
      section: "writing",
      correct: 0,
      total: 1,
      percentage: 0,
      scale_score: 160,
      answers: { test: "rls" },
      graded_states: {},
      attempted_at: new Date().toISOString()
    });
    await dataRequest(userA, "/c2_attempts", { method: "POST", body: JSON.stringify(makeRow(rowA, userA.id)) });
    await dataRequest(userB, "/c2_attempts", { method: "POST", body: JSON.stringify(makeRow(rowB, userB.id)) });

    const [aOwn, aReadsB, bOwn, bReadsA] = await Promise.all([
      dataRequest(userA, `/c2_attempts?id=eq.${encodeURIComponent(rowA)}&select=id,correct`),
      dataRequest(userA, `/c2_attempts?id=eq.${encodeURIComponent(rowB)}&select=id,correct`),
      dataRequest(userB, `/c2_attempts?id=eq.${encodeURIComponent(rowB)}&select=id,correct`),
      dataRequest(userB, `/c2_attempts?id=eq.${encodeURIComponent(rowA)}&select=id,correct`)
    ]);
    assert(aOwn.length === 1 && bOwn.length === 1, "Users could not read their own rows");
    assert(aReadsB.length === 0 && bReadsA.length === 0, "Cross-user SELECT was not blocked");

    const [aUpdatesB, bUpdatesA] = await Promise.all([
      dataRequest(userA, `/c2_attempts?id=eq.${encodeURIComponent(rowB)}`, { method: "PATCH", body: JSON.stringify({ correct: 1 }) }),
      dataRequest(userB, `/c2_attempts?id=eq.${encodeURIComponent(rowA)}`, { method: "PATCH", body: JSON.stringify({ correct: 1 }) })
    ]);
    assert(aUpdatesB.length === 0 && bUpdatesA.length === 0, "Cross-user UPDATE was not blocked");

    await Promise.all([
      dataRequest(userA, `/c2_attempts?id=eq.${encodeURIComponent(rowB)}`, { method: "DELETE" }),
      dataRequest(userB, `/c2_attempts?id=eq.${encodeURIComponent(rowA)}`, { method: "DELETE" })
    ]);
    const [aStillExists, bStillExists] = await Promise.all([
      dataRequest(userA, `/c2_attempts?id=eq.${encodeURIComponent(rowA)}&select=id`),
      dataRequest(userB, `/c2_attempts?id=eq.${encodeURIComponent(rowB)}&select=id`)
    ]);
    assert(aStillExists.length === 1 && bStillExists.length === 1, "Cross-user DELETE affected another user's row");

    const anonymous = await fetch(`${DATA_API_URL}/c2_attempts?select=id&limit=1`);
    assert(!anonymous.ok, "Unauthenticated access unexpectedly reached private rows");

    await Promise.all([
      dataRequest(userA, `/c2_attempts?id=eq.${encodeURIComponent(rowA)}`, { method: "DELETE" }),
      dataRequest(userB, `/c2_attempts?id=eq.${encodeURIComponent(rowB)}`, { method: "DELETE" })
    ]);

    console.log(JSON.stringify({
      verified: true,
      users: [userA.id, userB.id],
      checks: {
        ownRead: true,
        crossReadBlocked: true,
        crossUpdateBlocked: true,
        crossDeleteBlocked: true,
        anonymousBlocked: true
      }
    }));
  } finally {
    await deleteTestUsers(users);
  }
}

main().catch(error => {
  console.error(`RLS verification failed: ${error.message}`);
  process.exitCode = 1;
});
