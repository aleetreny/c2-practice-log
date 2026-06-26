const { clearSessionCookie, sendJson } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  res.setHeader("Set-Cookie", clearSessionCookie(req));
  return sendJson(res, 200, { authenticated: false });
};
