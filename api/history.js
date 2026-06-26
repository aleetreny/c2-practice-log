const { readJsonBody, requireAuth, sendJson } = require("./_auth");
const { readProgressFile, writeProgressFile } = require("./_githubStore");

module.exports = async function handler(req, res) {
  if (!["GET", "PUT"].includes(req.method)) {
    res.setHeader("Allow", "GET, PUT");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  if (!requireAuth(req, res)) return null;

  try {
    if (req.method === "GET") {
      const progress = await readProgressFile();
      return sendJson(res, 200, {
        history: progress.history,
        updatedAt: progress.updatedAt
      });
    }

    const body = await readJsonBody(req);
    if (!Array.isArray(body.history)) {
      return sendJson(res, 400, { error: "history must be an array" });
    }

    const result = await writeProgressFile(body.history, { mode: body.mode });
    return sendJson(res, 200, result);
  } catch (error) {
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    return sendJson(res, statusCode, { error: error.message || "Could not save progress" });
  }
};
