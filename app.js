// STATE MANAGEMENT
const STATE = {
  currentView: "home", // "home" | "dashboard" | "sheet"
  activeSection: null, // "useOfEnglish" | "reading" | "listening" | "writing"
  answers: {}, // Q-num -> string
  gradedStates: {}, // Q-num -> "correct" | "incorrect" | score (0|1|2)
  errorNotes: {}, // Q-num -> string
  isCorrecting: false,
  activeProfile: "Candidate C2",
  profiles: ["Candidate C2"],
  history: [], 
  mistakes: [] 
};

// INITIALIZE APP
window.addEventListener("DOMContentLoaded", () => {
  loadProfiles();
  loadLocalStorage();
  renderHome();
});

// LOAD AND SAVE LOCAL STORAGE
function loadProfiles() {
  try {
    const rawActive = localStorage.getItem("c2_companion_active_profile");
    const rawList = localStorage.getItem("c2_companion_profiles");
    
    if (rawActive) STATE.activeProfile = rawActive;
    if (rawList) {
      STATE.profiles = JSON.parse(rawList);
    } else {
      STATE.profiles = ["Candidate C2"];
      localStorage.setItem("c2_companion_profiles", JSON.stringify(STATE.profiles));
    }
  } catch (e) {
    console.error("Failed to load profiles", e);
    STATE.activeProfile = "Candidate C2";
    STATE.profiles = ["Candidate C2"];
  }
}

function loadLocalStorage() {
  const profileKey = STATE.activeProfile.replace(/\s+/g, "_");
  try {
    const rawHistory = localStorage.getItem(`c2_history_${profileKey}`);
    const rawMistakes = localStorage.getItem(`c2_mistakes_${profileKey}`);
    
    if (rawHistory) {
      STATE.history = JSON.parse(rawHistory);
    } else {
      STATE.history = [];
    }

    if (rawMistakes) {
      STATE.mistakes = JSON.parse(rawMistakes);
    } else {
      STATE.mistakes = [];
    }

    // Inyectar datos de demostración si está vacío
    if (STATE.history.length === 0 && STATE.activeProfile === "Candidate C2") {
      injectMockData();
    }
  } catch (e) {
    console.error("Failed to load local storage for user profile", e);
    STATE.history = [];
    STATE.mistakes = [];
  }
}

function saveLocalStorage() {
  const profileKey = STATE.activeProfile.replace(/\s+/g, "_");
  try {
    localStorage.setItem(`c2_history_${profileKey}`, JSON.stringify(STATE.history));
    localStorage.setItem(`c2_mistakes_${profileKey}`, JSON.stringify(STATE.mistakes));
    localStorage.setItem("c2_companion_active_profile", STATE.activeProfile);
    localStorage.setItem("c2_companion_profiles", JSON.stringify(STATE.profiles));
  } catch (e) {
    console.error("Failed to save local storage", e);
  }
}

// INJECT FAKE HISTORICAL DEMO DATA
function injectMockData() {
  const days = (n) => Date.now() - n * 24 * 60 * 60 * 1000;
  
  STATE.history = [
    {
      id: "mock_session_1",
      section: "useOfEnglish",
      correct: 20, // raw score out of 28+8=36 marks
      total: 36,
      percentage: 56,
      scaleScore: 175,
      answers: {
        1: "A", 2: "B", 3: "A", 4: "C", 5: "D", 6: "A", 7: "B", 8: "C",
        9: "THAT", 10: "FOR", 11: "THANKS", 12: "IF", 13: "NOT", 14: "ONE", 15: "ABOUT", 16: "DOWN",
        17: "REGENERATION", 18: "DEPRIVATION", 19: "REPLACEABLE", 20: "DISPOSED", 21: "SEQUENTIAL", 22: "WHETHER", 23: "VALUED", 24: "BENEFICIAL",
        25: "UNTIL THE OFFICE CLOSED DID", 26: "SHYING AWAY", 27: "PULL SOCKS", 28: "IT NOT BEEN FOR", 29: "TO CALL OFF", 30: "LEFT HER AT A LOSS"
      },
      gradedStates: {
        1: "correct", 2: "correct", 3: "correct", 4: "incorrect", 5: "correct", 6: "incorrect", 7: "correct", 8: "incorrect",
        9: "correct", 10: "incorrect", 11: "correct", 12: "incorrect", 13: "correct", 14: "correct", 15: "correct", 16: "incorrect",
        17: "correct", 18: "correct", 19: "incorrect", 20: "incorrect", 21: "correct", 22: "incorrect", 23: "incorrect", 24: "correct",
        25: 2, 26: 0, 27: 1, 28: 2, 29: 2, 30: 1
      },
      errorNotes: {
        4: "Wrong vocabulary word choice", 6: "Missed collocated verb", 8: "Did not fit context",
        10: "Used 'for' instead of 'to'", 12: "Used 'if' instead of 'whether'", 16: "Phrasal verb error",
        19: "Forgot negative prefix 'ir-'", 20: "Missed prefix 'predisposed'", 22: "Wrong conjunction", 23: "Forgot prefix 'undervalued'",
        26: "Used active shying instead of shied", 27: "Missed pronoun 'your'"
      },
      incorrectQuestions: [4, 6, 8, 10, 12, 16, 19, 20, 22, 23, 26, 27],
      date: days(6)
    },
    {
      id: "mock_session_2",
      section: "reading",
      correct: 25, // raw score out of 12(P5)+14(P6)+10(P7) = 36 marks
      total: 36,
      percentage: 69,
      scaleScore: 187,
      answers: {
        31: "B", 32: "A", 33: "C", 34: "B", 35: "C", 36: "D",
        37: "A", 38: "C", 39: "F", 40: "G", 41: "D", 42: "B", 43: "H",
        44: "A", 45: "B", 46: "C", 47: "D", 48: "A", 49: "C", 50: "B", 51: "D", 52: "A", 53: "B"
      },
      gradedStates: {
        31: "correct", 32: "incorrect", 33: "correct", 34: "incorrect", 35: "correct", 36: "correct",
        37: "incorrect", 38: "correct", 39: "correct", 40: "correct", 41: "incorrect", 42: "correct", 43: "correct",
        44: "correct", 45: "correct", 46: "correct", 47: "correct", 48: "incorrect", 49: "correct", 50: "correct", 51: "correct", 52: "correct", 53: "correct"
      },
      errorNotes: {
        32: "Misunderstood 'organic automata' context", 34: "Confused mass property aggregates",
        37: "Wrong paragraph link, missed transition", 41: "Misread pressure cellular rupture details",
        48: "Missed Marcus Vance frustration details"
      },
      incorrectQuestions: [32, 34, 37, 41, 48],
      date: days(4)
    },
    {
      id: "mock_session_3",
      section: "listening",
      correct: 23, // raw score out of 30 marks
      total: 30,
      percentage: 77,
      scaleScore: 197,
      answers: {
        54: "A", 55: "B", 56: "B", 57: "A", 58: "A", 59: "B",
        60: "COLD LIGHT", 61: "LUCIFEREEN", 62: "LANTERNFISH", 63: "SILHOUETTES", 64: "FISHING ROD", 65: "MILKY SEAS", 66: "SATELLITES", 67: "BURGLAR ALARM", 68: "POLLUTION SENSORS",
        69: "B", 70: "B", 71: "C", 72: "B", 73: "C",
        74: "C", 75: "F", 76: "A", 77: "D", 78: "H", 79: "E", 80: "B", 81: "G", 82: "A", 83: "D"
      },
      gradedStates: {
        54: "correct", 55: "correct", 56: "correct", 57: "correct", 58: "correct", 59: "correct",
        60: "correct", 61: "incorrect", 62: "correct", 63: "correct", 64: "correct", 65: "correct", 66: "correct", 67: "correct", 68: "incorrect",
        69: "correct", 70: "correct", 71: "correct", 72: "correct", 73: "correct",
        74: "incorrect", 75: "correct", 76: "correct", 77: "correct", 78: "correct", 79: "incorrect", 80: "correct", 81: "correct", 82: "correct", 83: "correct"
      },
      errorNotes: {
        61: "Spelling mistake of chemical substance 'luciferin'",
        68: "Heard 'pollution detectors', wrote 'sensors'",
        74: "Missed Speaker 1 burnout reason",
        79: "Missed financial constraints details"
      },
      incorrectQuestions: [61, 68, 74, 79],
      date: days(3)
    },
    {
      id: "mock_session_4",
      section: "useOfEnglish",
      correct: 30, // raw score out of 36 marks
      total: 36,
      percentage: 83,
      scaleScore: 198,
      answers: {
        1: "A", 2: "A", 3: "A", 4: "A", 5: "A", 6: "A", 7: "A", 8: "A",
        9: "THAT", 10: "TO", 11: "THANKS", 12: "WHETHER", 13: "NOT", 14: "ONE", 15: "ABOUT", 16: "UP",
        17: "REGENERATION", 18: "DEPRIVATION", 19: "IRREPLACEABLE", 20: "PREDISPOSED", 21: "SEQUENTIAL", 22: "WHEREAS", 23: "UNDERVALUED", 24: "BENEFICIAL",
        25: "UNTIL THE OFFICE CLOSED DID", 26: "SHIED AWAY FROM", 27: "PULL SOCKS UP", 28: "IT NOT BEEN FOR", 29: "TO CALL OFF", 30: "LEFT HER AT A LOSS"
      },
      gradedStates: {
        1: "correct", 2: "correct", 3: "correct", 4: "correct", 5: "correct", 6: "correct", 7: "correct", 8: "correct",
        9: "correct", 10: "correct", 11: "correct", 12: "correct", 13: "correct", 14: "correct", 15: "correct", 16: "correct",
        17: "correct", 18: "correct", 19: "correct", 20: "correct", 21: "correct", 22: "correct", 23: "correct", 24: "correct",
        25: 2, 26: 2, 27: 1, 28: 2, 29: 2, 30: 1
      },
      errorNotes: {
        27: "Missed pronoun 'your' in pull your socks up",
        30: "Missed 'for words' in left her at a loss for words"
      },
      incorrectQuestions: [27, 30],
      date: days(1)
    },
    {
      id: "mock_session_5",
      section: "writing",
      correct: 34, // raw score out of 40 marks
      total: 40,
      percentage: 85,
      scaleScore: 200,
      answers: {
        part1: "The relation of technology in classrooms...",
        part2: "A report on modernized community spaces..."
      },
      gradedStates: {
        part1: { content: 5, comm: 4, org: 4, lang: 4 },
        part2: { content: 5, comm: 4, org: 4, lang: 4 }
      },
      date: Date.now() - 3 * 60 * 60 * 1000 // 3 hours ago
    }
  ];

  // Populate mistakes journal
  STATE.mistakes = [
    {
      id: "mock_mistake_1",
      section: "useOfEnglish",
      qNum: 26,
      userAnswer: "SHYING AWAY",
      scoreValue: 0,
      note: "Used active shying instead of shied",
      date: days(6)
    },
    {
      id: "mock_mistake_2",
      section: "useOfEnglish",
      qNum: 10,
      userAnswer: "FOR",
      note: "Used 'for' instead of 'to'",
      date: days(6)
    },
    {
      id: "mock_mistake_3",
      section: "reading",
      qNum: 32,
      userAnswer: "A",
      note: "Misunderstood 'organic automata' context",
      date: days(4)
    },
    {
      id: "mock_mistake_4",
      section: "listening",
      qNum: 61,
      userAnswer: "LUCIFEREEN",
      note: "Spelling mistake of chemical substance 'luciferin'",
      date: days(3)
    }
  ];
  saveLocalStorage();
}

// CAMBRIDGE SCALE SCORE PIECEWISE CONVERTERS PER SECTION
function interpolate(x, x0, x1, y0, y1) {
  return Math.round(y0 + ((x - x0) / (x1 - x0)) * (y1 - y0));
}

function getUseOfEnglishScale(raw) {
  if (raw >= 30) return interpolate(raw, 30, 36, 200, 230); // C2 Pass
  if (raw >= 21) return interpolate(raw, 21, 30, 180, 200); // C1 Level
  if (raw >= 15) return interpolate(raw, 15, 21, 160, 180); // B2 Level
  return interpolate(raw, 0, 15, 120, 160); // Fail
}

function getReadingScale(raw) {
  if (raw >= 26) return interpolate(raw, 26, 36, 200, 230); // C2 Pass
  if (raw >= 18) return interpolate(raw, 18, 26, 180, 200); // C1 Level
  if (raw >= 11) return interpolate(raw, 11, 18, 160, 180); // B2 Level
  return interpolate(raw, 0, 11, 120, 160); // Fail
}

function getListeningScale(raw) {
  if (raw >= 24) return interpolate(raw, 24, 30, 200, 230); // C2 Pass
  if (raw >= 18) return interpolate(raw, 18, 24, 180, 200); // C1 Level
  if (raw >= 13) return interpolate(raw, 13, 18, 160, 180); // B2 Level
  return interpolate(raw, 0, 13, 120, 160); // Fail
}

function getWritingScale(raw) {
  if (raw >= 34) return interpolate(raw, 34, 40, 200, 230); // C2 Pass
  if (raw >= 24) return interpolate(raw, 24, 34, 180, 200); // C1 Level
  if (raw >= 16) return interpolate(raw, 16, 24, 160, 180); // B2 Level
  return interpolate(raw, 0, 16, 120, 160); // Fail
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
  if (scaleScore >= 160) return "Level B2";
  return "Fail";
}

// ==========================================================================
// 1. HOME HUB CONTROLLER (CLEAN INITIAL STATE, VISUALLY SQUARE)
// ==========================================================================
function renderHome() {
  STATE.currentView = "home";
  const appContainer = document.getElementById("app-container");
  
  appContainer.innerHTML = `
    <div class="home-container">
      <div class="home-header">
        <div class="home-title-area">
          <h1>🎓 C2 Answer Sheet Companion</h1>
          <p>Interactive answer sheet templates for official Cambridge C2 Proficiency (CPE) practice papers.</p>
        </div>
        
        <div class="home-header-actions">
          <button class="btn btn-square" onclick="renderDashboard()">📊 View History & Analytics</button>
          
          <!-- PROFILE SWITCHER -->
          <div class="profile-box" onclick="openProfileModal()" title="Switch User Profile">
            <div class="profile-avatar">${STATE.activeProfile.charAt(0).toUpperCase()}</div>
            <div class="profile-name">${STATE.activeProfile}</div>
          </div>
        </div>
      </div>

      <div class="sections-grid">
        ${Object.entries(C2_EXAM_METADATA).map(([key, data]) => `
          <div class="section-square-card">
            <span class="section-card-badge">${data.maxMarks} Marks</span>
            <h3 class="section-card-title">${data.name}</h3>
            <p class="section-card-desc">${data.description}</p>
            <button class="btn btn-primary btn-square btn-full" onclick="openAnswerSheet('${key}')">Open Answer Sheet</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderDashboard() {
  STATE.currentView = "dashboard";
  const appContainer = document.getElementById("app-container");
  
  // Calculate Stats
  const totalCompleted = STATE.history.length;
  const avgScaleScore = calculateAverageScaleScore();
  const avgGrade = getCambridgeGrade(avgScaleScore);
  const overallAccuracy = calculateOverallAccuracy();
  
  appContainer.innerHTML = `
    <div class="dash-container">
      <div class="dash-header">
        <div class="dash-title">
          <h1>📊 Practice History & Analytics</h1>
          <p>Review your historical attempts, evolution graph, and log of mistakes.</p>
        </div>
        
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <button class="btn btn-square" onclick="renderHome()">🏠 Back to Hub</button>
          
          <!-- PROFILE SWITCHER -->
          <div class="profile-box" onclick="openProfileModal()" title="Switch User Profile">
            <div class="profile-avatar">${STATE.activeProfile.charAt(0).toUpperCase()}</div>
            <div class="profile-name">${STATE.activeProfile}</div>
          </div>
        </div>
      </div>

      <div class="summary-row">
        <div class="summary-card">
          <div class="summary-card-title">Completed Exams</div>
          <div class="summary-card-value">${totalCompleted}</div>
        </div>
        <div class="summary-card">
          <div class="summary-card-title">Average Scale Score</div>
          <div class="summary-card-value" style="color: ${avgScaleScore >= 200 ? 'var(--color-success)' : 'var(--text-main)'}">
            ${avgScaleScore > 0 ? `${avgScaleScore} pts (${avgGrade})` : '—'}
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-card-title">Overall Accuracy</div>
          <div class="summary-card-value" style="color: ${overallAccuracy >= 60 ? (overallAccuracy >= 80 ? 'var(--color-success)' : 'var(--color-warning)') : 'var(--color-error)'}">
            ${overallAccuracy > 0 ? `${overallAccuracy}%` : '—'}
          </div>
        </div>
      </div>

      <div class="dash-content-grid">
        <!-- LEFT PANEL: PROGRESS CHART & SECTION ANALYTICS -->
        <div style="display:flex; flex-direction:column; gap:1.5rem;">
          <!-- PROGRESS CHART -->
          ${renderProgressChartHTML()}

          <!-- SECTION ANALYTICS -->
          ${renderSectionAnalyticsHTML()}
        </div>

        <!-- RIGHT PANEL: HISTORY & MISTAKES JOURNAL -->
        <div style="display:flex; flex-direction:column; gap:1.5rem;">
          <div class="dash-panel">
            <h2 class="panel-title">
              <span>Practice History</span>
              ${STATE.history.length > 0 ? `<button class="btn-danger-link" onclick="clearHistory()">Clear all</button>` : ''}
            </h2>
            <div class="history-list" style="max-height: 480px;">
              ${renderHistoryListHTML()}
            </div>
          </div>

          <div class="dash-panel">
            <h2 class="panel-title">
              <span>Mistakes Journal</span>
              ${STATE.mistakes.length > 0 ? `<button class="btn-danger-link" onclick="clearMistakes()">Clear all</button>` : ''}
            </h2>
            <div class="history-list" style="max-height: 350px;">
              ${renderMistakesJournalHTML()}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function calculateOverallAccuracy() {
  if (STATE.history.length === 0) return 0;
  const correctSum = STATE.history.reduce((acc, curr) => acc + curr.correct, 0);
  const totalSum = STATE.history.reduce((acc, curr) => acc + curr.total, 0);
  return Math.round((correctSum / totalSum) * 100);
}

function renderHistoryListHTML() {
  if (STATE.history.length === 0) {
    return `<div class="empty-state">No recorded practices found. Start practicing!</div>`;
  }
  
  return STATE.history.slice().reverse().map(item => {
    const isPass = item.scaleScore >= 200;
    const dateFormatted = new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
    const sectionName = C2_EXAM_METADATA[item.section].name;

    return `
      <div class="history-item" style="cursor:pointer;" onclick="openHistoryDetailModal('${item.id}')" title="Click to view detailed answer sheet">
        <div class="history-details" style="width: 75%;">
          <span class="history-header-line">${sectionName}</span>
          <span class="history-meta-line">${dateFormatted} ➔ <span style="text-decoration:underline;">View Details</span></span>
        </div>
        <div style="display:flex; align-items:center; gap:0.25rem;">
          <div class="history-score-badge">
            <div class="history-scale-score ${isPass ? 'pass' : 'fail'}">${item.scaleScore} pts</div>
            <div class="history-raw-fraction">${item.correct}/${item.total} marks (${item.percentage}%)</div>
          </div>
          <button class="delete-hist-btn" onclick="event.stopPropagation(); deleteHistoryItem('${item.id}')" title="Delete log">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderMistakesJournalHTML() {
  if (STATE.mistakes.length === 0) {
    return `<div class="empty-state">All clean! The mistake journal is empty.</div>`;
  }
  
  return STATE.mistakes.slice().reverse().map(item => {
    const dateFormatted = new Date(item.date).toLocaleDateString();
    const sectionName = C2_EXAM_METADATA[item.section].name;
    
    let answerLabel = `Your Answer: <b class="mistake-badge-u">${item.userAnswer}</b>`;
    if (item.scoreValue !== undefined) {
      answerLabel += ` (Scored ${item.scoreValue} pts)`;
    }

    return `
      <div class="history-item" style="border-left: 3px solid var(--color-error);">
        <div class="history-details" style="width: 85%;">
          <span class="history-header-line">${sectionName} - Question ${item.qNum}</span>
          <span class="history-meta-line">Date: ${dateFormatted} | ${answerLabel}</span>
          ${item.note ? `<div class="mistake-note">Note: "${item.note}"</div>` : ''}
        </div>
        <button class="delete-hist-btn" onclick="deleteMistakeItem('${item.id}')" title="Remove mistake">✕</button>
      </div>
    `;
  }).join('');
}

function renderSectionAnalyticsHTML() {
  if (STATE.history.length === 0) return "";
  
  const analytics = {};
  for (const key of Object.keys(C2_EXAM_METADATA)) {
    const logs = STATE.history.filter(h => h.section === key);
    if (logs.length > 0) {
      const avgScale = Math.round(logs.reduce((acc, curr) => acc + curr.scaleScore, 0) / logs.length);
      const avgAccuracy = Math.round(logs.reduce((acc, curr) => acc + curr.percentage, 0) / logs.length);
      analytics[key] = { avgScale, avgAccuracy };
    } else {
      analytics[key] = null;
    }
  }

  return `
    <div class="dash-panel">
      <h2 class="panel-title">📊 Section-Specific Analytics</h2>
      <div class="analytics-grid">
        ${Object.entries(C2_EXAM_METADATA).map(([key, data]) => {
          const stats = analytics[key];
          return `
            <div class="analytics-card">
              <span class="analytics-card-title">${data.name}</span>
              <span class="analytics-card-value">
                ${stats ? `${stats.avgScale} pts <span style="font-size:0.75rem; font-weight:normal; color:var(--text-muted);">(${stats.avgAccuracy}% acc)</span>` : '—'}
              </span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ==========================================================================
// 2. USER PROFILE CONTROLLER
// ==========================================================================
function openProfileModal() {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 450px;">
      <div class="modal-header">
        <h3 class="modal-title">Sign In / Switch Profile</h3>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">Select an existing user profile to load their specific logs, or create a new profile.</p>
        
        <div class="user-list">
          ${STATE.profiles.map(name => {
            const isActive = name === STATE.activeProfile;
            return `
              <button class="user-item-btn ${isActive ? 'active' : ''}" onclick="switchUserProfile('${escapeJS(name)}')">
                <span>👤 ${name}</span>
                ${isActive ? '<span>Active ✓</span>' : '<span>Load ➔</span>'}
              </button>
            `;
          }).join('')}
        </div>

        <div style="border-top:1px solid var(--border-color); margin-top:1.5rem; padding-top:1rem;">
          <h4 style="font-size:0.85rem; font-weight:700; margin-bottom:0.5rem;">Create New Profile</h4>
          <div style="display:flex; gap:0.5rem;">
            <input type="text" id="new-profile-input" style="flex-grow:1; padding:0.4rem 0.6rem; border:1px solid var(--border-color); border-radius:6px; font-size:0.85rem; outline:none;" placeholder="Enter username...">
            <button class="btn btn-primary" onclick="createUserProfile()">Create</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function switchUserProfile(name) {
  STATE.activeProfile = name;
  saveLocalStorage();
  loadLocalStorage();
  closeModal();
  refreshCurrentView();
}

function createUserProfile() {
  const input = document.getElementById("new-profile-input");
  const name = input.value.trim();
  if (name === "") return;
  
  if (STATE.profiles.includes(name)) {
    alert("Profile name already exists!");
    return;
  }
  
  STATE.profiles.push(name);
  STATE.activeProfile = name;
  saveLocalStorage();
  loadLocalStorage();
  closeModal();
  refreshCurrentView();
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
        const uAns = item.answers[q] || "—";
        const gradeState = item.gradedStates[q];
        
        let gradeLabel = "";
        if (partData.type === "partial") {
          const ptClass = gradeState === 2 ? 'color:var(--color-success)' : (gradeState === 1 ? 'color:var(--color-warning)' : 'color:var(--color-error)');
          gradeLabel = `<span style="font-weight:700; ${ptClass}; font-size:0.85rem;">[${gradeState}/2 pts]</span>`;
        } else {
          gradeLabel = gradeState === "correct" ? 
            `<span style="color:var(--color-success); font-weight:bold;">Correct ✅</span>` : 
            `<span style="color:var(--color-error); font-weight:bold;">Incorrect ❌</span>`;
        }

        const noteText = item.errorNotes[q] ? `<div class="mistake-note" style="margin-top:0.25rem;">Note: "${item.errorNotes[q]}"</div>` : "";

        rowsHTML += `
          <div style="border-bottom:1px solid #f3f4f6; padding:0.5rem 0.25rem; font-size:0.8rem;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span><b>Q.${q}</b>: <span style="font-family:monospace; font-weight:700; text-transform:uppercase;">${uAns}</span></span>
              <span>${gradeLabel}</span>
            </div>
            ${noteText}
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
        <h3 class="modal-title">Answer Sheet Review: ${sectionMeta.name}</h3>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div style="display:flex; justify-content:space-between; align-items:center; background-color:#f9fafb; border:1px solid var(--border-color); border-radius:6px; padding:0.75rem 1rem; margin-bottom:1.5rem;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Scale Score</div>
            <div style="font-size:1.4rem; font-weight:800; color:var(--accent-color);">${item.scaleScore} pts <span style="font-size:0.85rem; font-weight:normal;">(${getCambridgeGrade(item.scaleScore)})</span></div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Raw Score</div>
            <div style="font-size:1.1rem; font-weight:700; color:var(--text-main);">${item.correct} / ${item.total} pts (${item.percentage}%)</div>
          </div>
        </div>

        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.75rem;">Submitted on: <b>${dateFormatted}</b></div>
        
        ${sheetHTML}
      </div>
      <div style="margin-top:1rem; text-align:right;">
        <button class="btn btn-primary" onclick="closeModal()">Close Review</button>
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
  STATE.errorNotes = {};
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
        <b>Writing Paper:</b> Type or paste your two writing responses. The counter badge will alert you if your length matches the Cambridge C2 limits. When done, self-grade each part (out of 20 marks) using the sliders.
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
        Fill in your answers below as you work through your official paper or PDF. Once finished, click <b>"Finish & Correct"</b> to self-grade.
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
            <h2>Answer Sheet: ${sectionMeta.name}</h2>
            <p>${sectionMeta.description}</p>
          </div>
          <button class="btn btn-square" onclick="renderHome()">⬅ Back to Hub</button>
        </div>

        ${sheetContent}

        <div style="border-top:1px solid var(--border-color); padding-top:1.5rem; display:flex; justify-content:space-between; align-items:center;">
          <button class="btn btn-danger-link" onclick="clearSheetInputs()">Reset Sheet</button>
          <button class="btn btn-primary" id="sheet-submit-btn" onclick="lockAnswersAndStartCorrection()">
            Finish & Correct
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
    STATE.errorNotes = {};
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
            <button class="correct-btn" id="correct-btn-${q}" onclick="markBinaryGrade(${q}, 'correct')">✅ Correct</button>
            <button class="incorrect-btn" id="incorrect-btn-${q}" onclick="markBinaryGrade(${q}, 'incorrect')">❌ Incorrect</button>
          </div>
        `;
      }
    }
  }
  
  const mainBtn = document.getElementById("sheet-submit-btn");
  mainBtn.textContent = "Save & Calculate Score";
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
    delete STATE.errorNotes[qNum];
  } else {
    iBtn.classList.add("active");
    cBtn.classList.remove("active");
    
    const noteArea = document.getElementById(`error-note-area-${qNum}`);
    noteArea.innerHTML = `
      <div class="sheet-error-note-box">
        <label for="note-input-${qNum}">Explain why you missed it (Error details):</label>
        <input type="text" class="sheet-error-note-input" id="note-input-${qNum}" 
               placeholder="e.g. spelling error, wrong preposition, vocabulary gap..." 
               oninput="storeErrorNote(${qNum}, this.value)" value="${STATE.errorNotes[qNum] || ''}">
      </div>
    `;
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
  if (pts === 2) {
    noteArea.innerHTML = "";
    delete STATE.errorNotes[qNum];
  } else {
    noteArea.innerHTML = `
      <div class="sheet-error-note-box">
        <label for="note-input-${qNum}">Partial score (${pts}/2 pts). Log details about your mistake:</label>
        <input type="text" class="sheet-error-note-input" id="note-input-${qNum}" 
               placeholder="e.g. missed the second half of the phrase, grammar structure flaw..." 
               oninput="storeErrorNote(${qNum}, this.value)" value="${STATE.errorNotes[qNum] || ''}">
      </div>
    `;
  }
}

function storeErrorNote(qNum, noteVal) {
  STATE.errorNotes[qNum] = noteVal.trim();
}

function saveGradedSheetResult() {
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
    alert(`Please grade all questions before saving (Q.${missingGrades.join(', Q.')})`);
    return;
  }

  let rawScoreTotal = 0;
  let incorrectQuestionsList = [];
  
  for (const [partKey, partData] of Object.entries(sectionMeta.parts)) {
    for (let q = partData.startQ; q <= partData.endQ; q++) {
      const state = STATE.gradedStates[q];
      
      if (partData.type === "partial") {
        rawScoreTotal += state;
        if (state < 2) {
          incorrectQuestionsList.push(q);
          STATE.mistakes.push({
            id: `${STATE.activeSection}_q${q}_${Date.now()}`,
            section: STATE.activeSection,
            qNum: q,
            userAnswer: STATE.answers[q] || "Blank",
            scoreValue: state,
            note: STATE.errorNotes[q] || "",
            date: Date.now()
          });
        }
      } else {
        if (state === "correct") {
          rawScoreTotal += partData.weight;
        } else {
          incorrectQuestionsList.push(q);
          STATE.mistakes.push({
            id: `${STATE.activeSection}_q${q}_${Date.now()}`,
            section: STATE.activeSection,
            qNum: q,
            userAnswer: STATE.answers[q] || "Blank",
            note: STATE.errorNotes[q] || "",
            date: Date.now()
          });
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
    errorNotes: { ...STATE.errorNotes },
    incorrectQuestions: incorrectQuestionsList,
    date: Date.now()
  });

  saveLocalStorage();
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
      <h3 style="font-size:1.05rem; font-weight:700; color:var(--accent-color); border-bottom:1px solid var(--border-color); padding-bottom:0.5rem; margin-bottom:1rem;">📋 Essay Assessment Rubric: Part 1</h3>
      
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
      <h3 style="font-size:1.05rem; font-weight:700; color:var(--accent-color); border-bottom:1px solid var(--border-color); padding-bottom:0.5rem; margin-bottom:1rem;">📋 Writing Assessment Rubric: Part 2</h3>
      
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
  mainBtn.textContent = "Save Writing Assessment";
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

function saveWritingSheetResult() {
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

  saveLocalStorage();
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

function calculateAverageScaleScore() {
  if (STATE.history.length === 0) return 0;
  const sum = STATE.history.reduce((acc, curr) => acc + curr.scaleScore, 0);
  return Math.round(sum / STATE.history.length);
}

function renderProgressChartHTML() {
  if (STATE.history.length === 0) {
    return `
      <div class="progress-graph-container">
        <h2 class="panel-title">📈 Score Evolution</h2>
        <div style="height: 120px; display:flex; justify-content:center; align-items:center; color:var(--text-muted); font-size:0.85rem;">
          No attempts recorded yet.
        </div>
      </div>
    `;
  }

  // Get last 10 attempts for the chart
  const recentAttempts = STATE.history.slice(-10);

  const barsHTML = recentAttempts.map(item => {
    const isPass = item.scaleScore >= 200;
    const heightPct = Math.max(5, Math.min(100, Math.round(((item.scaleScore - 120) / 110) * 100)));
    const dateFormatted = new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    
    // Get section initial
    let sectionInitial = "U";
    if (item.section === "reading") sectionInitial = "R";
    if (item.section === "listening") sectionInitial = "L";
    if (item.section === "writing") sectionInitial = "W";
    
    const tooltipText = `${C2_EXAM_METADATA[item.section].name}: ${item.scaleScore} pts (${item.correct}/${item.total})`;

    return `
      <div class="graph-bar-wrapper">
        <div class="graph-bar-fill ${isPass ? 'pass' : 'fail'}" 
             style="height: ${heightPct}%;" 
             data-score="${tooltipText}">
        </div>
        <div class="graph-bar-date">${dateFormatted} (${sectionInitial})</div>
      </div>
    `;
  }).join('');

  return `
    <div class="progress-graph-container">
      <h2 class="panel-title">📈 Score Evolution (Last 10 Attempts)</h2>
      <div class="graph-bars">
        ${barsHTML}
      </div>
      <div style="font-size:0.7rem; color:var(--text-muted); text-align:center; margin-top:0.25rem;">
        Hover over the bars to see details. (U = Use of English, R = Reading, L = Listening, W = Writing)
      </div>
    </div>
  `;
}

function deleteHistoryItem(id) {
  if (confirm("Delete this history record?")) {
    STATE.history = STATE.history.filter(h => h.id !== id);
    saveLocalStorage();
    refreshCurrentView();
  }
}

function deleteMistakeItem(id) {
  if (confirm("Remove this mistake from journal?")) {
    STATE.mistakes = STATE.mistakes.filter(m => m.id !== id);
    saveLocalStorage();
    refreshCurrentView();
  }
}

function clearHistory() {
  if (confirm("Are you sure you want to clear your entire practice history? This cannot be undone.")) {
    STATE.history = [];
    saveLocalStorage();
    refreshCurrentView();
  }
}

function clearMistakes() {
  if (confirm("Are you sure you want to clear your entire mistakes journal? This cannot be undone.")) {
    STATE.mistakes = [];
    saveLocalStorage();
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
