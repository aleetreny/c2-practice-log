const crypto = require("crypto");

const COOKIE_NAME = "c2_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function getSessionSecret() {
  return process.env.SESSION_SECRET || process.env.APP_PASSWORD || "";
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((cookies, item) => {
    const [rawKey, ...rawValue] = item.trim().split("=");
    if (!rawKey) return cookies;
    cookies[rawKey] = decodeURIComponent(rawValue.join("="));
    return cookies;
  }, {});
}

function signPayload(payload) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

function createSessionToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: "owner",
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS
  })).toString("base64url");

  return `${payload}.${signPayload(payload)}`;
}

function safeEqual(left, right) {
  const leftHash = crypto.createHash("sha256").update(String(left)).digest();
  const rightHash = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function verifySessionToken(token) {
  const secret = getSessionSecret();
  if (!secret || !token || !token.includes(".")) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, signPayload(payload))) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed.sub === "owner" && parsed.exp > Math.floor(Date.now() / 1000);
  } catch (error) {
    return false;
  }
}

function isSecureRequest(req) {
  return req.headers["x-forwarded-proto"] === "https" || process.env.VERCEL === "1";
}

function serializeCookie(value, req, maxAge = SESSION_MAX_AGE_SECONDS) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ];

  if (isSecureRequest(req)) parts.push("Secure");
  return parts.join("; ");
}

function clearSessionCookie(req) {
  return serializeCookie("", req, 0);
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[COOKIE_NAME]);
}

function requireAuth(req, res) {
  if (isAuthenticated(req)) return true;
  sendJson(res, 401, { error: "Not authenticated" });
  return false;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    const invalidJsonError = new Error("Invalid JSON body");
    invalidJsonError.statusCode = 400;
    throw invalidJsonError;
  }
}

module.exports = {
  COOKIE_NAME,
  createSessionToken,
  clearSessionCookie,
  isAuthenticated,
  readJsonBody,
  requireAuth,
  safeEqual,
  sendJson,
  serializeCookie
};
