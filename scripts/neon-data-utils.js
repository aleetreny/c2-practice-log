const crypto = require("node:crypto");

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, stableValue(value[key])])
  );
}

function stableJson(value, space = 0) {
  return `${JSON.stringify(stableValue(value), null, space)}\n`;
}

function sha256(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return crypto.createHash("sha256").update(input).digest("hex");
}

function isoTimestamp(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid timestamp: ${value}`);
  return date.toISOString();
}

function normalizeMigrationRow(row) {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    section: String(row.section),
    correct: Number(row.correct) || 0,
    total: Number(row.total) || 0,
    percentage: Number(row.percentage) || 0,
    scale_score: Number(row.scale_score) || 0,
    answers: stableValue(row.answers || {}),
    graded_states: stableValue(row.graded_states || {}),
    attempted_at: isoTimestamp(row.attempted_at),
    created_at: isoTimestamp(row.created_at || row.attempted_at),
    updated_at: isoTimestamp(row.updated_at || row.attempted_at)
  };
}

function migrationContentChecksum(rows) {
  const normalized = rows
    .map(normalizeMigrationRow)
    .sort((left, right) => left.id.localeCompare(right.id));
  return sha256(stableJson(normalized));
}

function isLearningStateRow(row) {
  return String(row?.id || "").startsWith("vocabulary_state_")
    || row?.answers?.__kind === "vocabulary_state";
}

function sanitizePublicRow(row) {
  const normalized = normalizeMigrationRow({
    ...row,
    user_id: "public-profile-owner"
  });
  delete normalized.user_id;
  return normalized;
}

function countBySection(rows) {
  return rows.reduce((counts, row) => {
    const section = String(row.section || "unknown");
    counts[section] = (counts[section] || 0) + 1;
    return counts;
  }, {});
}

function buildPublicProfileFiles(rows, options = {}) {
  const generatedAt = isoTimestamp(options.generatedAt || new Date());
  const profile = options.profile || "Aleetreny";
  const sanitizedRows = rows
    .map(sanitizePublicRow)
    .sort((left, right) => left.attempted_at.localeCompare(right.attempted_at) || left.id.localeCompare(right.id));
  const history = sanitizedRows.filter(row => !isLearningStateRow(row));
  const learningRows = sanitizedRows.filter(isLearningStateRow);
  if (learningRows.length > 1) throw new Error("More than one learning-state row found for the owner profile");

  const learningState = learningRows[0] || null;
  const learningPayload = learningState?.answers || {};
  const vocabulary = {
    version: 1,
    generatedAt,
    profile,
    entries: Array.isArray(learningPayload.entries) ? learningPayload.entries : [],
    archivedIds: Array.isArray(learningPayload.archivedIds) ? learningPayload.archivedIds : [],
    updatedAt: Number(learningPayload.vocabularyUpdatedAt || learningPayload.updatedAt) || 0
  };
  vocabulary.checksum = sha256(stableJson(vocabulary));

  const reviewState = {
    version: 1,
    generatedAt,
    profile,
    vocabularyReviewStats: learningPayload.reviewStats || {},
    vocabularyReviewSettings: learningPayload.vocabularyReviewSettings || {},
    errorReviewStats: learningPayload.errorReviewStats || {},
    errorReviewSettings: learningPayload.errorReviewSettings || {},
    errorReviewUpdatedAt: Number(learningPayload.errorReviewUpdatedAt) || 0
  };
  reviewState.checksum = sha256(stableJson(reviewState));

  const historyDocument = {
    version: 1,
    generatedAt,
    profile,
    attemptCount: history.length,
    rows: history
  };
  historyDocument.checksum = sha256(stableJson(historyDocument));

  const latest = {
    version: 1,
    generatedAt,
    profile,
    history,
    learningState
  };
  latest.checksum = sha256(stableJson(latest));

  const documents = {
    "latest.json": latest,
    "history.json": historyDocument,
    "vocabulary.json": vocabulary,
    "review-state.json": reviewState
  };
  const fileChecksums = Object.fromEntries(
    Object.entries(documents).map(([name, value]) => [name, sha256(stableJson(value, 2))])
  );
  const manifest = {
    version: 1,
    generatedAt,
    profile,
    attemptCount: history.length,
    vocabularyCount: vocabulary.entries.length,
    sections: countBySection(history),
    checksum: latest.checksum,
    source: "Neon",
    files: fileChecksums
  };

  return { ...documents, "manifest.json": manifest };
}

function validatePublicProfile(latest) {
  if (!latest || latest.version !== 1 || !Array.isArray(latest.history)) {
    throw new Error("Unsupported public profile backup format");
  }
  const checksum = latest.checksum;
  const unsigned = { ...latest };
  delete unsigned.checksum;
  const actualChecksum = sha256(stableJson(unsigned));
  if (checksum !== actualChecksum) throw new Error("Public profile checksum mismatch");

  const rows = [...latest.history, ...(latest.learningState ? [latest.learningState] : [])];
  const ids = rows.map(row => String(row.id));
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) throw new Error(`Duplicate row IDs: ${[...new Set(duplicates)].join(", ")}`);
  rows.forEach(sanitizePublicRow);
  return {
    rows,
    attemptCount: latest.history.length,
    learningStateCount: latest.learningState ? 1 : 0,
    checksum
  };
}

module.exports = {
  buildPublicProfileFiles,
  countBySection,
  isLearningStateRow,
  migrationContentChecksum,
  normalizeMigrationRow,
  sanitizePublicRow,
  sha256,
  stableJson,
  stableValue,
  validatePublicProfile
};
