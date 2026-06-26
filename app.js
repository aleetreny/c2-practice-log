// STATE MANAGEMENT
const STATE = {
  currentView: "home", // "home" | "dashboard" | "sheet"
  activeSection: null, // "useOfEnglish" | "reading" | "listening" | "writing"
  answers: {}, // Q-num -> string
  gradedStates: {}, // Q-num -> "correct" | "incorrect" | score (0|1|2)
  isCorrecting: false,
  activeProfile: "Aleetreny",
  profiles: ["Aleetreny"],
  history: [],
  isAuthenticated: false,
  supabaseSession: null,
  supabaseUserEmail: "",
  syncStatus: "local",
  syncMessage: "Local backup"
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
    answers: item.answers || {},
    graded_states: item.gradedStates || {},
    attempted_at: new Date(Number(item.date) || Date.now()).toISOString()
  };
}

function supabaseRowToHistoryItem(row) {
  return {
    id: row.id,
    section: row.section,
    correct: Number(row.correct) || 0,
    total: Number(row.total) || 0,
    percentage: Number(row.percentage) || 0,
    scaleScore: Number(row.scale_score) || 0,
    answers: row.answers || {},
    gradedStates: row.graded_states || {},
    date: row.attempted_at ? new Date(row.attempted_at).getTime() : Date.now()
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
    return { raw: 0, max: partData.weight || 0 };
  }

  if (partData.type === "writing") {
    const criteria = session.gradedStates[partKey];
    const raw = criteria
      ? (criteria.content || 0) + (criteria.comm || 0) + (criteria.org || 0) + (criteria.lang || 0)
      : 0;
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
    const averagePct = maxSum > 0 ? Math.round((rawSum / maxSum) * 100) : 0;
    const latestScore = scores.length > 0 ? scores[scores.length - 1] : null;

    return {
      section,
      partKey,
      name: partData.name,
      attempts: logs.length,
      averagePct,
      averageRaw: logs.length > 0 ? rawSum / logs.length : 0,
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
            <div class="summary-card-value ${overallAccuracy >= 80 ? "positive" : "negative"}">${overallAccuracy ? `${overallAccuracy}%` : "--"}</div>
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
      </main>
    </div>
  `;
}

function calculateOverallAccuracy() {
  if (STATE.history.length === 0) return 0;
  const correctSum = STATE.history.reduce((acc, curr) => acc + curr.correct, 0);
  const totalSum = STATE.history.reduce((acc, curr) => acc + curr.total, 0);
  return Math.round((correctSum / totalSum) * 100);
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

        return `
          <div class="attempt-item" role="button" tabindex="0"
               onclick="openHistoryDetailModal('${escapeJS(item.id)}')"
               onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openHistoryDetailModal('${escapeJS(item.id)}'); }"
               title="Ver detalle del intento">
            <div class="attempt-main">
              <span class="section-code">${getSectionIconSVG(item.section)}</span>
              <div class="attempt-copy">
                <strong>${sectionName}</strong>
                <span>${dateFormatted}</span>
              </div>
            </div>
            <div class="attempt-score">
              <strong class="${scoreClass}">${item.scaleScore}</strong>
              <span>${item.correct}/${item.total} - ${item.percentage}%</span>
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
                <span>${stats.avgAccuracy || "--"}% raw</span>
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
                        <strong>${part.attempts ? `${part.averagePct}%` : "--"}</strong>
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

  document.body.appendChild(modal);
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
function openHistoryDetailModal(sessionId) {
  const item = STATE.history.find(h => h.id === sessionId);
  if (!item) return;

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  
  const dateFormatted = new Date(item.date).toLocaleString();
  const sectionMeta = C2_EXAM_METADATA[item.section];
  
  let sheetHTML = "";
  if (item.section === "writing") {
    const w1Score = item.gradedStates.part1.content + item.gradedStates.part1.comm + item.gradedStates.part1.org + item.gradedStates.part1.lang;
    const w2Score = item.gradedStates.part2.content + item.gradedStates.part2.comm + item.gradedStates.part2.org + item.gradedStates.part2.lang;
    
    sheetHTML = `
      <div style="display:flex; flex-direction:column; gap:1rem;">
        <div style="background-color:#fafafa; border:1px solid var(--border-color); border-radius:6px; padding:1rem;">
          <h4 style="font-weight:700; color:var(--accent-color); margin-bottom:0.5rem;">Part 1 - Compulsory Essay (${w1Score}/20 pts)</h4>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.5rem;">
            Content: ${item.gradedStates.part1.content}/5 | Comm: ${item.gradedStates.part1.comm}/5 | Org: ${item.gradedStates.part1.org}/5 | Lang: ${item.gradedStates.part1.lang}/5
          </div>
          <div style="background:#fff; border:1px solid var(--border-color); border-radius:4px; padding:0.75rem; max-height:120px; overflow-y:auto; font-family:monospace; white-space:pre-wrap; font-size:0.8rem;">
            ${item.answers.part1 || "No text saved"}
          </div>
        </div>
        <div style="background-color:#fafafa; border:1px solid var(--border-color); border-radius:6px; padding:1rem;">
          <h4 style="font-weight:700; color:var(--accent-color); margin-bottom:0.5rem;">Part 2 - Optional Writing (${w2Score}/20 pts)</h4>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.5rem;">
            Content: ${item.gradedStates.part2.content}/5 | Comm: ${item.gradedStates.part2.comm}/5 | Org: ${item.gradedStates.part2.org}/5 | Lang: ${item.gradedStates.part2.lang}/5
          </div>
          <div style="background:#fff; border:1px solid var(--border-color); border-radius:4px; padding:0.75rem; max-height:120px; overflow-y:auto; font-family:monospace; white-space:pre-wrap; font-size:0.8rem;">
            ${item.answers.part2 || "No text saved"}
          </div>
        </div>
      </div>
    `;
  } else {
    // Generate answers breakdown grid
    let questionsHTML = "";
    
    for (const [partKey, partData] of Object.entries(sectionMeta.parts)) {
      let rowsHTML = "";
      
      for (let q = partData.startQ; q <= partData.endQ; q++) {
        const uAns = item.answers[q] || "--";
        const gradeState = item.gradedStates[q];
        
        let gradeLabel = "";
        if (partData.type === "partial") {
          const ptClass = gradeState === 2 ? 'color:var(--color-success)' : 'color:var(--color-error)';
          gradeLabel = `<span style="font-weight:700; ${ptClass}; font-size:0.85rem;">[${gradeState}/2 pts]</span>`;
        } else {
          gradeLabel = gradeState === "correct" ?
            `<span style="color:var(--color-success); font-weight:bold;">Correct</span>` :
            `<span style="color:var(--color-error); font-weight:bold;">Missed</span>`;
        }

        rowsHTML += `
          <div style="border-bottom:1px solid #f3f4f6; padding:0.5rem 0.25rem; font-size:0.8rem;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span><b>Q.${q}</b>: <span style="font-family:monospace; font-weight:700; text-transform:uppercase;">${uAns}</span></span>
              <span>${gradeLabel}</span>
            </div>
          </div>
        `;
      }

      questionsHTML += `
        <div style="border:1px solid var(--border-color); border-radius:6px; padding:0.75rem 1rem; margin-bottom:1rem;">
          <h4 style="font-size:0.85rem; font-weight:700; color:var(--accent-color); border-bottom:1px dashed var(--border-color); padding-bottom:0.25rem; margin-bottom:0.5rem;">${partData.name}</h4>
          ${rowsHTML}
        </div>
      `;
    }
    sheetHTML = questionsHTML;
  }

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px; max-height: 90vh;">
      <div class="modal-header">
        <h3 class="modal-title">Review: ${sectionMeta.name}</h3>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div style="display:flex; justify-content:space-between; align-items:center; background-color:#f9fafb; border:1px solid var(--border-color); border-radius:6px; padding:0.75rem 1rem; margin-bottom:1.5rem;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Scale score</div>
            <div style="font-size:1.4rem; font-weight:800; color:var(--accent-color);">${item.scaleScore} pts <span style="font-size:0.85rem; font-weight:normal;">(${getCambridgeGrade(item.scaleScore)})</span></div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Raw marks</div>
            <div style="font-size:1.1rem; font-weight:700; color:var(--text-main);">${item.correct} / ${item.total} pts (${item.percentage}%)</div>
          </div>
        </div>

        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.75rem;">Saved: <b>${dateFormatted}</b></div>
        
        ${sheetHTML}
      </div>
      <div style="margin-top:1rem; text-align:right;">
        <button class="btn btn-primary" onclick="closeModal()">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// ==========================================================================
// 4. ANSWER SHEET TEMPLATE CONTROLLER
// ==========================================================================
function openAnswerSheet(section) {
  STATE.currentView = "sheet";
  STATE.activeSection = section;
  STATE.answers = {};
  STATE.gradedStates = {};
  STATE.isCorrecting = false;
  
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
        <textarea class="writing-sheet-textarea" id="writing-textarea-part1" placeholder="Write your essay here..." oninput="trackSectionWritingWordCount('part1', this.value)" style="height:180px;"></textarea>
        <div class="writing-word-badge under" id="writing-count-part1" style="margin-top:0.5rem;">0 words</div>
      </div>

      <!-- PART 2 WRITING -->
      <div style="background-color:#fafafa; border:1px solid var(--border-color); border-radius:8px; padding:1.25rem; margin-bottom:1.5rem;">
        <h3 style="font-size:1rem; font-weight:700; margin-bottom:0.75rem; color:var(--accent-color);">Writing Part 2: Optional Writing (280 - 320 words)</h3>
        <textarea class="writing-sheet-textarea" id="writing-textarea-part2" placeholder="Write your article/report/review here..." oninput="trackSectionWritingWordCount('part2', this.value)" style="height:180px;"></textarea>
        <div class="writing-word-badge under" id="writing-count-part2" style="margin-top:0.5rem;">0 words</div>
      </div>
      
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
      <div class="sheet-container">
        <div class="sheet-header">
          <div class="sheet-title">
            <h2>Mock: ${sectionMeta.name}</h2>
            <p>${sectionMeta.description}</p>
          </div>
          <button class="btn btn-secondary" onclick="renderHome()">Back</button>
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
}

function renderSectionPartsHTML(sectionMeta) {
  let sectionHTML = "";
  
  for (const [partKey, partData] of Object.entries(sectionMeta.parts)) {
    let rowsHTML = "";
    
    for (let q = partData.startQ; q <= partData.endQ; q++) {
      const answeredVal = STATE.answers[q] || "";
      let inputField = "";
      
      const weightHint = partData.weight > 1 ? `<span style="font-size:0.7rem; color:var(--text-muted); font-weight:normal; margin-left:0.25rem;">(${partData.weight} marks)</span>` : "";

      if (partData.type === "mcq") {
        inputField = `
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
      } else if (partData.type === "dropdown") {
        inputField = `
          <select class="sheet-select-input" onchange="storeInputAnswer(${q}, this.value)">
            <option value="">Select...</option>
            ${partData.options.map(opt => `
              <option value="${opt}" ${answeredVal === opt ? 'selected' : ''}>Option ${opt}</option>
            `).join('')}
          </select>
        `;
      } else {
        inputField = `
          <input type="text" class="sheet-text-input" value="${answeredVal}" maxlength="80" 
                 oninput="storeInputAnswer(${q}, this.value)" placeholder="Enter answer...">
        `;
      }

      rowsHTML += `
        <div class="sheet-row" id="sheet-row-${q}" style="border:none; border-bottom:1px solid #f3f4f6; border-radius:0; padding:0.6rem 0.5rem;">
          <div class="sheet-row-main">
            <div class="sheet-q-num">Q.${q} ${weightHint}</div>
            <div style="flex-grow:1; display:flex; justify-content:flex-start;">
              ${inputField}
            </div>
            <div id="correction-controls-${q}"></div>
          </div>
          <div id="error-note-area-${q}"></div>
        </div>
      `;
    }

    sectionHTML += `
      <div style="background-color:#ffffff; border:1px solid var(--border-color); border-radius:8px; padding:1.25rem; margin-bottom:1.5rem;">
        <h3 style="font-size:1rem; font-weight:700; color:var(--accent-color); border-bottom:1px solid var(--border-color); padding-bottom:0.5rem; margin-bottom:0.75rem;">
          ${partData.name}
        </h3>
        <div style="display:flex; flex-direction:column;">
          ${rowsHTML}
        </div>
      </div>
    `;
  }

  return sectionHTML;
}

function clearSheetInputs() {
  if (confirm("Reset all answers on the current sheet?")) {
    STATE.answers = {};
    STATE.gradedStates = {};
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
    document.getElementById(`error-note-area-${qNum}`).innerHTML = "";
  } else {
    iBtn.classList.add("active");
    cBtn.classList.remove("active");
    document.getElementById(`error-note-area-${qNum}`).innerHTML = "";
  }
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
  
  const noteArea = document.getElementById(`error-note-area-${qNum}`);
  noteArea.innerHTML = "";
}

async function saveGradedSheetResult() {
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
  
  STATE.history.push({
    id: `session_${STATE.activeSection}_${Date.now()}`,
    section: STATE.activeSection,
    correct: rawScoreTotal,
    total: maxPossibleMarks,
    percentage: accuracyPct,
    scaleScore: scaleScore,
    answers: { ...STATE.answers },
    gradedStates: { ...STATE.gradedStates },
    date: Date.now()
  });

  await persistHistory({ mode: "merge" });
  renderDashboard();
}

// ==========================================================================
// 5. WRITING GRADING FLOW (CRITERIA CHIPS)
// ==========================================================================
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

function setupWritingGradingArea() {
  document.getElementById("writing-textarea-part1").disabled = true;
  document.getElementById("writing-textarea-part2").disabled = true;
  
  const gradingArea = document.getElementById("writing-grading-area");
  
  gradingArea.innerHTML = `
    <!-- PART 1 RUBRIC -->
    <div class="writing-criteria-checklist" style="margin-bottom:1.5rem;">
      <h3 style="font-size:1.05rem; font-weight:700; color:var(--accent-color); border-bottom:1px solid var(--border-color); padding-bottom:0.5rem; margin-bottom:1rem;">Essay Assessment Rubric: Part 1</h3>
      
      <div>
        <div class="criteria-title">Content</div>
        <div class="criteria-slider-row">
          <input type="range" class="criteria-slider" id="w1-score-content" min="0" max="5" value="3" oninput="updateWritingRawTotal()">
          <span class="criteria-value" id="w1-val-content">3 / 5</span>
        </div>
      </div>
      <div>
        <div class="criteria-title">Communicative Achievement</div>
        <div class="criteria-slider-row">
          <input type="range" class="criteria-slider" id="w1-score-comm" min="0" max="5" value="3" oninput="updateWritingRawTotal()">
          <span class="criteria-value" id="w1-val-comm">3 / 5</span>
        </div>
      </div>
      <div>
        <div class="criteria-title">Organisation</div>
        <div class="criteria-slider-row">
          <input type="range" class="criteria-slider" id="w1-score-org" min="0" max="5" value="3" oninput="updateWritingRawTotal()">
          <span class="criteria-value" id="w1-val-org">3 / 5</span>
        </div>
      </div>
      <div>
        <div class="criteria-title">Language (Grammar & Lexicon)</div>
        <div class="criteria-slider-row">
          <input type="range" class="criteria-slider" id="w1-score-lang" min="0" max="5" value="3" oninput="updateWritingRawTotal()">
          <span class="criteria-value" id="w1-val-lang">3 / 5</span>
        </div>
      </div>
      <div style="font-size:0.85rem; font-weight:700; text-align:right; margin-top:0.5rem;" id="w1-part-total">Part 1 Subtotal: 12 / 20 pts</div>
    </div>

    <!-- PART 2 RUBRIC -->
    <div class="writing-criteria-checklist">
      <h3 style="font-size:1.05rem; font-weight:700; color:var(--accent-color); border-bottom:1px solid var(--border-color); padding-bottom:0.5rem; margin-bottom:1rem;">Writing Assessment Rubric: Part 2</h3>
      
      <div>
        <div class="criteria-title">Content</div>
        <div class="criteria-slider-row">
          <input type="range" class="criteria-slider" id="w2-score-content" min="0" max="5" value="3" oninput="updateWritingRawTotal()">
          <span class="criteria-value" id="w2-val-content">3 / 5</span>
        </div>
      </div>
      <div>
        <div class="criteria-title">Communicative Achievement</div>
        <div class="criteria-slider-row">
          <input type="range" class="criteria-slider" id="w2-score-comm" min="0" max="5" value="3" oninput="updateWritingRawTotal()">
          <span class="criteria-value" id="w2-val-comm">3 / 5</span>
        </div>
      </div>
      <div>
        <div class="criteria-title">Organisation</div>
        <div class="criteria-slider-row">
          <input type="range" class="criteria-slider" id="w2-score-org" min="0" max="5" value="3" oninput="updateWritingRawTotal()">
          <span class="criteria-value" id="w2-val-org">3 / 5</span>
        </div>
      </div>
      <div>
        <div class="criteria-title">Language (Grammar & Lexicon)</div>
        <div class="criteria-slider-row">
          <input type="range" class="criteria-slider" id="w2-score-lang" min="0" max="5" value="3" oninput="updateWritingRawTotal()">
          <span class="criteria-value" id="w2-val-lang">3 / 5</span>
        </div>
      </div>
      <div style="font-size:0.85rem; font-weight:700; text-align:right; margin-top:0.5rem;" id="w2-part-total">Part 2 Subtotal: 12 / 20 pts</div>
    </div>

    <!-- SUMMATION CARD -->
    <div class="writing-criteria-checklist" style="margin-top:1.5rem; border-color:var(--accent-color); background-color:#f3f4f6;">
      <div style="display:flex; justify-content:space-between; align-items:center; font-weight:800; font-size:1.1rem; color:var(--text-main);">
        <span>Total Summed Score:</span>
        <span style="color:var(--accent-hover);" id="writing-overall-score">24 / 40 points</span>
      </div>
    </div>
  `;

  const mainBtn = document.getElementById("sheet-submit-btn");
  mainBtn.textContent = "Save writing";
  mainBtn.setAttribute("onclick", "saveWritingSheetResult()");
  
  updateWritingRawTotal();
}

function updateWritingRawTotal() {
  const w1Content = parseInt(document.getElementById("w1-score-content").value);
  const w1Comm = parseInt(document.getElementById("w1-score-comm").value);
  const w1Org = parseInt(document.getElementById("w1-score-org").value);
  const w1Lang = parseInt(document.getElementById("w1-score-lang").value);
  
  const w2Content = parseInt(document.getElementById("w2-score-content").value);
  const w2Comm = parseInt(document.getElementById("w2-score-comm").value);
  const w2Org = parseInt(document.getElementById("w2-score-org").value);
  const w2Lang = parseInt(document.getElementById("w2-score-lang").value);
  
  document.getElementById("w1-val-content").textContent = `${w1Content} / 5`;
  document.getElementById("w1-val-comm").textContent = `${w1Comm} / 5`;
  document.getElementById("w1-val-org").textContent = `${w1Org} / 5`;
  document.getElementById("w1-val-lang").textContent = `${w1Lang} / 5`;
  
  document.getElementById("w2-val-content").textContent = `${w2Content} / 5`;
  document.getElementById("w2-val-comm").textContent = `${w2Comm} / 5`;
  document.getElementById("w2-val-org").textContent = `${w2Org} / 5`;
  document.getElementById("w2-val-lang").textContent = `${w2Lang} / 5`;
  
  const totalW1 = w1Content + w1Comm + w1Org + w1Lang;
  const totalW2 = w2Content + w2Comm + w2Org + w2Lang;
  const totalOverall = totalW1 + totalW2;
  
  document.getElementById("w1-part-total").textContent = `Part 1 Subtotal: ${totalW1} / 20 pts`;
  document.getElementById("w2-part-total").textContent = `Part 2 Subtotal: ${totalW2} / 20 pts`;
  document.getElementById("writing-overall-score").textContent = `${totalOverall} / 40 points`;
}

async function saveWritingSheetResult() {
  const text1 = document.getElementById("writing-textarea-part1").value;
  const text2 = document.getElementById("writing-textarea-part2").value;
  
  const w1Content = parseInt(document.getElementById("w1-score-content").value);
  const w1Comm = parseInt(document.getElementById("w1-score-comm").value);
  const w1Org = parseInt(document.getElementById("w1-score-org").value);
  const w1Lang = parseInt(document.getElementById("w1-score-lang").value);
  
  const w2Content = parseInt(document.getElementById("w2-score-content").value);
  const w2Comm = parseInt(document.getElementById("w2-score-comm").value);
  const w2Org = parseInt(document.getElementById("w2-score-org").value);
  const w2Lang = parseInt(document.getElementById("w2-score-lang").value);
  
  const total = w1Content + w1Comm + w1Org + w1Lang + w2Content + w2Comm + w2Org + w2Lang;
  const accuracyPct = Math.round((total / 40) * 100);
  const scaleScore = calculateScaleScore("writing", total);
  
  STATE.history.push({
    id: `session_writing_${Date.now()}`,
    section: "writing",
    correct: total,
    total: 40,
    percentage: accuracyPct,
    scaleScore: scaleScore,
    answers: { part1: text1, part2: text2 },
    gradedStates: { 
      part1: { content: w1Content, comm: w1Comm, org: w1Org, lang: w1Lang },
      part2: { content: w2Content, comm: w2Comm, org: w2Org, lang: w2Lang }
    },
    date: Date.now()
  });

  await persistHistory({ mode: "merge" });
  renderDashboard();
}

// HELPERS
function closeModal() {
  const modal = document.querySelector(".modal-overlay");
  if (modal) modal.remove();
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
  document.body.appendChild(modal);
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
