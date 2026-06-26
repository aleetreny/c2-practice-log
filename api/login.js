const {
  createSessionToken,
  readJsonBody,
  safeEqual,
  sendJson,
  serializeCookie
} = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const expectedPassword = process.env.APP_PASSWORD;
  if (!expectedPassword) {
    return sendJson(res, 500, { error: "APP_PASSWORD is not configured" });
  }

  try {
    const body = await readJsonBody(req);
    const password = body.password || "";

    if (!safeEqual(password, expectedPassword)) {
      return sendJson(res, 401, { error: "Invalid password" });
    }

    const token = createSessionToken();
    res.setHeader("Set-Cookie", serializeCookie(token, req));
    return sendJson(res, 200, { authenticated: true, user: "Aleetreny" });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { error: error.message || "Login failed" });
  }
};
