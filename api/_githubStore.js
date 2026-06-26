const DEFAULT_DATA_PATH = "data/progress.json";
const DEFAULT_BACKUP_DIR = "data/backups";

function getConfig() {
  const token = process.env.GITHUB_DATA_TOKEN;
  const repo = process.env.GITHUB_DATA_REPO;
  const branch = process.env.GITHUB_DATA_BRANCH || "main";
  const path = process.env.GITHUB_DATA_PATH || DEFAULT_DATA_PATH;

  if (!token || !repo) {
    const error = new Error("GitHub storage is not configured");
    error.statusCode = 500;
    throw error;
  }

  return { token, repo, branch, path };
}

async function githubRequest(url, options = {}) {
  const { token } = getConfig();
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(payload?.message || `GitHub request failed (${response.status})`);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function contentsUrl(path, branch) {
  const { repo } = getConfig();
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
}

function updateUrl(path) {
  const { repo } = getConfig();
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${repo}/contents/${encodedPath}`;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(item => item && typeof item === "object" && item.id && item.section)
    .map(item => ({
      ...item,
      correct: Number(item.correct) || 0,
      total: Number(item.total) || 0,
      percentage: Number(item.percentage) || 0,
      scaleScore: Number(item.scaleScore) || 0,
      date: Number(item.date) || Date.now()
    }))
    .sort((a, b) => a.date - b.date);
}

function mergeHistory(currentHistory, incomingHistory) {
  const byId = new Map();

  for (const item of normalizeHistory(currentHistory)) {
    byId.set(item.id, item);
  }

  for (const item of normalizeHistory(incomingHistory)) {
    byId.set(item.id, item);
  }

  return [...byId.values()].sort((a, b) => a.date - b.date);
}

function toProgressPayload(history) {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    history: normalizeHistory(history)
  };
}

async function readProgressFile() {
  const { branch, path } = getConfig();

  try {
    const payload = await githubRequest(contentsUrl(path, branch));
    const raw = Buffer.from(payload.content.replace(/\n/g, ""), "base64").toString("utf8");
    const parsed = JSON.parse(raw);
    return {
      exists: true,
      sha: payload.sha,
      updatedAt: parsed.updatedAt || null,
      history: normalizeHistory(parsed.history)
    };
  } catch (error) {
    if (error.statusCode === 404) {
      return { exists: false, sha: null, updatedAt: null, history: [] };
    }
    throw error;
  }
}

async function putContent(path, payload, sha, message) {
  const { branch } = getConfig();
  const body = {
    message,
    branch,
    content: Buffer.from(JSON.stringify(payload, null, 2)).toString("base64")
  };

  if (sha) body.sha = sha;
  return githubRequest(updateUrl(path), {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

async function createBackup(current) {
  if (!current.exists || current.history.length === 0 || process.env.GITHUB_BACKUP_ON_WRITE === "false") {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${process.env.GITHUB_BACKUP_DIR || DEFAULT_BACKUP_DIR}/${timestamp}.json`;
  const payload = toProgressPayload(current.history);
  payload.backupOf = process.env.GITHUB_DATA_PATH || DEFAULT_DATA_PATH;

  try {
    return await putContent(backupPath, payload, null, `Backup C2 progress ${timestamp}`);
  } catch (error) {
    if (error.statusCode === 422) return null;
    throw error;
  }
}

async function writeProgressFile(incomingHistory, options = {}) {
  const mode = options.mode === "replace" ? "replace" : "merge";
  const { path } = getConfig();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await readProgressFile();
    const nextHistory = mode === "replace"
      ? normalizeHistory(incomingHistory)
      : mergeHistory(current.history, incomingHistory);
    const nextPayload = toProgressPayload(nextHistory);

    await createBackup(current);

    try {
      const result = await putContent(
        path,
        nextPayload,
        current.sha,
        `Update C2 progress (${nextHistory.length} attempts)`
      );

      return {
        history: nextHistory,
        updatedAt: nextPayload.updatedAt,
        commitSha: result.commit?.sha || null
      };
    } catch (error) {
      if (error.statusCode === 409 && attempt === 0) continue;
      throw error;
    }
  }

  const conflictError = new Error("Could not save progress after retrying");
  conflictError.statusCode = 409;
  throw conflictError;
}

module.exports = {
  readProgressFile,
  writeProgressFile
};
