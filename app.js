// STATE MANAGEMENT
const STATE = {
  currentView: "home", // "home" | "dashboard" | "errorReview" | "writingLab" | "vocabulary" | "vocabularyReview" | "sheet"
  activeSection: null, // "useOfEnglish" | "reading" | "listening" | "writing"
  answers: {}, // Q-num -> string
  gradedStates: {}, // Q-num -> "correct" | "incorrect" | score (0|1|2)
  correctAnswers: {}, // Tracked answer Q-num -> model answer
  errorNotes: {}, // Tracked answer Q-num -> optional study note
  useOfEnglishPartTexts: {}, // part2 | part3 | part4 -> reference text
  readingPartTexts: {}, // part1 -> shared Reading reference text
  isCorrecting: false,
  isSavingAttempt: false,
  activeProfile: "Aleetreny",
  profiles: ["Aleetreny"],
  history: [],
  isAuthenticated: false,
  supabaseSession: null,
  supabaseUserEmail: "",
  syncStatus: "local",
  syncMessage: "Local backup",
  vocabularyEntries: [],
  vocabularyArchivedIds: [],
  vocabularyReviewStats: {},
  vocabularyUpdatedAt: 0,
  vocabularyFilters: {
    query: "",
    family: "vocabulary",
    collection: "curated",
    page: 1
  },
  vocabularyEntryType: null,
  vocabularyEditingId: null,
  vocabularyNotice: "",
  vocabularyReviewSetup: {
    mode: "recognition",
    collection: "all",
    size: 5
  },
  vocabularyReviewSession: null,
  errorReviewSetup: {
    parts: C2_STUDY_REVIEW.TRACKED_PARTS.map(part => part.id),
    scope: "missed",
    size: 10
  },
  errorReviewSession: null,
  writingLabTab: "essay",
  writingSituationGroup: "all",
  writingLabQuery: "",
  writingGenre: "report",
  writingToolkitTab: "situations",
  writingToolkitGroup: "compare",
  timer: {
    elapsedSeconds: 0,
    isRunning: false,
    startedAt: null,
    intervalId: null
  }
};

const OWNER_PROFILE = "Aleetreny";
const LOCAL_HISTORY_KEY = "c2_owner_history";
const LOCAL_VOCABULARY_KEY = "c2_vocabulary_library";
const LOCAL_VOCABULARY_REVIEW_KEY = "c2_vocabulary_review_stats";
const VOCABULARY_STATE_ID_PREFIX = "vocabulary_state_";
const SUPABASE_SESSION_KEY = "c2_supabase_session";
const SUPABASE_CONFIG = {
  restUrl: "https://irsugdtdqnvlrcbotvfe.supabase.co/rest/v1",
  authUrl: "https://irsugdtdqnvlrcbotvfe.supabase.co/auth/v1",
  redirectUrl: "https://aleetreny.github.io/c2-practice-log/",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlyc3VnZHRkcW52bHJjYm90dmZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Nzk4MjgsImV4cCI6MjA5ODA1NTgyOH0.MMJwed40u5tszDUYeS_Tx0BMo0PLWdY-eEp6Qs4XC9o"
};
let vocabularySyncTimeoutId = null;
let cachedPreferredVocabularyVoice = null;
let activeVocabularyUtterance = null;
let activeVocabularySpeechButton = null;
let vocabularySpeechSequence = 0;

const VOCABULARY_VOICE_NAME_PREFERENCES = [
  ["sonia", 165],
  ["libby", 160],
  ["martha", 155],
  ["serena", 150],
  ["google uk english female", 145],
  ["daniel", 130],
  ["arthur", 125],
  ["samantha", 115],
  ["ava", 110],
  ["karen", 100],
  ["moira", 95]
];

if ("speechSynthesis" in window && typeof window.speechSynthesis.addEventListener === "function") {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    cachedPreferredVocabularyVoice = null;
  });
  window.speechSynthesis.getVoices();
}

// INITIALIZE APP
window.addEventListener("DOMContentLoaded", async () => {
  await initializeApp();
});

async function initializeApp() {
  loadProfiles();
  loadLocalStorage();
  await consumeSupabaseRedirectSession();
  renderHome();

  await hydrateRemoteHistory();
  refreshCurrentView();
}

// LOAD AND SAVE LOCAL STORAGE
function loadProfiles() {
  STATE.activeProfile = OWNER_PROFILE;
  STATE.profiles = [OWNER_PROFILE];
  saveProfilesMeta();
}

function loadLocalStorage() {
  try {
    const localHistories = [
      parseStoredHistory(localStorage.getItem(LOCAL_HISTORY_KEY)),
      parseStoredHistory(localStorage.getItem(`c2_history_${getProfileKey(OWNER_PROFILE)}`)),
      parseStoredHistory(localStorage.getItem("c2_history_Candidate_C2"))
    ];

    const localMigration = C2_STUDY_REVIEW.migrateHistoryStudyData(
      mergeHistoryCollections(...localHistories),
      C2_EXAM_METADATA
    );
    STATE.history = localMigration.history;
    if (localMigration.changed) saveLocalStorage();
    const storedVocabulary = JSON.parse(localStorage.getItem(LOCAL_VOCABULARY_KEY) || "{}");
    STATE.vocabularyEntries = Array.isArray(storedVocabulary.entries) ? storedVocabulary.entries.map(stripVocabularyCategory) : [];
    STATE.vocabularyArchivedIds = Array.isArray(storedVocabulary.archivedIds) ? storedVocabulary.archivedIds : [];
    STATE.vocabularyUpdatedAt = Number(storedVocabulary.updatedAt) || 0;
    const storedReviewStats = JSON.parse(localStorage.getItem(LOCAL_VOCABULARY_REVIEW_KEY) || "{}");
    STATE.vocabularyReviewStats = storedReviewStats && typeof storedReviewStats === "object" ? storedReviewStats : {};
  } catch (e) {
    console.error("Failed to load local storage", e);
    STATE.history = [];
    STATE.vocabularyEntries = [];
    STATE.vocabularyArchivedIds = [];
    STATE.vocabularyReviewStats = {};
    STATE.vocabularyUpdatedAt = 0;
  }
}

function saveVocabularyLocalStorage(options = {}) {
  try {
    localStorage.setItem(LOCAL_VOCABULARY_KEY, JSON.stringify({
      entries: STATE.vocabularyEntries,
      archivedIds: STATE.vocabularyArchivedIds,
      updatedAt: STATE.vocabularyUpdatedAt
    }));
    localStorage.setItem(LOCAL_VOCABULARY_REVIEW_KEY, JSON.stringify(STATE.vocabularyReviewStats));
    if (options.sync !== false) queueVocabularyCloudSync();
  } catch (error) {
    console.error("Failed to save vocabulary", error);
  }
}

function stripVocabularyCategory(entry) {
  const { topic, topics, ...cleanEntry } = entry || {};
  return cleanEntry;
}

function markVocabularyChanged() {
  STATE.vocabularyUpdatedAt = Date.now();
  saveVocabularyLocalStorage();
}

function queueVocabularyCloudSync() {
  if (!STATE.isAuthenticated) return;
  if (vocabularySyncTimeoutId) clearTimeout(vocabularySyncTimeoutId);
  vocabularySyncTimeoutId = setTimeout(async () => {
    vocabularySyncTimeoutId = null;
    try {
      await saveRemoteVocabularyState();
    } catch (error) {
      console.warn("Vocabulary cloud sync unavailable", error);
    }
  }, 450);
}

function saveLocalStorage() {
  try {
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(STATE.history));
    localStorage.setItem(`c2_history_${getProfileKey(OWNER_PROFILE)}`, JSON.stringify(STATE.history));
    saveProfilesMeta();
  } catch (e) {
    console.error("Failed to save local storage", e);
  }
}

function saveProfilesMeta() {
  try {
    localStorage.setItem("c2_companion_active_profile", OWNER_PROFILE);
    localStorage.setItem("c2_companion_profiles", JSON.stringify([OWNER_PROFILE]));
  } catch (e) {
    console.error("Failed to save profile metadata", e);
  }
}

function getProfileKey(name = STATE.activeProfile) {
  return name.trim().replace(/\s+/g, "_");
}

function parseStoredHistory(raw) {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function mergeHistoryCollections(...collections) {
  const byId = new Map();

  collections.flat().forEach(item => {
    if (!item || !item.id) return;
    byId.set(item.id, item);
  });

  return [...byId.values()].sort((a, b) => (a.date || 0) - (b.date || 0));
}

function normalizeSupabaseUrl(value) {
  return value.replace(/\/$/, "");
}

function loadSupabaseSession() {
  try {
    const raw = localStorage.getItem(SUPABASE_SESSION_KEY);
    const session = raw ? JSON.parse(raw) : null;
    if (!session || !session.access_token || !session.user) return null;

    STATE.supabaseSession = session;
    STATE.isAuthenticated = true;
    STATE.supabaseUserEmail = session.user.email || "";
    return session;
  } catch (error) {
    console.error("Failed to load Supabase session", error);
    return null;
  }
}

function saveSupabaseSession(session) {
  const normalized = {
    ...session,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + (session.expires_in || 3600)
  };

  STATE.supabaseSession = normalized;
  STATE.isAuthenticated = true;
  STATE.supabaseUserEmail = normalized.user?.email || "";
  localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(normalized));
}

function clearSupabaseSession() {
  STATE.supabaseSession = null;
  STATE.isAuthenticated = false;
  STATE.supabaseUserEmail = "";
  localStorage.removeItem(SUPABASE_SESSION_KEY);
}

async function fetchSupabaseUser(accessToken) {
  const response = await fetch(`${normalizeSupabaseUrl(SUPABASE_CONFIG.authUrl)}/user`, {
    headers: {
      apikey: SUPABASE_CONFIG.anonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.msg || payload.message || "Could not read Supabase user");
  }

  return payload;
}

async function consumeSupabaseRedirectSession() {
  const hash = window.location.hash ? window.location.hash.slice(1) : "";
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (!accessToken || !refreshToken) return false;

  try {
    const user = await fetchSupabaseUser(accessToken);
    saveSupabaseSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: Number(params.get("expires_in")) || 3600,
      expires_at: Math.floor(Date.now() / 1000) + (Number(params.get("expires_in")) || 3600),
      token_type: params.get("token_type") || "bearer",
      user
    });

    window.history.replaceState(null, document.title, `${window.location.origin}${window.location.pathname}${window.location.search}`);
    return true;
  } catch (error) {
    console.warn("Could not consume Supabase redirect session", error);
    return false;
  }
}

async function supabaseAuthRequest(path, body) {
  const response = await fetch(`${normalizeSupabaseUrl(SUPABASE_CONFIG.authUrl)}${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_CONFIG.anonKey,
      Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.msg || payload.message || "Supabase auth failed");
  }

  return payload;
}

async function signInWithSupabase(email, password) {
  const session = await supabaseAuthRequest("/token?grant_type=password", { email, password });
  saveSupabaseSession(session);
  return session;
}

async function signUpWithSupabase(email, password) {
  const redirectTo = encodeURIComponent(SUPABASE_CONFIG.redirectUrl);
  const session = await supabaseAuthRequest(`/signup?redirect_to=${redirectTo}`, { email, password });
  if (session.access_token) saveSupabaseSession(session);
  return session;
}

async function refreshSupabaseSession() {
  const session = STATE.supabaseSession || loadSupabaseSession();
  if (!session?.refresh_token) return false;

  try {
    const refreshed = await supabaseAuthRequest("/token?grant_type=refresh_token", {
      refresh_token: session.refresh_token
    });
    saveSupabaseSession(refreshed);
    return true;
  } catch (error) {
    clearSupabaseSession();
    return false;
  }
}

async function ensureSupabaseSession() {
  const session = STATE.supabaseSession || loadSupabaseSession();
  if (!session) return false;

  const expiresAt = Number(session.expires_at || 0);
  const shouldRefresh = expiresAt > 0 && expiresAt < Math.floor(Date.now() / 1000) + 120;
  if (!shouldRefresh) return true;

  return refreshSupabaseSession();
}

async function supabaseRequest(path, options = {}, retry = true) {
  const hasSession = await ensureSupabaseSession();
  if (!hasSession) throw new Error("Sign in to sync your progress.");

  const response = await fetch(`${normalizeSupabaseUrl(SUPABASE_CONFIG.restUrl)}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_CONFIG.anonKey,
      Authorization: `Bearer ${STATE.supabaseSession.access_token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  if (response.status === 401 && retry && await refreshSupabaseSession()) {
    return supabaseRequest(path, options, false);
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.message || payload?.details || `Supabase request failed (${response.status})`);
  }

  return payload;
}

function historyItemToSupabaseRow(item) {
  return {
    id: item.id,
    user_id: STATE.supabaseSession.user.id,
    section: item.section,
    correct: Number(item.correct) || 0,
    total: Number(item.total) || 0,
    percentage: Number(item.percentage) || 0,
    scale_score: Number(item.scaleScore) || 0,
    answers: getHistoryAnswersForStorage(item),
    graded_states: item.gradedStates || {},
    attempted_at: new Date(Number(item.date) || Date.now()).toISOString()
  };
}

function supabaseRowToHistoryItem(row) {
  const answers = row.answers || {};
  const historyItem = {
    answers
  };

  return {
    id: row.id,
    section: row.section,
    correct: Number(row.correct) || 0,
    total: Number(row.total) || 0,
    percentage: Number(row.percentage) || 0,
    scaleScore: Number(row.scale_score) || 0,
    answers,
    gradedStates: row.graded_states || {},
    date: row.attempted_at ? new Date(row.attempted_at).getTime() : Date.now(),
    durationSeconds: getAttemptDurationSeconds(historyItem)
  };
}

function getVocabularyStateRowId() {
  const userId = STATE.supabaseSession?.user?.id;
  return userId ? `${VOCABULARY_STATE_ID_PREFIX}${userId}` : "";
}

function vocabularyStateToSupabaseRow() {
  return {
    id: getVocabularyStateRowId(),
    user_id: STATE.supabaseSession.user.id,
    section: "writing",
    correct: 0,
    total: 1,
    percentage: 0,
    scale_score: 160,
    answers: {
      __kind: "vocabulary_state",
      entries: STATE.vocabularyEntries.map(stripVocabularyCategory),
      archivedIds: STATE.vocabularyArchivedIds,
      reviewStats: STATE.vocabularyReviewStats,
      updatedAt: STATE.vocabularyUpdatedAt
    },
    graded_states: {},
    attempted_at: new Date(STATE.vocabularyUpdatedAt || Date.now()).toISOString()
  };
}

function isVocabularyStateRow(row) {
  return String(row?.id || "").startsWith(VOCABULARY_STATE_ID_PREFIX) || row?.answers?.__kind === "vocabulary_state";
}

function applyRemoteVocabularyState(row) {
  const payload = row?.answers;
  if (!payload || payload.__kind !== "vocabulary_state") return false;
  STATE.vocabularyEntries = Array.isArray(payload.entries) ? payload.entries.map(stripVocabularyCategory) : [];
  STATE.vocabularyArchivedIds = Array.isArray(payload.archivedIds) ? payload.archivedIds : [];
  STATE.vocabularyReviewStats = payload.reviewStats && typeof payload.reviewStats === "object" ? payload.reviewStats : {};
  STATE.vocabularyUpdatedAt = Number(payload.updatedAt) || (row.attempted_at ? new Date(row.attempted_at).getTime() : 0);
  saveVocabularyLocalStorage({ sync: false });
  return true;
}

async function fetchSupabaseHistory() {
  const rows = await supabaseRequest(
    "/c2_attempts?select=id,section,correct,total,percentage,scale_score,answers,graded_states,attempted_at&order=attempted_at.asc"
  );
  return Array.isArray(rows) ? rows.filter(row => !isVocabularyStateRow(row)).map(supabaseRowToHistoryItem) : [];
}

async function fetchSupabaseVocabularyState() {
  const rowId = getVocabularyStateRowId();
  if (!rowId) return null;
  const rows = await supabaseRequest(
    `/c2_attempts?id=eq.${encodeURIComponent(rowId)}&select=id,answers,attempted_at&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function saveRemoteVocabularyState() {
  if (!STATE.isAuthenticated || !getVocabularyStateRowId()) return { online: false };
  await supabaseRequest("/c2_attempts?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([vocabularyStateToSupabaseRow()])
  });
  return { online: true };
}

async function hydrateRemoteHistory() {
  try {
    const hasSession = await ensureSupabaseSession();

    if (!hasSession) {
      STATE.syncStatus = "local";
      STATE.syncMessage = "Sign in to sync";
      return;
    }

    STATE.syncStatus = "syncing";
    STATE.syncMessage = "Syncing";

    const [remoteHistory, remoteVocabularyState] = await Promise.all([
      fetchSupabaseHistory(),
      fetchSupabaseVocabularyState()
    ]);
    const migration = C2_STUDY_REVIEW.migrateHistoryStudyData(
      mergeHistoryCollections(remoteHistory, STATE.history),
      C2_EXAM_METADATA
    );
    const mergedHistory = migration.history;
    STATE.history = mergedHistory;
    saveLocalStorage();

    const remoteVocabularyUpdatedAt = Number(remoteVocabularyState?.answers?.updatedAt) || 0;
    if (remoteVocabularyState && remoteVocabularyUpdatedAt > STATE.vocabularyUpdatedAt) {
      applyRemoteVocabularyState(remoteVocabularyState);
    } else if (STATE.vocabularyUpdatedAt > remoteVocabularyUpdatedAt) {
      await saveRemoteVocabularyState();
    }

    if (mergedHistory.length !== remoteHistory.length || migration.changed) {
      await saveRemoteHistory("merge");
    }

    STATE.syncStatus = "synced";
    STATE.syncMessage = "Synced online";
  } catch (error) {
    STATE.syncStatus = "local";
    STATE.syncMessage = "Local backup";
    console.warn("Supabase sync unavailable", error);
  }
}

async function saveRemoteHistory(mode = "merge") {
  if (mode === "replace") {
    await supabaseRequest(`/c2_attempts?user_id=eq.${encodeURIComponent(STATE.supabaseSession.user.id)}`, {
      method: "DELETE"
    });
  }

  if (STATE.history.length > 0) {
    await supabaseRequest("/c2_attempts?on_conflict=id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(STATE.history.map(historyItemToSupabaseRow))
    });
  }

  if (STATE.vocabularyUpdatedAt > 0) {
    await saveRemoteVocabularyState();
  }

  const history = await fetchSupabaseHistory();
  STATE.history = mergeHistoryCollections(history);
  saveLocalStorage();
  return { history };
}

async function persistHistory(options = {}) {
  const mode = options.mode || "merge";
  saveLocalStorage();

  if (!STATE.isAuthenticated) {
    STATE.syncStatus = "local";
    STATE.syncMessage = "Saved locally";
    return { online: false };
  }

  try {
    STATE.syncStatus = "syncing";
    STATE.syncMessage = "Saving";
    await saveRemoteHistory(mode);
    STATE.syncStatus = "synced";
    STATE.syncMessage = "Synced online";
    return { online: true };
  } catch (error) {
    STATE.syncStatus = "local";
    STATE.syncMessage = "Local backup";
    console.error("Online save failed", error);
    alert("Saved locally, but online sync failed. Sign in again from Account before closing the browser.");
    return { online: false, error };
  }
}

function getSyncLabel() {
  if (STATE.syncStatus === "syncing") return "Syncing";
  if (STATE.isAuthenticated) return "Online";
  return "Local backup";
}

function resetPracticeTimer(options = {}) {
  const keepRunning = options.keepRunning === true;
  clearPracticeTimerInterval();
  STATE.timer.elapsedSeconds = 0;
  STATE.timer.startedAt = keepRunning ? Date.now() : null;
  STATE.timer.isRunning = keepRunning;

  if (keepRunning) {
    STATE.timer.intervalId = setInterval(updatePracticeTimerDisplay, 1000);
  }

  updatePracticeTimerDisplay();
}

function clearPracticeTimerInterval() {
  if (STATE.timer.intervalId) {
    clearInterval(STATE.timer.intervalId);
    STATE.timer.intervalId = null;
  }
}

function getPracticeTimerSeconds() {
  if (!STATE.timer.isRunning || !STATE.timer.startedAt) {
    return STATE.timer.elapsedSeconds;
  }

  return Math.floor((Date.now() - STATE.timer.startedAt) / 1000);
}

function formatPracticeTimer(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":");
}

function getCurrentPracticeDurationSeconds() {
  if (STATE.activeSection === "listening") return 0;
  return getPracticeTimerSeconds();
}

function getPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isPartialPracticeAttempt(item) {
  return C2_ATTEMPT_DATA.isPartialPracticeAttempt(item);
}

function getScoredHistory(section = null) {
  return C2_ATTEMPT_DATA.getScoredAttempts(STATE.history, section);
}

function getPartialPracticeHistory() {
  return STATE.history.filter(isPartialPracticeAttempt);
}

function getAttemptedQuestionNumbers(item) {
  return C2_ATTEMPT_DATA.getAttemptedQuestionNumbers(item, C2_EXAM_METADATA[item?.section]);
}

function getAttemptedPartKeys(item) {
  return C2_ATTEMPT_DATA.getAttemptedPartKeys(item, C2_EXAM_METADATA[item?.section]);
}

function getPartialPracticeScopeLabel(item) {
  const sectionMeta = C2_EXAM_METADATA[item?.section];
  if (!sectionMeta) return "Selected questions";
  const partKeys = getAttemptedPartKeys(item);
  if (partKeys.length === 0) return "Selected questions";
  return partKeys.map(partKey => {
    const match = String(sectionMeta.parts[partKey]?.name || partKey).match(/^Part\s+\d+/i);
    return match ? match[0] : String(sectionMeta.parts[partKey]?.name || partKey);
  }).join(" · ");
}

function getAttemptDurationSeconds(item = {}) {
  if (isPartialPracticeAttempt(item)) return 0;
  const answers = getPlainObject(item.answers);
  const meta = getPlainObject(answers.meta);
  const candidates = [
    item.durationSeconds,
    item.elapsedSeconds,
    meta.durationSeconds,
    answers.durationSeconds
  ];
  const seconds = candidates
    .map(value => Number(value))
    .find(value => Number.isFinite(value) && value > 0);

  return seconds ? Math.round(seconds) : 0;
}

function getHistoryAnswersForStorage(item = {}) {
  const answers = { ...getPlainObject(item.answers) };
  if (isPartialPracticeAttempt(item)) {
    const meta = { ...getPlainObject(answers.meta) };
    delete meta.durationSeconds;
    delete answers.durationSeconds;
    answers.meta = meta;
    return answers;
  }
  const durationSeconds = getAttemptDurationSeconds(item);

  if (durationSeconds > 0) {
    answers.meta = {
      ...getPlainObject(answers.meta),
      durationSeconds
    };
  }

  return answers;
}

function getErrorNotes(item = {}) {
  const answers = getPlainObject(item.answers);
  const meta = getPlainObject(answers.meta);
  return getPlainObject(meta.errorNotes);
}

function getCorrectAnswers(item = {}) {
  return C2_STUDY_REVIEW.getCorrectAnswers(item);
}

function getUseOfEnglishPartTexts(item = {}) {
  const answers = getPlainObject(item.answers);
  const meta = getPlainObject(answers.meta);
  return getPlainObject(meta.useOfEnglishPartTexts);
}

function getReadingPartTexts(item = {}) {
  const answers = getPlainObject(item.answers);
  const meta = getPlainObject(answers.meta);
  const savedTexts = getPlainObject(meta.readingPartTexts);
  if (savedTexts.part1) return savedTexts;

  const legacyQuestionTexts = getPlainObject(meta.questionTexts);
  const legacyText = Object.values(legacyQuestionTexts).find(value => typeof value === "string" && value.trim());
  return legacyText ? { part1: legacyText } : {};
}

function getPartReferenceTexts(item = {}) {
  if (item.section === "useOfEnglish") return getUseOfEnglishPartTexts(item);
  if (item.section === "reading") return getReadingPartTexts(item);
  return {};
}

function getUseOfEnglishPartShortLabel(partKey) {
  return partKey.replace("part", "Part ");
}

function isObjectiveError(partData, gradeState) {
  if (!partData) return false;
  if (partData.type === "partial") {
    return typeof gradeState === "number" && gradeState < partData.weight;
  }
  return gradeState === "incorrect";
}

function hasObjectiveGrade(partData, gradeState) {
  if (!partData) return false;
  if (partData.type === "partial") {
    return typeof gradeState === "number" && Number.isFinite(gradeState);
  }
  return gradeState === "correct" || gradeState === "incorrect";
}

function isTrackedErrorPart(section, partKey) {
  return section === "useOfEnglish" || (section === "reading" && partKey === "part1");
}

function getPartEntryForQuestion(section, qNum) {
  const parts = C2_EXAM_METADATA[section]?.parts || {};
  return Object.entries(parts).find(([, partData]) => qNum >= partData.startQ && qNum <= partData.endQ) || null;
}

function getTrackedErrorColumns() {
  return [
    {
      section: "reading",
      sectionName: C2_EXAM_METADATA.reading.name,
      partKey: "part1",
      partData: C2_EXAM_METADATA.reading.parts.part1
    },
    ...Object.entries(C2_EXAM_METADATA.useOfEnglish.parts).map(([partKey, partData]) => ({
      section: "useOfEnglish",
      sectionName: C2_EXAM_METADATA.useOfEnglish.name,
      partKey,
      partData
    }))
  ];
}

function getTrackedErrorEntries({ includeCorrectWithoutNotes = false } = {}) {
  const entries = [];

  STATE.history
    .filter(item => item.section === "useOfEnglish" || item.section === "reading")
    .forEach(item => {
      const answers = getPlainObject(item.answers);
      const gradedStates = getPlainObject(item.gradedStates);
      const notes = getErrorNotes(item);
      const correctAnswers = getCorrectAnswers(item);
      const partTexts = getPartReferenceTexts(item);

      Object.entries(C2_EXAM_METADATA[item.section].parts).forEach(([partKey, partData]) => {
        if (!isTrackedErrorPart(item.section, partKey)) return;
        for (let q = partData.startQ; q <= partData.endQ; q++) {
          const gradeState = gradedStates[q];
          if (!hasObjectiveGrade(partData, gradeState)) continue;
          const note = typeof notes[q] === "string" ? notes[q].trim() : "";
          const correctAnswer = typeof correctAnswers[q] === "string" ? correctAnswers[q].trim() : "";
          const isMissed = isObjectiveError(partData, gradeState);
          if (!C2_STUDY_REVIEW.shouldIncludeInErrorLog(
            gradeState,
            partData.weight,
            note,
            includeCorrectWithoutNotes
          )) continue;

          entries.push({
            attemptId: item.id,
            date: Number(item.date) || 0,
            section: item.section,
            sectionName: C2_EXAM_METADATA[item.section].name,
            partKey,
            partName: partData.name,
            question: q,
            answer: answers[q] || "",
            correctAnswer,
            gradeState,
            maxPoints: partData.weight,
            isMissed,
            note,
            hasReferenceText: Boolean(String(partTexts[partKey] || "").trim())
          });
        }
      });
    });

  return entries.sort((a, b) => b.date - a.date || a.question - b.question);
}

function formatAttemptDuration(totalSeconds) {
  const seconds = Number(totalSeconds) || 0;
  return seconds > 0 ? formatPracticeTimer(seconds) : "";
}

function updatePracticeTimerDisplay() {
  const display = document.getElementById("practice-timer-display");
  const toggleButton = document.getElementById("practice-timer-toggle");
  if (!display || !toggleButton) return;

  display.textContent = formatPracticeTimer(getPracticeTimerSeconds());
  toggleButton.textContent = STATE.timer.isRunning ? "Pause" : "Start";
}

function togglePracticeTimer() {
  if (STATE.activeSection === "listening") return;

  if (STATE.timer.isRunning) {
    STATE.timer.elapsedSeconds = getPracticeTimerSeconds();
    STATE.timer.isRunning = false;
    STATE.timer.startedAt = null;
    clearPracticeTimerInterval();
  } else {
    STATE.timer.isRunning = true;
    STATE.timer.startedAt = Date.now() - STATE.timer.elapsedSeconds * 1000;
    clearPracticeTimerInterval();
    STATE.timer.intervalId = setInterval(updatePracticeTimerDisplay, 1000);
  }

  updatePracticeTimerDisplay();
}

function restartPracticeTimer() {
  if (STATE.activeSection === "listening") return;
  resetPracticeTimer({ keepRunning: STATE.timer.isRunning });
}

function renderPracticeTimerHTML() {
  if (STATE.activeSection === "listening") return "";

  return `
    <div class="practice-timer" aria-label="Practice timer">
      <span id="practice-timer-display">${formatPracticeTimer(getPracticeTimerSeconds())}</span>
      <div class="practice-timer-actions">
        <button class="btn btn-secondary timer-btn" id="practice-timer-toggle" onclick="togglePracticeTimer()">Start</button>
        <button class="btn btn-secondary timer-btn" onclick="restartPracticeTimer()">Reset</button>
      </div>
    </div>
  `;
}

// CAMBRIDGE SCALE SCORE PIECEWISE CONVERTERS PER SECTION
function interpolate(x, x0, x1, y0, y1) {
  return Math.round(y0 + ((x - x0) / (x1 - x0)) * (y1 - y0));
}

function getUseOfEnglishScale(raw) {
  if (raw >= 22) return interpolate(raw, 22, 28, 220, 230);
  if (raw >= 17) return interpolate(raw, 17, 22, 200, 220);
  if (raw >= 13) return interpolate(raw, 13, 17, 180, 200);
  if (raw >= 9) return interpolate(raw, 9, 13, 162, 180);
  return interpolate(raw, 0, 9, 120, 162);
}

function getReadingScale(raw) {
  if (raw >= 36) return interpolate(raw, 36, 44, 220, 230);
  if (raw >= 28) return interpolate(raw, 28, 36, 200, 220);
  if (raw >= 22) return interpolate(raw, 22, 28, 180, 200);
  if (raw >= 14) return interpolate(raw, 14, 22, 162, 180);
  return interpolate(raw, 0, 14, 120, 162);
}

function getListeningScale(raw) {
  if (raw >= 24) return interpolate(raw, 24, 30, 220, 230);
  if (raw >= 18) return interpolate(raw, 18, 24, 200, 220);
  if (raw >= 14) return interpolate(raw, 14, 18, 180, 200);
  if (raw >= 10) return interpolate(raw, 10, 14, 162, 180);
  return interpolate(raw, 0, 10, 120, 162);
}

function getWritingScale(raw) {
  if (raw >= 34) return interpolate(raw, 34, 40, 220, 230);
  if (raw >= 24) return interpolate(raw, 24, 34, 200, 220);
  if (raw >= 16) return interpolate(raw, 16, 24, 180, 200);
  if (raw >= 10) return interpolate(raw, 10, 16, 162, 180);
  return interpolate(raw, 0, 10, 120, 162);
}

function calculateScaleScore(section, rawScore) {
  if (section === "useOfEnglish") return getUseOfEnglishScale(rawScore);
  if (section === "reading") return getReadingScale(rawScore);
  if (section === "listening") return getListeningScale(rawScore);
  if (section === "writing") return getWritingScale(rawScore);
  return 0;
}

function getCambridgeGrade(scaleScore) {
  if (scaleScore >= 220) return "Grade A (C2)";
  if (scaleScore >= 213) return "Grade B (C2)";
  if (scaleScore >= 200) return "Grade C (C2)";
  if (scaleScore >= 180) return "Level C1";
  if (scaleScore >= 162) return "Reported (No Certificate)";
  return "Not Reported";
}

const SECTION_ORDER = ["useOfEnglish", "reading", "listening", "writing"];

function getSectionInitial(section) {
  if (section === "useOfEnglish") return "UE";
  if (section === "reading") return "R";
  if (section === "listening") return "L";
  if (section === "writing") return "W";
  return "?";
}

function formatShortDate(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatCompactDateTime(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getLatestAttempt() {
  const scoredHistory = getScoredHistory();
  return scoredHistory.length > 0 ? scoredHistory[scoredHistory.length - 1] : null;
}

function getSectionStats(section) {
  const logs = getScoredHistory(section);

  if (logs.length === 0) {
    return {
      section,
      attempts: 0,
      avgScale: 0,
      avgAccuracy: 0,
      bestScale: 0,
      lastScale: 0,
      lastDate: null
    };
  }

  const avgScale = Math.round(logs.reduce((acc, curr) => acc + curr.scaleScore, 0) / logs.length);
  const avgAccuracy = Math.round(logs.reduce((acc, curr) => acc + curr.percentage, 0) / logs.length);
  const bestScale = Math.max(...logs.map(item => item.scaleScore));
  const last = logs[logs.length - 1];

  return {
    section,
    attempts: logs.length,
    avgScale,
    avgAccuracy,
    bestScale,
    lastScale: last.scaleScore,
    lastDate: last.date
  };
}

function getAllSectionStats() {
  return SECTION_ORDER.map(section => getSectionStats(section));
}

function getPartScoreForSession(session, partKey, partData) {
  if (!session || !session.gradedStates) {
    return { raw: 0, max: 0 };
  }

  if (partData.type === "writing") {
    const criteria = session.gradedStates[partKey];
    if (!criteria) return { raw: 0, max: 0 };

    const raw = (criteria.content || 0) + (criteria.comm || 0) + (criteria.org || 0) + (criteria.lang || 0);
    return { raw, max: partData.weight };
  }

  let raw = 0;
  let max = 0;

  for (let q = partData.startQ; q <= partData.endQ; q++) {
    const state = session.gradedStates[q];

    if (partData.type === "partial") {
      raw += typeof state === "number" ? state : 0;
      max += partData.weight;
    } else {
      raw += state === "correct" ? partData.weight : 0;
      max += partData.weight;
    }
  }

  return { raw, max };
}

function getSectionPartStats(section) {
  const sectionMeta = C2_EXAM_METADATA[section];
  const logs = getScoredHistory(section);

  return Object.entries(sectionMeta.parts).map(([partKey, partData]) => {
    const scores = logs.map(session => getPartScoreForSession(session, partKey, partData));
    const rawSum = scores.reduce((acc, item) => acc + item.raw, 0);
    const maxSum = scores.reduce((acc, item) => acc + item.max, 0);
    const attemptedScores = scores.filter(item => item.max > 0);
    const averagePct = maxSum > 0 ? Math.round((rawSum / maxSum) * 100) : 0;
    const latestScore = attemptedScores.length > 0 ? attemptedScores[attemptedScores.length - 1] : null;

    return {
      section,
      partKey,
      name: partData.name,
      attempts: attemptedScores.length,
      averagePct,
      averageRaw: attemptedScores.length > 0 ? rawSum / attemptedScores.length : 0,
      maxRaw: partData.weight,
      latestPct: latestScore && latestScore.max > 0 ? Math.round((latestScore.raw / latestScore.max) * 100) : 0
    };
  });
}

function getAllPartStats() {
  return SECTION_ORDER.flatMap(section => getSectionPartStats(section));
}

function getWeakestPart(section) {
  const attempted = getSectionPartStats(section).filter(part => part.attempts > 0);
  if (attempted.length === 0) return null;
  return attempted.slice().sort((a, b) => a.averagePct - b.averagePct)[0];
}

function getGlobalWeakestPart() {
  const attempted = getAllPartStats().filter(part => part.attempts > 0);
  if (attempted.length === 0) return null;
  return attempted.slice().sort((a, b) => a.averagePct - b.averagePct)[0];
}

function calculateRecentTrend() {
  const scoredHistory = getScoredHistory();
  if (scoredHistory.length < 2) return 0;

  const recent = scoredHistory.slice(-3);
  const previous = scoredHistory.slice(Math.max(0, scoredHistory.length - 6), scoredHistory.length - 3);
  const previousSet = previous.length > 0 ? previous : scoredHistory.slice(0, -recent.length);

  if (previousSet.length === 0) return 0;

  const avgRecent = recent.reduce((acc, curr) => acc + curr.scaleScore, 0) / recent.length;
  const avgPrevious = previousSet.reduce((acc, curr) => acc + curr.scaleScore, 0) / previousSet.length;
  return Math.round(avgRecent - avgPrevious);
}

function calculatePassRate() {
  const scoredHistory = getScoredHistory();
  if (scoredHistory.length === 0) return 0;
  const passed = scoredHistory.filter(item => item.scaleScore >= 200).length;
  return Math.round((passed / scoredHistory.length) * 100);
}

function getScorePosition(scaleScore) {
  if (!scaleScore) {
    return {
      label: "No baseline yet",
      detail: "Save your first mock to start tracking progress.",
      tone: "neutral"
    };
  }

  if (scaleScore >= 220) {
    return {
      label: "Grade A zone",
      detail: `${scaleScore - 220} points above 220.`,
      tone: "strong"
    };
  }

  if (scaleScore >= 200) {
    return {
      label: "C2 zone",
      detail: `${220 - scaleScore} points to Grade A.`,
      tone: "steady"
    };
  }

  if (scaleScore >= 180) {
    return {
      label: "C1 zone",
      detail: `${200 - scaleScore} points to secure C2.`,
      tone: "watch"
    };
  }

  return {
    label: "Below C1",
    detail: `${180 - scaleScore} points to reach C1.`,
    tone: "risk"
  };
}

function getNextFocusInsight(sectionStats = getAllSectionStats()) {
  const practiced = sectionStats.filter(item => item.attempts > 0);

  if (practiced.length === 0) {
    return {
      section: null,
      title: "Start with any paper",
      detail: "No saved attempts yet.",
      value: "--"
    };
  }

  const weakest = practiced.slice().sort((a, b) => a.avgScale - b.avgScale)[0];
  const name = C2_EXAM_METADATA[weakest.section].name;
  const weakestPart = getWeakestPart(weakest.section);
  const partLabel = weakestPart ? ` Weakest part: ${weakestPart.name} (${weakestPart.averagePct}%).` : "";

  return {
    section: weakest.section,
    title: `Next focus: ${name}`,
    detail: `${weakest.avgScale} average scale.${partLabel}`,
    value: weakest.avgScale
  };
}

// ==========================================================================
// 1. HOME HUB CONTROLLER (CLEAN INITIAL STATE, VISUALLY SQUARE)
// ==========================================================================
function renderMainNavigation(activeView) {
  const items = [
    { key: "home", label: "Practice", action: "renderHome()" },
    { key: "dashboard", label: "Progress", action: "renderDashboard()" },
    { key: "writingLab", label: "Writing", action: "openWritingLab()" },
    { key: "vocabulary", label: "Vocabulary", action: "openVocabulary()" },
    { key: "vocabularyReview", label: "Review", action: "openVocabularyReview()" }
  ];

  return `
    <nav class="topbar-actions" aria-label="Main navigation">
      <div class="nav-group">
        ${items.map(item => `
          <button class="nav-pill ${activeView === item.key ? "active" : ""}" onclick="${item.action}">${item.label}</button>
        `).join("")}
      </div>
      <button class="candidate-switch" onclick="openProfileModal()" title="Account and sync">
        <span class="candidate-name">${escapeHTML(STATE.activeProfile)}</span>
        <span class="candidate-status"><i aria-hidden="true"></i>${getSyncLabel()}</span>
      </button>
    </nav>
  `;
}

function renderHome() {
  if (STATE.currentView === "sheet") {
    clearPracticeTimerInterval();
  }

  STATE.currentView = "home";
  const appContainer = document.getElementById("app-container");
  const totalCompleted = getScoredHistory().length;
  const avgScaleScore = calculateAverageScaleScore();
  const latest = getLatestAttempt();
  const scorePosition = getScorePosition(avgScaleScore);
  const focus = getNextFocusInsight();
  const sectionStats = getAllSectionStats();
  
  appContainer.innerHTML = `
    <div class="home-container app-shell">
      <header class="app-topbar">
        <button class="brand-button" onclick="renderHome()" aria-label="Practice home" style="text-align: left;">
          <span style="text-align: left; display: block;">
            <span class="brand-title">Practice Log</span>
            <span class="brand-subtitle">Cambridge C2</span>
          </span>
        </button>

        ${renderMainNavigation("home")}
      </header>

      <main class="home-main">
        <section class="home-overview">
          <div class="home-title-area">
            <span class="eyebrow">Practice hub</span>
            <h1>Fill, grade, track.</h1>
            <p>${scorePosition.label} - ${scorePosition.detail}</p>
          </div>

          <div class="home-metrics" aria-label="Progress snapshot">
            <div class="metric-tile">
              <span class="metric-label">Average</span>
              <strong>${avgScaleScore || "--"}</strong>
              <span class="metric-note">${avgScaleScore ? getCambridgeGrade(avgScaleScore) : "No mocks yet"}</span>
            </div>
            <div class="metric-tile">
              <span class="metric-label">Attempts</span>
              <strong>${totalCompleted}</strong>
              <span class="metric-note">${latest ? `Latest: ${C2_EXAM_METADATA[latest.section].name}` : "Baseline pending"}</span>
            </div>
            <div class="metric-tile focus">
              <span class="metric-label">Focus</span>
              <strong>${focus.value}</strong>
              <span class="metric-note">${focus.section ? C2_EXAM_METADATA[focus.section].name : "First practice"}</span>
            </div>
          </div>
        </section>

        <section class="sections-grid" aria-label="Exam parts">
          ${SECTION_ORDER.map(key => {
            const data = C2_EXAM_METADATA[key];
            const stats = sectionStats.find(item => item.section === key);
            const progressWidth = stats.avgScale ? Math.max(6, Math.min(100, Math.round((stats.avgScale / 230) * 100))) : 0;

            return `
              <article class="section-square-card">
                <div class="section-card-topline">
                  <span class="section-code">${getSectionIconSVG(key)}</span>
                  <span class="section-card-badge">${data.maxMarks} marks</span>
                </div>
                <div>
                  <h2 class="section-card-title">${data.name}</h2>
                  <p class="section-card-desc">${data.description}</p>
                </div>
                <div class="section-card-stats">
                  <div>
                    <span>Average</span>
                    <strong>${stats.avgScale || "--"}</strong>
                  </div>
                  <div>
                    <span>Attempts</span>
                    <strong>${stats.attempts}</strong>
                  </div>
                  <div>
                    <span>Latest</span>
                    <strong>${stats.lastScale || "--"}</strong>
                  </div>
                </div>
                <div class="mini-meter" aria-hidden="true"><span style="width:${progressWidth}%"></span></div>
                <button class="btn btn-primary btn-full" onclick="openAnswerSheet('${key}')">Open mock</button>
              </article>
            `;
          }).join("")}
        </section>
      </main>
    </div>
  `;
}

// ==========================================================================
// VOCABULARY LIBRARY AND QUICK REVIEW
// ==========================================================================
const VOCABULARY_FAMILIES = {
  vocabulary: { label: "Vocabulary", shortLabel: "Vocabulary", icon: "V" },
  patterns: { label: "Patterns & Collocations", shortLabel: "Patterns", icon: "P" },
  idioms: { label: "Idioms & Fixed Phrases", shortLabel: "Idioms", icon: "I" },
  wordFormation: { label: "Word Formation", shortLabel: "Word formation", icon: "W" }
};

const VOCABULARY_COLLECTIONS = {
  curated: {
    family: "vocabulary",
    label: "Curated Vocabulary",
    shortLabel: "Curated",
    entryType: "general",
    description: "Words paired with a concise meaning and a usage example."
  },
  official: {
    family: "vocabulary",
    label: "Official Wordlist",
    shortLabel: "Official",
    entryType: "general",
    description: "Definition-led vocabulary with an example sentence."
  },
  personal: {
    family: "vocabulary",
    label: "My Vocabulary Phrases",
    shortLabel: "My phrases",
    entryType: "personal",
    description: "Your own sentences and expressions. Notes are optional; they are not dictionary entries."
  },
  patterns: {
    family: "patterns",
    label: "Patterns & Collocations",
    shortLabel: "Patterns",
    entryType: "patterns",
    description: "Prepositions, phrasal verbs and combinations that belong together."
  },
  idioms: {
    family: "idioms",
    label: "Idioms & Fixed Phrases",
    shortLabel: "Idioms",
    entryType: "idioms",
    description: "Fixed expressions with meaning and, where available, context."
  },
  wordFormation: {
    family: "wordFormation",
    label: "Word Formation",
    shortLabel: "Word formation",
    entryType: "wordFormation",
    description: "Word families and derived forms paired with their meaning."
  }
};

const VOCABULARY_ENTRY_TYPES = {
  general: { label: "General vocabulary", collection: "curated", family: "vocabulary", noun: "Term" },
  personal: { label: "My phrase", collection: "personal", family: "vocabulary", noun: "Phrase or sentence" },
  patterns: { label: "Pattern / collocation", collection: "patterns", family: "patterns", noun: "Pattern or collocation" },
  idioms: { label: "Idiom / fixed phrase", collection: "idioms", family: "idioms", noun: "Expression" },
  wordFormation: { label: "Word formation", collection: "wordFormation", family: "wordFormation", noun: "Word or family" }
};

function getVocabularyCollection(entry) {
  if (entry.collection && VOCABULARY_COLLECTIONS[entry.collection]) return entry.collection;
  if (entry.entryType && VOCABULARY_ENTRY_TYPES[entry.entryType]) {
    return VOCABULARY_ENTRY_TYPES[entry.entryType].collection;
  }
  const sources = entry.sources || [];
  const families = entry.families || [entry.family];
  if (sources.includes("My Vocabulary List")) return "personal";
  if (String(entry.id || "").startsWith("custom-") && sources.includes("Personal entry") && families.includes("vocabulary") && !entry.meaning) return "personal";
  if (sources.includes("Word Formation")) return "wordFormation";
  if (families.includes("idioms")) return "idioms";
  if (families.includes("patterns")) return "patterns";
  if (sources.includes("Official Wordlist")) return "official";
  return "curated";
}

function getVocabularyFamily(entry) {
  return VOCABULARY_COLLECTIONS[getVocabularyCollection(entry)]?.family || "vocabulary";
}

function getAllVocabularyEntries() {
  const seed = typeof VOCABULARY_SEED !== "undefined" && Array.isArray(VOCABULARY_SEED)
    ? VOCABULARY_SEED
    : [];
  const byId = new Map(seed.map(entry => [entry.id, { ...entry, isImported: true }]));
  STATE.vocabularyEntries.forEach(entry => {
    byId.set(entry.id, { ...entry, isImported: entry.id.startsWith("notion-") });
  });
  STATE.vocabularyArchivedIds.forEach(id => byId.delete(id));
  return [...byId.values()];
}

function getVocabularyEntry(id) {
  return getAllVocabularyEntries().find(entry => entry.id === id) || null;
}

function getVocabularyTopics(entries = getAllVocabularyEntries(), family = "all") {
  const scoped = family === "all" ? entries : entries.filter(entry => getVocabularyFamily(entry) === family);
  const counts = new Map();
  scoped.forEach(entry => {
    (entry.topics?.length ? entry.topics : [entry.topic]).filter(Boolean).forEach(topic => {
      counts.set(topic, (counts.get(topic) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => a.topic.localeCompare(b.topic, "en", { sensitivity: "base" }));
}

function getVocabularySources(entries = getAllVocabularyEntries()) {
  const counts = new Map();
  entries.forEach(entry => (entry.sources || []).forEach(source => {
    counts.set(source, (counts.get(source) || 0) + 1);
  }));
  return [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => a.source.localeCompare(b.source, "en", { sensitivity: "base" }));
}

function normalizeVocabularySearch(value = "") {
  return String(value).toLocaleLowerCase("en").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getFilteredVocabularyEntries() {
  const filters = STATE.vocabularyFilters;
  const query = normalizeVocabularySearch(filters.query.trim());
  return getAllVocabularyEntries()
    .filter(entry => getVocabularyCollection(entry) === filters.collection)
    .filter(entry => {
      if (!query) return true;
      return normalizeVocabularySearch([
        entry.term,
        entry.meaning,
        entry.example,
        entry.topic,
        ...(entry.sources || [])
      ].join(" ")).includes(query);
    })
    .sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
}

function getVocabularyMastery(entryId) {
  const stat = STATE.vocabularyReviewStats[entryId];
  if (!stat?.views) return null;
  return Math.round((stat.known / stat.views) * 100);
}

function supportsVocabularySpeech() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function scoreVocabularyVoice(voice) {
  const name = String(voice?.name || "").toLocaleLowerCase("en");
  const language = String(voice?.lang || "").toLocaleLowerCase("en");
  if (!language.startsWith("en")) return -Infinity;

  let score = language.startsWith("en-gb") ? 220
    : language.startsWith("en-ie") || language.startsWith("en-au") || language.startsWith("en-nz") ? 150
      : language.startsWith("en-us") ? 110 : 80;

  if (/natural|premium|enhanced|neural/.test(name)) score += 420;
  if (/compact|eloquence|espeak/.test(name)) score -= 140;
  if (voice.default) score += 12;
  if (voice.localService) score += 8;

  VOCABULARY_VOICE_NAME_PREFERENCES.forEach(([preferredName, weight]) => {
    if (name.includes(preferredName)) score += weight;
  });

  return score;
}

function getPreferredVocabularyVoice() {
  if (!supportsVocabularySpeech()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  if (cachedPreferredVocabularyVoice && voices.some(voice => voice.voiceURI === cachedPreferredVocabularyVoice.voiceURI)) {
    return cachedPreferredVocabularyVoice;
  }

  cachedPreferredVocabularyVoice = voices
    .filter(voice => String(voice.lang || "").toLocaleLowerCase("en").startsWith("en"))
    .sort((a, b) => scoreVocabularyVoice(b) - scoreVocabularyVoice(a))[0]
    || voices.find(voice => voice.default)
    || null;
  return cachedPreferredVocabularyVoice;
}

function renderVocabularyListenButtonHTML(term, variant = "table") {
  const safeTerm = escapeHTML(term);
  const isReview = variant === "review";
  const supported = supportsVocabularySpeech();
  return `<button type="button" class="vocabulary-listen-button ${variant}"
    data-speech-text="${safeTerm}" onclick="speakVocabularyTerm(this.dataset.speechText, this)"
    aria-label="Listen to ${safeTerm}" aria-pressed="false"
    title="${supported ? "Listen to pronunciation" : "Speech is not supported by this browser"}" ${supported ? "" : "disabled"}>
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 9v6h4l5 4V5L9 9H5Z"></path>
      <path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12"></path>
    </svg>
    ${isReview ? "<span>Listen</span>" : ""}
  </button>`;
}

function resetVocabularySpeechButton(button) {
  if (!button?.isConnected) return;
  button.classList.remove("is-speaking", "speech-error");
  button.setAttribute("aria-pressed", "false");
  button.title = "Listen to pronunciation";
  delete button.dataset.voice;
}

function speakVocabularyTerm(term, button) {
  const text = String(term || "").trim();
  if (!text || !supportsVocabularySpeech()) {
    if (button) {
      button.classList.add("speech-error");
      button.title = "Speech is not available in this browser";
    }
    return;
  }

  const speech = window.speechSynthesis;
  if (speech.speaking || speech.pending) speech.cancel();
  resetVocabularySpeechButton(activeVocabularySpeechButton);

  const sequence = ++vocabularySpeechSequence;
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getPreferredVocabularyVoice();
  utterance.lang = voice?.lang || "en-GB";
  utterance.voice = voice;
  utterance.rate = 0.9;
  utterance.pitch = 1;
  utterance.volume = 1;

  activeVocabularyUtterance = utterance;
  activeVocabularySpeechButton = button || null;
  if (button) {
    button.classList.add("is-speaking");
    button.setAttribute("aria-pressed", "true");
    button.title = voice ? `Playing with ${voice.name}` : "Playing pronunciation";
    if (voice) button.dataset.voice = voice.name;
  }

  const finish = () => {
    if (sequence !== vocabularySpeechSequence) return;
    resetVocabularySpeechButton(button);
    activeVocabularyUtterance = null;
    activeVocabularySpeechButton = null;
  };

  utterance.onend = finish;
  utterance.onerror = event => {
    const isPlaybackError = event.error !== "canceled" && event.error !== "interrupted";
    finish();
    if (isPlaybackError && sequence === vocabularySpeechSequence && button?.isConnected) {
      button.classList.add("speech-error");
      button.title = "Could not play this pronunciation";
      window.setTimeout(() => resetVocabularySpeechButton(button), 1800);
    }
  };

  speech.speak(utterance);
}

function openVocabulary() {
  STATE.vocabularyEditingId = null;
  STATE.vocabularyEntryType = null;
  renderVocabulary();
  window.scrollTo({ top: 0 });
}

function openVocabularyReview() {
  STATE.vocabularyReviewSession = null;
  renderVocabularyReview();
  window.scrollTo({ top: 0 });
}

function renderVocabularyLegacy() {
  if (STATE.currentView === "sheet") clearPracticeTimerInterval();
  STATE.currentView = "vocabulary";
  const entries = getAllVocabularyEntries();
  const filtered = getFilteredVocabularyEntries();
  const perPage = 48;
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  STATE.vocabularyFilters.page = Math.min(STATE.vocabularyFilters.page, pageCount);
  const pageStart = (STATE.vocabularyFilters.page - 1) * perPage;
  const visibleEntries = filtered.slice(pageStart, pageStart + perPage);
  const topics = getVocabularyTopics(entries, STATE.vocabularyFilters.family);
  const sources = getVocabularySources(entries);
  const reviewed = Object.values(STATE.vocabularyReviewStats).filter(stat => stat?.views > 0).length;
  const editingEntry = STATE.vocabularyEditingId ? getVocabularyEntry(STATE.vocabularyEditingId) : null;
  const customCount = STATE.vocabularyEntries.filter(entry => !entry.id.startsWith("notion-")).length;
  const appContainer = document.getElementById("app-container");

  appContainer.innerHTML = `
    <div class="vocabulary-container app-shell">
      <header class="app-topbar">
        <button class="brand-button" onclick="renderHome()" aria-label="Practice home" style="text-align:left">
          <span style="text-align:left;display:block">
            <span class="brand-title">Practice Log</span>
            <span class="brand-subtitle">Cambridge C2</span>
          </span>
        </button>
        ${renderMainNavigation("vocabulary")}
      </header>

      <main class="vocabulary-main">
        <section class="vocabulary-hero">
          <div>
            <span class="eyebrow">Vocabulary library</span>
            <h1>Your C2 language bank.</h1>
            <p>${entries.length.toLocaleString("en-GB")} unique entries from Notion, organised without the repetition.</p>
          </div>
          <div class="vocabulary-hero-stats" aria-label="Vocabulary overview">
            <div><strong>${entries.length.toLocaleString("en-GB")}</strong><span>entries</span></div>
            <div><strong>${customCount}</strong><span>added here</span></div>
            <div><strong>${reviewed}</strong><span>reviewed</span></div>
          </div>
        </section>

        <section class="quick-capture-panel" aria-labelledby="quick-capture-title">
          <div class="capture-heading">
            <div>
              <span class="eyebrow">Quick capture</span>
              <h2 id="quick-capture-title">${editingEntry ? "Edit this entry" : "Write it down while it is fresh"}</h2>
            </div>
            ${editingEntry ? `<button class="btn btn-secondary" type="button" onclick="cancelVocabularyEdit()">Cancel edit</button>` : ""}
          </div>
          <form class="vocabulary-capture-form" onsubmit="saveVocabularyEntry(event)">
            <label class="capture-field capture-term">
              <span>Word, phrase or pattern</span>
              <input name="term" required autocomplete="off" placeholder="e.g. take something with a pinch of salt" value="${escapeHTML(editingEntry?.term || "")}">
            </label>
            <label class="capture-field capture-meaning">
              <span>Meaning</span>
              <input name="meaning" autocomplete="off" placeholder="Short definition or Spanish cue" value="${escapeHTML(editingEntry?.meaning || "")}">
            </label>
            <label class="capture-field">
              <span>Family</span>
              <select name="family">
                ${Object.entries(VOCABULARY_FAMILIES).map(([key, meta]) => `<option value="${key}" ${(editingEntry?.family || STATE.vocabularyFilters.family) === key ? "selected" : ""}>${meta.label}</option>`).join("")}
              </select>
            </label>
            <label class="capture-field">
              <span>Category</span>
              <input name="topic" list="vocabulary-topic-options" autocomplete="off" placeholder="e.g. Emotions & Reactions" value="${escapeHTML(editingEntry?.topic || "Personal vocabulary")}">
              <datalist id="vocabulary-topic-options">${getVocabularyTopics(entries).map(item => `<option value="${escapeHTML(item.topic)}"></option>`).join("")}</datalist>
            </label>
            <label class="capture-field capture-example">
              <span>Example or context <small>optional</small></span>
              <textarea name="example" rows="2" placeholder="The sentence where you found it, or one you would actually use.">${escapeHTML(editingEntry?.example || "")}</textarea>
            </label>
            <button class="btn btn-primary capture-submit" type="submit">${editingEntry ? "Save changes" : "Add to library"}</button>
          </form>
          ${STATE.vocabularyNotice ? `<div class="capture-notice" role="status">${escapeHTML(STATE.vocabularyNotice)}</div>` : ""}
        </section>

        <section class="vocabulary-family-grid" aria-label="Vocabulary families">
          ${Object.entries(VOCABULARY_FAMILIES).map(([key, meta]) => {
            const count = entries.filter(entry => (entry.families || [entry.family]).includes(key)).length;
            return `<button class="vocabulary-family-card ${STATE.vocabularyFilters.family === key ? "active" : ""}" onclick="setVocabularyFilter('family','${key}')">
              <span class="family-monogram">${meta.icon}</span>
              <span><strong>${meta.label}</strong><small>${count.toLocaleString("en-GB")} entries</small></span>
            </button>`;
          }).join("")}
        </section>

        <section class="vocabulary-browser">
          <div class="vocabulary-browser-head">
            <div>
              <span class="eyebrow">Browse the bank</span>
              <h2>${filtered.length.toLocaleString("en-GB")} ${filtered.length === 1 ? "entry" : "entries"}</h2>
            </div>
            <button class="btn btn-primary" onclick="reviewCurrentVocabularySelection()" ${filtered.length ? "" : "disabled"}>Review this selection</button>
          </div>
          <div class="vocabulary-filters">
            <label class="vocabulary-search">
              <span class="sr-only">Search vocabulary</span>
              <input id="vocabulary-search-input" type="search" placeholder="Search term, meaning or example…" value="${escapeHTML(STATE.vocabularyFilters.query)}" oninput="setVocabularySearch(this.value)">
            </label>
            <select aria-label="Filter by family" onchange="setVocabularyFilter('family',this.value)">
              <option value="all">All families</option>
              ${Object.entries(VOCABULARY_FAMILIES).map(([key, meta]) => `<option value="${key}" ${STATE.vocabularyFilters.family === key ? "selected" : ""}>${meta.shortLabel}</option>`).join("")}
            </select>
            <select aria-label="Filter by category" onchange="setVocabularyFilter('topic',this.value)">
              <option value="all">All categories</option>
              ${topics.map(item => `<option value="${escapeHTML(item.topic)}" ${STATE.vocabularyFilters.topic === item.topic ? "selected" : ""}>${escapeHTML(item.topic)} (${item.count})</option>`).join("")}
            </select>
            <select aria-label="Filter by source" onchange="setVocabularyFilter('source',this.value)">
              <option value="all">All sources</option>
              ${sources.map(item => `<option value="${escapeHTML(item.source)}" ${STATE.vocabularyFilters.source === item.source ? "selected" : ""}>${escapeHTML(item.source)} (${item.count})</option>`).join("")}
            </select>
            <button class="btn btn-secondary" onclick="clearVocabularyFilters()">Clear</button>
          </div>

          <div class="vocabulary-card-grid">
            ${visibleEntries.length ? visibleEntries.map(renderVocabularyEntryCard).join("") : `<div class="vocabulary-empty"><strong>No entries match.</strong><span>Try clearing one of the filters.</span></div>`}
          </div>
          ${pageCount > 1 ? `
            <div class="vocabulary-pagination">
              <button class="btn btn-secondary" onclick="changeVocabularyPage(-1)" ${STATE.vocabularyFilters.page === 1 ? "disabled" : ""}>Previous</button>
              <span>Page ${STATE.vocabularyFilters.page} of ${pageCount}</span>
              <button class="btn btn-secondary" onclick="changeVocabularyPage(1)" ${STATE.vocabularyFilters.page === pageCount ? "disabled" : ""}>Next</button>
            </div>` : ""}
        </section>
      </main>
    </div>
  `;
}

function renderVocabularyEntryCardLegacy(entry) {
  const family = VOCABULARY_FAMILIES[entry.family] || VOCABULARY_FAMILIES.vocabulary;
  const mastery = getVocabularyMastery(entry.id);
  const isEdited = STATE.vocabularyEntries.some(item => item.id === entry.id);
  return `
    <article class="vocabulary-entry-card family-${entry.family}">
      <div class="vocabulary-entry-topline">
        <span class="vocabulary-family-tag">${family.shortLabel}</span>
        <div class="vocabulary-card-actions">
          ${renderVocabularyListenButtonHTML(entry.term, "card")}
          ${mastery !== null ? `<span class="mastery-chip ${mastery >= 70 ? "good" : mastery < 40 ? "risk" : ""}">${mastery}% familiar</span>` : ""}
          <button onclick="startVocabularyEdit('${entry.id}')" aria-label="Edit ${escapeHTML(entry.term)}">Edit</button>
          <button onclick="deleteVocabularyEntry('${entry.id}')" aria-label="Delete ${escapeHTML(entry.term)}">Delete</button>
        </div>
      </div>
      <h3>${escapeHTML(entry.term)}</h3>
      ${entry.meaning ? `<p class="vocabulary-meaning">${escapeHTML(entry.meaning)}</p>` : `<p class="vocabulary-meaning muted">Meaning not added yet</p>`}
      ${entry.example ? `<blockquote>${escapeHTML(entry.example)}</blockquote>` : ""}
      <div class="vocabulary-entry-meta">
        <span>${escapeHTML(entry.topic || "General")}</span>
        <span>${escapeHTML((entry.sources || ["Personal entry"]).join(" · "))}${isEdited ? " · edited" : ""}</span>
      </div>
    </article>
  `;
}

function renderVocabulary() {
  if (STATE.currentView === "sheet") clearPracticeTimerInterval();
  STATE.currentView = "vocabulary";
  const entries = getAllVocabularyEntries();
  const allowedCollections = Object.entries(VOCABULARY_COLLECTIONS)
    .filter(([, collection]) => collection.family === STATE.vocabularyFilters.family)
    .map(([key]) => key);
  if (!allowedCollections.includes(STATE.vocabularyFilters.collection)) {
    STATE.vocabularyFilters.collection = allowedCollections[0];
    STATE.vocabularyFilters.page = 1;
  }
  const filtered = getFilteredVocabularyEntries();
  const perPage = 100;
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  STATE.vocabularyFilters.page = Math.min(STATE.vocabularyFilters.page, pageCount);
  const pageStart = (STATE.vocabularyFilters.page - 1) * perPage;
  const visibleEntries = filtered.slice(pageStart, pageStart + perPage);
  const reviewed = Object.values(STATE.vocabularyReviewStats).filter(stat => stat?.views > 0).length;
  const editingEntry = STATE.vocabularyEditingId ? getVocabularyEntry(STATE.vocabularyEditingId) : null;
  const customCount = STATE.vocabularyEntries.filter(entry => !entry.id.startsWith("notion-")).length;
  const activeCollection = VOCABULARY_COLLECTIONS[STATE.vocabularyFilters.collection];
  const appContainer = document.getElementById("app-container");

  appContainer.innerHTML = `
    <div class="vocabulary-container app-shell">
      <header class="app-topbar">
        <button class="brand-button" onclick="renderHome()" aria-label="Practice home" style="text-align:left">
          <span style="text-align:left;display:block"><span class="brand-title">Practice Log</span><span class="brand-subtitle">Cambridge C2</span></span>
        </button>
        ${renderMainNavigation("vocabulary")}
      </header>

      <main class="vocabulary-main vocabulary-table-main">
        <section class="vocabulary-hero compact-vocabulary-hero">
          <div>
            <span class="eyebrow">Vocabulary library</span>
            <h1>Your C2 language bank.</h1>
            <p>Each collection keeps the structure it had in Notion.</p>
          </div>
          <div class="vocabulary-hero-stats" aria-label="Vocabulary overview">
            <div><strong>${entries.length.toLocaleString("en-GB")}</strong><span>entries</span></div>
            <div><strong>${customCount}</strong><span>added here</span></div>
            <div><strong>${reviewed}</strong><span>reviewed</span></div>
          </div>
        </section>

        <section class="quick-capture-panel adaptive-capture-panel ${STATE.vocabularyEntryType ? "has-form" : "type-only"}" aria-labelledby="quick-capture-title">
          <div class="capture-heading">
            <div><span class="eyebrow">Quick capture</span><h2 id="quick-capture-title">${editingEntry ? "Edit this entry" : "First choose the kind of entry"}</h2></div>
            ${editingEntry ? `<button class="btn btn-secondary" type="button" onclick="cancelVocabularyEdit()">Cancel edit</button>` : ""}
          </div>
          ${renderVocabularyEntryTypePickerHTML()}
          ${STATE.vocabularyEntryType ? renderAdaptiveVocabularyFormHTML(editingEntry, entries) : `<p class="capture-type-hint">The fields change to match the format you select.</p>`}
          ${STATE.vocabularyNotice ? `<div class="capture-notice" role="status">${escapeHTML(STATE.vocabularyNotice)}</div>` : ""}
        </section>

        <section class="vocabulary-family-grid" aria-label="Vocabulary families">
          ${Object.entries(VOCABULARY_FAMILIES).map(([key, meta]) => {
            const count = entries.filter(entry => getVocabularyFamily(entry) === key).length;
            return `<button class="vocabulary-family-card ${STATE.vocabularyFilters.family === key ? "active" : ""}" onclick="selectVocabularyFamily('${key}')">
              <span class="family-monogram">${meta.icon}</span><span><strong>${meta.label}</strong><small>${count.toLocaleString("en-GB")} entries</small></span>
            </button>`;
          }).join("")}
        </section>

        <section class="vocabulary-browser notion-table-panel">
          <div class="vocabulary-browser-head">
            <div><span class="eyebrow">${escapeHTML(VOCABULARY_FAMILIES[STATE.vocabularyFilters.family].label)}</span><h2>${escapeHTML(activeCollection.label)}</h2><p>${escapeHTML(activeCollection.description)}</p></div>
            ${STATE.vocabularyFilters.collection === "personal" ? `<button class="btn btn-secondary" disabled>Reference only</button>` : `<button class="btn btn-primary" onclick="reviewCurrentVocabularySelection()" ${filtered.length ? "" : "disabled"}>Review this collection</button>`}
          </div>
          ${allowedCollections.length > 1 ? `<div class="vocabulary-collection-tabs" role="tablist" aria-label="Vocabulary collections">
            ${allowedCollections.map(key => {
              const collection = VOCABULARY_COLLECTIONS[key];
              const count = entries.filter(entry => getVocabularyCollection(entry) === key).length;
              return `<button role="tab" aria-selected="${STATE.vocabularyFilters.collection === key}" class="${STATE.vocabularyFilters.collection === key ? "active" : ""}" onclick="selectVocabularyCollection('${key}')">${escapeHTML(collection.shortLabel)} <span>${count}</span></button>`;
            }).join("")}
          </div>` : ""}
          <div class="vocabulary-table-toolbar">
            <label class="vocabulary-search"><span class="sr-only">Search this collection</span><input id="vocabulary-search-input" type="search" placeholder="Search this collection…" value="${escapeHTML(STATE.vocabularyFilters.query)}" oninput="setVocabularySearch(this.value)"></label>
            <span>${filtered.length.toLocaleString("en-GB")} ${filtered.length === 1 ? "row" : "rows"}</span>
          </div>
          ${renderVocabularyTableHTML(visibleEntries, STATE.vocabularyFilters.collection)}
          ${pageCount > 1 ? `<div class="vocabulary-pagination"><button class="btn btn-secondary" onclick="changeVocabularyPage(-1)" ${STATE.vocabularyFilters.page === 1 ? "disabled" : ""}>Previous</button><span>Page ${STATE.vocabularyFilters.page} of ${pageCount}</span><button class="btn btn-secondary" onclick="changeVocabularyPage(1)" ${STATE.vocabularyFilters.page === pageCount ? "disabled" : ""}>Next</button></div>` : ""}
        </section>
      </main>
    </div>
  `;
}

function renderVocabularyEntryTypePickerHTML() {
  return `<div class="capture-type-picker" role="group" aria-label="Entry type">
    ${Object.entries(VOCABULARY_ENTRY_TYPES).map(([key, type]) => `<button type="button" class="${STATE.vocabularyEntryType === key ? "active" : ""}" onclick="selectVocabularyEntryType('${key}')">${type.label}</button>`).join("")}
  </div>`;
}

function renderAdaptiveVocabularyFormHTML(editingEntry, entries) {
  const typeKey = STATE.vocabularyEntryType;
  const type = VOCABULARY_ENTRY_TYPES[typeKey];
  const isPersonal = typeKey === "personal";
  const isWordFormation = typeKey === "wordFormation";
  const supportsExample = ["general", "patterns", "idioms"].includes(typeKey);
  return `<form class="vocabulary-capture-form adaptive-${typeKey}" onsubmit="saveVocabularyEntry(event)">
    <input type="hidden" name="entryType" value="${typeKey}">
    <label class="capture-field capture-term"><span>${type.noun}</span>${isPersonal ? `<textarea name="term" rows="2" required autocomplete="off" placeholder="Keep the phrase or sentence exactly as you want it.">${escapeHTML(editingEntry?.term || "")}</textarea>` : `<input name="term" required autocomplete="off" placeholder="${typeKey === "wordFormation" ? "e.g. (Abolish) Abolition" : typeKey === "patterns" ? "e.g. take issue with" : typeKey === "idioms" ? "e.g. a blessing in disguise" : "e.g. inexhaustible"}" value="${escapeHTML(editingEntry?.term || "")}">`}</label>
    <label class="capture-field capture-meaning"><span>${isPersonal ? "Notes · optional" : "Meaning"}</span>${isPersonal ? `<textarea name="meaning" rows="2" placeholder="Add a cue only if it helps; no translation is required.">${escapeHTML(editingEntry?.meaning || "")}</textarea>` : `<input name="meaning" required autocomplete="off" placeholder="Short definition or Spanish cue" value="${escapeHTML(editingEntry?.meaning || "")}">`}</label>
    ${supportsExample ? `<label class="capture-field capture-example"><span>Example or context <small>optional</small></span><textarea name="example" rows="2" placeholder="A sentence you would actually use.">${escapeHTML(editingEntry?.example || "")}</textarea></label>` : ""}
    <button class="btn btn-primary capture-submit" type="submit">${editingEntry ? "Save changes" : `Add ${type.label.toLowerCase()}`}</button>
  </form>`;
}

function getVocabularyTableColumns(collectionKey) {
  if (collectionKey === "personal") return [{ key: "term", label: "Phrase or sentence", className: "term" }, { key: "meaning", label: "Notes", className: "notes" }];
  if (collectionKey === "wordFormation") return [{ key: "term", label: "Word / family", className: "term" }, { key: "meaning", label: "Meaning", className: "meaning" }];
  if (collectionKey === "curated") return [{ key: "term", label: "Term", className: "term" }, { key: "meaning", label: "Meaning", className: "meaning" }, { key: "example", label: "Example", className: "example" }];
  const noun = collectionKey === "patterns" ? "Pattern / collocation" : collectionKey === "idioms" ? "Expression" : "Term";
  return [{ key: "term", label: noun, className: "term" }, { key: "meaning", label: collectionKey === "official" ? "Definition" : "Meaning", className: "meaning" }, { key: "example", label: "Example", className: "example" }];
}

function renderVocabularyTableHTML(entries, collectionKey) {
  if (!entries.length) return `<div class="vocabulary-empty"><strong>No rows match.</strong><span>Clear the search to see the collection again.</span></div>`;
  const columns = getVocabularyTableColumns(collectionKey);
  return `<div class="vocabulary-table-wrap"><table class="vocabulary-table table-${collectionKey}"><thead><tr>${columns.map(column => `<th class="col-${column.className}">${column.label}</th>`).join("")}</tr></thead><tbody>${entries.map(entry => renderVocabularyTableRowHTML(entry, columns, collectionKey)).join("")}</tbody></table></div>`;
}

function renderVocabularyTableRowHTML(entry, columns, collectionKey) {
  const mastery = getVocabularyMastery(entry.id);
  return `<tr>${columns.map(column => {
    const rawValue = entry[column.key] || "";
    const fallback = collectionKey === "personal" && column.key === "meaning" ? "No notes" : "—";
    return `<td class="col-${column.className}" title="${escapeHTML(rawValue)}">${column.key === "term" ? `<div class="table-term-layout"><span class="table-term-label"><strong>${escapeHTML(rawValue)}</strong>${mastery !== null ? `<small class="table-mastery">${mastery}% familiar</small>` : ""}</span><span class="table-row-actions">${renderVocabularyListenButtonHTML(entry.term)}<button onclick="startVocabularyEdit('${entry.id}')" aria-label="Edit ${escapeHTML(entry.term)}">Edit</button><button class="delete-action" onclick="deleteVocabularyEntry('${entry.id}')" aria-label="Delete ${escapeHTML(entry.term)}">Delete</button></span></div>` : `<span class="table-cell-copy ${rawValue ? "" : "empty"}">${escapeHTML(rawValue || fallback)}</span>`}</td>`;
  }).join("")}</tr>`;
}

function setVocabularySearch(value) {
  STATE.vocabularyFilters.query = value;
  STATE.vocabularyFilters.page = 1;
  renderVocabulary();
  requestAnimationFrame(() => {
    const input = document.getElementById("vocabulary-search-input");
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
}

function selectVocabularyFamily(family) {
  const collection = Object.entries(VOCABULARY_COLLECTIONS).find(([, meta]) => meta.family === family)?.[0] || "curated";
  STATE.vocabularyFilters.family = family;
  STATE.vocabularyFilters.collection = collection;
  STATE.vocabularyFilters.query = "";
  STATE.vocabularyFilters.page = 1;
  renderVocabulary();
}

function selectVocabularyCollection(collection) {
  const meta = VOCABULARY_COLLECTIONS[collection];
  if (!meta) return;
  STATE.vocabularyFilters.family = meta.family;
  STATE.vocabularyFilters.collection = collection;
  STATE.vocabularyFilters.query = "";
  STATE.vocabularyFilters.page = 1;
  renderVocabulary();
}

function selectVocabularyEntryType(entryType) {
  const type = VOCABULARY_ENTRY_TYPES[entryType];
  if (!type) return;
  STATE.vocabularyEntryType = entryType;
  STATE.vocabularyFilters.family = type.family;
  STATE.vocabularyFilters.collection = type.collection;
  STATE.vocabularyFilters.page = 1;
  STATE.vocabularyNotice = "";
  renderVocabulary();
}

function changeVocabularyPage(direction) {
  STATE.vocabularyFilters.page += direction;
  renderVocabulary();
  document.querySelector(".vocabulary-browser")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function saveVocabularyEntry(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const term = String(formData.get("term") || "").trim();
  if (!term) return;
  const existing = STATE.vocabularyEditingId ? getVocabularyEntry(STATE.vocabularyEditingId) : null;
  const entryType = String(formData.get("entryType") || STATE.vocabularyEntryType || "general");
  const type = VOCABULARY_ENTRY_TYPES[entryType] || VOCABULARY_ENTRY_TYPES.general;
  const id = existing?.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const entry = {
    id,
    term,
    meaning: String(formData.get("meaning") || "").trim(),
    example: String(formData.get("example") || "").trim(),
    family: type.family,
    families: [type.family],
    entryType,
    collection: existing ? getVocabularyCollection(existing) : type.collection,
    sources: existing?.sources || ["Personal entry"],
    notionPages: existing?.notionPages || [],
    updatedAt: Date.now()
  };
  STATE.vocabularyEntries = STATE.vocabularyEntries.filter(item => item.id !== id).concat(entry);
  STATE.vocabularyArchivedIds = STATE.vocabularyArchivedIds.filter(archivedId => archivedId !== id);
  STATE.vocabularyEditingId = null;
  STATE.vocabularyFilters.family = type.family;
  STATE.vocabularyFilters.collection = entry.collection;
  STATE.vocabularyFilters.query = "";
  STATE.vocabularyFilters.page = 1;
  STATE.vocabularyNotice = existing ? `Updated “${term}”.` : `Added “${term}” to your library.`;
  markVocabularyChanged();
  renderVocabulary();
}

function startVocabularyEdit(id) {
  const entry = getVocabularyEntry(id);
  if (!entry) return;
  const collection = getVocabularyCollection(entry);
  STATE.vocabularyEditingId = id;
  STATE.vocabularyEntryType = VOCABULARY_COLLECTIONS[collection]?.entryType || "general";
  STATE.vocabularyFilters.family = VOCABULARY_COLLECTIONS[collection]?.family || "vocabulary";
  STATE.vocabularyFilters.collection = collection;
  STATE.vocabularyNotice = "";
  renderVocabulary();
  requestAnimationFrame(() => document.querySelector(".quick-capture-panel [name='term']")?.focus());
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelVocabularyEdit() {
  STATE.vocabularyEditingId = null;
  STATE.vocabularyEntryType = null;
  STATE.vocabularyNotice = "";
  renderVocabulary();
}

function deleteVocabularyEntry(id) {
  const entry = getVocabularyEntry(id);
  if (!entry || !confirm(`Remove “${entry.term}” from the library?`)) return;
  STATE.vocabularyEntries = STATE.vocabularyEntries.filter(item => item.id !== id);
  if (id.startsWith("notion-") && !STATE.vocabularyArchivedIds.includes(id)) STATE.vocabularyArchivedIds.push(id);
  delete STATE.vocabularyReviewStats[id];
  STATE.vocabularyNotice = `Removed “${entry.term}”.`;
  markVocabularyChanged();
  renderVocabulary();
}

function reviewCurrentVocabularySelection() {
  STATE.vocabularyReviewSetup = {
    ...STATE.vocabularyReviewSetup,
    collection: STATE.vocabularyFilters.collection
  };
  STATE.vocabularyReviewSession = null;
  renderVocabularyReview();
  window.scrollTo({ top: 0 });
}

function getVocabularyAnswerTerm(entry) {
  let value = String(entry.term || "").trim();
  const familyMatch = value.match(/^\([^)]*\)\s*(.+)$/);
  if (familyMatch) value = familyMatch[1];
  value = value.replace(/\s*\([^)]*(?:no |noun|adj|verb|adverb)[^)]*\)\s*$/i, "").trim();
  value = value.split(/\s+\/\s+|\/|::/)[0].trim();
  return value || entry.term;
}

function findVocabularyClozeMatch(entry) {
  const example = entry.example || "";
  const term = getVocabularyAnswerTerm(entry);
  if (!example || !term) return null;
  const lowerExample = example.toLocaleLowerCase("en").replace(/[’‘]/g, "'");
  const lowerTerm = term.toLocaleLowerCase("en").replace(/[’‘]/g, "'");
  const findExpandableMatch = phrase => {
    let searchFrom = 0;
    while (searchFrom < lowerExample.length) {
      const index = lowerExample.indexOf(phrase, searchFrom);
      if (index < 0) return null;
      const startsAtBoundary = index === 0 || !/[a-z]/.test(lowerExample[index - 1]);
      if (startsAtBoundary) {
        let end = index + phrase.length;
        while (end < lowerExample.length && /[a-z'-]/.test(lowerExample[end])) end += 1;
        return { index, length: end - index };
      }
      searchFrom = index + 1;
    }
    return null;
  };
  const exactMatch = findExpandableMatch(lowerTerm);
  if (exactMatch) return exactMatch;

  const stopWords = new Set(["something", "somebody", "someone", "sth", "sb", "one", "ones", "one's", "your", "his", "her", "their", "the", "to", "be", "a", "an", "it"]);
  const tokens = lowerTerm.match(/[a-z][a-z'-]*/g)?.filter(token => !stopWords.has(token)) || [];
  for (let width = tokens.length; width >= 2; width -= 1) {
    for (let start = 0; start <= tokens.length - width; start += 1) {
      const phrase = tokens.slice(start, start + width).join(" ");
      const phraseMatch = findExpandableMatch(phrase);
      if (phraseMatch) return phraseMatch;
    }
  }
  for (const token of [...tokens].sort((a, b) => b.length - a.length)) {
    if (token.length < 3) continue;
    const irregular = { catch: "caught", throw: "threw", swell: "swollen", get: "got" };
    const variants = [token, irregular[token], token.endsWith("e") ? `${token.slice(0, -1)}ing` : `${token}ing`, `${token}ed`, `${token}s`].filter(Boolean);
    for (const variant of variants) {
      const tokenMatch = findExpandableMatch(variant);
      if (tokenMatch) return tokenMatch;
    }
  }
  return null;
}

function getReviewEligibleEntries(setup = STATE.vocabularyReviewSetup) {
  return getAllVocabularyEntries()
    .filter(entry => getVocabularyCollection(entry) !== "personal")
    .filter(entry => setup.collection === "all" || getVocabularyCollection(entry) === setup.collection)
    .filter(entry => ["recognition", "recall"].includes(setup.mode) && Boolean(entry.meaning));
}

function shuffleVocabularyEntries(entries) {
  const result = [...entries];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function renderVocabularyReview() {
  if (STATE.currentView === "sheet") clearPracticeTimerInterval();
  STATE.currentView = "vocabularyReview";
  const appContainer = document.getElementById("app-container");
  appContainer.innerHTML = `
    <div class="vocabulary-container review-container app-shell">
      <header class="app-topbar">
        <button class="brand-button" onclick="renderHome()" aria-label="Practice home" style="text-align:left">
          <span style="text-align:left;display:block">
            <span class="brand-title">Practice Log</span>
            <span class="brand-subtitle">Cambridge C2</span>
          </span>
        </button>
        ${renderMainNavigation("vocabularyReview")}
      </header>
      <main class="review-main">
        ${STATE.vocabularyReviewSession ? renderVocabularyReviewSessionHTML() : renderVocabularyReviewSetupHTML()}
      </main>
    </div>
  `;
}

function renderVocabularyReviewSetupHTML() {
  const setup = STATE.vocabularyReviewSetup;
  if (setup.collection === "personal") setup.collection = "all";
  const entries = getAllVocabularyEntries();
  const scopedEntries = entries.filter(entry => getVocabularyCollection(entry) !== "personal").filter(entry => setup.collection === "all" || getVocabularyCollection(entry) === setup.collection);
  const reviewModes = ["recognition", "recall"];
  const modeCounts = Object.fromEntries(reviewModes.map(mode => [mode, getReviewEligibleEntries({ ...setup, mode }).length]));
  if (!reviewModes.includes(setup.mode) || !modeCounts[setup.mode]) setup.mode = reviewModes.find(mode => modeCounts[mode]) || "recognition";
  const eligible = getReviewEligibleEntries(setup);
  const skipped = scopedEntries.length - eligible.length;
  return `
    <section class="review-setup-hero">
      <div>
        <span class="eyebrow">Vocabulary review</span>
        <h1>A small, sharp round.</h1>
        <p>Only rows with the fields required by the chosen question are included.</p>
      </div>
      <div class="review-setup-count"><strong>${eligible.length.toLocaleString("en-GB")}</strong><span>cards available</span></div>
    </section>

    <section class="review-setup-panel">
      <div class="review-setup-step">
        <span class="review-step-number">1</span>
        <div>
          <h2>How do you want to remember it?</h2>
          <div class="review-mode-grid">
            ${[
              ["recognition", "Recognise", "See the term, retrieve its saved meaning."],
              ["recall", "Recall", "See the meaning, produce the term."]
            ].map(([key, title, detail]) => `<button class="review-mode-card ${setup.mode === key ? "active" : ""}" onclick="setVocabularyReviewOption('mode','${key}')" ${modeCounts[key] ? "" : "disabled"}><strong>${title}<small>${modeCounts[key].toLocaleString("en-GB")}</small></strong><span>${detail}</span></button>`).join("")}
          </div>
        </div>
      </div>

      <div class="review-setup-step">
        <span class="review-step-number">2</span>
        <div>
          <h2>What should be in the deck?</h2>
          <div class="review-scope-controls single-control">
            <label><span>Collection</span><select onchange="setVocabularyReviewOption('collection',this.value)">
              <option value="all">All testable collections</option>
              ${Object.entries(VOCABULARY_COLLECTIONS).filter(([key]) => key !== "personal").map(([key, meta]) => `<option value="${key}" ${setup.collection === key ? "selected" : ""}>${meta.label} (${entries.filter(entry => getVocabularyCollection(entry) === key).length})</option>`).join("")}
            </select></label>
          </div>
        </div>
      </div>

      <div class="review-setup-step">
        <span class="review-step-number">3</span>
        <div>
          <h2>Keep it deliberately short.</h2>
          <div class="review-size-row">
            ${[5, 10, 20].map(size => `<button class="review-size-button ${Number(setup.size) === size ? "active" : ""}" onclick="setVocabularyReviewOption('size',${size})"><strong>${size}</strong><span>cards</span></button>`).join("")}
          </div>
        </div>
      </div>

      <div class="review-launch-row">
        <div><strong>${eligible.length ? `${Math.min(Number(setup.size), eligible.length)} ${Math.min(Number(setup.size), eligible.length) === 1 ? "card" : "cards"} ready` : "No compatible cards"}</strong><span>${skipped ? `${skipped.toLocaleString("en-GB")} ${skipped === 1 ? "row is" : "rows are"} intentionally skipped because ${skipped === 1 ? "it has" : "they have"} no compatible answer field.` : "Randomised every round."}</span></div>
        <button class="btn btn-primary review-launch-button" onclick="startVocabularyReviewSession()" ${eligible.length ? "" : "disabled"}>Start review</button>
      </div>
    </section>
  `;
}

function setVocabularyReviewOption(key, value) {
  STATE.vocabularyReviewSetup[key] = key === "size" ? Number(value) : value;
  renderVocabularyReview();
}

function startVocabularyReviewSession() {
  const eligible = getReviewEligibleEntries();
  if (!eligible.length) return;
  const items = shuffleVocabularyEntries(eligible).slice(0, Math.min(Number(STATE.vocabularyReviewSetup.size), eligible.length));
  STATE.vocabularyReviewSession = {
    itemIds: items.map(item => item.id),
    index: 0,
    revealed: false,
    complete: false,
    ratings: { again: 0, unsure: 0, known: 0 }
  };
  renderVocabularyReview();
  window.scrollTo({ top: 0 });
}

function renderVocabularyReviewSessionHTML() {
  const session = STATE.vocabularyReviewSession;
  if (session.complete) return renderVocabularyReviewCompleteHTML(session);
  const entry = getVocabularyEntry(session.itemIds[session.index]);
  if (!entry) {
    session.index += 1;
    if (session.index >= session.itemIds.length) session.complete = true;
    return renderVocabularyReviewSessionHTML();
  }
  const progress = Math.round((session.index / session.itemIds.length) * 100);
  const setup = STATE.vocabularyReviewSetup;
  const collection = VOCABULARY_COLLECTIONS[getVocabularyCollection(entry)];
  return `
    <section class="review-session-shell">
      <div class="review-session-topbar">
        <button class="btn btn-secondary" onclick="exitVocabularyReviewSession()">End round</button>
        <div class="review-progress-copy"><strong>${session.index + 1} / ${session.itemIds.length}</strong><span>${escapeHTML(collection?.shortLabel || "Vocabulary")}</span></div>
        <div class="review-progress-track" aria-label="${progress}% complete"><span style="width:${progress}%"></span></div>
      </div>
      <article class="review-flashcard ${session.revealed ? "revealed" : ""}">
        <div class="review-card-prompt">
          <span>${setup.mode === "recognition" ? "What does this mean?" : "Which term fits?"}</span>
          <div class="review-card-front">${renderVocabularyReviewFront(entry, setup.mode)}</div>
        </div>
        ${session.revealed ? `
          <div class="review-card-answer">
            <span>Answer</span>
            <div class="review-answer-heading">
              <h2>${escapeHTML(entry.term)}</h2>
              ${renderVocabularyListenButtonHTML(entry.term, "review")}
            </div>
            ${entry.meaning ? `<p>${escapeHTML(entry.meaning)}</p>` : `<p class="muted">No definition saved — assess whether you recognised how to use it.</p>`}
            ${entry.example ? `<blockquote>${escapeHTML(entry.example)}</blockquote>` : ""}
            <small>${escapeHTML((entry.sources || []).join(" · "))}</small>
          </div>` : ""}
      </article>
      ${session.revealed ? `
        <div class="review-rating-row">
          <button class="review-rating again" onclick="rateVocabularyCard('again')"><kbd>1</kbd><span><strong>Again</strong><small>It did not come back</small></span></button>
          <button class="review-rating unsure" onclick="rateVocabularyCard('unsure')"><kbd>2</kbd><span><strong>Unsure</strong><small>Slow or incomplete</small></span></button>
          <button class="review-rating known" onclick="rateVocabularyCard('known')"><kbd>3</kbd><span><strong>Got it</strong><small>Quick and confident</small></span></button>
        </div>` : `
        <button class="btn btn-primary review-reveal-button" onclick="revealVocabularyCard()">Reveal answer <kbd>Space</kbd></button>`}
    </section>
  `;
}

function renderVocabularyReviewFront(entry, mode) {
  if (mode === "recognition") return `<h2>${escapeHTML(entry.term)}</h2>`;
  return entry.meaning ? `<h2>${escapeHTML(entry.meaning)}</h2>` : "";
}

function revealVocabularyCard() {
  if (!STATE.vocabularyReviewSession || STATE.vocabularyReviewSession.complete) return;
  STATE.vocabularyReviewSession.revealed = true;
  renderVocabularyReview();
}

function rateVocabularyCard(rating) {
  const session = STATE.vocabularyReviewSession;
  if (!session || !session.revealed || session.complete) return;
  const id = session.itemIds[session.index];
  const current = STATE.vocabularyReviewStats[id] || { views: 0, known: 0, unsure: 0, again: 0 };
  current.views += 1;
  current[rating] = (current[rating] || 0) + 1;
  current.lastRating = rating;
  current.lastReviewedAt = Date.now();
  STATE.vocabularyReviewStats[id] = current;
  session.ratings[rating] += 1;
  session.index += 1;
  session.revealed = false;
  if (session.index >= session.itemIds.length) session.complete = true;
  markVocabularyChanged();
  renderVocabularyReview();
}

function renderVocabularyReviewCompleteHTML(session) {
  const confidentPct = Math.round((session.ratings.known / session.itemIds.length) * 100);
  return `
    <section class="review-complete-panel">
      <span class="review-complete-mark">✓</span>
      <span class="eyebrow">Round complete</span>
      <h1>${session.itemIds.length} ${session.itemIds.length === 1 ? "card" : "cards"}, done.</h1>
      <p>${confidentPct}% came back quickly. Keep the “Again” pile small by meeting it often.</p>
      <div class="review-complete-stats">
        <div class="again"><strong>${session.ratings.again}</strong><span>Again</span></div>
        <div class="unsure"><strong>${session.ratings.unsure}</strong><span>Unsure</span></div>
        <div class="known"><strong>${session.ratings.known}</strong><span>Got it</span></div>
      </div>
      <div class="review-complete-actions">
        <button class="btn btn-primary" onclick="startVocabularyReviewSession()">Another random round</button>
        <button class="btn btn-secondary" onclick="exitVocabularyReviewSession()">Change setup</button>
        <button class="btn btn-secondary" onclick="openVocabulary()">Open library</button>
      </div>
    </section>
  `;
}

function exitVocabularyReviewSession() {
  STATE.vocabularyReviewSession = null;
  renderVocabularyReview();
  window.scrollTo({ top: 0 });
}

function handleVocabularyReviewKeyboard(event) {
  if (STATE.currentView !== "vocabularyReview" || !STATE.vocabularyReviewSession) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  if (event.code === "Space" && !STATE.vocabularyReviewSession.revealed) {
    event.preventDefault();
    revealVocabularyCard();
    return;
  }
  if (!STATE.vocabularyReviewSession.revealed) return;
  if (event.key === "1") rateVocabularyCard("again");
  if (event.key === "2") rateVocabularyCard("unsure");
  if (event.key === "3") rateVocabularyCard("known");
}

window.addEventListener("keydown", handleVocabularyReviewKeyboard);

function getStudyReviewPartLabel(partId) {
  const part = C2_STUDY_REVIEW.TRACKED_PARTS.find(entry => entry.id === partId);
  if (!part) return "Practice part";
  const partData = C2_EXAM_METADATA[part.section]?.parts?.[part.partKey];
  return partData?.name || `${C2_EXAM_METADATA[part.section]?.name || "Practice"} ${getUseOfEnglishPartShortLabel(part.partKey)}`;
}

function getStudyReviewCandidates(setup = STATE.errorReviewSetup) {
  const selectedParts = new Set(Array.isArray(setup.parts) ? setup.parts : []);
  const candidates = [];

  STATE.history.forEach(item => {
    if (!item || !["reading", "useOfEnglish"].includes(item.section)) return;
    const answers = getPlainObject(item.answers);
    const gradedStates = getPlainObject(item.gradedStates);
    const notes = getErrorNotes(item);
    const correctAnswers = getCorrectAnswers(item);
    const partTexts = getPartReferenceTexts(item);

    C2_STUDY_REVIEW.TRACKED_PARTS.filter(part => part.section === item.section).forEach(part => {
      if (!selectedParts.has(part.id)) return;
      const partData = C2_EXAM_METADATA[part.section]?.parts?.[part.partKey];
      if (!partData) return;
      const referenceText = String(partTexts[part.partKey] || "").trim();
      if (!referenceText) return;

      for (let question = part.startQ; question <= part.endQ; question += 1) {
        const gradeState = gradedStates[question];
        if (!hasObjectiveGrade(partData, gradeState)) continue;
        const isMissed = isObjectiveError(partData, gradeState);
        if (setup.scope === "missed" && !isMissed) continue;
        const correctAnswer = String(correctAnswers[question] || "").trim();
        if (!correctAnswer) continue;
        const prompt = C2_STUDY_REVIEW.getStudyReviewPrompt(
          referenceText,
          part.partKey,
          question,
          part.startQ,
          part.endQ
        );

        candidates.push({
          key: `${item.id}:${part.id}:${question}`,
          attemptId: item.id,
          date: Number(item.date) || 0,
          section: part.section,
          partKey: part.partKey,
          partId: part.id,
          partLabel: getStudyReviewPartLabel(part.id),
          question,
          prompt: prompt.text,
          promptMode: prompt.mode,
          answer: String(answers[question] || "").trim(),
          correctAnswer,
          note: String(notes[question] || "").trim(),
          isMissed,
          gradeState,
          maxPoints: partData.weight
        });
      }
    });
  });

  return candidates;
}

function getStudyReviewCandidateByKey(key) {
  return getStudyReviewCandidates({
    ...STATE.errorReviewSetup,
    scope: "all",
    parts: C2_STUDY_REVIEW.TRACKED_PARTS.map(part => part.id)
  }).find(candidate => candidate.key === key) || null;
}

function openErrorReview() {
  STATE.errorReviewSession = null;
  renderErrorReview();
  window.scrollTo({ top: 0 });
}

function renderErrorReview() {
  if (STATE.currentView === "sheet") clearPracticeTimerInterval();
  STATE.currentView = "errorReview";
  const appContainer = document.getElementById("app-container");
  appContainer.innerHTML = `
    <div class="vocabulary-container review-container study-review-container app-shell">
      <header class="app-topbar">
        <button class="brand-button" onclick="renderHome()" aria-label="Practice home" style="text-align:left">
          <span style="text-align:left;display:block">
            <span class="brand-title">Practice Log</span>
            <span class="brand-subtitle">Cambridge C2</span>
          </span>
        </button>
        ${renderMainNavigation("dashboard")}
      </header>
      <main class="review-main">
        ${STATE.errorReviewSession ? renderErrorReviewSessionHTML() : renderErrorReviewSetupHTML()}
      </main>
    </div>
  `;
}

function renderErrorReviewSetupHTML() {
  const setup = STATE.errorReviewSetup;
  const selectedParts = new Set(setup.parts);
  const eligible = getStudyReviewCandidates(setup);
  const readyCount = Math.min(Number(setup.size), eligible.length);

  return `
    <section class="review-setup-hero study-review-hero">
      <div>
        <button class="study-review-back" onclick="renderDashboard()">&larr; Back to Error log</button>
        <span class="eyebrow">Exercise review</span>
        <h1>Turn corrections into recall.</h1>
        <p>Random questions from Reading Part 1 and Use of English Parts 2–4, built from your saved exercises.</p>
      </div>
      <div class="review-setup-count"><strong>${eligible.length.toLocaleString("en-GB")}</strong><span>cards available</span></div>
    </section>

    <section class="review-setup-panel study-review-setup-panel">
      <div class="review-setup-step">
        <span class="review-step-number">1</span>
        <div>
          <h2>Which parts should appear?</h2>
          <div class="study-review-part-grid">
            ${C2_STUDY_REVIEW.TRACKED_PARTS.map(part => {
              const count = getStudyReviewCandidates({ ...setup, parts: [part.id] }).length;
              return `<button class="study-review-part ${selectedParts.has(part.id) ? "active" : ""}" onclick="toggleErrorReviewPart('${part.id}')">
                <span>${part.section === "reading" ? "Reading" : "Use of English"}</span>
                <strong>${getUseOfEnglishPartShortLabel(part.partKey)}</strong>
                <small>${count} ready</small>
              </button>`;
            }).join("")}
          </div>
        </div>
      </div>

      <div class="review-setup-step">
        <span class="review-step-number">2</span>
        <div>
          <h2>What should the deck include?</h2>
          <div class="review-mode-grid">
            ${[
              ["missed", "Mistakes only", "Focus only on answers that lost marks."],
              ["all", "Correct + missed", "Mix successful answers with mistakes for stronger recall."]
            ].map(([key, title, detail]) => `<button class="review-mode-card ${setup.scope === key ? "active" : ""}" onclick="setErrorReviewOption('scope','${key}')"><strong>${title}</strong><span>${detail}</span></button>`).join("")}
          </div>
        </div>
      </div>

      <div class="review-setup-step">
        <span class="review-step-number">3</span>
        <div>
          <h2>Choose a round size.</h2>
          <div class="review-size-row">
            ${[5, 10, 20].map(size => `<button class="review-size-button ${Number(setup.size) === size ? "active" : ""}" onclick="setErrorReviewOption('size',${size})"><strong>${size}</strong><span>cards</span></button>`).join("")}
          </div>
        </div>
      </div>

      <div class="review-launch-row">
        <div><strong>${eligible.length && selectedParts.size ? `${readyCount} ${readyCount === 1 ? "card" : "cards"} ready` : "No cards for this selection"}</strong><span>Randomised on every round. Your saved data is never changed by reviewing.</span></div>
        <button class="btn btn-primary review-launch-button" onclick="startErrorReviewSession()" ${eligible.length && selectedParts.size ? "" : "disabled"}>Start review</button>
      </div>
    </section>
  `;
}

function toggleErrorReviewPart(partId) {
  const parts = new Set(STATE.errorReviewSetup.parts);
  if (parts.has(partId)) parts.delete(partId);
  else parts.add(partId);
  STATE.errorReviewSetup.parts = [...parts];
  renderErrorReview();
}

function setErrorReviewOption(key, value) {
  STATE.errorReviewSetup[key] = key === "size" ? Number(value) : value;
  renderErrorReview();
}

function startErrorReviewSession() {
  const eligible = getStudyReviewCandidates();
  if (!eligible.length) return;
  const items = shuffleVocabularyEntries(eligible).slice(0, Math.min(Number(STATE.errorReviewSetup.size), eligible.length));
  STATE.errorReviewSession = {
    itemKeys: items.map(item => item.key),
    index: 0,
    revealed: false,
    complete: false,
    ratings: { again: 0, unsure: 0, known: 0 }
  };
  renderErrorReview();
  window.scrollTo({ top: 0 });
}

function renderErrorReviewSessionHTML() {
  const session = STATE.errorReviewSession;
  if (session.complete) return renderErrorReviewCompleteHTML(session);
  const card = getStudyReviewCandidateByKey(session.itemKeys[session.index]);
  if (!card) {
    session.index += 1;
    if (session.index >= session.itemKeys.length) session.complete = true;
    return renderErrorReviewSessionHTML();
  }
  const progress = Math.round((session.index / session.itemKeys.length) * 100);
  const gradeLabel = typeof card.gradeState === "number"
    ? `${card.gradeState}/${card.maxPoints} pts`
    : card.isMissed ? "Missed" : "Correct";

  return `
    <section class="review-session-shell study-review-session">
      <div class="review-session-topbar">
        <button class="btn btn-secondary" onclick="exitErrorReviewSession()">End round</button>
        <div class="review-progress-copy"><strong>${session.index + 1} / ${session.itemKeys.length}</strong><span>${escapeHTML(card.partLabel)}</span></div>
        <div class="review-progress-track" aria-label="${progress}% complete"><span style="width:${progress}%"></span></div>
      </div>
      <article class="review-flashcard study-review-card ${session.revealed ? "revealed" : ""}">
        <div class="review-card-prompt study-review-prompt">
          <div class="study-review-card-meta">
            <span>${card.section === "reading" ? "Reading" : "Use of English"} · ${getUseOfEnglishPartShortLabel(card.partKey)}</span>
          </div>
          <div class="study-review-question-focus">
            <span>Target question</span>
            <strong>Q.${card.question}</strong>
            <p>Answer this numbered item using the exercise context below.</p>
          </div>
          <div class="study-review-source ${card.promptMode === "part" ? "full-part" : "question-excerpt"}">${escapeHTML(card.prompt)}</div>
          ${card.partKey === "part4" && card.promptMode === "part" ? `<small>The full Part 4 exercise is shown because Q.${card.question} could not be isolated safely.</small>` : ""}
          <p class="study-review-instruction">Retrieve the answer before revealing the correction.</p>
        </div>
        ${session.revealed ? `
          <div class="review-card-answer study-review-answer">
            <span>${card.isMissed ? "Correct answer" : "Your answer"}</span>
            <h2>${escapeHTML(card.isMissed ? card.correctAnswer : card.answer || card.correctAnswer)}</h2>
            ${card.isMissed ? `
              <div class="study-review-answer-comparison">
                <div><small>Your saved answer</small><strong>${escapeHTML(card.answer || "No answer")}</strong></div>
                <div class="missed"><small>Original result</small><strong>${gradeLabel}</strong></div>
              </div>` : `
              <div class="study-review-result-pill correct"><small>Original result</small><strong>${gradeLabel}</strong></div>`}
            ${card.note ? `
              <div class="study-review-note-wrap">
                <span>Notes</span>
                <blockquote class="study-review-note" tabindex="0">${escapeHTML(card.note)}</blockquote>
                <small>Long notes scroll inside the box; drag its lower edge to resize it.</small>
              </div>` : ""}
            <small>Attempt from ${formatCompactDateTime(card.date)}</small>
          </div>` : ""}
      </article>
      ${session.revealed ? `
        <div class="review-rating-row">
          <button class="review-rating again" onclick="rateErrorReviewCard('again')"><kbd>1</kbd><span><strong>Again</strong><small>I did not retrieve it</small></span></button>
          <button class="review-rating unsure" onclick="rateErrorReviewCard('unsure')"><kbd>2</kbd><span><strong>Unsure</strong><small>Slow or incomplete</small></span></button>
          <button class="review-rating known" onclick="rateErrorReviewCard('known')"><kbd>3</kbd><span><strong>Got it</strong><small>Quick and accurate</small></span></button>
        </div>` : `
        <button class="btn btn-primary review-reveal-button" onclick="revealErrorReviewCard()">Reveal correction <kbd>Space</kbd></button>`}
    </section>
  `;
}

function revealErrorReviewCard() {
  if (!STATE.errorReviewSession || STATE.errorReviewSession.complete) return;
  STATE.errorReviewSession.revealed = true;
  renderErrorReview();
}

function rateErrorReviewCard(rating) {
  const session = STATE.errorReviewSession;
  if (!session || !session.revealed || session.complete) return;
  session.ratings[rating] += 1;
  session.index += 1;
  session.revealed = false;
  if (session.index >= session.itemKeys.length) session.complete = true;
  renderErrorReview();
}

function renderErrorReviewCompleteHTML(session) {
  const confidentPct = Math.round((session.ratings.known / session.itemKeys.length) * 100);
  return `
    <section class="review-complete-panel">
      <span class="review-complete-mark">✓</span>
      <span class="eyebrow">Exercise round complete</span>
      <h1>${session.itemKeys.length} ${session.itemKeys.length === 1 ? "card" : "cards"}, done.</h1>
      <p>${confidentPct}% came back quickly. Repeat the uncertain cards until the pattern feels automatic.</p>
      <div class="review-complete-stats">
        <div class="again"><strong>${session.ratings.again}</strong><span>Again</span></div>
        <div class="unsure"><strong>${session.ratings.unsure}</strong><span>Unsure</span></div>
        <div class="known"><strong>${session.ratings.known}</strong><span>Got it</span></div>
      </div>
      <div class="review-complete-actions">
        <button class="btn btn-primary" onclick="startErrorReviewSession()">Another random round</button>
        <button class="btn btn-secondary" onclick="exitErrorReviewSession()">Change setup</button>
        <button class="btn btn-secondary" onclick="renderDashboard()">Back to Error log</button>
      </div>
    </section>
  `;
}

function exitErrorReviewSession() {
  STATE.errorReviewSession = null;
  renderErrorReview();
  window.scrollTo({ top: 0 });
}

function handleErrorReviewKeyboard(event) {
  if (STATE.currentView !== "errorReview" || !STATE.errorReviewSession) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  if (event.code === "Space" && !STATE.errorReviewSession.revealed) {
    event.preventDefault();
    revealErrorReviewCard();
    return;
  }
  if (!STATE.errorReviewSession.revealed) return;
  if (event.key === "1") rateErrorReviewCard("again");
  if (event.key === "2") rateErrorReviewCard("unsure");
  if (event.key === "3") rateErrorReviewCard("known");
}

window.addEventListener("keydown", handleErrorReviewKeyboard);

// ==========================================================================
// WRITING LAB
// ==========================================================================
const WRITING_SITUATION_GROUPS = {
  all: "All situations",
  orient: "Set up the texts",
  compare: "Compare authors",
  evaluate: "Support or challenge",
  nuance: "Add nuance",
  reason: "Cause, effect & examples",
  position: "Position & conclude"
};

function openWritingLab(tab = STATE.writingLabTab || "essay") {
  if (STATE.currentView === "sheet") clearPracticeTimerInterval();
  STATE.currentView = "writingLab";
  STATE.writingLabTab = tab;
  renderWritingLab();
  window.scrollTo({ top: 0 });
}

function renderWritingLab() {
  STATE.currentView = "writingLab";
  const appContainer = document.getElementById("app-container");
  const tabs = [
    ["essay", "Essay map", "4-paragraph architecture"],
    ["situations", "Situation bank", "Get unstuck by function"],
    ["language", "Language", "Verbs, nouns and upgrades"],
    ["formats", "Other text types", "Report, review, article, letters"]
  ];

  appContainer.innerHTML = `
    <div class="writing-lab-container app-shell">
      <header class="app-topbar">
        <button class="brand-button" onclick="renderHome()" aria-label="Practice home" style="text-align:left">
          <span style="text-align:left;display:block"><span class="brand-title">Practice Log</span><span class="brand-subtitle">Cambridge C2</span></span>
        </button>
        ${renderMainNavigation("writingLab")}
      </header>
      <main class="writing-lab-main">
        <section class="writing-lab-hero">
          <div>
            <span class="eyebrow">Writing lab</span>
            <h1>Know what the sentence needs to do.</h1>
            <p>Find the function first, then choose language that fits its exact position. Built around the two-text C2 essay.</p>
          </div>
          <div class="writing-lab-hero-flow" aria-label="Essay flow">
            ${WRITING_ESSAY_STAGES.map(stage => `<span><b>${stage.paragraph}</b>${escapeHTML(stage.title)}</span>`).join("")}
          </div>
        </section>

        <nav class="writing-lab-tabs" aria-label="Writing lab sections">
          ${tabs.map(([key, label, detail]) => `<button class="${STATE.writingLabTab === key ? "active" : ""}" onclick="setWritingLabTab('${key}')"><strong>${label}</strong><span>${detail}</span></button>`).join("")}
        </nav>

        <div class="writing-lab-content">
          ${renderWritingLabContentHTML()}
        </div>
      </main>
    </div>
  `;
}

function setWritingLabTab(tab) {
  STATE.writingLabTab = tab;
  renderWritingLab();
  window.scrollTo({ top: 0 });
}

function renderWritingLabContentHTML() {
  if (STATE.writingLabTab === "situations") return renderWritingSituationsHTML();
  if (STATE.writingLabTab === "language") return renderWritingLanguageHTML();
  if (STATE.writingLabTab === "formats") return renderWritingFormatsHTML();
  return renderWritingEssayMapHTML();
}

function renderWritingEssayMapHTML() {
  return `
    <section class="writing-lab-section essay-map-section">
      <div class="writing-section-heading">
        <div><span class="eyebrow">Part 1 · 240–280 words</span><h2>One argument, four jobs</h2><p>Every paragraph must compare, evaluate or decide. Summary alone is never enough.</p></div>
      </div>

      <div class="essay-brief-strip">
        <div><span>Input</span><strong>2 short texts</strong></div><i>→</i>
        <div><span>Your work</span><strong>Summarise + evaluate</strong></div><i>→</i>
        <div><span>Output</span><strong>A qualified position</strong></div>
      </div>

      <div class="essay-stage-grid">
        ${WRITING_ESSAY_STAGES.map(stage => `
          <article class="essay-stage-card">
            <div class="essay-stage-head"><span>${stage.paragraph}</span><div><h3>${escapeHTML(stage.title)}</h3><small>${escapeHTML(stage.target)}</small></div></div>
            <p>${escapeHTML(stage.role)}</p>
            <div class="essay-move-row">${stage.moves.map(move => `<span>${escapeHTML(move)}</span>`).join("")}</div>
            <details><summary>See it in position</summary><blockquote>${escapeHTML(stage.example)}</blockquote></details>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function getFilteredWritingSituations() {
  const query = STATE.writingLabQuery.trim().toLocaleLowerCase("en");
  return WRITING_ESSAY_SITUATIONS.filter(item => {
    const groupMatches = STATE.writingSituationGroup === "all" || item.group === STATE.writingSituationGroup;
    const haystack = [item.title, item.cue, ...item.phrases].join(" ").toLocaleLowerCase("en");
    return groupMatches && (!query || haystack.includes(query));
  });
}

function renderWritingSituationsHTML() {
  const situations = getFilteredWritingSituations();
  return `
    <section class="writing-lab-section">
      <div class="writing-section-heading">
        <div><span class="eyebrow">Essay rescue bank</span><h2>What are you trying to do?</h2><p>Filter by rhetorical job. Position tags show where each move normally belongs.</p></div>
        <label class="writing-lab-search"><span class="sr-only">Search writing situations</span><input id="writing-lab-search" type="search" placeholder="Search: contradict, support, consequence…" value="${escapeHTML(STATE.writingLabQuery)}" oninput="setWritingLabQuery(this.value)"></label>
      </div>
      <div class="writing-filter-row">
        ${Object.entries(WRITING_SITUATION_GROUPS).map(([key, label]) => `<button class="${STATE.writingSituationGroup === key ? "active" : ""}" onclick="setWritingSituationGroup('${key}')">${label}</button>`).join("")}
      </div>
      <div class="writing-situation-count"><strong>${situations.length}</strong> situations · click a phrase to copy it</div>
      ${situations.length ? `<div class="writing-situation-grid">${situations.map(renderWritingSituationCardHTML).join("")}</div>` : `<div class="writing-empty"><strong>No matching function.</strong><span>Try a broader term or clear the filters.</span></div>`}
    </section>
  `;
}

function renderWritingSituationCardHTML(item, compact = false) {
  return `
    <article class="writing-situation-card ${compact ? "compact" : ""}">
      <div class="writing-situation-head"><div><span class="situation-group">${escapeHTML(WRITING_SITUATION_GROUPS[item.group])}</span><h3>${escapeHTML(item.title)}</h3></div><div class="position-tags">${item.positions.map(position => `<span>${position}</span>`).join("")}</div></div>
      <p>${escapeHTML(item.cue)}</p>
      <div class="writing-phrase-list">${item.phrases.map(phrase => renderWritingPhraseButtonHTML(phrase)).join("")}</div>
    </article>
  `;
}

function renderWritingPhraseButtonHTML(phrase) {
  return `<button class="writing-phrase" data-phrase="${escapeHTML(phrase)}" onclick="copyWritingPhrase(this)"><span>${escapeHTML(phrase)}</span><small>Copy</small></button>`;
}

function setWritingSituationGroup(group) {
  STATE.writingSituationGroup = group;
  renderWritingLab();
}

function setWritingLabQuery(value) {
  STATE.writingLabQuery = value;
  renderWritingLab();
  requestAnimationFrame(() => {
    const input = document.getElementById("writing-lab-search");
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
}

async function copyWritingPhrase(button) {
  const phrase = button.dataset.phrase || "";
  if (!phrase) return;
  try {
    await navigator.clipboard.writeText(phrase);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = phrase;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  const label = button.querySelector("small");
  if (!label) return;
  label.textContent = "Copied";
  button.classList.add("copied");
  setTimeout(() => {
    label.textContent = "Copy";
    button.classList.remove("copied");
  }, 1200);
}

function renderWritingLanguageHTML() {
  return `
    <section class="writing-lab-section">
      <div class="writing-section-heading"><div><span class="eyebrow">Precision bank</span><h2>Choose language by function</h2><p>Patterns and examples prevent impressive words from being used in the wrong construction.</p></div></div>
      ${renderWritingLanguageGroupsHTML()}
      ${renderWritingLanguageResourcesHTML()}
    </section>
  `;
}

function renderWritingLanguageGroupsHTML() {
  return `
    <div class="writing-language-grid">
      ${WRITING_LANGUAGE_GROUPS.map(group => `
        <article class="writing-language-card">
          <div><span class="eyebrow">${escapeHTML(group.id.replace(/-/g, " "))}</span><h3>${escapeHTML(group.title)}</h3><p>${escapeHTML(group.note)}</p></div>
          <div class="writing-language-table">
            ${group.items.map(([term, pattern, example]) => `<div><strong>${escapeHTML(term)}</strong><code>${escapeHTML(pattern)}</code><span>${escapeHTML(example)}</span></div>`).join("")}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderWritingLanguageResourcesHTML() {
  return `
    <div class="writing-resource-split">
      <article class="writing-upgrade-panel">
        <div class="writing-section-heading compact"><div><span class="eyebrow">Upgrade carefully</span><h2>Replace vague words</h2></div></div>
        ${WRITING_UPGRADES.map(item => `<div class="writing-upgrade-row"><strong>${escapeHTML(item.plain)}</strong><span>${escapeHTML(item.options)}</span><small>${escapeHTML(item.collocation)}</small></div>`).join("")}
      </article>
      <article class="writing-safe-panel">
        <div class="writing-section-heading compact"><div><span class="eyebrow writing-safe-eyebrow">Formal-safe<br>expressions</span><h2>Useful, not decorative</h2></div></div>
        ${WRITING_SAFE_EXPRESSIONS.map(([phrase, use]) => `<div><strong>${escapeHTML(phrase)}</strong><span>${escapeHTML(use)}</span></div>`).join("")}
      </article>
    </div>
  `;
}

function renderWritingFormatsHTML() {
  const genre = WRITING_GENRES[STATE.writingGenre] || WRITING_GENRES.report;
  const letterGuide = genre.letterGuide;
  return `
    <section class="writing-lab-section">
      <div class="writing-section-heading"><div><span class="eyebrow">Part 2 compass</span><h2>Change the genre, change the writing</h2><p>Purpose, reader and structure come before advanced vocabulary.</p></div></div>
      <div class="writing-genre-picker">
        ${Object.entries(WRITING_GENRES).map(([key, item]) => `<button class="${STATE.writingGenre === key ? "active" : ""}" onclick="setWritingGenre('${key}')"><strong>${escapeHTML(item.label)}</strong><span>${escapeHTML(item.meta)}</span></button>`).join("")}
      </div>
      <article class="writing-genre-workspace">
        <div class="writing-genre-title">
          <span class="eyebrow">Format guide</span>
          <h2>${escapeHTML(genre.label)}</h2>
          <div class="writing-genre-meta">${genre.meta.split("·").map(item => `<span>${escapeHTML(item.trim())}</span>`).join("")}</div>
        </div>
        <div class="writing-genre-structure">${genre.structure.map(([step, objective], index) => `<div><span>${index + 1}</span><div><strong>${escapeHTML(step)}</strong><p>${escapeHTML(objective)}</p></div></div>`).join("")}</div>
        ${letterGuide ? `
          <section class="writing-letter-guide" aria-label="${escapeHTML(genre.label)} openings and closings">
            <div class="writing-letter-guide-heading">
              <div><span class="eyebrow">Opening &amp; closing</span><h3>${escapeHTML(letterGuide.title)}</h3></div>
              <p>${escapeHTML(letterGuide.note)}</p>
            </div>
            <div class="writing-letter-guide-grid">
              ${letterGuide.situations.map(item => `
                <article class="writing-letter-guide-card">
                  <div class="writing-letter-guide-reader"><strong>${escapeHTML(item.situation)}</strong><span>${escapeHTML(item.reader)}</span></div>
                  <div><span>Open</span><p>${escapeHTML(item.opening)}</p></div>
                  <div><span>Close</span><p>${escapeHTML(item.closing)}</p></div>
                  <small>${escapeHTML(item.tip)}</small>
                </article>
              `).join("")}
            </div>
            ${letterGuide.addressees ? `
              <div class="writing-letter-addressee-heading">
                <div><span class="eyebrow">Organisation reference</span><h3>Who should you address?</h3></div>
                <p>Use the role named or implied by the task. If none fits, fall back to <strong>Dear Sir or Madam,</strong></p>
              </div>
              <div class="writing-letter-addressee-grid">
                ${letterGuide.addressees.map(item => `
                  <article class="writing-letter-addressee-card">
                    <span>${escapeHTML(item.organisation)}</span>
                    <div><small>Role</small><strong>${escapeHTML(item.role)}</strong></div>
                    <div><small>Write</small><p>${escapeHTML(item.opening)}</p></div>
                    <p>${escapeHTML(item.context)}</p>
                  </article>
                `).join("")}
              </div>
            ` : ""}
          </section>
        ` : ""}
        <div class="writing-genre-grid">
          <div class="writing-genre-phrases">
            <h3>High-value moves</h3>
            ${genre.phrases.map(([label, phrase]) => `<div><span>${escapeHTML(label)}</span>${renderWritingPhraseButtonHTML(phrase)}</div>`).join("")}
          </div>
          <aside class="writing-genre-language"><span class="eyebrow">Genre vocabulary</span><h3>Useful language</h3>${genre.language.map(([term, use]) => `<div><strong>${escapeHTML(term)}</strong><span>${escapeHTML(use)}</span></div>`).join("")}</aside>
        </div>
      </article>
    </section>
  `;
}

function setWritingGenre(genre) {
  STATE.writingGenre = genre;
  renderWritingLab();
}

function openWritingToolkit() {
  const modal = document.createElement("div");
  modal.className = "modal-overlay writing-toolkit-overlay";
  modal.innerHTML = `
    <div class="modal-content writing-toolkit-modal" role="dialog" aria-modal="true" aria-labelledby="writing-toolkit-title">
      <div class="modal-header">
        <div><span class="eyebrow">Keep your draft open</span><h3 class="modal-title" id="writing-toolkit-title">Essay quick rescue</h3><p>Choose the job your next sentence must perform.</p></div>
        <button class="modal-close" onclick="closeModal()" aria-label="Close">&times;</button>
      </div>
      <div class="writing-toolkit-mode-tabs" aria-label="Writing toolkit sections">
        <button class="${STATE.writingToolkitTab === "situations" ? "active" : ""}" data-toolkit-tab="situations" onclick="setWritingToolkitTab('situations')">Situations</button>
        <button class="${STATE.writingToolkitTab === "language" ? "active" : ""}" data-toolkit-tab="language" onclick="setWritingToolkitTab('language')">Language</button>
      </div>
      <div id="writing-toolkit-controls">${renderWritingToolkitControlsHTML()}</div>
      <div class="modal-body writing-toolkit-body" id="writing-toolkit-body">${renderWritingToolkitBodyHTML()}</div>
    </div>
  `;
  mountModal(modal);
}

function renderWritingToolkitControlsHTML() {
  if (STATE.writingToolkitTab !== "situations") return "";
  return `<div class="writing-toolkit-tabs">${Object.entries(WRITING_SITUATION_GROUPS).filter(([key]) => key !== "all").map(([key, label]) => `<button class="${STATE.writingToolkitGroup === key ? "active" : ""}" data-toolkit-group="${key}" onclick="setWritingToolkitGroup('${key}')">${label}</button>`).join("")}</div>`;
}

function renderWritingToolkitBodyHTML() {
  if (STATE.writingToolkitTab === "language") {
    return `<div class="writing-toolkit-note"><strong>Choose by function.</strong><span>Use the pattern and example to keep each expression natural.</span></div><div class="writing-toolkit-language">${renderWritingLanguageGroupsHTML()}${renderWritingLanguageResourcesHTML()}</div>`;
  }
  const situations = WRITING_ESSAY_SITUATIONS.filter(item => item.group === STATE.writingToolkitGroup);
  return `<div class="writing-toolkit-note"><strong>Use the position tag.</strong><span>It stops a good phrase appearing in the wrong paragraph.</span></div><div class="writing-toolkit-list">${situations.map(item => renderWritingSituationCardHTML(item, true)).join("")}</div>`;
}

function setWritingToolkitTab(tab) {
  STATE.writingToolkitTab = tab;
  document.querySelectorAll("[data-toolkit-tab]").forEach(button => button.classList.toggle("active", button.dataset.toolkitTab === tab));
  const controls = document.getElementById("writing-toolkit-controls");
  if (controls) controls.innerHTML = renderWritingToolkitControlsHTML();
  const body = document.getElementById("writing-toolkit-body");
  if (body) {
    body.scrollTop = 0;
    body.innerHTML = renderWritingToolkitBodyHTML();
  }
}

function setWritingToolkitGroup(group) {
  STATE.writingToolkitGroup = group;
  document.querySelectorAll("[data-toolkit-group]").forEach(button => button.classList.toggle("active", button.dataset.toolkitGroup === group));
  const body = document.getElementById("writing-toolkit-body");
  if (body) body.innerHTML = renderWritingToolkitBodyHTML();
}

function renderDashboard() {
  renderDashboardView();
}

function renderDashboardView() {
  if (STATE.currentView === "sheet") {
    clearPracticeTimerInterval();
  }

  STATE.currentView = "dashboard";
  const appContainer = document.getElementById("app-container");

  const totalCompleted = getScoredHistory().length;
  const avgScaleScore = calculateAverageScaleScore();
  const avgGrade = getCambridgeGrade(avgScaleScore);
  const overallAccuracy = calculateOverallAccuracy();
  const sectionStats = getAllSectionStats();
  const trend = calculateRecentTrend();
  const passRate = calculatePassRate();
  const focus = getNextFocusInsight(sectionStats);
  const scorePosition = getScorePosition(avgScaleScore);
  const trendClass = trend > 0 ? "good" : trend < 0 ? "risk" : "neutral";
  const trendLabel = trend === 0 ? "0" : `${trend > 0 ? "+" : ""}${trend}`;

  appContainer.innerHTML = `
    <div class="dash-container app-shell">
      <header class="app-topbar">
        <button class="brand-button" onclick="renderHome()" aria-label="Practice home" style="text-align: left;">
          <span style="text-align: left; display: block;">
            <span class="brand-title">Practice Log</span>
            <span class="brand-subtitle">Cambridge C2</span>
          </span>
        </button>

        ${renderMainNavigation("dashboard")}
      </header>

      <main class="dashboard-main">
        <section class="insight-hero ${scorePosition.tone}">
          <div class="insight-copy">
            <span class="eyebrow">Progress</span>
            <h1>You are at ${avgScaleScore || "--"}</h1>
            <p>${scorePosition.label}. ${scorePosition.detail}</p>
          </div>
          <div class="score-ring" aria-label="Average scale score">
            <strong>${avgScaleScore || "--"}</strong>
            <span>average</span>
          </div>
          <div class="focus-strip">
            <span>${focus.title}</span>
            <strong>${focus.detail}</strong>
          </div>
        </section>

        <section class="summary-row">
          <div class="summary-card">
            <div class="summary-card-title">Saved attempts</div>
            <div class="summary-card-value">${totalCompleted}</div>
            <div class="summary-card-note">${passRate || 0}% in C2 range</div>
          </div>
          <div class="summary-card">
            <div class="summary-card-title">Average scale</div>
            <div class="summary-card-value ${avgScaleScore >= 200 ? "positive" : "risk"}">${avgScaleScore || "--"}</div>
            <div class="summary-card-note">${avgScaleScore ? `${avgGrade} · papers weighted equally` : "No average yet"}</div>
          </div>
          <div class="summary-card">
            <div class="summary-card-title">Average accuracy</div>
            <div class="summary-card-value ${getAccuracyTone(overallAccuracy)}">${overallAccuracy ? `${overallAccuracy}%` : "--"}</div>
            <div class="summary-card-note">weighted raw marks</div>
          </div>
          <div class="summary-card">
            <div class="summary-card-title">Recent trend</div>
            <div class="summary-card-value ${trendClass}">${trendLabel}</div>
            <div class="summary-card-note">last 3 vs previous</div>
          </div>
        </section>

        <section class="dashboard-grid">
          ${renderProgressMapHTML(sectionStats)}
          ${renderSectionAnalyticsV2HTML(sectionStats)}
          ${renderPartBreakdownHTML()}

          <section class="dash-panel attempts-panel">
            <div class="panel-title">
              <span>Recent saved work</span>
              ${STATE.history.length > 0 ? `<button class="btn-danger-link" onclick="clearHistory()">Clear all</button>` : ""}
            </div>
            <div class="panel-body-scroll">
              ${renderHistoryListV2HTML(6)}
            </div>
            ${STATE.history.length > 6 ? `
              <div style="margin-top: auto; padding-top: 12px; border-top: 1px dashed var(--border-color); display: flex; justify-content: center;">
                <button class="btn btn-secondary btn-full" onclick="openAllAttemptsModal()" style="font-size: 0.8rem; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 800; width: 100%;">
                  View all saved work
                </button>
              </div>
            ` : ""}
          </section>
        </section>

        ${renderErrorLogDashboardHTML()}
      </main>
    </div>
  `;
}

const VISIBLE_ERRORS_PER_LOG_COLUMN = 3;

function renderTrackedErrorItemHTML(error, compact = false, textPanelId = "ue-dashboard-part-text-panel") {
  const partLabel = getUseOfEnglishPartShortLabel(error.partKey);
  const gradeLabel = typeof error.gradeState === "number"
    ? `${error.gradeState}/${error.maxPoints || 2} pts`
    : error.gradeState === "correct" ? "Correct" : error.gradeState === "incorrect" ? "Missed" : "Not graded";
  const answer = error.answer ? escapeHTML(error.answer) : "No answer";
  const correctAnswer = error.correctAnswer ? escapeHTML(error.correctAnswer) : "Correction pending";
  const note = error.note.trim();

  return `
    <article class="ue-error-item ${compact ? "compact" : ""} ${error.isMissed ? "" : "noted-correct"}">
      <div class="ue-error-item-head">
        <div>
          <span class="ue-error-part">${partLabel}</span>
          <strong>Q.${error.question}</strong>
        </div>
        <span>${gradeLabel}</span>
      </div>
      <span class="error-answer-label">Your answer</span>
      <div class="ue-error-answer">${answer}</div>
      ${error.isMissed ? `
        <span class="error-answer-label">Correct answer</span>
        <div class="ue-error-correct-answer">${correctAnswer}</div>` : ""}
      ${note ? `
        <div class="ue-error-note-wrap">
          <span class="error-answer-label">Notes</span>
          <p class="ue-error-note" tabindex="0">${escapeHTML(note)}</p>
        </div>` : ""}
      <div class="ue-error-actions">
        <button class="ue-error-text-button" onclick="showPartReferenceText('${escapeJS(error.attemptId)}', '${error.section}', '${error.partKey}', '${textPanelId}')">View part text</button>
        <button class="ue-error-review" onclick="openHistoryDetailModal('${escapeJS(error.attemptId)}')">${formatCompactDateTime(error.date)}</button>
      </div>
    </article>
  `;
}

function focusErrorLogPartColumn(workspace, section, partKey) {
  if (!workspace?.classList.contains("ue-errors-workspace")) return;
  workspace.dataset.activeErrorSection = section;
  workspace.dataset.activeErrorPart = partKey;
  workspace.querySelectorAll(".ue-part-card[data-error-section][data-error-part]").forEach(card => {
    const isActive = card.dataset.errorSection === section && card.dataset.errorPart === partKey;
    card.hidden = !isActive;
    card.classList.toggle("text-source", isActive);
  });
}

function clearErrorLogPartFocus(workspace) {
  if (!workspace?.classList.contains("ue-errors-workspace")) return;
  workspace.querySelectorAll(".ue-part-card[data-error-section][data-error-part]").forEach(card => {
    card.hidden = false;
    card.classList.remove("text-source");
  });
  delete workspace.dataset.activeErrorSection;
  delete workspace.dataset.activeErrorPart;
}

function showPartReferenceText(sessionId, section, partKey, panelId) {
  const item = STATE.history.find(historyItem => historyItem.id === sessionId);
  const panel = document.getElementById(panelId);
  const partData = C2_EXAM_METADATA[section]?.parts?.[partKey];
  if (!item || item.section !== section || !panel || !partData) return;

  const text = getPartReferenceTexts(item)[partKey]?.trim() || "";
  panel.innerHTML = `
    <div class="ue-part-text-panel-head">
      <div>
        <span>${getUseOfEnglishPartShortLabel(partKey)}</span>
        <strong>${partData.name.replace(/^Part \d+ - /, "")}</strong>
      </div>
      <button type="button" onclick="hidePartReferenceText('${panelId}')" aria-label="Close part text">&times;</button>
    </div>
    <div class="ue-part-text-panel-meta">Saved with the attempt from ${formatCompactDateTime(item.date)}</div>
    ${text
      ? `<div class="ue-part-text-content" tabindex="0" aria-label="Full text for ${getUseOfEnglishPartShortLabel(partKey)}">${escapeHTML(text)}</div>`
      : `<div class="ue-part-text-missing">No text is attached to this part yet. Open the review and choose <strong>Edit corrections</strong> to add it.</div>`}
    ${panelId === "history-review-part-text-panel" ? "" : `
      <button class="btn btn-secondary btn-full ue-part-text-open-review" onclick="openHistoryDetailModal('${escapeJS(item.id)}')">Open review</button>
    `}
  `;
  panel.hidden = false;
  const workspace = panel.closest(".ue-text-workspace");
  focusErrorLogPartColumn(workspace, section, partKey);
  workspace?.classList.add("text-open");
  panel.closest(".history-review-modal")?.classList.add("text-open");
  const textContent = panel.querySelector(".ue-part-text-content");
  if (textContent) textContent.scrollTop = 0;
}

function hidePartReferenceText(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.hidden = true;
  const workspace = panel.closest(".ue-text-workspace");
  clearErrorLogPartFocus(workspace);
  workspace?.classList.remove("text-open");
  panel.closest(".history-review-modal")?.classList.remove("text-open");
}

function getTrackedPartErrors(section, partKey, scope = "corrections") {
  const includeCorrectWithoutNotes = scope === "all";
  return getTrackedErrorEntries({ includeCorrectWithoutNotes })
    .filter(error => error.section === section && error.partKey === partKey);
}

function renderTrackedPartErrorSearchResultsHTML(errors) {
  if (errors.length === 0) {
    return `<div class="empty-state ue-search-empty">No corrections match this search.</div>`;
  }
  return errors.map(error => renderTrackedErrorItemHTML(error, false, "ue-modal-part-text-panel")).join("");
}

function filterTrackedPartErrors(section, partKey) {
  const query = document.getElementById("ue-error-search-input")?.value || "";
  const scope = document.getElementById("ue-error-scope-select")?.value || "corrections";
  const errors = getTrackedPartErrors(section, partKey, scope)
    .filter(error => C2_STUDY_REVIEW.matchesTrackedErrorSearch(error, query));
  const list = document.getElementById("ue-all-errors-list");
  const count = document.getElementById("ue-error-search-count");
  if (list) list.innerHTML = renderTrackedPartErrorSearchResultsHTML(errors);
  if (count) count.textContent = `${errors.length} ${errors.length === 1 ? "result" : "results"}`;
}

function openTrackedPartErrorsModal(section, partKey) {
  const partData = C2_EXAM_METADATA[section]?.parts?.[partKey];
  if (!partData) return;

  const errors = getTrackedPartErrors(section, partKey);
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content ue-all-errors-modal">
      <div class="modal-header">
        <div>
          <span class="eyebrow">${C2_EXAM_METADATA[section].name} · ${getUseOfEnglishPartShortLabel(partKey)}</span>
          <h3 class="modal-title">${partData.name.replace(/^Part \d+ - /, "")} corrections</h3>
        </div>
        <button class="modal-close" onclick="closeModal()" aria-label="Close">&times;</button>
      </div>
      <div class="ue-error-search-row">
        <label class="ue-error-search-control" for="ue-error-search-input">
          <span>Search corrections</span>
          <input id="ue-error-search-input" type="search"
                 placeholder="Question, answer or note..."
                 oninput="filterTrackedPartErrors('${section}', '${partKey}')">
        </label>
        <label class="ue-error-scope-control" for="ue-error-scope-select">
          <span>Show</span>
          <select id="ue-error-scope-select" onchange="filterTrackedPartErrors('${section}', '${partKey}')">
            <option value="corrections">Mistakes + correct with notes</option>
            <option value="all">All graded answers</option>
          </select>
        </label>
        <small id="ue-error-search-count">${errors.length} ${errors.length === 1 ? "result" : "results"}</small>
      </div>
      <div class="modal-body ue-text-workspace ue-all-errors-workspace">
        <div class="ue-all-errors-list" id="ue-all-errors-list">
          ${renderTrackedPartErrorSearchResultsHTML(errors)}
        </div>
        <aside class="ue-part-text-panel" id="ue-modal-part-text-panel" hidden aria-live="polite"></aside>
      </div>
      <div class="history-review-actions">
        <button class="btn btn-primary" onclick="closeModal()">Close</button>
      </div>
    </div>
  `;
  mountModal(modal);
}

function renderErrorLogDashboardHTML() {
  const errors = getTrackedErrorEntries();
  const columns = getTrackedErrorColumns();

  return `
    <section class="dash-panel ue-errors-panel" aria-label="Error log">
      <div class="panel-title">
        <div>
          <span>Error log</span>
          <small>${errors.length} ${errors.length === 1 ? "saved correction" : "saved corrections"}</small>
        </div>
        <button class="btn btn-primary ue-start-review" onclick="openErrorReview()" ${getStudyReviewCandidates({ ...STATE.errorReviewSetup, scope: "all" }).length ? "" : "disabled"}>Review exercises</button>
      </div>
      ${errors.length === 0 ? `
        <div class="empty-state ue-errors-empty">Corrections from Reading Part 1 and Use of English Parts 2–4 will appear here.</div>
      ` : `
        <div class="ue-text-workspace ue-errors-workspace">
          <section class="ue-part-register">
            <div class="ue-part-register-grid">
              ${columns.map(({ section, sectionName, partKey, partData }) => {
                const partErrors = errors.filter(error => error.section === section && error.partKey === partKey);
                const visibleErrors = partErrors.slice(0, VISIBLE_ERRORS_PER_LOG_COLUMN);
                return `
                  <article class="ue-part-card" data-error-section="${section}" data-error-part="${partKey}">
                    <div class="ue-part-card-head">
                      <div>
                        <span>${sectionName} · ${getUseOfEnglishPartShortLabel(partKey)}</span>
                        <strong>${partData.name.replace(/^Part \d+ - /, "")}</strong>
                      </div>
                      <b>${partErrors.length}</b>
                    </div>
                    ${partErrors.length > 0 ? `
                      <div class="ue-part-error-list">
                        ${visibleErrors.map(error => renderTrackedErrorItemHTML(error, true)).join("")}
                      </div>
                      ${partErrors.length > visibleErrors.length ? `
                        <button class="btn btn-secondary btn-full ue-view-all-errors" onclick="openTrackedPartErrorsModal('${section}', '${partKey}')">
                          View all ${partErrors.length} corrections
                        </button>
                      ` : ""}
                    ` : `<p class="ue-part-empty">No corrections yet.</p>`}
                  </article>
                `;
              }).join("")}
            </div>
          </section>
          <aside class="ue-part-text-panel" id="ue-dashboard-part-text-panel" hidden aria-live="polite"></aside>
        </div>
      `}
    </section>
  `;
}

function calculateOverallAccuracy() {
  const scoredHistory = getScoredHistory();
  if (scoredHistory.length === 0) return 0;
  const correctSum = scoredHistory.reduce((acc, curr) => acc + curr.correct, 0);
  const totalSum = scoredHistory.reduce((acc, curr) => acc + curr.total, 0);
  return totalSum > 0 ? Math.round((correctSum / totalSum) * 100) : 0;
}

function getAccuracyTone(value) {
  const pct = Number(value) || 0;
  if (pct >= 85) return "excellent";
  if (pct >= 75) return "pass";
  if (pct >= 60) return "warning";
  if (pct > 0) return "risk";
  return "neutral";
}

function getSavedWorkItems(sectionFilter = "all") {
  const validSections = new Set(["useOfEnglish", "reading", "listening", "writing"]);
  if (!validSections.has(sectionFilter)) return STATE.history;
  return STATE.history.filter(item => item.section === sectionFilter);
}

function renderHistoryListV2HTML(limit = 4, sectionFilter = "all") {
  const filteredHistory = getSavedWorkItems(sectionFilter);
  if (filteredHistory.length === 0) {
    return `
      <div class="empty-state" style="display:flex; flex-direction:column; align-items:center; gap:12px; padding:2rem 1rem; text-align:center;">
        <span>${STATE.history.length === 0 ? "Save a mock to start tracking progress." : "No saved work for this section yet."}</span>
      </div>
    `;
  }

  const itemsToShow = limit ? filteredHistory.slice(-limit) : filteredHistory;

  return `
    <div class="attempt-list">
      ${itemsToShow.slice().reverse().map(item => {
        const isPartial = isPartialPracticeAttempt(item);
        const isStrong = !isPartial && item.scaleScore >= 220;
        const isPass = !isPartial && item.scaleScore >= 200;
        const scoreClass = isPartial ? "partial" : isStrong ? "excellent" : isPass ? "pass" : "risk";
        const sectionName = C2_EXAM_METADATA[item.section].name;
        const dateFormatted = formatCompactDateTime(item.date);
        const durationText = formatAttemptDuration(getAttemptDurationSeconds(item));
        const scopeLabel = isPartial ? getPartialPracticeScopeLabel(item) : "";

        return `
          <div class="attempt-item" role="button" tabindex="0"
               onclick="openHistoryDetailModal('${escapeJS(item.id)}')"
               onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openHistoryDetailModal('${escapeJS(item.id)}'); }"
               title="Open saved review">
            <div class="attempt-main">
              <span class="section-code">${getSectionIconSVG(item.section)}</span>
              <div class="attempt-copy">
                <strong>${sectionName}</strong>
                <span>${dateFormatted}${scopeLabel ? ` · ${escapeHTML(scopeLabel)}` : ""}${durationText ? ` - ${durationText}` : ""}</span>
              </div>
            </div>
            <div class="attempt-score">
              ${isPartial ? `
                <strong class="${scoreClass}">Partial</strong>
                <span class="partial-practice-caption">Not scored</span>
              ` : `
                <strong class="${scoreClass}">${item.scaleScore}</strong>
                <span class="accuracy-value ${getAccuracyTone(item.percentage)}">${item.correct}/${item.total} - ${item.percentage}%</span>
              `}
            </div>
            <button class="delete-hist-btn" onclick="event.stopPropagation(); deleteHistoryItem('${escapeJS(item.id)}')" title="Delete attempt">x</button>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderSectionAnalyticsV2HTML(sectionStats = getAllSectionStats()) {
  const focus = getNextFocusInsight(sectionStats);

  return `
    <section class="dash-panel section-panel">
      <div class="panel-title">
        <span>Section overview</span>
        <small>scale / accuracy / weakest part</small>
      </div>
      <div class="section-performance-list">
        ${sectionStats.map(stats => {
          const data = C2_EXAM_METADATA[stats.section];
          const isFocus = focus.section === stats.section;
          const meterWidth = stats.avgScale ? Math.max(4, Math.min(100, Math.round(((stats.avgScale - 120) / 110) * 100))) : 0;
          const scoreClass = stats.avgScale >= 220 ? "excellent" : stats.avgScale >= 200 ? "pass" : stats.avgScale ? "risk" : "neutral";
          const weakestPart = getWeakestPart(stats.section);

          return `
            <article class="section-performance-card ${isFocus ? "needs-focus" : ""}">
              <div class="section-performance-head">
                <div>
                  <span class="section-code">${getSectionIconSVG(stats.section)}</span>
                  <h3>${data.name}</h3>
                </div>
                <strong class="${scoreClass}">${stats.avgScale || "--"}</strong>
              </div>
              <div class="meter">
                <span style="width:${meterWidth}%"></span>
              </div>
              <div class="section-performance-meta">
                <span>${stats.attempts} attempts</span>
                <span class="accuracy-value ${getAccuracyTone(stats.avgAccuracy)}">${stats.avgAccuracy || "--"}% raw</span>
                <span>Best ${stats.bestScale || "--"}</span>
                <span>${weakestPart ? `Weakest: ${weakestPart.name}` : "No part data"}</span>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderProgressMapHTML(sectionStats = getAllSectionStats()) {
  if (getScoredHistory().length === 0) {
    return `
      <section class="dash-panel progress-panel">
        <div class="panel-title">
          <span>Progress map</span>
          <small>by paper, not by date</small>
        </div>
        <div class="empty-chart">No attempts yet.</div>
      </section>
    `;
  }

  return `
    <section class="dash-panel progress-panel">
      <div class="panel-title">
        <span>Progress map</span>
        <small>by section, in chronological order</small>
      </div>
      <div class="progress-map">
        ${sectionStats.map(stats => {
          const sectionLogs = getScoredHistory(stats.section);
          const latest = sectionLogs[sectionLogs.length - 1];
          const weakestPart = getWeakestPart(stats.section);

          const maxVisible = 5;
          const offset = sectionLogs.length > maxVisible ? sectionLogs.length - maxVisible : 0;
          const visibleLogs = sectionLogs.slice(offset);

          return `
            <article class="progress-row">
              <div class="progress-row-head">
                <div>
                  <span class="section-code">${getSectionIconSVG(stats.section)}</span>
                  <strong>${C2_EXAM_METADATA[stats.section].name}</strong>
                </div>
                <span class="progress-row-actions">
                  <button class="progress-evolution-button"
                          type="button"
                          onclick="openSectionEvolutionModal('${stats.section}')"
                          ${sectionLogs.length === 0 ? "disabled" : ""}
                          aria-label="View ${C2_EXAM_METADATA[stats.section].name} evolution">
                    View evolution
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 12.5 5.2 9l2.5 2 5.8-7"></path><path d="M10 4h3.5v3.5"></path></svg>
                  </button>
                </span>
              </div>
              <div class="attempt-sparkline">
                ${sectionLogs.length === 0 ? `<span class="no-attempts">No attempts</span>` : visibleLogs.map((item, index) => {
                  const pointWidth = Math.max(4, Math.min(100, Math.round(((item.scaleScore - 120) / 110) * 100)));
                  const scoreClass = item.scaleScore >= 220 ? "excellent" : item.scaleScore >= 200 ? "pass" : "risk";
                  const attemptNumber = offset + index + 1;

                  return `
                    <button class="attempt-chip ${scoreClass}"
                            style="width:${pointWidth}%"
                            onclick="openHistoryDetailModal('${escapeJS(item.id)}')"
                            title="Attempt ${attemptNumber}: ${item.scaleScore}">
                      <span>#${attemptNumber}</span>
                      <strong>${item.scaleScore}</strong>
                    </button>
                  `;
                }).join("")}
              </div>
              <div class="progress-row-foot">
                <span>${stats.attempts} attempts</span>
                <span>Latest ${latest ? latest.scaleScore : "--"}</span>
                <span class="progress-row-weakest">${weakestPart ? `Weakest part: ${weakestPart.name}` : "Part data pending"}</span>
                <span class="progress-row-average-foot">${stats.avgScale || "--"} avg</span>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function getSectionEvolutionMetrics(section) {
  const logs = getScoredHistory(section)
    .slice()
    .sort((a, b) => (a.date || 0) - (b.date || 0));

  if (logs.length === 0) {
    return {
      logs,
      latest: null,
      first: null,
      best: null,
      currentScale: 0,
      currentAccuracy: 0,
      comparisonAverage: null,
      comparisonCount: 0,
      improvement: null,
      consistency: null,
      c2Rate: 0,
      averageAccuracy: 0
    };
  }

  const latest = logs[logs.length - 1];
  const first = logs[0];
  const best = logs.reduce((top, item) => item.scaleScore > top.scaleScore ? item : top, logs[0]);
  const recent = logs.slice(-3);
  const comparisonLogs = logs.slice(0, -recent.length);
  const currentScale = Math.round(recent.reduce((sum, item) => sum + item.scaleScore, 0) / recent.length);
  const currentAccuracy = Math.round(recent.reduce((sum, item) => sum + item.percentage, 0) / recent.length);
  const comparisonAverage = comparisonLogs.length
    ? Math.round(comparisonLogs.reduce((sum, item) => sum + item.scaleScore, 0) / comparisonLogs.length)
    : null;
  const consistencySet = logs.slice(-5).map(item => item.scaleScore);
  const consistencyAverage = consistencySet.reduce((sum, value) => sum + value, 0) / consistencySet.length;
  const variance = consistencySet.reduce((sum, value) => sum + Math.pow(value - consistencyAverage, 2), 0) / consistencySet.length;

  return {
    logs,
    latest,
    first,
    best,
    currentScale,
    currentAccuracy,
    comparisonAverage,
    comparisonCount: comparisonLogs.length,
    improvement: comparisonAverage === null ? null : currentScale - comparisonAverage,
    consistency: logs.length > 1 ? Math.round(Math.sqrt(variance)) : null,
    c2Rate: Math.round((logs.filter(item => item.scaleScore >= 200).length / logs.length) * 100),
    averageAccuracy: Math.round(logs.reduce((sum, item) => sum + item.percentage, 0) / logs.length)
  };
}

function formatSignedNumber(value) {
  const number = Number(value) || 0;
  return number > 0 ? `+${number}` : String(number);
}

function getConsistencyLabel(deviation) {
  if (deviation === null) return "More data needed";
  if (deviation <= 4) return "Very steady";
  if (deviation <= 8) return "Steady";
  if (deviation <= 14) return "Variable";
  return "Highly variable";
}

function renderSectionEvolutionChartHTML(section, logs) {
  if (logs.length === 0) {
    return `<div class="evolution-empty">No ${C2_EXAM_METADATA[section].name} attempts yet.</div>`;
  }

  const width = 760;
  const height = 286;
  const plot = { left: 46, right: 18, top: 18, bottom: 42 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const yForScore = score => plot.top + ((230 - Math.max(160, Math.min(230, score))) / 70) * plotHeight;
  const xForIndex = index => logs.length === 1
    ? plot.left + (plotWidth / 2)
    : plot.left + (index / (logs.length - 1)) * plotWidth;
  const gridScores = [230, 220, 200, 180, 160];
  const points = logs.map((item, index) => `${xForIndex(index).toFixed(1)},${yForScore(item.scaleScore).toFixed(1)}`).join(" ");
  const baselineY = yForScore(160);
  const areaPoints = `${points} ${xForIndex(logs.length - 1).toFixed(1)},${baselineY.toFixed(1)} ${xForIndex(0).toFixed(1)},${baselineY.toFixed(1)}`;
  const bestIndex = logs.reduce((topIndex, item, index) => item.scaleScore > logs[topIndex].scaleScore ? index : topIndex, 0);
  const dateLabelIndexes = new Set([0, logs.length - 1]);
  if (logs.length <= 6) {
    logs.forEach((_, index) => dateLabelIndexes.add(index));
  } else {
    const labelStep = Math.ceil((logs.length - 1) / 4);
    for (let index = labelStep; index < logs.length - 1; index += labelStep) dateLabelIndexes.add(index);
  }

  return `
    <div class="evolution-chart-frame" aria-label="Complete evolution chart">
      <svg class="evolution-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="evolution-chart-title-${section} evolution-chart-desc-${section}">
        <title id="evolution-chart-title-${section}">${C2_EXAM_METADATA[section].name} score evolution</title>
        <desc id="evolution-chart-desc-${section}">${logs.length} attempts in chronological order. Cambridge scale scores range from 160 to 230.</desc>
        <defs>
          <linearGradient id="evolution-area-${section}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0f766e" stop-opacity="0.26"></stop>
            <stop offset="72%" stop-color="#0f766e" stop-opacity="0.055"></stop>
            <stop offset="100%" stop-color="#0f766e" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        <rect class="evolution-zone grade-a" x="${plot.left}" y="${yForScore(230)}" width="${plotWidth}" height="${yForScore(220) - yForScore(230)}"></rect>
        <rect class="evolution-zone c2" x="${plot.left}" y="${yForScore(220)}" width="${plotWidth}" height="${yForScore(200) - yForScore(220)}"></rect>
        ${gridScores.map(score => {
          const y = yForScore(score);
          const thresholdClass = score === 200 ? " c2-threshold" : score === 220 ? " grade-a-threshold" : "";
          return `
            <line class="evolution-grid-line${thresholdClass}" x1="${plot.left}" y1="${y}" x2="${width - plot.right}" y2="${y}"></line>
            <text class="evolution-axis-label${thresholdClass}" x="${plot.left - 12}" y="${y + 4}" text-anchor="end">${score}</text>
          `;
        }).join("")}
        <polygon class="evolution-area" points="${areaPoints}" fill="url(#evolution-area-${section})"></polygon>
        ${logs.length > 1 ? `<polyline class="evolution-line" points="${points}"></polyline>` : ""}
        ${logs.map((item, index) => {
          const x = xForIndex(index);
          const y = yForScore(item.scaleScore);
          const tone = item.scaleScore >= 220 ? "excellent" : item.scaleScore >= 200 ? "pass" : "risk";
          const attemptTitle = `Attempt ${index + 1}: ${item.scaleScore} scale, ${item.percentage}% accuracy, ${formatCompactDateTime(item.date)}`;
          const isLatest = index === logs.length - 1;
          const isBest = index === bestIndex;
          const showScore = isLatest || isBest;
          const scoreAnchor = isLatest ? "end" : "middle";
          const scoreX = isLatest ? x - 2 : x;
          return `
            <g class="evolution-point ${tone} ${isLatest ? "latest" : ""}" role="button" tabindex="0"
               onclick="openHistoryDetailModal('${escapeJS(item.id)}')"
               onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openHistoryDetailModal('${escapeJS(item.id)}'); }"
               aria-label="${escapeHTML(attemptTitle)}">
              <circle class="evolution-point-halo" cx="${x}" cy="${y}" r="12"></circle>
              <circle class="evolution-point-dot" cx="${x}" cy="${y}" r="${isLatest ? 6 : 4.5}"></circle>
              ${showScore ? `<text class="evolution-point-score" x="${scoreX}" y="${Math.max(14, y - 13)}" text-anchor="${scoreAnchor}">${item.scaleScore}${isLatest ? " · now" : ""}</text>` : ""}
              ${dateLabelIndexes.has(index) ? `<text class="evolution-date-label" x="${x}" y="${height - 13}" text-anchor="${index === 0 ? "start" : isLatest ? "end" : "middle"}">${escapeHTML(formatShortDate(item.date))}</text>` : ""}
              <title>${escapeHTML(attemptTitle)}</title>
            </g>
          `;
        }).join("")}
      </svg>
    </div>
  `;
}

function renderSectionEvolutionContentHTML(section) {
  const metrics = getSectionEvolutionMetrics(section);
  const weakestPart = getWeakestPart(section);
  const latestTone = metrics.latest
    ? metrics.currentScale >= 220 ? "excellent" : metrics.currentScale >= 200 ? "pass" : "risk"
    : "neutral";
  const trendTone = metrics.improvement > 0 ? "positive" : metrics.improvement < 0 ? "negative" : "neutral";
  const consistencyDetail = metrics.consistency === null ? "More data needed" : `±${metrics.consistency} · ${getConsistencyLabel(metrics.consistency)}`;

  return `
    <div class="evolution-section-heading">
      <div>
        <span class="section-code">${getSectionIconSVG(section)}</span>
        <div>
          <span class="eyebrow">Full history</span>
          <h4>${C2_EXAM_METADATA[section].name}</h4>
        </div>
      </div>
      <span>${metrics.logs.length} ${metrics.logs.length === 1 ? "attempt" : "attempts"}</span>
    </div>
    ${metrics.logs.length === 0 ? renderSectionEvolutionChartHTML(section, metrics.logs) : `
      <div class="evolution-workspace">
        <section class="evolution-chart-card">
          <div class="evolution-chart-head">
            <div>
              <h5>Scale score</h5>
              <p>All attempts · select any point to open its review</p>
            </div>
            <div class="evolution-legend" aria-label="Score bands">
              <span><i class="c2"></i>C2 200–219</span>
              <span><i class="grade-a"></i>Grade A 220+</span>
            </div>
          </div>
          ${renderSectionEvolutionChartHTML(section, metrics.logs)}
        </section>
        <aside class="evolution-insights">
          <article class="evolution-score-summary ${latestTone}">
            <div>
              <span>Current level · last 3 avg</span>
              <strong>${metrics.currentScale}</strong>
              <small>${getCambridgeGrade(metrics.currentScale)} · ${metrics.currentAccuracy}% raw</small>
            </div>
            <span class="evolution-improvement metric-${trendTone}">
              ${metrics.improvement === null ? "--" : formatSignedNumber(metrics.improvement)}
              <small>${metrics.comparisonCount ? `vs ${metrics.comparisonCount} earlier` : "more history needed"}</small>
            </span>
          </article>
          <div class="evolution-compact-metrics">
            <article><span>Best</span><strong>${metrics.best.scaleScore}</strong><small>${formatShortDate(metrics.best.date)}</small></article>
            <article><span>Previous avg</span><strong>${metrics.comparisonAverage === null ? "--" : metrics.comparisonAverage}</strong><small>${metrics.comparisonCount ? `${metrics.comparisonCount} earlier tests` : "before current block"}</small></article>
            <article><span>Consistency</span><strong>${metrics.consistency === null ? "--" : metrics.consistency}</strong><small>${consistencyDetail}</small></article>
            <article><span>C2 rate</span><strong>${metrics.c2Rate}%</strong><small>scores at 200+</small></article>
          </div>
          <div class="evolution-accuracy">
            <div><span>Average raw accuracy</span><strong>${metrics.averageAccuracy}%</strong></div>
            <div class="evolution-accuracy-track"><span style="width:${metrics.averageAccuracy}%"></span></div>
          </div>
          <aside class="evolution-study-focus">
            <span>Next focus</span>
            <div>
              <strong>${weakestPart ? weakestPart.name : "Keep collecting part data"}</strong>
              <p>${weakestPart
                ? `${weakestPart.averagePct}% average · prioritise this part next.`
                : "Complete another paper to unlock a recommendation."}</p>
            </div>
          </aside>
        </aside>
      </div>
    `}
  `;
}

function openSectionEvolutionModal(section) {
  if (!SECTION_ORDER.includes(section)) return;

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content evolution-modal">
      <div class="modal-header evolution-modal-header">
        <div>
          <span class="eyebrow">Progress map</span>
          <h3 class="modal-title">Performance evolution</h3>
        </div>
        <button class="modal-close" onclick="closeModal()" aria-label="Close">&times;</button>
      </div>
      <div class="evolution-tabs" role="tablist" aria-label="Exam sections">
        ${SECTION_ORDER.map(tabSection => `
          <button type="button" role="tab"
                  class="evolution-tab ${tabSection === section ? "active" : ""}"
                  aria-selected="${tabSection === section}"
                  onclick="switchSectionEvolution('${tabSection}', this)">
            <span class="section-code">${getSectionIconSVG(tabSection)}</span>
            ${C2_EXAM_METADATA[tabSection].name}
          </button>
        `).join("")}
      </div>
      <div class="modal-body evolution-modal-body" id="section-evolution-content">
        ${renderSectionEvolutionContentHTML(section)}
      </div>
    </div>
  `;
  mountModal(modal);
}

function switchSectionEvolution(section, button) {
  if (!SECTION_ORDER.includes(section)) return;
  const modal = button?.closest(".evolution-modal");
  const content = modal?.querySelector("#section-evolution-content");
  if (!modal || !content) return;

  modal.querySelectorAll(".evolution-tab").forEach(tab => {
    const isActive = tab === button;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  content.innerHTML = renderSectionEvolutionContentHTML(section);
  content.scrollTop = 0;
}

function renderPartBreakdownHTML() {
  const partStats = getAllPartStats();

  return `
    <section class="dash-panel part-panel">
      <div class="panel-title">
        <span>Part breakdown</span>
        <small>where each paper is costing marks</small>
      </div>
      <div class="part-grid">
        ${SECTION_ORDER.map(section => {
          const sectionParts = partStats.filter(part => part.section === section);
          const weakestPart = getWeakestPart(section);

          return `
            <article class="part-section">
              <div class="part-section-head">
                <span class="section-code">${getSectionIconSVG(section)}</span>
                <div>
                  <strong>${C2_EXAM_METADATA[section].name}</strong>
                  <span>${weakestPart ? `Weakest: ${weakestPart.name}` : "No attempts yet"}</span>
                </div>
              </div>
              <div class="part-bars">
                ${sectionParts.map(part => {
                  const isWeakest = weakestPart && weakestPart.partKey === part.partKey;
                  const width = part.attempts > 0 ? Math.max(4, part.averagePct) : 0;

                  return `
                    <div class="part-bar ${isWeakest ? "weakest" : ""}">
                      <div class="part-bar-label">
                        <span>${part.name}</span>
                        <strong class="accuracy-value ${getAccuracyTone(part.averagePct)}">${part.attempts ? `${part.averagePct}%` : "--"}</strong>
                      </div>
                      <div class="meter">
                        <span style="width:${width}%"></span>
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

// ==========================================================================
// 2. OWNER ACCOUNT CONTROLLER
// ==========================================================================
function openProfileModal() {
  openProfileModalView();
}

function openProfileModalView() {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  const accountState = STATE.isAuthenticated
    ? "Supabase sync active"
    : "Local backup only";
  const accountDetail = STATE.isAuthenticated
    ? `Signed in as ${escapeHTML(STATE.supabaseUserEmail || "owner")}. New attempts are saved online.`
    : "Sign in with your Supabase account. Local attempts will be uploaded after sign in.";

  modal.innerHTML = `
    <div class="modal-content profile-modal">
      <div class="modal-header">
        <div>
          <span class="eyebrow">Owner account</span>
          <h3 class="modal-title">Aleetreny</h3>
        </div>
        <button class="modal-close" onclick="closeModal()" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="user-list">
          <div class="user-item-btn active">
            <span>${accountState}</span>
            <span>${getScoredHistory().length} scored · ${getPartialPracticeHistory().length} partial</span>
          </div>
        </div>

        <div class="new-profile-box">
          <label>${accountDetail}</label>
          ${STATE.isAuthenticated ? `
            <div class="new-profile-row">
              <button class="btn btn-secondary btn-full" onclick="logoutOwnerFromModal()">Sign out</button>
            </div>
          ` : `
            <div class="account-form">
              <input type="email" id="owner-email-input" placeholder="Email" autocomplete="email">
              <input type="password" id="owner-password-input" placeholder="Password" onkeydown="handleAccountPasswordKeydown(event)" autocomplete="current-password">
              <div class="new-profile-row">
                <button class="btn btn-primary" id="owner-login-btn" onclick="loginOwnerFromModal()">Sign in</button>
                <button class="btn btn-secondary" id="owner-signup-btn" onclick="signUpOwnerFromModal()">Create account</button>
              </div>
            </div>
          `}
        </div>
      </div>
    </div>
  `;

  mountModal(modal);
  const emailInput = document.getElementById("owner-email-input");
  if (emailInput) emailInput.focus();
}

function handleAccountPasswordKeydown(event) {
  if (event.key === "Enter") {
    loginOwnerFromModal();
  }
}

async function loginOwnerFromModal() {
  const emailInput = document.getElementById("owner-email-input");
  const passwordInput = document.getElementById("owner-password-input");
  const button = document.getElementById("owner-login-btn");
  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value : "";
  if (!email || !password) return;

  if (button) {
    button.disabled = true;
    button.textContent = "Signing in";
  }

  try {
    await signInWithSupabase(email, password);
    await hydrateRemoteHistory();
    closeModal();
    refreshCurrentView();
  } catch (error) {
    alert(error.message || "Could not sign in.");
    if (button) {
      button.disabled = false;
      button.textContent = "Sign in";
    }
  }
}

async function signUpOwnerFromModal() {
  const emailInput = document.getElementById("owner-email-input");
  const passwordInput = document.getElementById("owner-password-input");
  const button = document.getElementById("owner-signup-btn");
  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value : "";
  if (!email || !password) return;

  if (button) {
    button.disabled = true;
    button.textContent = "Creating";
  }

  try {
    const session = await signUpWithSupabase(email, password);
    if (session.access_token) {
      await hydrateRemoteHistory();
      closeModal();
      refreshCurrentView();
    } else {
      alert("Account created. Check your email to confirm it, then sign in.");
      if (button) {
        button.disabled = false;
        button.textContent = "Create account";
      }
    }
  } catch (error) {
    alert(error.message || "Could not create account.");
    if (button) {
      button.disabled = false;
      button.textContent = "Create account";
    }
  }
}

async function logoutOwnerFromModal() {
  clearSupabaseSession();
  STATE.syncStatus = "local";
  STATE.syncMessage = "Local backup";
  closeModal();
  refreshCurrentView();
}

function switchUserProfile() {
  closeModal();
}

function createUserProfile() {
  alert("This app is configured for one owner account.");
}

// ==========================================================================
// 3. DETAILED HISTORY DETAIL DIALOG
// ==========================================================================
function getWritingPartCriteria(item, partKey) {
  const criteria = getPlainObject(getPlainObject(item.gradedStates)[partKey]);
  return Object.keys(criteria).length > 0 ? criteria : null;
}

function getWritingCorrectionNotes(item = {}) {
  const answers = getPlainObject(item.answers);
  const meta = getPlainObject(answers.meta);
  return getPlainObject(meta.writingCorrectionNotes);
}

function getWritingPartScore(criteria) {
  if (!criteria) return null;
  return WRITING_CRITERIA.reduce((sum, criterion) => sum + (Number(criteria[criterion.key]) || 0), 0);
}

function getWritingAttemptMeta(item) {
  const answers = getPlainObject(item.answers);
  const meta = getPlainObject(answers.meta);
  const fallbackParts = ["part1", "part2"].filter(partKey => {
    const hasScore = !!getWritingPartCriteria(item, partKey);
    const hasText = typeof answers[partKey] === "string" && answers[partKey].trim().length > 0;
    return hasScore || hasText;
  });
  const assessedParts = Array.isArray(meta.assessedParts) && meta.assessedParts.length > 0
    ? meta.assessedParts
    : fallbackParts;
  const fallbackActualRaw = assessedParts.reduce((sum, partKey) => {
    const score = getWritingPartScore(getWritingPartCriteria(item, partKey));
    return sum + (score || 0);
  }, 0);
  const fallbackActualMax = assessedParts.filter(partKey => getWritingPartCriteria(item, partKey)).length * 20;

  return {
    assessedParts,
    actualRaw: Number(meta.actualRaw) || fallbackActualRaw,
    actualMax: Number(meta.actualMax) || fallbackActualMax || Number(item.total) || 40,
    equivalentRaw: Number(meta.equivalentRaw) || Number(item.correct) || 0
  };
}

function getHistoryRawSummaryText(item) {
  if (isPartialPracticeAttempt(item)) {
    const gradedCount = getAttemptedQuestionNumbers(item).length;
    return `${gradedCount} graded ${gradedCount === 1 ? "question" : "questions"} · not scored`;
  }
  if (item.section !== "writing") {
    return `${item.correct} / ${item.total} pts (${item.percentage}%)`;
  }

  const meta = getWritingAttemptMeta(item);
  const assessedSummary = `${meta.actualRaw} / ${meta.actualMax} assessed`;
  const equivalentSummary = `${meta.equivalentRaw} / 40 equivalent`;

  return meta.actualMax === 40
    ? `${equivalentSummary} (${item.percentage}%)`
    : `${assessedSummary} - ${equivalentSummary} (${item.percentage}%)`;
}

function renderHistoryWritingCriterionOptions(selectedValue) {
  return Array.from({ length: 6 }, (_, value) => `
    <option value="${value}" ${value === selectedValue ? "selected" : ""}>${value} / 5</option>
  `).join("");
}

function renderWritingHistoryPartHTML(item, partKey, editMode = false) {
  const answers = getPlainObject(item.answers);
  const criteria = getWritingPartCriteria(item, partKey);
  const score = getWritingPartScore(criteria);
  const responseText = typeof answers[partKey] === "string" ? answers[partKey].trim() : "";
  const correctionNotes = getWritingCorrectionNotes(item);
  const correctionText = typeof correctionNotes[partKey] === "string"
    ? correctionNotes[partKey].trim()
    : "";

  if (!criteria && !responseText && !correctionText) return "";

  const title = partKey === "part1"
    ? "Part 1 - Compulsory Essay"
    : `Part 2 - ${getWritingPart2TypeLabel(answers.part2Type)}`;
  const criteriaLine = criteria
    ? WRITING_CRITERIA.map(criterion => `${criterion.label}: ${Number(criteria[criterion.key]) || 0}/5`).join(" | ")
    : "Not scored";
  const scoreLabel = score === null ? "Not scored" : `${score}/20 pts`;
  const editorHTML = editMode ? `
    <div data-history-writing-part="${partKey}">
      <div class="history-writing-edit-grid">
        ${WRITING_CRITERIA.map(criterion => {
          const selectedValue = Number(criteria?.[criterion.key]) || 0;
          return `
            <label>
              <span>${criterion.label}</span>
              <select data-history-writing-criterion="${criterion.key}" onchange="updateHistoryReviewPreview()">
                ${renderHistoryWritingCriterionOptions(selectedValue)}
              </select>
            </label>
          `;
        }).join("")}
      </div>
      <label class="history-writing-correction-editor">
        <span>Correction feedback</span>
        <textarea data-history-writing-correction="${partKey}" aria-label="${title} correction feedback"
                  placeholder="Add corrections, recurring errors and advice for this task...">${escapeHTML(correctionText)}</textarea>
      </label>
    </div>
  ` : `<div class="history-writing-criteria">${criteriaLine}</div>`;

  return `
    <div class="history-writing-part">
      <h4>${title} <span>${scoreLabel}</span></h4>
      ${editorHTML}
      <div class="history-writing-response">${responseText ? escapeHTML(responseText) : "No text saved"}</div>
      ${!editMode && correctionText ? `
        <div class="history-writing-correction">
          <strong>Correction feedback</strong>
          <div class="history-writing-markdown">${renderWritingFeedbackMarkdown(correctionText)}</div>
        </div>
      ` : ""}
    </div>
  `;
}

function renderHistoryGradeEditorHTML(q, partData, gradeState) {
  if (partData.type === "partial") {
    return `
      <div class="history-grade-edit-controls" id="history-grade-control-${q}"
           data-question="${q}" data-type="partial" data-weight="${partData.weight}" data-value="${gradeState}">
        ${[0, 1, 2].map(points => `
          <button type="button" class="points-btn ${gradeState === points ? `active-${points}` : ""}"
                  id="history-grade-${q}-${points}" onclick="setHistoryReviewGrade(${q}, ${points})">
            ${points} ${points === 1 ? "pt" : "pts"}
          </button>
        `).join("")}
      </div>
    `;
  }

  return `
    <div class="history-grade-edit-controls" id="history-grade-control-${q}"
         data-question="${q}" data-type="binary" data-weight="${partData.weight}" data-value="${gradeState}">
      <button type="button" class="correct-btn ${gradeState === "correct" ? "active" : ""}"
              id="history-grade-${q}-correct" onclick="setHistoryReviewGrade(${q}, 'correct')">Correct</button>
      <button type="button" class="incorrect-btn ${gradeState === "incorrect" ? "active" : ""}"
              id="history-grade-${q}-incorrect" onclick="setHistoryReviewGrade(${q}, 'incorrect')">Missed</button>
    </div>
  `;
}

function renderHistoryErrorNoteEditorHTML(item, q, partKey) {
  if (!isTrackedErrorPart(item.section, partKey)) return "";

  const note = getErrorNotes(item)[q] || "";
  const correctAnswer = C2_STUDY_REVIEW.normalizeCorrectAnswer(getCorrectAnswers(item)[q]);

  return `
    <div class="history-error-note-editor" id="history-error-note-editor-${q}">
      <label for="history-correct-answer-${q}">Correct answer</label>
      <input id="history-correct-answer-${q}" value="${escapeHTML(correctAnswer)}"
             oninput="normalizeCorrectAnswerInput(this)"
             autocapitalize="characters" spellcheck="false"
             placeholder="Only the correct answer, without explanation">
      <label for="history-error-note-${q}">Notes and observations (optional)</label>
      <textarea id="history-error-note-${q}" rows="2"
                placeholder="Rule, nuance, explanation or reminder.">${escapeHTML(note)}</textarea>
    </div>
  `;
}

function renderPartReferenceTextEditorHTML(section, partKey, value = "", context = "sheet") {
  const partData = C2_EXAM_METADATA[section]?.parts?.[partKey];
  if (!partData) return "";

  const isSheetEditor = context === "sheet";
  const inputId = isSheetEditor ? `part-reference-text-${section}-${partKey}` : `history-part-text-${partKey}`;
  const inputHandler = isSheetEditor
    ? `oninput="storePartReferenceText('${section}', '${partKey}', this.value)"`
    : "";
  const helperText = isSheetEditor
    ? "Optional - saved with this attempt for future review"
    : "One text for this part and attempt - shared by every noted answer in the part";

  return `
    <div class="ue-part-text-editor ${isSheetEditor ? "sheet-part-text-editor" : "history-part-text-editor"}">
      <label for="${inputId}">
        <span>${getUseOfEnglishPartShortLabel(partKey)} reference text</span>
        <small>${helperText}</small>
      </label>
      <textarea id="${inputId}" rows="6" ${inputHandler}
                placeholder="Paste the full text, sentences or task for ${partData.name} here...">${escapeHTML(value)}</textarea>
    </div>
  `;
}

function setHistoryReviewGrade(qNum, value) {
  const control = document.getElementById(`history-grade-control-${qNum}`);
  if (!control) return;

  const isPartial = control.dataset.type === "partial";
  const normalizedValue = isPartial ? Number(value) : value;
  control.dataset.value = String(normalizedValue);

  control.querySelectorAll("button").forEach(button => {
    button.classList.remove("active", "active-0", "active-1", "active-2");
  });

  const activeButton = document.getElementById(`history-grade-${qNum}-${normalizedValue}`);
  if (activeButton) {
    activeButton.classList.add(isPartial ? `active-${normalizedValue}` : "active");
  }

  updateHistoryReviewPreview();
}

function getHistoryObjectiveEditSnapshot(section) {
  const sectionMeta = C2_EXAM_METADATA[section];
  const gradedStates = {};
  let rawScore = 0;

  document.querySelectorAll("[data-question][data-type]").forEach(control => {
    const q = Number(control.dataset.question);
    const weight = Number(control.dataset.weight) || 1;
    const value = control.dataset.type === "partial"
      ? Number(control.dataset.value)
      : control.dataset.value;
    gradedStates[q] = value;
    rawScore += control.dataset.type === "partial" ? value : value === "correct" ? weight : 0;
  });

  const total = sectionMeta.maxMarks;
  return {
    gradedStates,
    rawScore,
    total,
    percentage: Math.round((rawScore / total) * 100),
    scaleScore: calculateScaleScore(section, rawScore)
  };
}

function getHistoryWritingEditSnapshot() {
  const partScores = {};
  const correctionNotes = {};

  document.querySelectorAll("[data-history-writing-part]").forEach(partElement => {
    const partKey = partElement.dataset.historyWritingPart;
    const criteria = {};
    WRITING_CRITERIA.forEach(criterion => {
      const select = partElement.querySelector(`[data-history-writing-criterion="${criterion.key}"]`);
      criteria[criterion.key] = Math.max(0, Math.min(5, Number(select?.value) || 0));
    });
    partScores[partKey] = criteria;

    const correctionText = partElement.querySelector(`[data-history-writing-correction="${partKey}"]`)?.value.trim() || "";
    if (correctionText) correctionNotes[partKey] = correctionText;
  });

  const partKeys = Object.keys(partScores);
  const actualRaw = partKeys.reduce((sum, partKey) => {
    return sum + WRITING_CRITERIA.reduce((partSum, criterion) => partSum + partScores[partKey][criterion.key], 0);
  }, 0);
  const actualMax = partKeys.length * 20;
  const equivalentRaw = getWritingEquivalentRawScore(actualRaw, actualMax);
  const percentage = Math.round((equivalentRaw / 40) * 100);

  return {
    partKeys,
    partScores,
    correctionNotes,
    actualRaw,
    actualMax,
    equivalentRaw,
    percentage,
    scaleScore: calculateScaleScore("writing", equivalentRaw)
  };
}

function updateHistoryReviewPreview() {
  const modal = document.querySelector(".history-review-modal");
  const scaleElement = document.getElementById("history-review-scale");
  const rawElement = document.getElementById("history-review-raw");
  if (!modal || !scaleElement || !rawElement) return;

  const section = modal.dataset.historySection;
  if (modal.dataset.historyPartial === "true") {
    const snapshot = getHistoryObjectiveEditSnapshot(section);
    const gradedCount = Object.keys(snapshot.gradedStates).length;
    scaleElement.textContent = "Partial practice";
    rawElement.textContent = `${gradedCount} graded ${gradedCount === 1 ? "question" : "questions"} · not scored`;
    return;
  }
  if (section === "writing") {
    const snapshot = getHistoryWritingEditSnapshot();
    scaleElement.innerHTML = `${snapshot.scaleScore} pts <span>(${getCambridgeGrade(snapshot.scaleScore)})</span>`;
    rawElement.textContent = snapshot.actualMax === 40
      ? `${snapshot.equivalentRaw} / 40 equivalent (${snapshot.percentage}%)`
      : `${snapshot.actualRaw} / ${snapshot.actualMax} assessed - ${snapshot.equivalentRaw} / 40 equivalent (${snapshot.percentage}%)`;
    return;
  }

  const snapshot = getHistoryObjectiveEditSnapshot(section);
  scaleElement.innerHTML = `${snapshot.scaleScore} pts <span>(${getCambridgeGrade(snapshot.scaleScore)})</span>`;
  rawElement.textContent = `${snapshot.rawScore} / ${snapshot.total} pts (${snapshot.percentage}%)`;
}

function reopenHistoryDetailModal(sessionId, editMode) {
  closeModal();
  openHistoryDetailModal(sessionId, editMode);
}

async function saveHistoryReviewEdits(sessionId) {
  const item = STATE.history.find(historyItem => historyItem.id === sessionId);
  if (!item) return;

  const saveButton = document.getElementById("history-review-save");
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
  }

  if (item.section === "writing") {
    const snapshot = getHistoryWritingEditSnapshot();
    const answers = { ...getPlainObject(item.answers) };
    const meta = {
      ...getPlainObject(answers.meta),
      assessedParts: snapshot.partKeys,
      actualRaw: snapshot.actualRaw,
      actualMax: snapshot.actualMax,
      equivalentRaw: snapshot.equivalentRaw,
      scaleBasis: "normalised-to-40"
    };

    if (Object.keys(snapshot.correctionNotes).length > 0) {
      meta.writingCorrectionNotes = snapshot.correctionNotes;
    } else {
      delete meta.writingCorrectionNotes;
    }

    answers.meta = meta;

    item.gradedStates = snapshot.partScores;
    item.answers = answers;
    item.correct = snapshot.equivalentRaw;
    item.total = 40;
    item.percentage = snapshot.percentage;
    item.scaleScore = snapshot.scaleScore;
  } else {
    const snapshot = getHistoryObjectiveEditSnapshot(item.section);
    const isPartial = isPartialPracticeAttempt(item);
    item.gradedStates = snapshot.gradedStates;
    item.correct = isPartial ? 0 : snapshot.rawScore;
    item.total = isPartial ? 0 : snapshot.total;
    item.percentage = isPartial ? 0 : snapshot.percentage;
    item.scaleScore = isPartial ? 0 : snapshot.scaleScore;

    if (item.section === "useOfEnglish" || item.section === "reading") {
      const answers = { ...getPlainObject(item.answers) };
      const meta = { ...getPlainObject(answers.meta) };
      const errorNotes = {};
      const correctAnswers = {};
      const partTexts = {};
      const sectionParts = C2_EXAM_METADATA[item.section].parts;

      if (isPartial) {
        meta.attemptType = C2_ATTEMPT_DATA.PARTIAL_PRACTICE_TYPE;
        meta.gradedQuestions = Object.keys(snapshot.gradedStates).map(Number).sort((a, b) => a - b);
        meta.attemptedParts = Object.entries(sectionParts)
          .filter(([, partData]) => meta.gradedQuestions.some(q => q >= partData.startQ && q <= partData.endQ))
          .map(([partKey]) => partKey);
        delete meta.durationSeconds;
      }

      Object.entries(sectionParts).forEach(([partKey, partData]) => {
        if (!isTrackedErrorPart(item.section, partKey)) return;
        for (let q = partData.startQ; q <= partData.endQ; q++) {
          const correctAnswer = C2_STUDY_REVIEW.normalizeCorrectAnswer(document.getElementById(`history-correct-answer-${q}`)?.value);
          const note = document.getElementById(`history-error-note-${q}`)?.value.trim() || "";
          if (correctAnswer) correctAnswers[q] = correctAnswer;
          if (note) errorNotes[q] = note;
        }

        const partText = document.getElementById(`history-part-text-${partKey}`)?.value.trim() || "";
        if (partText) partTexts[partKey] = partText;
      });

      if (Object.keys(errorNotes).length > 0) {
        meta.errorNotes = errorNotes;
      } else {
        delete meta.errorNotes;
      }

      if (Object.keys(correctAnswers).length > 0) {
        meta.correctAnswers = correctAnswers;
      } else {
        delete meta.correctAnswers;
      }
      meta.studyDataVersion = C2_STUDY_REVIEW.STUDY_DATA_VERSION;

      if (item.section === "reading") {
        if (Object.keys(partTexts).length > 0) {
          meta.readingPartTexts = partTexts;
        } else {
          delete meta.readingPartTexts;
        }
        delete meta.questionTexts;
      }

      if (item.section === "useOfEnglish") {
        if (Object.keys(partTexts).length > 0) {
          meta.useOfEnglishPartTexts = partTexts;
        } else {
          delete meta.useOfEnglishPartTexts;
        }
      }

      answers.meta = meta;
      item.answers = answers;
    }
  }

  await persistHistory({ mode: "merge" });
  closeAllModals();
  refreshCurrentView();
  openHistoryDetailModal(sessionId);
}

function openHistoryDetailModal(sessionId, editMode = false) {
  const item = STATE.history.find(h => h.id === sessionId);
  if (!item) return;

  document.querySelectorAll(".history-review-modal").forEach(existingModal => {
    existingModal.closest(".modal-overlay")?.remove();
  });

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  
  const dateFormatted = new Date(item.date).toLocaleString();
  const sectionMeta = C2_EXAM_METADATA[item.section];
  const isPartialPractice = isPartialPracticeAttempt(item);
  const attemptedQuestions = new Set(isPartialPractice ? getAttemptedQuestionNumbers(item) : []);
  const durationText = formatAttemptDuration(getAttemptDurationSeconds(item));
  
  let sheetHTML = "";
  if (item.section === "writing") {
    sheetHTML = `
      <div style="display:flex; flex-direction:column; gap:1rem;">
        ${["part1", "part2"].map(partKey => renderWritingHistoryPartHTML(item, partKey, editMode)).join("")}
      </div>
    `;
  } else {
    // Generate answers breakdown grid
    let questionsHTML = "";
    
    for (const [partKey, partData] of Object.entries(sectionMeta.parts)) {
      if (isPartialPractice) {
        const partWasAttempted = [...attemptedQuestions].some(q => q >= partData.startQ && q <= partData.endQ);
        if (!partWasAttempted) continue;
      }
      let rowsHTML = "";
      
      for (let q = partData.startQ; q <= partData.endQ; q++) {
        if (isPartialPractice && !attemptedQuestions.has(q)) continue;
        const uAns = escapeHTML(getPlainObject(item.answers)[q] || "--");
        const gradeState = item.gradedStates[q];
        const isError = isTrackedErrorPart(item.section, partKey) && isObjectiveError(partData, gradeState);
        const errorNote = isTrackedErrorPart(item.section, partKey) ? (getErrorNotes(item)[q] || "").trim() : "";
        const correctAnswer = isTrackedErrorPart(item.section, partKey) ? (getCorrectAnswers(item)[q] || "").trim() : "";
        
        let gradeLabel = "";
        if (editMode) {
          gradeLabel = renderHistoryGradeEditorHTML(q, partData, gradeState);
        } else if (partData.type === "partial") {
          const ptClass = gradeState === 2 ? 'color:var(--color-success)' : 'color:var(--color-error)';
          gradeLabel = `<span style="font-weight:700; ${ptClass}; font-size:0.85rem;">[${gradeState}/2 pts]</span>`;
        } else {
          gradeLabel = gradeState === "correct" ?
            `<span style="color:var(--color-success); font-weight:bold;">Correct</span>` :
            `<span style="color:var(--color-error); font-weight:bold;">Missed</span>`;
        }

        rowsHTML += `
          <div class="history-question-row">
            <div class="history-question-main">
              <span><b>Q.${q}</b>: <span style="font-family:monospace; font-weight:700; text-transform:uppercase;">${uAns}</span></span>
              <span>${gradeLabel}</span>
            </div>
            ${editMode
              ? renderHistoryErrorNoteEditorHTML(item, q, partKey)
              : `${isError && correctAnswer ? `<div class="history-correct-answer"><strong>Correct answer</strong>${escapeHTML(correctAnswer)}</div>` : ""}
                 ${errorNote ? `<div class="history-error-note ${isError ? "" : "noted-correct"}"><strong>Notes</strong>${escapeHTML(errorNote)}</div>` : ""}`}
            ${!editMode && (isError || errorNote) ? `
              <button class="history-question-text-button" onclick="showPartReferenceText('${escapeJS(item.id)}', '${item.section}', '${partKey}', 'history-review-part-text-panel')">
                View ${getUseOfEnglishPartShortLabel(partKey)} text
              </button>
            ` : ""}
          </div>
        `;
      }

      questionsHTML += `
        <div class="history-part-card">
          <div class="history-part-card-headline">
            <h4>${partData.name}</h4>
            ${isTrackedErrorPart(item.section, partKey) && !editMode ? `
              <button class="history-part-text-button" onclick="showPartReferenceText('${escapeJS(item.id)}', '${item.section}', '${partKey}', 'history-review-part-text-panel')">View part text</button>
            ` : ""}
          </div>
          ${isTrackedErrorPart(item.section, partKey) && editMode
            ? renderPartReferenceTextEditorHTML(item.section, partKey, getPartReferenceTexts(item)[partKey] || "", "history")
            : ""}
          ${rowsHTML}
        </div>
      `;
    }
    sheetHTML = questionsHTML;
  }

  const reviewSheetHTML = (item.section === "useOfEnglish" || item.section === "reading") && !editMode ? `
    <div class="ue-text-workspace history-review-workspace">
      <div>${sheetHTML}</div>
      <aside class="ue-part-text-panel history-review-part-text-panel" id="history-review-part-text-panel" hidden aria-live="polite"></aside>
    </div>
  ` : sheetHTML;

  const reviewMaxWidth = item.section === "writing"
    ? editMode ? "980px" : "920px"
    : editMode ? "760px" : "600px";

  modal.innerHTML = `
    <div class="modal-content history-review-modal ${editMode ? "editing" : ""}"
         data-history-section="${item.section}" data-history-partial="${isPartialPractice}" style="width: min(${reviewMaxWidth}, 100%); max-width: ${reviewMaxWidth}; max-height: 90vh;">
      <div class="modal-header">
        <div>
          <h3 class="modal-title">Review: ${sectionMeta.name}</h3>
          ${editMode ? `<span class="history-review-mode">Editing corrections</span>` : ""}
        </div>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-body ${item.section === "useOfEnglish" && !editMode ? "history-review-scroll-body" : ""}">
        <div class="history-review-summary">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">${isPartialPractice ? "Practice type" : "Scale score"}</div>
            <div id="history-review-scale" class="history-review-scale">${isPartialPractice ? "Partial practice" : `${item.scaleScore} pts <span>(${getCambridgeGrade(item.scaleScore)})</span>`}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">${isPartialPractice ? "Scope" : "Raw marks"}</div>
            <div id="history-review-raw" class="history-review-raw">${isPartialPractice ? escapeHTML(getPartialPracticeScopeLabel(item)) : getHistoryRawSummaryText(item)}</div>
          </div>
        </div>

        ${isPartialPractice ? `<div class="history-partial-notice">No score or time was recorded. This review does not affect any progress metric.</div>` : ""}

        <div class="history-review-saved">
          Saved: <b>${dateFormatted}</b>${durationText ? ` - Time: <b>${durationText}</b>` : ""}
        </div>

        ${editMode ? `<div class="history-review-edit-notice">${isPartialPractice ? "Change the saved correction below. This practice remains unscored and excluded from metrics." : "Change the correction below. Scores and scale are recalculated automatically; original answers stay unchanged."}</div>` : ""}
        
        ${reviewSheetHTML}
      </div>
      <div class="history-review-actions">
        ${editMode ? `
          <button class="btn btn-secondary" onclick="reopenHistoryDetailModal('${escapeJS(item.id)}', false)">Cancel</button>
          <button class="btn btn-primary" id="history-review-save" onclick="saveHistoryReviewEdits('${escapeJS(item.id)}')">Save changes</button>
        ` : `
          <button class="btn history-review-delete" onclick="deleteHistoryItemFromReview('${escapeJS(item.id)}')">Delete this attempt</button>
          <button class="btn btn-secondary" onclick="reopenHistoryDetailModal('${escapeJS(item.id)}', true)">Edit corrections</button>
          <button class="btn btn-primary" onclick="closeModal()">Close</button>
        `}
      </div>
    </div>
  `;
  mountModal(modal);
}

// ==========================================================================
// 4. ANSWER SHEET TEMPLATE CONTROLLER
// ==========================================================================
function openAnswerSheet(section) {
  STATE.currentView = "sheet";
  STATE.activeSection = section;
  STATE.answers = {};
  STATE.gradedStates = {};
  STATE.correctAnswers = {};
  STATE.errorNotes = {};
  STATE.useOfEnglishPartTexts = {};
  STATE.readingPartTexts = {};
  STATE.isCorrecting = false;
  STATE.isSavingAttempt = false;
  resetPracticeTimer();
  
  renderAnswerSheetHTML();
}

function renderAnswerSheetHTML() {
  const appContainer = document.getElementById("app-container");
  const sectionMeta = C2_EXAM_METADATA[STATE.activeSection];
  
  let sheetContent = "";
  
  if (STATE.activeSection === "writing") {
    sheetContent = `
      <div class="sheet-notice">
        Paste both writing tasks, check the word count, then score each criterion.
      </div>
      
      <!-- PART 1 WRITING -->
      <div style="background-color:#fafafa; border:1px solid var(--border-color); border-radius:8px; padding:1.25rem; margin-bottom:1.5rem;">
        <h3 style="font-size:1rem; font-weight:700; margin-bottom:0.75rem; color:var(--accent-color);">Writing Part 1: Compulsory Essay (240 - 280 words)</h3>
        <textarea class="writing-sheet-textarea" id="writing-textarea-part1" placeholder="Write your essay here..." oninput="trackSectionWritingWordCount('part1', this.value); updateWritingAssessmentPrompt()" style="height:180px;"></textarea>
        <div class="writing-word-badge under" id="writing-count-part1" style="margin-top:0.5rem;">0 words</div>
      </div>

      <!-- PART 2 WRITING -->
      <div style="background-color:#fafafa; border:1px solid var(--border-color); border-radius:8px; padding:1.25rem; margin-bottom:1.5rem;">
        <div class="writing-part2-head">
          <h3 style="font-size:1rem; font-weight:700; color:var(--accent-color);">Writing Part 2: Optional Writing (280 - 320 words)</h3>
          <label class="writing-type-control">
            <span>Text type</span>
            <select id="writing-part2-type" onchange="storeWritingPart2Type(this.value); updateWritingAssessmentPrompt()">
              ${getWritingPart2TypeOptionsHTML()}
            </select>
          </label>
        </div>
        <textarea class="writing-sheet-textarea" id="writing-textarea-part2" placeholder="Write your article/report/review/email here..." oninput="trackSectionWritingWordCount('part2', this.value); updateWritingAssessmentPrompt()" style="height:180px;"></textarea>
        <div class="writing-word-badge under" id="writing-count-part2" style="margin-top:0.5rem;">0 words</div>
      </div>

      ${renderWritingPromptPanelHTML()}
      
      <div id="writing-grading-area"></div>
    `;
  } else {
    const partialPracticeHint = STATE.activeSection === "useOfEnglish"
      ? "You can also complete one or more individual parts. An incomplete paper is saved as unscored partial practice."
      : STATE.activeSection === "reading"
        ? "You can also complete Reading Part 1 on its own. It will be saved as unscored partial practice."
        : "";
    sheetContent = `
      <div class="sheet-notice">
        <strong>Enter, lock and grade.</strong> ${partialPracticeHint || "Complete the whole paper to save a scored attempt."}
      </div>
      
      <div class="sheet-questions-list">
        ${renderSectionPartsHTML(sectionMeta)}
      </div>
    `;
  }

  appContainer.innerHTML = `
    <div class="sheet-view">
      <div class="sheet-container ${STATE.activeSection === "listening" ? "sheet-container-wide" : ""}">
        <div class="sheet-header">
          <div class="sheet-title">
            <h2>Mock: ${sectionMeta.name}</h2>
            <p>${sectionMeta.description}</p>
          </div>
          <div class="sheet-header-actions">
            ${renderPracticeTimerHTML()}
            ${STATE.activeSection === "writing" ? `<button class="btn btn-secondary writing-toolkit-trigger" onclick="openWritingToolkit()">Writing toolkit</button>` : ""}
            <button class="btn btn-secondary" onclick="renderHome()">Back</button>
          </div>
        </div>

        ${sheetContent}

        <div style="border-top:1px solid var(--border-color); padding-top:1.5rem; display:flex; justify-content:space-between; align-items:center;">
          <button class="btn btn-danger-link" onclick="clearSheetInputs()">Clear</button>
          <button class="btn btn-primary" id="sheet-submit-btn" onclick="lockAnswersAndStartCorrection()">
            Grade
          </button>
        </div>
      </div>
    </div>
  `;

  updatePracticeTimerDisplay();
  if (STATE.activeSection === "writing") {
    updateWritingAssessmentPrompt();
  }
}

function renderSectionPartsHTML(sectionMeta) {
  let sectionHTML = "";
  
  for (const [partKey, partData] of Object.entries(sectionMeta.parts)) {
    if (STATE.activeSection === "listening" && partKey === "part4") {
      sectionHTML += renderListeningPart4HTML(partData);
      continue;
    }

    let rowsHTML = "";
    
    for (let q = partData.startQ; q <= partData.endQ; q++) {
      rowsHTML += renderSheetQuestionRowHTML(q, partData);
    }

    sectionHTML += `
      <div class="sheet-part-card" id="sheet-part-${partKey}">
        <h3 class="sheet-part-title">${partData.name}</h3>
        <div id="part-text-area-${partKey}"></div>
        <div style="display:flex; flex-direction:column;">
          ${rowsHTML}
        </div>
      </div>
    `;
  }

  return sectionHTML;
}

function renderSheetQuestionInputHTML(q, partData) {
  const answeredVal = STATE.answers[q] || "";

  if (partData.type === "mcq") {
    return `
      <div class="sheet-radio-group">
        ${partData.options.map(opt => `
          <label class="sheet-radio-label">
            <input type="radio" name="sheet-q-${q}" class="sheet-radio-input" value="${opt}"
                   ${answeredVal === opt ? 'checked' : ''} onchange="storeInputAnswer(${q}, this.value)">
            ${opt}
          </label>
        `).join('')}
      </div>
    `;
  }

  if (partData.type === "dropdown") {
    return `
      <select class="sheet-select-input" onchange="storeInputAnswer(${q}, this.value)">
        <option value="">Select...</option>
        ${partData.options.map(opt => `
          <option value="${opt}" ${answeredVal === opt ? 'selected' : ''}>Option ${opt}</option>
        `).join('')}
      </select>
    `;
  }

  const isTransformation = STATE.activeSection === "useOfEnglish" && partData.type === "partial";
  return `
    <input type="text" class="sheet-text-input ${isTransformation ? "sheet-text-input-long" : ""}"
           value="${escapeHTML(answeredVal)}" maxlength="${isTransformation ? 160 : 80}"
           oninput="storeInputAnswer(${q}, this.value)" placeholder="${isTransformation ? "Enter the full phrase..." : "Enter answer..."}">
  `;
}

function renderSheetQuestionRowHTML(q, partData, extraClass = "") {
  const weightHint = partData.weight > 1 ? `<span style="font-size:0.7rem; color:var(--text-muted); font-weight:normal; margin-left:0.25rem;">(${partData.weight} marks)</span>` : "";

  return `
    <div class="sheet-row ${extraClass}" id="sheet-row-${q}" style="border:none; border-bottom:1px solid #f3f4f6; border-radius:0; padding:0.6rem 0.5rem;">
      <div class="sheet-row-main">
        <div class="sheet-q-num">Q.${q} ${weightHint}</div>
        <div style="flex-grow:1; display:flex; justify-content:flex-start;">
          ${renderSheetQuestionInputHTML(q, partData)}
        </div>
        <div id="correction-controls-${q}"></div>
      </div>
      <div id="error-note-area-${q}"></div>
    </div>
  `;
}

function renderListeningPart4HTML(partData) {
  const task1Rows = [];
  const task2Rows = [];
  const midpoint = partData.startQ + Math.floor((partData.endQ - partData.startQ + 1) / 2) - 1;

  for (let q = partData.startQ; q <= partData.endQ; q++) {
    const row = renderSheetQuestionRowHTML(q, partData, "listening-part4-row");
    if (q <= midpoint) {
      task1Rows.push(row);
    } else {
      task2Rows.push(row);
    }
  }

  return `
    <div class="sheet-part-card listening-part4-card">
      <h3 class="sheet-part-title">${partData.name}</h3>
      <div class="listening-part4-grid">
        <section class="listening-task-column" aria-label="Listening Part 4 Task 1">
          <div class="listening-task-header">
            <span>Task 1</span>
            <small>Questions ${partData.startQ}-${midpoint}</small>
          </div>
          <div class="listening-task-rows">
            ${task1Rows.join("")}
          </div>
        </section>
        <section class="listening-task-column" aria-label="Listening Part 4 Task 2">
          <div class="listening-task-header">
            <span>Task 2</span>
            <small>Questions ${midpoint + 1}-${partData.endQ}</small>
          </div>
          <div class="listening-task-rows">
            ${task2Rows.join("")}
          </div>
        </section>
      </div>
    </div>
  `;
}

function clearSheetInputs() {
  if (confirm("Reset all answers on the current sheet?")) {
    STATE.answers = {};
    STATE.gradedStates = {};
    STATE.correctAnswers = {};
    STATE.errorNotes = {};
    STATE.useOfEnglishPartTexts = {};
    STATE.readingPartTexts = {};
    STATE.isCorrecting = false;
    renderAnswerSheetHTML();
  }
}

// LOCK INPUTS AND OPEN TOGGLES
function lockAnswersAndStartCorrection() {
  const sectionMeta = C2_EXAM_METADATA[STATE.activeSection];
  
  if (STATE.activeSection === "writing") {
    setupWritingGradingArea();
    return;
  }

  document.querySelectorAll("input.sheet-text-input").forEach(i => i.disabled = true);
  document.querySelectorAll("input.sheet-radio-input").forEach(i => i.disabled = true);
  document.querySelectorAll("select.sheet-select-input").forEach(i => i.disabled = true);
  
  STATE.isCorrecting = true;

  const answeredPartKeys = C2_ATTEMPT_DATA.getAnsweredPartKeys(sectionMeta, STATE.answers);
  const isFocusedUseOfEnglish = STATE.activeSection === "useOfEnglish"
    && answeredPartKeys.length > 0
    && answeredPartKeys.length < Object.keys(sectionMeta.parts).length;
  const isFocusedReadingPart1 = STATE.activeSection === "reading"
    && answeredPartKeys.length === 1
    && answeredPartKeys[0] === "part1";
  const focusedPartKeys = isFocusedUseOfEnglish || isFocusedReadingPart1
    ? new Set(answeredPartKeys)
    : null;

  if (focusedPartKeys) {
    Object.keys(sectionMeta.parts).forEach(partKey => {
      const partCard = document.getElementById(`sheet-part-${partKey}`);
      if (partCard) partCard.hidden = !focusedPartKeys.has(partKey);
    });
    const notice = document.querySelector(".sheet-notice");
    if (notice) {
      notice.innerHTML = `<strong>Partial correction: ${answeredPartKeys.map(getUseOfEnglishPartShortLabel).join(" · ")}.</strong> Grade the visible questions and paste their reference text. This save will not affect scores, attempts or time metrics.`;
    }
  }

  if (STATE.activeSection === "useOfEnglish" || STATE.activeSection === "reading") {
    Object.keys(sectionMeta.parts).filter(partKey => {
      return isTrackedErrorPart(STATE.activeSection, partKey) && (!focusedPartKeys || focusedPartKeys.has(partKey));
    }).forEach(partKey => {
      const partTextArea = document.getElementById(`part-text-area-${partKey}`);
      if (partTextArea) {
        const storedTexts = STATE.activeSection === "useOfEnglish"
          ? STATE.useOfEnglishPartTexts
          : STATE.readingPartTexts;
        partTextArea.innerHTML = renderPartReferenceTextEditorHTML(
          STATE.activeSection,
          partKey,
          storedTexts[partKey] || "",
          "sheet"
        );
      }
    });
  }
  
  for (const [partKey, partData] of Object.entries(sectionMeta.parts)) {
    if (focusedPartKeys && !focusedPartKeys.has(partKey)) continue;
    for (let q = partData.startQ; q <= partData.endQ; q++) {
      const controls = document.getElementById(`correction-controls-${q}`);
      
      if (partData.type === "partial") {
        controls.innerHTML = `
          <div class="points-btn-group">
            <button class="points-btn" id="pts-btn-${q}-0" onclick="markPartialGrade(${q}, 0)">0 pts</button>
            <button class="points-btn" id="pts-btn-${q}-1" onclick="markPartialGrade(${q}, 1)">1 pt</button>
            <button class="points-btn" id="pts-btn-${q}-2" onclick="markPartialGrade(${q}, 2)">2 pts</button>
          </div>
        `;
      } else {
        controls.innerHTML = `
          <div class="correction-controls-box">
            <button class="correct-btn" id="correct-btn-${q}" onclick="markBinaryGrade(${q}, 'correct')">Correct</button>
            <button class="incorrect-btn" id="incorrect-btn-${q}" onclick="markBinaryGrade(${q}, 'incorrect')">Missed</button>
          </div>
        `;
      }
    }
  }
  
  const mainBtn = document.getElementById("sheet-submit-btn");
  mainBtn.textContent = "Save result";
  mainBtn.setAttribute("onclick", "saveGradedSheetResult()");
}

function markBinaryGrade(qNum, state) {
  STATE.gradedStates[qNum] = state;
  seedCorrectAnswerFromFullCredit(qNum, state === "correct");
  
  const cBtn = document.getElementById(`correct-btn-${qNum}`);
  const iBtn = document.getElementById(`incorrect-btn-${qNum}`);
  
  if (state === "correct") {
    cBtn.classList.add("active");
    iBtn.classList.remove("active");
  } else {
    iBtn.classList.add("active");
    cBtn.classList.remove("active");
  }

  updateErrorNoteArea(qNum);
}

function markPartialGrade(qNum, pts) {
  STATE.gradedStates[qNum] = pts;
  seedCorrectAnswerFromFullCredit(qNum, pts === 2);
  
  const btn0 = document.getElementById(`pts-btn-${qNum}-0`);
  const btn1 = document.getElementById(`pts-btn-${qNum}-1`);
  const btn2 = document.getElementById(`pts-btn-${qNum}-2`);
  
  btn0.className = "points-btn";
  btn1.className = "points-btn";
  btn2.className = "points-btn";
  
  const activeBtn = document.getElementById(`pts-btn-${qNum}-${pts}`);
  activeBtn.classList.add(`active-${pts}`);

  updateErrorNoteArea(qNum);
}

function seedCorrectAnswerFromFullCredit(qNum, hasFullCredit) {
  const submittedAnswer = C2_STUDY_REVIEW.normalizeCorrectAnswer(STATE.answers[qNum]);
  const currentCorrectAnswer = C2_STUDY_REVIEW.normalizeCorrectAnswer(STATE.correctAnswers[qNum]);

  if (hasFullCredit && !currentCorrectAnswer && submittedAnswer) {
    STATE.correctAnswers[qNum] = submittedAnswer;
  } else if (!hasFullCredit && currentCorrectAnswer === submittedAnswer) {
    delete STATE.correctAnswers[qNum];
  }
}

function updateErrorNoteArea(qNum) {
  const noteArea = document.getElementById(`error-note-area-${qNum}`);
  if (!noteArea) return;

  const partEntry = getPartEntryForQuestion(STATE.activeSection, qNum);
  const partKey = partEntry?.[0];
  const partData = partEntry?.[1];
  const shouldShow = isTrackedErrorPart(STATE.activeSection, partKey)
    && hasObjectiveGrade(partData, STATE.gradedStates[qNum]);

  if (!shouldShow) {
    noteArea.innerHTML = "";
    return;
  }

  noteArea.innerHTML = `
    <div class="sheet-error-note-box">
      <label for="correct-answer-${qNum}">Correct answer</label>
      <input class="sheet-correct-answer-input" id="correct-answer-${qNum}"
             value="${escapeHTML(C2_STUDY_REVIEW.normalizeCorrectAnswer(STATE.correctAnswers[qNum]))}"
             oninput="storeCorrectAnswer(${qNum}, this)"
             autocapitalize="characters" spellcheck="false"
             placeholder="Only the correct answer, without explanation">
      <label for="error-note-${qNum}">Notes and observations (optional)</label>
      <textarea class="sheet-error-note-input" id="error-note-${qNum}" rows="2"
                oninput="storeErrorNote(${qNum}, this.value)"
                placeholder="Rule, nuance, explanation or reminder — do not repeat the answer.">${escapeHTML(STATE.errorNotes[qNum] || "")}</textarea>
    </div>
  `;
}

function normalizeCorrectAnswerInput(input) {
  if (!input) return "";
  const uppercaseValue = String(input.value || "").toLocaleUpperCase("en-GB");
  if (input.value !== uppercaseValue) input.value = uppercaseValue;
  return C2_STUDY_REVIEW.normalizeCorrectAnswer(uppercaseValue);
}

function storeCorrectAnswer(qNum, valueOrInput) {
  const partEntry = getPartEntryForQuestion(STATE.activeSection, qNum);
  if (!partEntry || !isTrackedErrorPart(STATE.activeSection, partEntry[0])) return;
  const value = typeof valueOrInput === "object" && valueOrInput
    ? normalizeCorrectAnswerInput(valueOrInput)
    : C2_STUDY_REVIEW.normalizeCorrectAnswer(valueOrInput);
  STATE.correctAnswers[qNum] = value;
}

function storeErrorNote(qNum, value) {
  const partEntry = getPartEntryForQuestion(STATE.activeSection, qNum);
  if (!partEntry || !isTrackedErrorPart(STATE.activeSection, partEntry[0])) return;
  STATE.errorNotes[qNum] = value;
}

function storePartReferenceText(section, partKey, value) {
  if (STATE.activeSection !== section || !isTrackedErrorPart(section, partKey)) return;
  if (section === "useOfEnglish") {
    STATE.useOfEnglishPartTexts[partKey] = value;
  } else if (section === "reading") {
    STATE.readingPartTexts[partKey] = value;
  }
}

async function saveGradedSheetResult() {
  if (STATE.isSavingAttempt) return;

  const sectionMeta = C2_EXAM_METADATA[STATE.activeSection];
  const completion = C2_ATTEMPT_DATA.getObjectiveAttemptCompletion(
    sectionMeta,
    STATE.answers,
    STATE.gradedStates
  );
  const isPartialPractice = !completion.isComplete;
  const supportsPartialPractice = STATE.activeSection === "useOfEnglish"
    || (STATE.activeSection === "reading" && completion.attemptedParts.every(partKey => partKey === "part1"));

  if (completion.gradedQuestions.length === 0) {
    alert("Grade at least one question before saving a partial practice.");
    return;
  }

  if (isPartialPractice && !supportsPartialPractice) {
    const missingGrades = completion.missingGrades;
    const detail = missingGrades.length > 0 ? ` (Q.${missingGrades.join(', Q.')})` : "";
    alert(`Grade and answer every question before saving this paper${detail}. Partial Reading practice is available for Part 1.`);
    return;
  }

  const gradedQuestionSet = new Set(completion.gradedQuestions);
  const attemptedPartSet = new Set(completion.attemptedParts);
  const activePartTexts = STATE.activeSection === "useOfEnglish"
    ? STATE.useOfEnglishPartTexts
    : STATE.activeSection === "reading"
      ? STATE.readingPartTexts
      : {};
  const partTexts = Object.fromEntries(
    Object.entries(activePartTexts)
      .filter(([partKey]) => !isPartialPractice || attemptedPartSet.has(partKey))
      .map(([partKey, text]) => [partKey, typeof text === "string" ? text.trim() : ""])
      .filter(([, text]) => text.length > 0)
  );

  if (STATE.activeSection === "useOfEnglish" || STATE.activeSection === "reading") {
    const missingCorrectAnswers = [];
    Object.entries(sectionMeta.parts).forEach(([partKey, partData]) => {
      if (!isTrackedErrorPart(STATE.activeSection, partKey)) return;
      for (let q = partData.startQ; q <= partData.endQ; q++) {
        if (!gradedQuestionSet.has(q)) continue;
        if (!String(STATE.correctAnswers[q] || "").trim()) missingCorrectAnswers.push(q);
      }
    });
    if (missingCorrectAnswers.length > 0) {
      alert(`Add the correct answer before saving (Q.${missingCorrectAnswers.join(', Q.')}). Notes remain optional.`);
      return;
    }

    if (isPartialPractice) {
      const missingReferenceParts = completion.attemptedParts.filter(partKey => {
        return isTrackedErrorPart(STATE.activeSection, partKey) && !partTexts[partKey];
      });
      if (missingReferenceParts.length > 0) {
        alert(`Paste the reference text before saving (${missingReferenceParts.map(getUseOfEnglishPartShortLabel).join(", ")}). This keeps the exercise available in Error Log and review.`);
        return;
      }
    }
  }

  let rawScoreTotal = 0;
  if (!isPartialPractice) {
    for (const partData of Object.values(sectionMeta.parts)) {
      for (let q = partData.startQ; q <= partData.endQ; q++) {
        const state = STATE.gradedStates[q];
        if (partData.type === "partial") {
          rawScoreTotal += state;
        } else if (state === "correct") {
          rawScoreTotal += partData.weight;
        }
      }
    }
  }

  const maxPossibleMarks = isPartialPractice ? 0 : sectionMeta.maxMarks;
  const accuracyPct = isPartialPractice ? 0 : Math.round((rawScoreTotal / maxPossibleMarks) * 100);
  const scaleScore = isPartialPractice ? 0 : calculateScaleScore(STATE.activeSection, rawScoreTotal);
  const durationSeconds = isPartialPractice ? 0 : getCurrentPracticeDurationSeconds();
  const answers = isPartialPractice
    ? Object.fromEntries(completion.gradedQuestions.map(q => [q, STATE.answers[q] ?? ""]))
    : { ...STATE.answers };
  const errorNotes = Object.fromEntries(
    Object.entries(STATE.errorNotes)
      .filter(([q]) => gradedQuestionSet.has(Number(q)))
      .map(([q, note]) => [q, typeof note === "string" ? note.trim() : ""])
      .filter(([, note]) => note.length > 0)
  );
  const correctAnswers = Object.fromEntries(
    Object.entries(STATE.correctAnswers)
      .filter(([q]) => gradedQuestionSet.has(Number(q)))
      .map(([q, answer]) => [q, C2_STUDY_REVIEW.normalizeCorrectAnswer(answer)])
      .filter(([, answer]) => answer.length > 0)
  );

  if (
    isPartialPractice
    || durationSeconds > 0
    || ((STATE.activeSection === "useOfEnglish" || STATE.activeSection === "reading") && Object.keys(correctAnswers).length > 0)
    || ((STATE.activeSection === "useOfEnglish" || STATE.activeSection === "reading") && Object.keys(errorNotes).length > 0)
    || ((STATE.activeSection === "useOfEnglish" || STATE.activeSection === "reading") && Object.keys(partTexts).length > 0)
  ) {
    answers.meta = {
      ...getPlainObject(answers.meta),
      ...(isPartialPractice ? {
        attemptType: C2_ATTEMPT_DATA.PARTIAL_PRACTICE_TYPE,
        attemptedParts: completion.attemptedParts,
        gradedQuestions: completion.gradedQuestions
      } : {}),
      ...(durationSeconds > 0 ? { durationSeconds } : {}),
      ...((STATE.activeSection === "useOfEnglish" || STATE.activeSection === "reading") && Object.keys(correctAnswers).length > 0 ? {
        correctAnswers,
        studyDataVersion: C2_STUDY_REVIEW.STUDY_DATA_VERSION
      } : {}),
      ...((STATE.activeSection === "useOfEnglish" || STATE.activeSection === "reading") && Object.keys(errorNotes).length > 0 ? { errorNotes } : {}),
      ...(STATE.activeSection === "reading" && Object.keys(partTexts).length > 0 ? { readingPartTexts: partTexts } : {}),
      ...(STATE.activeSection === "useOfEnglish" && Object.keys(partTexts).length > 0 ? { useOfEnglishPartTexts: partTexts } : {})
    };
  }
  
  const saveButton = document.getElementById("sheet-submit-btn");
  STATE.isSavingAttempt = true;
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
  }

  const savedAt = Date.now();
  const savedAttempt = {
    id: `session_${STATE.activeSection}_${savedAt}`,
    section: STATE.activeSection,
    correct: rawScoreTotal,
    total: maxPossibleMarks,
    percentage: accuracyPct,
    scaleScore: scaleScore,
    answers,
    gradedStates: isPartialPractice
      ? Object.fromEntries(completion.gradedQuestions.map(q => [q, STATE.gradedStates[q]]))
      : { ...STATE.gradedStates },
    date: savedAt,
    durationSeconds
  };
  STATE.history.push(savedAttempt);

  await persistHistory({ mode: "merge" });
  STATE.isSavingAttempt = false;
  renderDashboard();
  openAttemptResultModal(savedAttempt.id);
}

// ==========================================================================
function getAttemptResultMood(scaleScore, isNewBest, hasPreviousAttempts) {
  if (!hasPreviousAttempts) {
    return {
      emoji: "🚀",
      title: "Baseline unlocked!",
      message: "The graph has its first dot. Tiny dot, enormous administrative importance."
    };
  }

  if (isNewBest) {
    return {
      emoji: "🏆",
      title: "New personal best!",
      message: "The previous record has been thanked for its service and gently escorted out."
    };
  }

  if (scaleScore >= 220) {
    return {
      emoji: "🧐",
      title: "Grade A behaviour.",
      message: "The examiner has dropped their monocle. Very inconvenient. Very impressive."
    };
  }

  if (scaleScore >= 200) {
    return {
      emoji: "✨",
      title: "C2 secured.",
      message: "Extremely civilised. Put the kettle on and pretend this was effortless."
    };
  }

  if (scaleScore >= 180) {
    return {
      emoji: "😤",
      title: "C2 is getting nervous.",
      message: "Solid C1 territory. The montage music has officially started."
    };
  }

  return {
    emoji: "🛠️",
    title: "Useful evidence collected.",
    message: "Not the glamorous bit, but excellent detective work. We know what to fix next."
  };
}

function getAttemptResultMilestone(scaleScore) {
  if (scaleScore >= 220) return "Grade A territory";
  if (scaleScore >= 200) return `${220 - scaleScore} points to Grade A`;
  if (scaleScore >= 180) return `${200 - scaleScore} points to C2`;
  return `${180 - scaleScore} points to C1`;
}

function animateAttemptResultScore(targetScore) {
  const scoreElement = document.getElementById("attempt-result-score");
  if (!scoreElement) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    scoreElement.textContent = String(targetScore);
    return;
  }

  const startValue = Math.min(targetScore, 120);
  const startedAt = performance.now();
  const duration = 900;

  function update(now) {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    scoreElement.textContent = String(Math.round(startValue + ((targetScore - startValue) * eased)));
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

function openPartialPracticeResultModal(item) {
  const gradedCount = getAttemptedQuestionNumbers(item).length;
  const correctionCount = getTrackedErrorEntries().filter(entry => entry.attemptId === item.id).length;
  const modal = document.createElement("div");
  modal.className = "modal-overlay result-modal-overlay";
  modal.innerHTML = `
    <div class="modal-content attempt-result-modal partial-practice-result" role="dialog" aria-modal="true" aria-labelledby="attempt-result-title">
      <button class="modal-close result-modal-close" onclick="closeModal()" aria-label="Close">&times;</button>
      <div class="result-mascot" aria-hidden="true">&#128209;</div>
      <span class="eyebrow">${escapeHTML(C2_EXAM_METADATA[item.section].name)} · ${escapeHTML(getPartialPracticeScopeLabel(item))}</span>
      <h2 id="attempt-result-title">Partial practice saved</h2>
      <p class="result-message">The correction is ready to revisit, without turning an incomplete exercise into an exam result.</p>
      <div class="partial-practice-status">
        <strong>No score recorded</strong>
        <span>Attempts, averages, accuracy, progress and time metrics are unchanged.</span>
      </div>
      <div class="result-stat-grid partial-practice-stats">
        <article><span>Graded</span><strong>${gradedCount}</strong></article>
        <article><span>Error Log cards</span><strong>${correctionCount}</strong></article>
        <article><span>Scope</span><strong>${escapeHTML(getPartialPracticeScopeLabel(item))}</strong></article>
      </div>
      <div class="result-actions">
        <button class="btn btn-secondary" onclick="closeModal(); openHistoryDetailModal('${escapeJS(item.id)}')">Review corrections</button>
        <button class="btn btn-primary" autofocus onclick="closeModal()">Back to progress</button>
      </div>
    </div>
  `;
  mountModal(modal);
}

function openAttemptResultModal(attemptId) {
  const item = STATE.history.find(attempt => attempt.id === attemptId);
  if (!item) return;

  if (isPartialPracticeAttempt(item)) {
    openPartialPracticeResultModal(item);
    return;
  }

  const previousAttempts = getScoredHistory(item.section).filter(attempt => attempt.id !== item.id);
  const previousBest = previousAttempts.length > 0
    ? Math.max(...previousAttempts.map(attempt => attempt.scaleScore))
    : null;
  const previousAttempt = previousAttempts
    .slice()
    .sort((a, b) => (a.date || 0) - (b.date || 0))
    .pop() || null;
  const previousDelta = previousAttempt ? item.scaleScore - previousAttempt.scaleScore : null;
  const isNewBest = previousBest !== null && item.scaleScore > previousBest;
  const mood = getAttemptResultMood(item.scaleScore, isNewBest, previousAttempts.length > 0);
  const scoreTone = item.scaleScore >= 220 ? "excellent" : item.scaleScore >= 200 ? "pass" : item.scaleScore >= 180 ? "c1" : "risk";
  const durationText = formatAttemptDuration(getAttemptDurationSeconds(item));
  const ringProgress = Math.max(4, Math.min(100, Math.round((item.scaleScore / 230) * 100)));
  const bestLabel = previousBest === null
    ? "First result"
    : isNewBest
      ? `Previous ${previousBest}`
      : `Best ${Math.max(previousBest, item.scaleScore)}`;
  const confetti = Array.from({ length: 22 }, (_, index) => {
    const left = 4 + ((index * 17) % 93);
    const delay = ((index * 7) % 12) / 20;
    const drift = -42 + ((index * 29) % 84);
    return `<i style="--confetti-left:${left}%; --confetti-delay:${delay}s; --confetti-drift:${drift}px; --confetti-rotation:${120 + ((index * 43) % 260)}deg"></i>`;
  }).join("");

  const modal = document.createElement("div");
  modal.className = "modal-overlay result-modal-overlay";
  modal.innerHTML = `
    <div class="modal-content attempt-result-modal ${scoreTone}" role="dialog" aria-modal="true" aria-labelledby="attempt-result-title">
      <div class="result-confetti" aria-hidden="true">${confetti}</div>
      <button class="modal-close result-modal-close" onclick="closeModal()" aria-label="Close">&times;</button>
      <div class="result-mascot" aria-hidden="true">${mood.emoji}</div>
      <span class="eyebrow">${C2_EXAM_METADATA[item.section].name} complete</span>
      <h2 id="attempt-result-title">${mood.title}</h2>
      <p class="result-message">${mood.message}</p>
      <div class="result-score-layout">
        <div class="result-score-ring" style="--result-progress:${ringProgress}%">
          <div>
            <strong id="attempt-result-score">120</strong>
            <span>Cambridge scale</span>
          </div>
        </div>
        <div class="result-grade-copy">
          <span>Your result</span>
          <strong>${getCambridgeGrade(item.scaleScore)}</strong>
          <small>${getAttemptResultMilestone(item.scaleScore)}</small>
        </div>
      </div>
      <div class="result-stat-grid">
        <article><span>Raw score</span><strong>${item.correct}/${item.total}</strong></article>
        <article><span>Accuracy</span><strong>${item.percentage}%</strong></article>
        <article><span>Record</span><strong>${bestLabel}</strong></article>
        ${durationText
          ? `<article><span>Time</span><strong>${durationText}</strong></article>`
          : previousAttempt
            ? `<article><span>Vs previous</span><strong class="metric-${previousDelta > 0 ? "positive" : previousDelta < 0 ? "negative" : "neutral"}">${formatSignedNumber(previousDelta)} pts</strong></article>`
            : `<article><span>Section attempt</span><strong>#1</strong></article>`}
      </div>
      <div class="result-actions">
        <button class="btn btn-secondary" onclick="closeModal(); openHistoryDetailModal('${escapeJS(item.id)}')">Review answers</button>
        <button class="btn btn-primary" autofocus onclick="closeModal()">Back to progress</button>
      </div>
    </div>
  `;
  mountModal(modal);
  animateAttemptResultScore(item.scaleScore);
}

// 5. WRITING GRADING FLOW (CRITERIA CHIPS)
// ==========================================================================
const WRITING_PART2_TYPES = [
  { value: "article", label: "Article" },
  { value: "email-letter", label: "Email / letter" },
  { value: "report", label: "Report" },
  { value: "review", label: "Review" }
];

const WRITING_CRITERIA = [
  { key: "content", label: "Content" },
  { key: "comm", label: "Communicative Achievement" },
  { key: "org", label: "Organisation" },
  { key: "lang", label: "Language" }
];

function getWritingPart2Type() {
  return STATE.answers.part2Type || "article";
}

function getWritingPart2TypeLabel(type = getWritingPart2Type()) {
  return WRITING_PART2_TYPES.find(item => item.value === type)?.label || "Article";
}

function getWritingPart2TypeOptionsHTML() {
  const activeType = getWritingPart2Type();
  return WRITING_PART2_TYPES.map(type => `
    <option value="${type.value}" ${activeType === type.value ? "selected" : ""}>${type.label}</option>
  `).join("");
}

function storeWritingPart2Type(value) {
  STATE.answers.part2Type = value;
}

function renderWritingPromptPanelHTML() {
  return `
    <details class="writing-prompt-panel">
      <summary>
        <span>GPT assessment prompt</span>
        <small>Cambridge C2 writing criteria</small>
      </summary>
      <div class="writing-prompt-body">
        <textarea id="writing-gpt-prompt" class="writing-prompt-textarea" readonly></textarea>
        <div class="writing-prompt-actions">
          <button class="btn btn-secondary" type="button" onclick="copyWritingAssessmentPrompt()">Copy prompt</button>
        </div>
      </div>
    </details>
  `;
}

function getPart2GenreGuidance(type = getWritingPart2Type()) {
  const guidance = {
    article: "For the Part 2 article, check whether it engages the target reader, has a clear angle/title or opening, develops ideas with a lively but controlled style, and ends with a satisfying conclusion.",
    "email-letter": "For the Part 2 email/letter, check whether the register is appropriate, the purpose is clear, the opening and closing fit the relationship with the reader, and all required points are handled naturally.",
    report: "For the Part 2 report, check whether it uses clear headings, concise factual organisation, relevant observations, and practical recommendations or conclusions.",
    review: "For the Part 2 review, check whether it describes and evaluates the subject, gives supported opinions, uses an engaging critical voice, and includes a clear recommendation where appropriate."
  };

  return guidance[type] || guidance.article;
}

function buildWritingAssessmentPrompt() {
  const part1Text = document.getElementById("writing-textarea-part1")?.value.trim() || "";
  const part2Text = document.getElementById("writing-textarea-part2")?.value.trim() || "";
  const part2Type = document.getElementById("writing-part2-type")?.value || getWritingPart2Type();
  const part2TypeLabel = getWritingPart2TypeLabel(part2Type);
  const tasks = [];

  if (part1Text) {
    tasks.push(`PART 1 - COMPULSORY ESSAY
Task type: essay
Text:
"""${part1Text}"""`);
  }

  if (part2Text) {
    tasks.push(`PART 2 - OPTIONAL WRITING
Task type: ${part2TypeLabel}
Genre-specific focus: ${getPart2GenreGuidance(part2Type)}
Text:
"""${part2Text}"""`);
  }

  const taskBlock = tasks.length > 0
    ? tasks.join("\n\n---\n\n")
    : "[Paste the candidate text here. If Part 1 is present, assess it as an essay. If Part 2 is present, assess it using the selected Part 2 text type.]";

  return `You are assessing Cambridge C2 Proficiency Writing practice.

Use the C2 Proficiency Writing scoring structure described below. Be strict but constructive.

Assessment rules:
- Writing has 2 tasks.
- Each task is marked out of 20.
- Each task has four criteria: Content, Communicative Achievement, Organisation, and Language.
- Award an integer score from 0 to 5 for each criterion. Do not use half marks.
- Part 1 must be assessed as a compulsory essay.
- Part 2 must be assessed according to its selected text type.
- Total raw Writing mark is out of 40.
- Cambridge practice-test thresholds for Writing are: 10 raw marks = 162, 16 = 180, 24 = 200, 34 = 220.
- Do not claim an official exact Cambridge Scale score. Give a likely band only: below 162, 162-179, 180-199, 200-219, or 220+.

For each submitted task, return:
1. A table with Content, Communicative Achievement, Organisation, and Language, each scored 0-5.
2. One short justification per criterion.
3. The task total out of 20.
4. The 3 most important fixes to improve the mark.
5. A short list of high-value rewrites or phrase upgrades.

If both tasks are included, also return:
- Combined raw mark out of 40.
- Likely Cambridge Scale band using the thresholds above.
- Whether the performance is closer to C1, C2 Grade C, C2 Grade B, or C2 Grade A.

Candidate text:

${taskBlock}`;
}

function updateWritingAssessmentPrompt() {
  const promptBox = document.getElementById("writing-gpt-prompt");
  if (!promptBox) return;
  promptBox.value = buildWritingAssessmentPrompt();
}

async function copyWritingAssessmentPrompt() {
  updateWritingAssessmentPrompt();
  const promptBox = document.getElementById("writing-gpt-prompt");
  if (!promptBox) return;

  try {
    await navigator.clipboard.writeText(promptBox.value);
  } catch (error) {
    promptBox.select();
    document.execCommand("copy");
  }
}

function trackSectionWritingWordCount(partKey, text) {
  const badgeId = partKey === "part1" ? "writing-count-part1" : "writing-count-part2";
  const badge = document.getElementById(badgeId);
  if (!badge) return;

  const count = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
  badge.textContent = `${count} words`;

  const meta = C2_EXAM_METADATA.writing.parts[partKey];
  
  badge.className = "writing-word-badge";
  if (count === 0) {
    badge.classList.add("under");
  } else if (count < meta.minW) {
    badge.classList.add("under");
    badge.textContent = `${count} words (Minimum: ${meta.minW})`;
  } else if (count > meta.maxW) {
    badge.classList.add("over");
    badge.textContent = `${count} words (Maximum: ${meta.maxW})`;
  } else {
    badge.classList.add("within");
    badge.textContent = `${count} words (Meets limit)`;
  }
}

function getWritingTextValue(partKey) {
  const elementId = partKey === "part1" ? "writing-textarea-part1" : "writing-textarea-part2";
  return document.getElementById(elementId)?.value.trim() || "";
}

function getWritingPartPrefix(partKey) {
  return partKey === "part1" ? "w1" : "w2";
}

function getWritingPartDisplayName(partKey) {
  if (partKey === "part1") return "Part 1 - Compulsory Essay";
  const activeType = document.getElementById("writing-part2-type")?.value || getWritingPart2Type();
  return `Part 2 - ${getWritingPart2TypeLabel(activeType)}`;
}

function getActiveWritingPartKeysFromText() {
  return ["part1", "part2"].filter(partKey => getWritingTextValue(partKey).length > 0);
}

function renderWritingCriterionControlHTML(partKey, criterion) {
  const prefix = getWritingPartPrefix(partKey);

  return `
    <div>
      <div class="criteria-title">${criterion.label}</div>
      <div class="criteria-slider-row">
        <input type="range" class="criteria-slider" id="${prefix}-score-${criterion.key}" min="0" max="5" value="3" oninput="updateWritingRawTotal()">
        <span class="criteria-value" id="${prefix}-val-${criterion.key}">3 / 5</span>
      </div>
    </div>
  `;
}

function renderWritingRubricHTML(partKey) {
  const prefix = getWritingPartPrefix(partKey);

  return `
    <div class="writing-criteria-checklist" data-writing-part="${partKey}">
      <h3>${getWritingPartDisplayName(partKey)}</h3>
      ${WRITING_CRITERIA.map(criterion => renderWritingCriterionControlHTML(partKey, criterion)).join("")}
      <label class="writing-correction-field">
        <span>Correction feedback</span>
        <small>Save errors, corrected phrases and advice for the review.</small>
        <textarea id="${prefix}-correction" aria-label="${getWritingPartDisplayName(partKey)} correction feedback"
                  placeholder="Add corrections, recurring errors and advice for this task..."></textarea>
      </label>
      <div class="writing-part-total" id="${prefix}-part-total">Subtotal: 12 / 20 pts</div>
    </div>
  `;
}

function getRenderedWritingPartKeys() {
  return [...document.querySelectorAll("[data-writing-part]")]
    .map(element => element.dataset.writingPart)
    .filter(Boolean);
}

function getWritingCriterionValue(partKey, criterionKey) {
  const element = document.getElementById(`${getWritingPartPrefix(partKey)}-score-${criterionKey}`);
  return element ? parseInt(element.value, 10) || 0 : null;
}

function getWritingPartScoreFromControls(partKey) {
  const score = {};

  for (const criterion of WRITING_CRITERIA) {
    const value = getWritingCriterionValue(partKey, criterion.key);
    if (value === null) return null;
    score[criterion.key] = value;
  }

  score.total = WRITING_CRITERIA.reduce((sum, criterion) => sum + score[criterion.key], 0);
  return score;
}

function getWritingEquivalentRawScore(actualRaw, actualMax) {
  return actualMax > 0 ? Math.round((actualRaw / actualMax) * 40) : 0;
}

function getWritingScoringSnapshot() {
  const partKeys = getRenderedWritingPartKeys();
  const partScores = {};

  partKeys.forEach(partKey => {
    const score = getWritingPartScoreFromControls(partKey);
    if (score) partScores[partKey] = score;
  });

  const actualRaw = Object.values(partScores).reduce((sum, score) => sum + score.total, 0);
  const actualMax = Object.keys(partScores).length * 20;
  const equivalentRaw = getWritingEquivalentRawScore(actualRaw, actualMax);

  return {
    partKeys: Object.keys(partScores),
    partScores,
    actualRaw,
    actualMax,
    equivalentRaw,
    percentage: Math.round((equivalentRaw / 40) * 100),
    scaleScore: calculateScaleScore("writing", equivalentRaw)
  };
}

function setupWritingGradingArea() {
  const activePartKeys = getActiveWritingPartKeysFromText();

  if (activePartKeys.length === 0) {
    alert("Write or paste at least one Writing part before grading.");
    return;
  }

  document.getElementById("writing-textarea-part1").disabled = true;
  document.getElementById("writing-textarea-part2").disabled = true;
  const part2TypeSelect = document.getElementById("writing-part2-type");
  if (part2TypeSelect) part2TypeSelect.disabled = true;

  const gradingArea = document.getElementById("writing-grading-area");

  gradingArea.innerHTML = `
    <div class="writing-grading-note">
      Score only the submitted ${activePartKeys.length === 1 ? "task" : "tasks"}. The scale estimate is normalised to a 40-mark Writing paper.
    </div>
    ${activePartKeys.map(renderWritingRubricHTML).join("")}
    <div class="writing-score-summary">
      <div>
        <span>Assessed raw</span>
        <strong id="writing-assessed-score">0 / 0</strong>
      </div>
      <div>
        <span>Equivalent raw</span>
        <strong id="writing-overall-score">0 / 40</strong>
      </div>
      <div>
        <span>Scale estimate</span>
        <strong id="writing-scale-preview">--</strong>
      </div>
    </div>
  `;

  const mainBtn = document.getElementById("sheet-submit-btn");
  mainBtn.textContent = "Save writing";
  mainBtn.setAttribute("onclick", "saveWritingSheetResult()");

  updateWritingRawTotal();
}

function updateWritingRawTotal() {
  const snapshot = getWritingScoringSnapshot();

  snapshot.partKeys.forEach(partKey => {
    const prefix = getWritingPartPrefix(partKey);
    const partScore = snapshot.partScores[partKey];

    WRITING_CRITERIA.forEach(criterion => {
      const valueElement = document.getElementById(`${prefix}-val-${criterion.key}`);
      if (valueElement) valueElement.textContent = `${partScore[criterion.key]} / 5`;
    });

    const totalElement = document.getElementById(`${prefix}-part-total`);
    if (totalElement) totalElement.textContent = `Subtotal: ${partScore.total} / 20 pts`;
  });

  const assessedElement = document.getElementById("writing-assessed-score");
  const equivalentElement = document.getElementById("writing-overall-score");
  const scaleElement = document.getElementById("writing-scale-preview");

  if (assessedElement) assessedElement.textContent = `${snapshot.actualRaw} / ${snapshot.actualMax} pts`;
  if (equivalentElement) equivalentElement.textContent = `${snapshot.equivalentRaw} / 40 pts`;
  if (scaleElement) scaleElement.textContent = `${snapshot.scaleScore} (${getCambridgeGrade(snapshot.scaleScore)})`;
}

async function saveWritingSheetResult() {
  if (STATE.isSavingAttempt) return;

  const text1 = document.getElementById("writing-textarea-part1").value;
  const text2 = document.getElementById("writing-textarea-part2").value;
  const part2Type = document.getElementById("writing-part2-type")?.value || getWritingPart2Type();
  const snapshot = getWritingScoringSnapshot();

  if (snapshot.partKeys.length === 0) {
    alert("No Writing task has been scored yet.");
    return;
  }

  const gradedStates = {};
  snapshot.partKeys.forEach(partKey => {
    const score = snapshot.partScores[partKey];
    gradedStates[partKey] = {
      content: score.content,
      comm: score.comm,
      org: score.org,
      lang: score.lang
    };
  });

  const writingCorrectionNotes = Object.fromEntries(
    snapshot.partKeys
      .map(partKey => {
        const correctionText = document.getElementById(`${getWritingPartPrefix(partKey)}-correction`)?.value.trim() || "";
        return [partKey, correctionText];
      })
      .filter(([, correctionText]) => correctionText.length > 0)
  );

  const durationSeconds = getCurrentPracticeDurationSeconds();
  const answers = {
    part1: text1,
    part2: text2,
    part2Type,
    meta: {
      assessedParts: snapshot.partKeys,
      actualRaw: snapshot.actualRaw,
      actualMax: snapshot.actualMax,
      equivalentRaw: snapshot.equivalentRaw,
      scaleBasis: "normalised-to-40",
      ...(Object.keys(writingCorrectionNotes).length > 0 ? { writingCorrectionNotes } : {})
    }
  };

  if (durationSeconds > 0) {
    answers.meta.durationSeconds = durationSeconds;
  }

  const saveButton = document.getElementById("sheet-submit-btn");
  STATE.isSavingAttempt = true;
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
  }

  const savedAt = Date.now();
  const savedAttempt = {
    id: `session_writing_${savedAt}`,
    section: "writing",
    correct: snapshot.equivalentRaw,
    total: 40,
    percentage: snapshot.percentage,
    scaleScore: snapshot.scaleScore,
    answers,
    gradedStates,
    date: savedAt,
    durationSeconds
  };
  STATE.history.push(savedAttempt);

  await persistHistory({ mode: "merge" });
  STATE.isSavingAttempt = false;
  renderDashboard();
  openAttemptResultModal(savedAttempt.id);
}

// HELPERS
function updateModalPageLock() {
  const hasOpenModal = document.querySelector(".modal-overlay") !== null;
  document.documentElement.classList.toggle("modal-open", hasOpenModal);
  document.body.classList.toggle("modal-open", hasOpenModal);
}

function mountModal(modal) {
  document.body.appendChild(modal);
  updateModalPageLock();
}

function closeModal() {
  const modals = document.querySelectorAll(".modal-overlay");
  const modal = modals[modals.length - 1];
  if (modal) modal.remove();
  updateModalPageLock();
}

function closeAllModals() {
  document.querySelectorAll(".modal-overlay").forEach(modal => modal.remove());
  updateModalPageLock();
}

function escapeJS(str) {
  return str.replace(/'/g, "\\'");
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderWritingMarkdownInline(value) {
  const codeTokens = [];
  let html = escapeHTML(value).replace(/`([^`]+)`/g, (_, code) => {
    const token = `\u0000CODE${codeTokens.length}\u0000`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });

  html = html
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");

  return html.replace(/\u0000CODE(\d+)\u0000/g, (_, index) => codeTokens[Number(index)] || "");
}

function getWritingMarkdownTableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
}

function getWritingMarkdownTableColumnRole(header) {
  const normalized = String(header || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  if (["criterio", "criteria", "criterion"].includes(normalized)) return "criterion";
  if (["nota", "score", "mark", "marks", "puntuacion"].includes(normalized)) return "score";
  if (["justificacion", "justification", "feedback", "comentario", "comments"].includes(normalized)) return "feedback";
  return "";
}

function renderWritingFeedbackMarkdown(value) {
  const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    output.push(`<p>${paragraph.map(renderWritingMarkdownInline).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    output.push(`<${list.tag}>${list.items.map(item => `<li>${item.map(renderWritingMarkdownInline).join("<br>")}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  const flushBlocks = () => {
    flushParagraph();
    flushList();
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushBlocks();
      continue;
    }

    if (/^```/.test(trimmed)) {
      flushBlocks();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      output.push(`<pre><code>${escapeHTML(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const nextLine = lines[index + 1] || "";
    const isTable = trimmed.includes("|") && /^\s*\|?\s*:?-{3,}:?(\s*\|\s*:?-{3,}:?)+\s*\|?\s*$/.test(nextLine);
    if (isTable) {
      flushBlocks();
      const headers = getWritingMarkdownTableCells(line);
      const columnRoles = headers.map(getWritingMarkdownTableColumnRole);
      const isAssessmentTable = columnRoles.includes("criterion") && columnRoles.includes("score") && columnRoles.includes("feedback");
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
        rows.push(getWritingMarkdownTableCells(lines[index]));
        index += 1;
      }
      index -= 1;
      output.push(`
        <div class="markdown-table-wrap">
          <table class="${isAssessmentTable ? "writing-assessment-table" : ""}">
            ${isAssessmentTable ? `<colgroup>${columnRoles.map(role => `<col class="markdown-col-${role || "default"}">`).join("")}</colgroup>` : ""}
            <thead><tr>${headers.map((cell, columnIndex) => `<th class="${columnRoles[columnIndex] ? `markdown-cell-${columnRoles[columnIndex]}` : ""}">${renderWritingMarkdownInline(cell)}</th>`).join("")}</tr></thead>
            <tbody>${rows.map(row => `<tr>${row.map((cell, columnIndex) => `<td class="${columnRoles[columnIndex] ? `markdown-cell-${columnRoles[columnIndex]}` : ""}">${renderWritingMarkdownInline(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
          </table>
        </div>
      `);
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushBlocks();
      const level = Math.min(6, heading[1].length + 1);
      output.push(`<h${level}>${renderWritingMarkdownInline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^([-*_])(?:\s*\1){2,}$/.test(trimmed)) {
      flushBlocks();
      output.push("<hr>");
      continue;
    }

    const orderedItem = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const unorderedItem = line.match(/^\s*[-+*]\s+(.+)$/);
    if (orderedItem || unorderedItem) {
      flushParagraph();
      const tag = orderedItem ? "ol" : "ul";
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push([orderedItem?.[1] || unorderedItem[1]]);
      continue;
    }

    if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1].push(trimmed);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushBlocks();
      output.push(`<blockquote>${renderWritingMarkdownInline(quote[1])}</blockquote>`);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushBlocks();
  return output.join("");
}

function calculateAverageScaleScore() {
  const scoredHistory = getScoredHistory();
  if (scoredHistory.length === 0) return 0;
  const sectionAverages = SECTION_ORDER.map(section => {
    const attempts = scoredHistory.filter(item => item.section === section);
    if (attempts.length === 0) return null;
    return attempts.reduce((sum, item) => sum + item.scaleScore, 0) / attempts.length;
  }).filter(average => average !== null);

  if (sectionAverages.length === 0) return 0;
  return Math.round(sectionAverages.reduce((sum, average) => sum + average, 0) / sectionAverages.length);
}

async function deleteHistoryItem(id) {
  if (confirm("Delete this history record?")) {
    STATE.history = STATE.history.filter(h => h.id !== id);
    await persistHistory({ mode: "replace" });
    refreshCurrentView();
  }
}

async function deleteHistoryItemFromReview(id) {
  const item = STATE.history.find(historyItem => historyItem.id === id);
  if (!item) return;

  const sectionName = C2_EXAM_METADATA[item.section]?.name || "exam";
  if (!confirm(`Delete this ${sectionName} attempt? The rest of your history will stay unchanged.`)) return;

  closeAllModals();
  STATE.history = STATE.history.filter(historyItem => historyItem.id !== id);
  await persistHistory({ mode: "replace" });
  refreshCurrentView();
}

async function clearHistory() {
  if (confirm("Clear your practice history from this app? Online sync keeps a versioned backup when it is available.")) {
    STATE.history = [];
    await persistHistory({ mode: "replace" });
    refreshCurrentView();
  }
}

function storeInputAnswer(qNum, value) {
  STATE.answers[qNum] = typeof value === "string" ? value.trim() : value;
}

function refreshCurrentView() {
  if (STATE.currentView === "dashboard") {
    renderDashboard();
  } else if (STATE.currentView === "errorReview") {
    renderErrorReview();
  } else if (STATE.currentView === "writingLab") {
    renderWritingLab();
  } else if (STATE.currentView === "vocabulary") {
    renderVocabulary();
  } else if (STATE.currentView === "vocabularyReview") {
    renderVocabularyReview();
  } else if (STATE.currentView === "sheet") {
    renderAnswerSheetHTML();
  } else {
    renderHome();
  }
}

function openAllAttemptsModal() {
  const savedWorkCount = getSavedWorkItems().length;
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content all-attempts-modal">
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid var(--border-color);">
        <h3 class="modal-title">All Saved Work</h3>
        <button class="modal-close" onclick="closeModal()" aria-label="Close" style="background: transparent; border: 0; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>
      <div class="all-attempts-filter-row">
        <label for="all-attempts-section-filter">
          <span>Section</span>
          <select id="all-attempts-section-filter" onchange="filterAllAttemptsModal(this.value)">
            <option value="all">All sections</option>
            <option value="useOfEnglish">Use of English</option>
            <option value="reading">Reading</option>
            <option value="listening">Listening</option>
            <option value="writing">Writing</option>
          </select>
        </label>
        <small id="all-attempts-count">${savedWorkCount} ${savedWorkCount === 1 ? "item" : "items"}</small>
      </div>
      <div class="modal-body all-attempts-list" id="all-attempts-list">
        ${renderHistoryListV2HTML(null, "all")}
      </div>
      <div class="all-attempts-actions">
        <button class="btn btn-primary" onclick="closeModal()">Close</button>
      </div>
    </div>
  `;
  mountModal(modal);
}

function filterAllAttemptsModal(sectionFilter) {
  const items = getSavedWorkItems(sectionFilter);
  const list = document.getElementById("all-attempts-list");
  const count = document.getElementById("all-attempts-count");
  if (list) list.innerHTML = renderHistoryListV2HTML(null, sectionFilter);
  if (count) count.textContent = `${items.length} ${items.length === 1 ? "item" : "items"}`;
}

function getSectionIconSVG(section) {
  if (section === "useOfEnglish") {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;
  }
  if (section === "reading") {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`;
  }
  if (section === "listening") {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>`;
  }
  if (section === "writing") {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
  }
  return "";
}
