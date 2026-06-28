// STATE MANAGEMENT
const STATE = {
  currentView: "home", // "home" | "dashboard" | "sheet"
  activeSection: null, // "useOfEnglish" | "reading" | "listening" | "writing"
  answers: {}, // Q-num -> string
  gradedStates: {}, // Q-num -> "correct" | "incorrect" | score (0|1|2)
  errorNotes: {}, // Use of English Q-num -> correction note
  useOfEnglishPartTexts: {}, // part2 | part3 | part4 -> reference text
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
  timer: {
    elapsedSeconds: 0,
    isRunning: false,
    startedAt: null,
    intervalId: null
  }
};

const OWNER_PROFILE = "Aleetreny";
const LOCAL_HISTORY_KEY = "c2_owner_history";
const SUPABASE_SESSION_KEY = "c2_supabase_session";
const SUPABASE_CONFIG = {
  restUrl: "https://irsugdtdqnvlrcbotvfe.supabase.co/rest/v1",
  authUrl: "https://irsugdtdqnvlrcbotvfe.supabase.co/auth/v1",
  redirectUrl: "https://aleetreny.github.io/c2-practice-log/",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlyc3VnZHRkcW52bHJjYm90dmZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0Nzk4MjgsImV4cCI6MjA5ODA1NTgyOH0.MMJwed40u5tszDUYeS_Tx0BMo0PLWdY-eEp6Qs4XC9o"
};

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

    STATE.history = mergeHistoryCollections(...localHistories);
  } catch (e) {
    console.error("Failed to load local storage", e);
    STATE.history = [];
  }
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

async function fetchSupabaseHistory() {
  const rows = await supabaseRequest(
    "/c2_attempts?select=id,section,correct,total,percentage,scale_score,answers,graded_states,attempted_at&order=attempted_at.asc"
  );
  return Array.isArray(rows) ? rows.map(supabaseRowToHistoryItem) : [];
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

    const remoteHistory = await fetchSupabaseHistory();
    const mergedHistory = mergeHistoryCollections(remoteHistory, STATE.history);
    STATE.history = mergedHistory;
    saveLocalStorage();

    if (mergedHistory.length !== remoteHistory.length) {
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

function getAttemptDurationSeconds(item = {}) {
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
  const durationSeconds = getAttemptDurationSeconds(item);

  if (durationSeconds > 0) {
    answers.meta = {
      ...getPlainObject(answers.meta),
      durationSeconds
    };
  }

  return answers;
}

function getUseOfEnglishErrorNotes(item = {}) {
  const answers = getPlainObject(item.answers);
  const meta = getPlainObject(answers.meta);
  return getPlainObject(meta.errorNotes);
}

function getUseOfEnglishPartTexts(item = {}) {
  const answers = getPlainObject(item.answers);
  const meta = getPlainObject(answers.meta);
  return getPlainObject(meta.useOfEnglishPartTexts);
}

function getUseOfEnglishPartShortLabel(partKey) {
  return partKey.replace("part", "Part ");
}

function isUseOfEnglishError(partData, gradeState) {
  if (!partData) return false;
  if (partData.type === "partial") {
    return typeof gradeState === "number" && gradeState < partData.weight;
  }
  return gradeState === "incorrect";
}

function getUseOfEnglishErrorEntries() {
  const useOfEnglishParts = C2_EXAM_METADATA.useOfEnglish.parts;
  const entries = [];

  STATE.history
    .filter(item => item.section === "useOfEnglish")
    .forEach(item => {
      const answers = getPlainObject(item.answers);
      const gradedStates = getPlainObject(item.gradedStates);
      const notes = getUseOfEnglishErrorNotes(item);

      Object.entries(useOfEnglishParts).forEach(([partKey, partData]) => {
        for (let q = partData.startQ; q <= partData.endQ; q++) {
          const gradeState = gradedStates[q];
          if (!isUseOfEnglishError(partData, gradeState)) continue;

          entries.push({
            attemptId: item.id,
            date: Number(item.date) || 0,
            partKey,
            partName: partData.name,
            question: q,
            answer: answers[q] || "",
            gradeState,
            note: typeof notes[q] === "string" ? notes[q] : ""
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
  return STATE.history.length > 0 ? STATE.history[STATE.history.length - 1] : null;
}

function getSectionStats(section) {
  const logs = STATE.history.filter(item => item.section === section);

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
  const logs = STATE.history.filter(item => item.section === section);

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
  if (STATE.history.length < 2) return 0;

  const recent = STATE.history.slice(-3);
  const previous = STATE.history.slice(Math.max(0, STATE.history.length - 6), STATE.history.length - 3);
  const previousSet = previous.length > 0 ? previous : STATE.history.slice(0, -recent.length);

  if (previousSet.length === 0) return 0;

  const avgRecent = recent.reduce((acc, curr) => acc + curr.scaleScore, 0) / recent.length;
  const avgPrevious = previousSet.reduce((acc, curr) => acc + curr.scaleScore, 0) / previousSet.length;
  return Math.round(avgRecent - avgPrevious);
}

function calculatePassRate() {
  if (STATE.history.length === 0) return 0;
  const passed = STATE.history.filter(item => item.scaleScore >= 200).length;
  return Math.round((passed / STATE.history.length) * 100);
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
function renderHome() {
  if (STATE.currentView === "sheet") {
    clearPracticeTimerInterval();
  }

  STATE.currentView = "home";
  const appContainer = document.getElementById("app-container");
  const totalCompleted = STATE.history.length;
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

        <nav class="topbar-actions" aria-label="Main navigation">
          <button class="nav-pill active" onclick="renderHome()">Practice</button>
          <button class="nav-pill" onclick="renderDashboard()">Progress</button>
          <button class="candidate-switch" onclick="openProfileModal()" title="Account and sync">
            <span class="profile-avatar">${STATE.activeProfile.charAt(0).toUpperCase()}</span>
            <span class="candidate-copy">
              <span class="candidate-label">${getSyncLabel()}</span>
              <span class="candidate-name">${escapeHTML(STATE.activeProfile)}</span>
            </span>
          </button>
        </nav>
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

function renderDashboard() {
  renderDashboardView();
}

function renderDashboardView() {
  if (STATE.currentView === "sheet") {
    clearPracticeTimerInterval();
  }

  STATE.currentView = "dashboard";
  const appContainer = document.getElementById("app-container");

  const totalCompleted = STATE.history.length;
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

        <nav class="topbar-actions" aria-label="Main navigation">
          <button class="nav-pill" onclick="renderHome()">Practice</button>
          <button class="nav-pill active" onclick="renderDashboard()">Progress</button>
          <button class="candidate-switch" onclick="openProfileModal()" title="Account and sync">
            <span class="profile-avatar">${STATE.activeProfile.charAt(0).toUpperCase()}</span>
            <span class="candidate-copy">
              <span class="candidate-label">${getSyncLabel()}</span>
              <span class="candidate-name">${escapeHTML(STATE.activeProfile)}</span>
            </span>
          </button>
        </nav>
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
            <div class="summary-card-note">${avgScaleScore ? avgGrade : "No average yet"}</div>
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
              <span>Recent attempts</span>
              ${STATE.history.length > 0 ? `<button class="btn-danger-link" onclick="clearHistory()">Clear all</button>` : ""}
            </div>
            <div class="panel-body-scroll">
              ${renderHistoryListV2HTML(6)}
            </div>
            ${STATE.history.length > 6 ? `
              <div style="margin-top: auto; padding-top: 12px; border-top: 1px dashed var(--border-color); display: flex; justify-content: center;">
                <button class="btn btn-secondary btn-full" onclick="openAllAttemptsModal()" style="font-size: 0.8rem; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 800; width: 100%;">
                  View all attempts
                </button>
              </div>
            ` : ""}
          </section>
        </section>

        ${renderUseOfEnglishErrorDashboardHTML()}
      </main>
    </div>
  `;
}

const USE_OF_ENGLISH_VISIBLE_ERRORS_PER_PART = 3;

function renderUseOfEnglishErrorItemHTML(error, compact = false, textPanelId = "ue-dashboard-part-text-panel") {
  const partLabel = getUseOfEnglishPartShortLabel(error.partKey);
  const gradeLabel = typeof error.gradeState === "number"
    ? `${error.gradeState}/2 pts`
    : "Missed";
  const answer = error.answer ? escapeHTML(error.answer) : "No answer";
  const note = error.note.trim();

  return `
    <article class="ue-error-item ${compact ? "compact" : ""}">
      <div class="ue-error-item-head">
        <div>
          <span class="ue-error-part">${partLabel}</span>
          <strong>Q.${error.question}</strong>
        </div>
        <span>${gradeLabel}</span>
      </div>
      <div class="ue-error-answer">${answer}</div>
      ${note ? `<p class="ue-error-note">${escapeHTML(note)}</p>` : `<p class="ue-error-note empty">No note added</p>`}
      <div class="ue-error-actions">
        <button class="ue-error-text-button" onclick="showUseOfEnglishPartText('${escapeJS(error.attemptId)}', '${error.partKey}', '${textPanelId}')">View part text</button>
        <button class="ue-error-review" onclick="openHistoryDetailModal('${escapeJS(error.attemptId)}')">${formatCompactDateTime(error.date)}</button>
      </div>
    </article>
  `;
}

function showUseOfEnglishPartText(sessionId, partKey, panelId) {
  const item = STATE.history.find(historyItem => historyItem.id === sessionId);
  const panel = document.getElementById(panelId);
  const partData = C2_EXAM_METADATA.useOfEnglish.parts[partKey];
  if (!item || !panel || !partData) return;

  const text = getUseOfEnglishPartTexts(item)[partKey]?.trim() || "";
  panel.innerHTML = `
    <div class="ue-part-text-panel-head">
      <div>
        <span>${getUseOfEnglishPartShortLabel(partKey)}</span>
        <strong>${partData.name.replace(/^Part \d+ - /, "")}</strong>
      </div>
      <button type="button" onclick="hideUseOfEnglishPartText('${panelId}')" aria-label="Close part text">&times;</button>
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
  workspace?.classList.add("text-open");
  panel.closest(".history-review-modal")?.classList.add("text-open");
  const textContent = panel.querySelector(".ue-part-text-content");
  if (textContent) textContent.scrollTop = 0;
}

function hideUseOfEnglishPartText(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.hidden = true;
  panel.closest(".ue-text-workspace")?.classList.remove("text-open");
  panel.closest(".history-review-modal")?.classList.remove("text-open");
}

function openUseOfEnglishPartErrorsModal(partKey) {
  const partData = C2_EXAM_METADATA.useOfEnglish.parts[partKey];
  if (!partData) return;

  const errors = getUseOfEnglishErrorEntries().filter(error => error.partKey === partKey);
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content ue-all-errors-modal">
      <div class="modal-header">
        <div>
          <span class="eyebrow">${getUseOfEnglishPartShortLabel(partKey)}</span>
          <h3 class="modal-title">${partData.name.replace(/^Part \d+ - /, "")} errors</h3>
        </div>
        <button class="modal-close" onclick="closeModal()" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body ue-text-workspace ue-all-errors-workspace">
        <div class="ue-all-errors-list">
          ${errors.map(error => renderUseOfEnglishErrorItemHTML(error, false, "ue-modal-part-text-panel")).join("")}
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

function renderUseOfEnglishErrorDashboardHTML() {
  const errors = getUseOfEnglishErrorEntries();
  const partEntries = Object.entries(C2_EXAM_METADATA.useOfEnglish.parts);

  return `
    <section class="dash-panel ue-errors-panel" aria-label="Use of English error log">
      <div class="panel-title">
        <span>Use of English error log</span>
        <small>${errors.length} ${errors.length === 1 ? "error" : "errors"} saved</small>
      </div>
      ${errors.length === 0 ? `
        <div class="empty-state ue-errors-empty">Your latest Use of English errors and notes will appear here.</div>
      ` : `
        <div class="ue-text-workspace ue-errors-workspace">
          <section class="ue-part-register">
            <div class="ue-part-register-grid">
              ${partEntries.map(([partKey, partData]) => {
                const partErrors = errors.filter(error => error.partKey === partKey);
                const visibleErrors = partErrors.slice(0, USE_OF_ENGLISH_VISIBLE_ERRORS_PER_PART);
                return `
                  <article class="ue-part-card">
                    <div class="ue-part-card-head">
                      <div>
                        <span>${getUseOfEnglishPartShortLabel(partKey)}</span>
                        <strong>${partData.name.replace(/^Part \d+ - /, "")}</strong>
                      </div>
                      <b>${partErrors.length}</b>
                    </div>
                    ${partErrors.length > 0 ? `
                      <div class="ue-part-error-list">
                        ${visibleErrors.map(error => renderUseOfEnglishErrorItemHTML(error, true)).join("")}
                      </div>
                      ${partErrors.length > visibleErrors.length ? `
                        <button class="btn btn-secondary btn-full ue-view-all-errors" onclick="openUseOfEnglishPartErrorsModal('${partKey}')">
                          View all ${partErrors.length} errors
                        </button>
                      ` : ""}
                    ` : `<p class="ue-part-empty">No errors recorded.</p>`}
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
  if (STATE.history.length === 0) return 0;
  const correctSum = STATE.history.reduce((acc, curr) => acc + curr.correct, 0);
  const totalSum = STATE.history.reduce((acc, curr) => acc + curr.total, 0);
  return Math.round((correctSum / totalSum) * 100);
}

function getAccuracyTone(value) {
  const pct = Number(value) || 0;
  if (pct >= 85) return "excellent";
  if (pct >= 75) return "pass";
  if (pct >= 60) return "warning";
  if (pct > 0) return "risk";
  return "neutral";
}

function renderHistoryListV2HTML(limit = 4) {
  if (STATE.history.length === 0) {
    return `
      <div class="empty-state" style="display:flex; flex-direction:column; align-items:center; gap:12px; padding:2rem 1rem; text-align:center;">
        <span>Save a mock to start tracking progress.</span>
      </div>
    `;
  }

  const itemsToShow = limit ? STATE.history.slice(-limit) : STATE.history;

  return `
    <div class="attempt-list">
      ${itemsToShow.slice().reverse().map(item => {
        const isStrong = item.scaleScore >= 220;
        const isPass = item.scaleScore >= 200;
        const scoreClass = isStrong ? "excellent" : isPass ? "pass" : "risk";
        const sectionName = C2_EXAM_METADATA[item.section].name;
        const dateFormatted = formatCompactDateTime(item.date);
        const durationText = formatAttemptDuration(getAttemptDurationSeconds(item));

        return `
          <div class="attempt-item" role="button" tabindex="0"
               onclick="openHistoryDetailModal('${escapeJS(item.id)}')"
               onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openHistoryDetailModal('${escapeJS(item.id)}'); }"
               title="Ver detalle del intento">
            <div class="attempt-main">
              <span class="section-code">${getSectionIconSVG(item.section)}</span>
              <div class="attempt-copy">
                <strong>${sectionName}</strong>
                <span>${dateFormatted}${durationText ? ` - ${durationText}` : ""}</span>
              </div>
            </div>
            <div class="attempt-score">
              <strong class="${scoreClass}">${item.scaleScore}</strong>
              <span class="accuracy-value ${getAccuracyTone(item.percentage)}">${item.correct}/${item.total} - ${item.percentage}%</span>
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
  if (STATE.history.length === 0) {
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
          const sectionLogs = STATE.history.filter(item => item.section === stats.section);
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
                <span>${stats.avgScale || "--"} avg</span>
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
                <span>${weakestPart ? `Weakest part: ${weakestPart.name}` : "Part data pending"}</span>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
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
            <span>${STATE.history.length} attempts</span>
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
          <p>${escapeHTML(correctionText)}</p>
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

function renderHistoryErrorNoteEditorHTML(item, q, partData, gradeState) {
  if (item.section !== "useOfEnglish") return "";

  const note = getUseOfEnglishErrorNotes(item)[q] || "";
  const isError = isUseOfEnglishError(partData, gradeState);

  return `
    <div class="history-error-note-editor" id="history-error-note-editor-${q}" ${isError ? "" : "hidden"}>
      <label for="history-error-note-${q}">Error note</label>
      <textarea id="history-error-note-${q}" rows="2"
                placeholder="Add the rule, correction or reminder.">${escapeHTML(note)}</textarea>
    </div>
  `;
}

function renderUseOfEnglishPartTextEditorHTML(partKey, value = "", context = "sheet") {
  const partData = C2_EXAM_METADATA.useOfEnglish.parts[partKey];
  if (!partData) return "";

  const isSheetEditor = context === "sheet";
  const inputId = isSheetEditor ? `use-part-text-${partKey}` : `history-part-text-${partKey}`;
  const inputHandler = isSheetEditor
    ? `oninput="storeUseOfEnglishPartText('${partKey}', this.value)"`
    : "";
  const helperText = isSheetEditor
    ? "Optional - saved with this attempt for future review"
    : "One text for this part and attempt - shared by every error in the part";

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

  const noteEditor = document.getElementById(`history-error-note-editor-${qNum}`);
  if (noteEditor) {
    const weight = Number(control.dataset.weight) || 1;
    const isError = isPartial ? normalizedValue < weight : normalizedValue === "incorrect";
    noteEditor.hidden = !isError;
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
    item.gradedStates = snapshot.gradedStates;
    item.correct = snapshot.rawScore;
    item.total = snapshot.total;
    item.percentage = snapshot.percentage;
    item.scaleScore = snapshot.scaleScore;

    if (item.section === "useOfEnglish") {
      const answers = { ...getPlainObject(item.answers) };
      const meta = { ...getPlainObject(answers.meta) };
      const errorNotes = {};
      const partTexts = {};
      const sectionParts = C2_EXAM_METADATA.useOfEnglish.parts;

      Object.entries(sectionParts).forEach(([partKey, partData]) => {
        for (let q = partData.startQ; q <= partData.endQ; q++) {
          if (!isUseOfEnglishError(partData, snapshot.gradedStates[q])) continue;
          const note = document.getElementById(`history-error-note-${q}`)?.value.trim() || "";
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

      if (Object.keys(partTexts).length > 0) {
        meta.useOfEnglishPartTexts = partTexts;
      } else {
        delete meta.useOfEnglishPartTexts;
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
      let rowsHTML = "";
      
      for (let q = partData.startQ; q <= partData.endQ; q++) {
        const uAns = escapeHTML(getPlainObject(item.answers)[q] || "--");
        const gradeState = item.gradedStates[q];
        const isError = item.section === "useOfEnglish" && isUseOfEnglishError(partData, gradeState);
        const errorNote = isError ? (getUseOfEnglishErrorNotes(item)[q] || "").trim() : "";
        
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
              ? renderHistoryErrorNoteEditorHTML(item, q, partData, gradeState)
              : errorNote ? `<div class="history-error-note"><strong>Error note</strong>${escapeHTML(errorNote)}</div>` : ""}
            ${!editMode && isError ? `
              <button class="history-question-text-button" onclick="showUseOfEnglishPartText('${escapeJS(item.id)}', '${partKey}', 'history-review-part-text-panel')">
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
            ${item.section === "useOfEnglish" && !editMode ? `
              <button class="history-part-text-button" onclick="showUseOfEnglishPartText('${escapeJS(item.id)}', '${partKey}', 'history-review-part-text-panel')">View part text</button>
            ` : ""}
          </div>
          ${item.section === "useOfEnglish" && editMode
            ? renderUseOfEnglishPartTextEditorHTML(partKey, getUseOfEnglishPartTexts(item)[partKey] || "", "history")
            : ""}
          ${rowsHTML}
        </div>
      `;
    }
    sheetHTML = questionsHTML;
  }

  const reviewSheetHTML = item.section === "useOfEnglish" && !editMode ? `
    <div class="ue-text-workspace history-review-workspace">
      <div>${sheetHTML}</div>
      <aside class="ue-part-text-panel history-review-part-text-panel" id="history-review-part-text-panel" hidden aria-live="polite"></aside>
    </div>
  ` : sheetHTML;

  const reviewMaxWidth = editMode ? "760px" : "600px";

  modal.innerHTML = `
    <div class="modal-content history-review-modal ${editMode ? "editing" : ""}"
         data-history-section="${item.section}" style="max-width: ${reviewMaxWidth}; max-height: 90vh;">
      <div class="modal-header">
        <div>
          <h3 class="modal-title">Review: ${sectionMeta.name}</h3>
          ${editMode ? `<span class="history-review-mode">Editing corrections</span>` : ""}
        </div>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-body ${item.section === "useOfEnglish" && !editMode ? "history-review-scroll-body" : ""}">
        <div style="display:flex; justify-content:space-between; align-items:center; background-color:#f9fafb; border:1px solid var(--border-color); border-radius:6px; padding:0.75rem 1rem; margin-bottom:1.5rem;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Scale score</div>
            <div id="history-review-scale" class="history-review-scale">${item.scaleScore} pts <span>(${getCambridgeGrade(item.scaleScore)})</span></div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Raw marks</div>
            <div id="history-review-raw" class="history-review-raw">${getHistoryRawSummaryText(item)}</div>
          </div>
        </div>

        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.75rem;">
          Saved: <b>${dateFormatted}</b>${durationText ? ` - Time: <b>${durationText}</b>` : ""}
        </div>

        ${editMode ? `<div class="history-review-edit-notice">Change the correction below. Scores and scale are recalculated automatically; original answers stay unchanged.</div>` : ""}
        
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
  STATE.errorNotes = {};
  STATE.useOfEnglishPartTexts = {};
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
    sheetContent = `
      <div class="sheet-notice">
        Enter your answers. When you finish, lock the sheet and grade each item.
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
    STATE.errorNotes = {};
    STATE.useOfEnglishPartTexts = {};
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

  if (STATE.activeSection === "useOfEnglish") {
    Object.keys(sectionMeta.parts).forEach(partKey => {
      const partTextArea = document.getElementById(`part-text-area-${partKey}`);
      if (partTextArea) {
        partTextArea.innerHTML = renderUseOfEnglishPartTextEditorHTML(
          partKey,
          STATE.useOfEnglishPartTexts[partKey] || "",
          "sheet"
        );
      }
    });
  }
  
  for (const [partKey, partData] of Object.entries(sectionMeta.parts)) {
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
  
  const cBtn = document.getElementById(`correct-btn-${qNum}`);
  const iBtn = document.getElementById(`incorrect-btn-${qNum}`);
  
  if (state === "correct") {
    cBtn.classList.add("active");
    iBtn.classList.remove("active");
    delete STATE.errorNotes[qNum];
  } else {
    iBtn.classList.add("active");
    cBtn.classList.remove("active");
  }

  updateErrorNoteArea(qNum);
}

function markPartialGrade(qNum, pts) {
  STATE.gradedStates[qNum] = pts;
  
  const btn0 = document.getElementById(`pts-btn-${qNum}-0`);
  const btn1 = document.getElementById(`pts-btn-${qNum}-1`);
  const btn2 = document.getElementById(`pts-btn-${qNum}-2`);
  
  btn0.className = "points-btn";
  btn1.className = "points-btn";
  btn2.className = "points-btn";
  
  const activeBtn = document.getElementById(`pts-btn-${qNum}-${pts}`);
  activeBtn.classList.add(`active-${pts}`);

  if (pts === 2) delete STATE.errorNotes[qNum];
  updateErrorNoteArea(qNum);
}

function updateErrorNoteArea(qNum) {
  const noteArea = document.getElementById(`error-note-area-${qNum}`);
  if (!noteArea) return;

  const useOfEnglishParts = C2_EXAM_METADATA.useOfEnglish.parts;
  const partData = Object.values(useOfEnglishParts).find(part => qNum >= part.startQ && qNum <= part.endQ);
  const shouldShow = STATE.activeSection === "useOfEnglish"
    && isUseOfEnglishError(partData, STATE.gradedStates[qNum]);

  if (!shouldShow) {
    noteArea.innerHTML = "";
    return;
  }

  noteArea.innerHTML = `
    <div class="sheet-error-note-box">
      <label for="error-note-${qNum}">Error note (optional)</label>
      <textarea class="sheet-error-note-input" id="error-note-${qNum}" rows="2"
                oninput="storeErrorNote(${qNum}, this.value)"
                placeholder="Why was this wrong? Add the rule, correction or reminder.">${escapeHTML(STATE.errorNotes[qNum] || "")}</textarea>
    </div>
  `;
}

function storeErrorNote(qNum, value) {
  if (STATE.activeSection !== "useOfEnglish") return;
  STATE.errorNotes[qNum] = value;
}

function storeUseOfEnglishPartText(partKey, value) {
  if (STATE.activeSection !== "useOfEnglish") return;
  STATE.useOfEnglishPartTexts[partKey] = value;
}

async function saveGradedSheetResult() {
  if (STATE.isSavingAttempt) return;

  const sectionMeta = C2_EXAM_METADATA[STATE.activeSection];
  
  let missingGrades = [];
  for (const [partKey, partData] of Object.entries(sectionMeta.parts)) {
    for (let q = partData.startQ; q <= partData.endQ; q++) {
      if (STATE.gradedStates[q] === undefined) {
        missingGrades.push(q);
      }
    }
  }

  if (missingGrades.length > 0) {
    alert(`Grade every question before saving (Q.${missingGrades.join(', Q.')})`);
    return;
  }

  let rawScoreTotal = 0;
  
  for (const [partKey, partData] of Object.entries(sectionMeta.parts)) {
    for (let q = partData.startQ; q <= partData.endQ; q++) {
      const state = STATE.gradedStates[q];
      
      if (partData.type === "partial") {
        rawScoreTotal += state;
      } else {
        if (state === "correct") {
          rawScoreTotal += partData.weight;
        }
      }
    }
  }

  const maxPossibleMarks = sectionMeta.maxMarks;
  const accuracyPct = Math.round((rawScoreTotal / maxPossibleMarks) * 100);
  const scaleScore = calculateScaleScore(STATE.activeSection, rawScoreTotal);
  const durationSeconds = getCurrentPracticeDurationSeconds();
  const answers = { ...STATE.answers };
  const errorNotes = Object.fromEntries(
    Object.entries(STATE.errorNotes)
      .map(([q, note]) => [q, typeof note === "string" ? note.trim() : ""])
      .filter(([, note]) => note.length > 0)
  );
  const partTexts = Object.fromEntries(
    Object.entries(STATE.useOfEnglishPartTexts)
      .map(([partKey, text]) => [partKey, typeof text === "string" ? text.trim() : ""])
      .filter(([, text]) => text.length > 0)
  );

  if (
    durationSeconds > 0
    || (STATE.activeSection === "useOfEnglish" && Object.keys(errorNotes).length > 0)
    || (STATE.activeSection === "useOfEnglish" && Object.keys(partTexts).length > 0)
  ) {
    answers.meta = {
      ...getPlainObject(answers.meta),
      ...(durationSeconds > 0 ? { durationSeconds } : {}),
      ...(STATE.activeSection === "useOfEnglish" && Object.keys(errorNotes).length > 0 ? { errorNotes } : {}),
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
  STATE.history.push({
    id: `session_${STATE.activeSection}_${savedAt}`,
    section: STATE.activeSection,
    correct: rawScoreTotal,
    total: maxPossibleMarks,
    percentage: accuracyPct,
    scaleScore: scaleScore,
    answers,
    gradedStates: { ...STATE.gradedStates },
    date: savedAt,
    durationSeconds
  });

  await persistHistory({ mode: "merge" });
  STATE.isSavingAttempt = false;
  renderDashboard();
}

// ==========================================================================
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
  STATE.history.push({
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
  });

  await persistHistory({ mode: "merge" });
  STATE.isSavingAttempt = false;
  renderDashboard();
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

function calculateAverageScaleScore() {
  if (STATE.history.length === 0) return 0;
  const sum = STATE.history.reduce((acc, curr) => acc + curr.scaleScore, 0);
  return Math.round(sum / STATE.history.length);
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
  } else if (STATE.currentView === "sheet") {
    renderAnswerSheetHTML();
  } else {
    renderHome();
  }
}

function openAllAttemptsModal() {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px; max-height: 85vh; display: flex; flex-direction: column;">
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid var(--border-color);">
        <h3 class="modal-title">All Attempts</h3>
        <button class="modal-close" onclick="closeModal()" aria-label="Close" style="background: transparent; border: 0; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>
      <div class="modal-body" style="flex: 1; overflow-y: auto; padding: 16px 0; min-height: 0;">
        ${renderHistoryListV2HTML(null)}
      </div>
      <div style="padding-top: 12px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end;">
        <button class="btn btn-primary" onclick="closeModal()">Close</button>
      </div>
    </div>
  `;
  mountModal(modal);
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
