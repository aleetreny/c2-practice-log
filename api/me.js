const { isAuthenticated, sendJson } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  return sendJson(res, 200, {
    authenticated: isAuthenticated(req),
    user: "Aleetreny"
  });
};
