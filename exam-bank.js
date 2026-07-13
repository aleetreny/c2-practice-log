(function initialiseExamBank(root) {
  const BANK = root.C2_EXAM_BANK || { useOfEnglish: [], reading: [], listening: [], writing: [] };
  const READING_PART_KEYS = ["part1", "part5", "part6", "part7"];
  const READING_PART_WEIGHTS = { part1: 1, part5: 2, part6: 2, part7: 1 };
  const USE_OF_ENGLISH_PART_KEYS = ["part2", "part3", "part4"];
  const USE_OF_ENGLISH_PART_WEIGHTS = { part2: 1, part3: 1, part4: 2 };
  let activeYouTubePlayer = null;

  function getCollection(value = STATE.examBankCollection) {
    return ["useOfEnglish", "reading", "listening", "writing"].includes(value) ? value : "reading";
  }

  function getUseOfEnglishTest(id) {
    return BANK.useOfEnglish.find(test => test.id === id) || BANK.useOfEnglish[0] || null;
  }

  function getReadingTest(id) {
    return BANK.reading.find(test => test.id === id) || BANK.reading[0] || null;
  }

  function getListeningTest(id) {
    return BANK.listening.find(test => test.id === id) || BANK.listening[0] || null;
  }

  function getWritingTest(id) {
    return BANK.writing.find(test => test.id === id) || BANK.writing[0] || null;
  }

  function getAttemptBankMeta(item) {
    return getPlainObject(getPlainObject(getPlainObject(item).answers).meta).examBank;
  }

  function getAttemptsForBankId(id) {
    return STATE.history.filter(item => getAttemptBankMeta(item)?.id === id);
  }

  function getLatestBankAttempt(id) {
    return getAttemptsForBankId(id).sort((a, b) => b.date - a.date)[0] || null;
  }

  function renderAttemptBadge(id) {
    const attempts = getAttemptsForBankId(id);
    if (attempts.length === 0) return '<span class="exam-bank-status new">Not attempted</span>';
    const latest = attempts.sort((a, b) => b.date - a.date)[0];
    return `<span class="exam-bank-status done">${attempts.length} ${attempts.length === 1 ? "attempt" : "attempts"} · latest ${latest.scaleScore || "saved"}</span>`;
  }

  function renderRichText(value, options = {}) {
    const blocks = String(value || "").replace(/\r\n?/g, "\n").trim().split(/\n{2,}/).filter(Boolean);
    if (blocks.length === 0) return "";
    return blocks.map(block => {
      let sourceBlock = block.replace(/\n/g, " ");
      const uoeGaps = [];
      const uoeBlanks = [];
      if (options.highlightUoeGaps) {
        sourceBlock = sourceBlock.replace(/\((\d{1,2})\)\s*(?:\.{5,}|_{5,})/g, (_, question) => {
          const token = `C2UOEGAP${uoeGaps.length}TOKEN`;
          uoeGaps.push(question);
          return token;
        });
        sourceBlock = sourceBlock.replace(/(?:_{5,}|\.{8,})/g, value => {
          const token = `C2UOEBLANK${uoeBlanks.length}TOKEN`;
          uoeBlanks.push(value);
          return token;
        });
      }
      let html = renderWritingMarkdownInline(sourceBlock);
      if (options.highlightGaps) {
        html = html.replace(/\[(3[7-9]|4[0-3])\]/g, '<mark class="exam-gap-marker" id="exam-gap-$1">[$1]</mark>');
      }
      if (options.highlightUoeGaps) {
        html = html.replace(/C2UOEGAP(\d+)TOKEN/g, (_, index) => `<mark class="exam-gap-marker">(${uoeGaps[Number(index)]})</mark>`);
        html = html.replace(/C2UOEBLANK(\d+)TOKEN/g, '<span class="exam-transformation-blank" aria-hidden="true"></span>');
      }
      return `<p>${html}</p>`;
    }).join("");
  }

  function renderUseOfEnglishPart4Passage(value) {
    const transformations = String(value || "").replace(/\r\n?/g, "\n").trim().split(/\n{2,}/).filter(Boolean);
    return `<div class="exam-uoe-transformations">${transformations.map(transformation => {
      const lines = transformation.split("\n").map(line => line.trim()).filter(Boolean);
      return `<article class="exam-uoe-transformation">${lines.map(line => {
        const sourceLine = line.replace(/(?:_{5,}|\.{8,})/g, "C2UOEBLANKTOKEN");
        const html = renderWritingMarkdownInline(sourceLine).replace(/C2UOEBLANKTOKEN/g, '<span class="exam-transformation-blank" aria-hidden="true"></span>');
        return `<p>${html}</p>`;
      }).join("")}</article>`;
    }).join("")}</div>`;
  }

  function renderUseOfEnglishPassageHTML(part) {
    return part.number === 4
      ? renderUseOfEnglishPart4Passage(part.passage)
      : renderRichText(part.passage, { highlightUoeGaps: true });
  }

  function openExamBank(collection = STATE.examBankCollection) {
    const nextCollection = getCollection(collection);
    const returningFromSheet = STATE.currentView === "sheet";
    if (returningFromSheet) {
      clearPracticeTimerInterval();
      if (activeYouTubePlayer?.destroy) activeYouTubePlayer.destroy();
      activeYouTubePlayer = null;
      STATE.examBankSession = null;
    }
    const objectiveSession = ["reading", "useOfEnglish"].includes(STATE.examBankSession?.section)
      ? STATE.examBankSession
      : null;
    if (objectiveSession && (STATE.examBankCollection !== nextCollection || objectiveSession.phase === "result")) {
      clearPracticeTimerInterval();
      STATE.examBankSession = null;
    }
    STATE.currentView = "examBank";
    STATE.examBankCollection = nextCollection;
    renderExamBank();
  }

  function renderExamBank() {
    const appContainer = document.getElementById("app-container");
    const collection = getCollection();
    const objectiveSession = ["reading", "useOfEnglish"].includes(STATE.examBankSession?.section) ? STATE.examBankSession : null;

    // While actively answering a Reading/Use of English paper, run the two-column
    // workspace full-screen: no top navigation or demo banner, a fixed viewport,
    // and independent scrolling inside each column (question text / answer sheet).
    const isAnsweringWorkspace = objectiveSession
      && objectiveSession.phase !== "result"
      && objectiveSession.phase !== "gradingPart4";
    if (isAnsweringWorkspace) {
      appContainer.innerHTML = `
        <div class="exam-session-view">
          ${objectiveSession.section === "reading" ? renderReadingSessionHTML(objectiveSession) : renderUseOfEnglishSessionHTML(objectiveSession)}
        </div>
      `;
      updatePracticeTimerDisplay();
      return;
    }

    appContainer.innerHTML = `
      <div class="exam-bank-container app-shell">
        <header class="app-topbar">
          <button class="brand-button" onclick="renderHome()" aria-label="Practice home" style="text-align:left">
            <span style="text-align:left;display:block"><span class="brand-title">Practice Log</span><span class="brand-subtitle">Cambridge C2</span></span>
          </button>
          ${renderMainNavigation("examBank")}
        </header>
        ${renderDemoNoticeHTML()}
        <main class="exam-bank-main">
          ${objectiveSession ? (objectiveSession.section === "reading" ? renderReadingSessionHTML(objectiveSession) : renderUseOfEnglishSessionHTML(objectiveSession)) : `
            ${renderLibraryHeroHTML(collection)}
            ${renderCollectionTabsHTML(collection)}
            ${collection === "useOfEnglish" ? renderUseOfEnglishLibraryHTML() : collection === "reading" ? renderReadingLibraryHTML() : collection === "listening" ? renderListeningLibraryHTML() : renderWritingLibraryHTML()}
          `}
        </main>
      </div>
    `;
    updatePracticeTimerDisplay();
  }

  function renderLibraryHeroHTML(collection) {
    const useOfEnglishPaperCount = BANK.useOfEnglish.filter(test => test.kind === "full").length;
    const copy = {
      useOfEnglish: ["complete papers", "24 real Use of English papers", "Start fresh from 24 full Parts 2–4 papers or use 20 additional Part 4 drills reconstructed from the source material in the practice logs."],
      reading: ["Reading papers", "12 complete Reading papers", "Every paper combines a real Part 1 with Parts 5–7 in one split-screen, 44-mark Reading test."],
      listening: ["Listening papers", "33 full video-led tests", "The video carries the audio and on-screen questions. The answer sheet marks all 30 responses automatically, with a guided check for Part 2 sentence completion."],
      writing: ["Writing papers", "14 paired Writing sets", "Each set combines one real Part 1 essay with one real Part 2 task. Work from the prompts without leaving the editor, then use the rubric and assessment prompt as usual."]
    }[collection];
    return `
      <section class="exam-bank-hero">
        <div><span class="eyebrow">Exam repository</span><h1>${copy[1]}</h1><p>${copy[2]}</p></div>
        <div class="exam-bank-hero-mark"><strong>${collection === "useOfEnglish" ? useOfEnglishPaperCount : collection === "reading" ? BANK.reading.length : collection === "listening" ? BANK.listening.length : BANK.writing.length}</strong><span>${copy[0]}</span></div>
      </section>
    `;
  }

  function renderCollectionTabsHTML(active) {
    const useOfEnglishPaperCount = BANK.useOfEnglish.filter(test => test.kind === "full").length;
    const collections = [
      ["useOfEnglish", "Use of English", `${useOfEnglishPaperCount} papers + 20 drills`],
      ["reading", "Reading", `${BANK.reading.length} tests`],
      ["listening", "Listening", `${BANK.listening.length} videos`],
      ["writing", "Writing", `${BANK.writing.length} sets`]
    ];
    return `<nav class="exam-bank-tabs" aria-label="Exam collections">${collections.map(([key, label, count]) => `
      <button class="${active === key ? "active" : ""}" onclick="openExamBank('${key}')"><span>${label}</span><small>${count}</small></button>
    `).join("")}</nav>`;
  }

  function setUseOfEnglishBankFilter(filter) {
    STATE.examBankUseOfEnglishFilter = filter === "part4" ? "part4" : "full";
    renderExamBank();
  }

  function renderUseOfEnglishLibraryHTML() {
    const filter = STATE.examBankUseOfEnglishFilter === "part4" ? "part4" : "full";
    const tests = BANK.useOfEnglish.filter(test => test.kind === filter);
    return `
      <section class="exam-library-section">
        <div class="exam-library-heading"><div><span class="eyebrow">Choose a fresh paper</span><h2>Use of English Parts 2, 3 and 4</h2></div><p>Automatic Part 3 · guided Parts 2 and 4 · timed</p></div>
        <div class="uoe-bank-filter" role="group" aria-label="Use of English source type">
          <button class="${filter === "full" ? "active" : ""}" onclick="setUseOfEnglishBankFilter('full')"><strong>24</strong><span>Full papers</span><small>Parts 2–4 · 28 marks</small></button>
          <button class="${filter === "part4" ? "active" : ""}" onclick="setUseOfEnglishBankFilter('part4')"><strong>20</strong><span>Part 4 drills</span><small>6 transformations · 12 marks</small></button>
        </div>
        <div class="reading-test-grid">
          ${tests.map((test, index) => `
            <article class="reading-test-card">
              <div class="exam-card-number">${String(filter === "full" ? test.number : index + 1).padStart(2, "0")}</div>
              <div class="reading-test-card-copy">
                <span>${test.kind === "full" ? `Use of English Paper ${test.number}` : `Part 4 Drill ${index + 1}`}</span>
                <ul>
                  ${test.kind === "full"
                    ? "<li><b>Part 2</b>Open cloze</li><li><b>Part 3</b>Word formation</li><li><b>Part 4</b>Key word transformations</li>"
                    : "<li><b>Part 4</b>Key word transformations</li><li><b>Format</b>Six questions · 12 marks</li>"}
                </ul>
                ${renderAttemptBadge(test.id)}
              </div>
              <button class="btn btn-primary" onclick="startUseOfEnglishBankTest('${test.id}')">Open ${test.kind === "full" ? "paper" : "drill"}</button>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderReadingLibraryHTML() {
    return `
      <section class="exam-library-section">
        <div class="exam-library-heading"><div><span class="eyebrow">Choose a paper</span><h2>Reading Parts 1, 5, 6 and 7</h2></div><p>12 complete papers · 44 marks each</p></div>
        <div class="reading-test-grid">
          ${BANK.reading.map(test => `
            <article class="reading-test-card">
              <div class="exam-card-number">${String(test.number).padStart(2, "0")}</div>
              <div class="reading-test-card-copy">
                <span>Reading Test ${test.number}</span>
                <ul>
                  <li><b>Part 1</b>Multiple-choice cloze</li>
                  <li><b>Part 5</b>Multiple choice</li>
                  <li><b>Part 6</b>Gapped text</li>
                  <li><b>Part 7</b>Multiple matching</li>
                </ul>
                ${renderAttemptBadge(test.id)}
              </div>
              <button class="btn btn-primary" onclick="startReadingBankTest('${test.id}')">Open paper</button>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function getSelectedListeningId() {
    const stored = STATE.examBankSelectedListeningId;
    return getListeningTest(stored)?.id || BANK.listening[0]?.id || "";
  }

  function selectListeningBankTest(id) {
    STATE.examBankSelectedListeningId = getListeningTest(id)?.id || BANK.listening[0]?.id;
    renderExamBank();
  }

  function selectRandomListeningTest() {
    if (BANK.listening.length === 0) return;
    const current = getSelectedListeningId();
    const pool = BANK.listening.filter(test => test.id !== current);
    selectListeningBankTest(pool[Math.floor(Math.random() * pool.length)]?.id || current);
  }

  function renderListeningLibraryHTML() {
    const selected = getListeningTest(getSelectedListeningId());
    if (!selected) return '<div class="empty-state">No Listening tests available.</div>';
    const latest = getLatestBankAttempt(selected.id);
    return `
      <section class="exam-library-section listening-library">
        <div class="exam-library-heading"><div><span class="eyebrow">Choose a video test</span><h2>Full Listening paper</h2></div><p>4 parts · 30 answers · automatic marking with Part 2 review</p></div>
        <div class="listening-picker-layout">
          <div class="listening-test-picker">
            <label for="listening-bank-select">Test number</label>
            <select id="listening-bank-select" onchange="selectListeningBankTest(this.value)">
              ${BANK.listening.map(test => `<option value="${test.id}" ${test.id === selected.id ? "selected" : ""}>Test ${test.number}</option>`).join("")}
            </select>
            <button class="btn btn-secondary" onclick="selectRandomListeningTest()">Surprise me</button>
          </div>
          <article class="listening-feature-card">
            <div class="listening-feature-visual">
              <span>Listening</span><strong>${String(selected.number).padStart(2, "0")}</strong><small>Video-led full paper</small>
            </div>
            <div class="listening-feature-copy">
              <span class="eyebrow">Selected paper</span>
              <h2>${escapeHTML(selected.title)}</h2>
              <p>Questions appear in the video together with the audio. The answer sheet stays visible underneath, using local numbers 1–30.</p>
              ${renderAttemptBadge(selected.id)}
              ${latest ? `<small class="exam-last-attempt">Last saved ${formatShortDate(latest.date)} · scale ${latest.scaleScore}</small>` : ""}
              <div><button class="btn btn-primary" onclick="startListeningBankTest('${selected.id}')">Start video test</button><a class="btn btn-secondary" href="${selected.watchUrl}" target="_blank" rel="noopener noreferrer">Open on YouTube</a></div>
            </div>
          </article>
        </div>
        <div class="listening-number-strip" aria-label="All Listening tests">
          ${BANK.listening.map(test => `<button class="${test.id === selected.id ? "active" : ""} ${getAttemptsForBankId(test.id).length ? "done" : ""}" onclick="selectListeningBankTest('${test.id}')">${test.number}</button>`).join("")}
        </div>
      </section>
    `;
  }

  function getWritingSelection(test) {
    if (!test?.part2Tasks?.length) return null;
    const selectedId = STATE.examBankWritingSelections[test.id];
    return test.part2Tasks.find(task => task.id === selectedId) || test.part2Tasks[0];
  }

  function selectWritingBankTask(testId, taskId) {
    const test = getWritingTest(testId);
    if (!test || !test.part2Tasks.some(task => task.id === taskId)) return;
    STATE.examBankWritingSelections[test.id] = taskId;
    renderExamBank();
  }

  function renderWritingLibraryHTML() {
    return `
      <section class="exam-library-section">
        <div class="exam-library-heading"><div><span class="eyebrow">Choose a task set</span><h2>Writing Part 1 and Part 2</h2></div><p>90 minutes · live word count · Cambridge rubric</p></div>
        <div class="writing-test-grid">
          ${BANK.writing.map(test => {
            const selectedTask = getWritingSelection(test);
            return `
              <article class="writing-test-card">
                <div class="writing-test-card-head"><span>Test ${String(test.number).padStart(2, "0")}</span>${renderAttemptBadge(test.id)}</div>
                <h3>Writing Set ${String(test.number).padStart(2, "0")}</h3>
                <div class="writing-task-preview"><span>Part 1 · Essay</span><strong>${escapeHTML(test.part1Topic)}</strong></div>
                <div class="writing-task-preview part2"><span>Part 2 · ${escapeHTML(selectedTask.label)}</span><strong>${escapeHTML(selectedTask.topic)}</strong></div>
                <button class="btn btn-primary btn-full" onclick="startWritingBankTest('${test.id}')">Open writing desk</button>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function startListeningBankTest(id) {
    const test = getListeningTest(id);
    if (!test) return;
    STATE.examBankSession = {
      section: "listening",
      collection: "listening",
      id: test.id,
      testNumber: test.number,
      label: `Listening Bank · Test ${test.number}`,
      subtitle: "Video questions + 30-answer sheet",
      video: test
    };
    openAnswerSheet("listening", { preserveExamBank: true, startTimer: true });
  }

  function startWritingBankTest(id) {
    const test = getWritingTest(id);
    if (!test) return;
    const part2Task = getWritingSelection(test);
    STATE.examBankSession = {
      section: "writing",
      collection: "writing",
      id: test.id,
      testNumber: test.number,
      label: `Writing Bank · Test ${test.number}`,
      subtitle: test.title,
      writingTest: test,
      part2Task
    };
    openAnswerSheet("writing", { preserveExamBank: true, startTimer: true });
  }

  function renderActiveExamBankListeningMediaHTML() {
    const session = STATE.examBankSession;
    if (session?.section !== "listening" || !session.video) return "";
    const video = session.video;
    return `
      <section class="exam-listening-player">
        <div class="exam-listening-player-head"><div><span class="eyebrow">Questions and audio</span><h3>${escapeHTML(video.title)}</h3></div><a href="${video.watchUrl}" target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a></div>
        <div class="exam-video-frame"><div id="exam-listening-youtube-player" aria-label="${escapeHTML(video.title)}"></div></div>
        <p>Use the controls in the video. Its question numbers 1–30 match the local numbers on the answer sheet below.</p>
      </section>
    `;
  }

  function loadYouTubeIframeAPI() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (window.__c2YouTubeAPIReadyPromise) return window.__c2YouTubeAPIReadyPromise;
    window.__c2YouTubeAPIReadyPromise = new Promise(resolve => {
      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previousCallback === "function") previousCallback();
        resolve(window.YT);
      };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.head.appendChild(script);
      }
    });
    return window.__c2YouTubeAPIReadyPromise;
  }

  async function initializeActiveListeningPlayer() {
    const session = STATE.examBankSession;
    const target = document.getElementById("exam-listening-youtube-player");
    if (session?.section !== "listening" || !target) return;
    const expectedSessionId = session.id;
    const YT = await loadYouTubeIframeAPI();
    if (STATE.examBankSession?.id !== expectedSessionId || !document.getElementById("exam-listening-youtube-player")) return;
    if (activeYouTubePlayer?.destroy) activeYouTubePlayer.destroy();
    activeYouTubePlayer = new YT.Player("exam-listening-youtube-player", {
      width: "100%",
      height: "100%",
      playerVars: { enablejsapi: 1, playsinline: 1, rel: 0 },
      events: {
        onReady: event => event.target.cuePlaylist({
          listType: "playlist",
          list: session.video.playlistId,
          index: session.video.apiIndex,
          startSeconds: 0
        })
      }
    });
  }

  function buildWritingPart1Prompt(test) {
    return [
      test.part1.instructions,
      ...test.part1.texts.map(text => `### Text ${text.number} — ${text.title}\n\n${text.body}`)
    ].filter(Boolean).join("\n\n");
  }

  function buildWritingPart2Prompt(task) {
    if (!task) return "";
    return `### Question ${task.question} — ${task.label}\n\n${task.prompt}`;
  }

  function renderActiveExamBankWritingPromptHTML(partKey) {
    const session = STATE.examBankSession;
    if (session?.section !== "writing") return "";
    if (partKey === "part1") {
      const test = session.writingTest;
      return `
        <section class="exam-writing-prompt">
          <div class="exam-writing-instructions">${renderRichText(test.part1.instructions)}</div>
          <div class="exam-writing-source-grid">${test.part1.texts.map(text => `<article><span>Text ${text.number}</span><h4>${escapeHTML(text.title)}</h4>${renderRichText(text.body)}</article>`).join("")}</div>
        </section>
      `;
    }
    const task = session.part2Task;
    return task ? `<section class="exam-writing-prompt part2"><span class="eyebrow">Question ${task.question} · ${escapeHTML(task.label)}</span>${renderRichText(task.prompt)}</section>` : "";
  }

  function getActiveExamBankWritingAssessmentContext() {
    const session = STATE.examBankSession;
    if (session?.section !== "writing") return "";
    return [
      `PART 1 PROMPT\n${buildWritingPart1Prompt(session.writingTest)}`,
      session.part2Task ? `PART 2 PROMPT\n${buildWritingPart2Prompt(session.part2Task)}` : ""
    ].filter(Boolean).join("\n\n---\n\n");
  }

  function getActiveExamBankAttemptMeta() {
    const session = STATE.examBankSession;
    if (!session || !["listening", "writing"].includes(session.section)) return null;
    const base = {
      version: 2,
      id: session.id,
      collection: session.collection,
      testNumber: session.testNumber,
      label: session.label,
      source: "real-exam-bank"
    };
    if (session.section === "listening") {
      return {
        ...base,
        playlistId: session.video.playlistId,
        playlistPosition: session.video.playlistPosition,
        apiIndex: session.video.apiIndex,
        sourceTest: session.video.sourceTest,
        watchUrl: session.video.watchUrl
      };
    }
    return {
      ...base,
      title: session.writingTest.title,
      part2TaskId: session.part2Task?.id || null,
      prompts: {
        part1: buildWritingPart1Prompt(session.writingTest),
        ...(session.part2Task ? { part2: buildWritingPart2Prompt(session.part2Task) } : {})
      }
    };
  }

  function getUseOfEnglishPartKeys(test) {
    return USE_OF_ENGLISH_PART_KEYS.filter(partKey => test.parts[partKey]);
  }

  function startUseOfEnglishBankTest(id) {
    const test = getUseOfEnglishTest(id);
    if (!test) return;
    const partKeys = getUseOfEnglishPartKeys(test);
    STATE.examBankCollection = "useOfEnglish";
    STATE.currentView = "examBank";
    STATE.examBankSession = {
      section: "useOfEnglish",
      collection: "useOfEnglish",
      id: test.id,
      testNumber: test.number,
      label: `Use of English Bank · ${test.title}`,
      subtitle: test.kind === "full" ? "Parts 2–4 · 22 questions" : "Part 4 · 6 transformations",
      test,
      activePart: partKeys[0],
      phase: "answering",
      answers: {},
      part2Grades: {},
      part4Grades: {},
      saving: false,
      result: null
    };
    resetPracticeTimer({ keepRunning: true });
    renderExamBank();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exitUseOfEnglishBankTest() {
    const session = STATE.examBankSession;
    if (session?.phase === "answering" && Object.keys(session.answers || {}).length > 0 && !confirm("Leave this Use of English set? Your unsaved answers will be lost.")) return;
    clearPracticeTimerInterval();
    STATE.examBankSession = null;
    openExamBank("useOfEnglish");
  }

  function retryUseOfEnglishBankTest() {
    const id = STATE.examBankSession?.id;
    if (id) startUseOfEnglishBankTest(id);
  }

  function switchUseOfEnglishBankPart(partKey) {
    const session = STATE.examBankSession;
    if (session?.section !== "useOfEnglish" || !session.test.parts[partKey]) return;
    session.activePart = partKey;
    renderExamBank();
  }

  function storeUseOfEnglishBankAnswer(question, value) {
    const session = STATE.examBankSession;
    if (session?.section !== "useOfEnglish" || session.phase !== "answering") return;
    const normalized = String(value || "").trimStart();
    if (normalized) session.answers[question] = normalized;
    else delete session.answers[question];
    document.querySelector(`[data-bank-question="${question}"]`)?.classList.toggle("answered", Boolean(normalized.trim()));
    updateUseOfEnglishProgressDOM();
  }

  function updateUseOfEnglishProgressDOM() {
    const session = STATE.examBankSession;
    if (session?.section !== "useOfEnglish") return;
    const partKeys = getUseOfEnglishPartKeys(session.test);
    const questionNumbers = partKeys.flatMap(partKey => session.test.parts[partKey].questions.map(question => question.number));
    const answered = questionNumbers.filter(question => String(session.answers[question] || "").trim()).length;
    const totalElement = document.getElementById("uoe-bank-total-progress");
    if (totalElement) totalElement.textContent = `${answered} / ${questionNumbers.length} answered`;
    partKeys.forEach(partKey => {
      const questions = session.test.parts[partKey].questions;
      const count = questions.filter(question => String(session.answers[question.number] || "").trim()).length;
      const element = document.querySelector(`[data-uoe-part-progress="${partKey}"]`);
      if (element) element.textContent = `${count}/${questions.length}`;
    });
  }

  function renderUseOfEnglishSessionHTML(session) {
    if (session.phase === "gradingPart4") return renderUseOfEnglishPart4GradingHTML(session);
    if (session.phase === "result") return renderUseOfEnglishResultHTML(session);
    const partKeys = getUseOfEnglishPartKeys(session.test);
    const activePart = partKeys.includes(session.activePart) ? session.activePart : partKeys[0];
    const part = session.test.parts[activePart];
    const allQuestions = partKeys.flatMap(partKey => session.test.parts[partKey].questions);
    return `
      <section class="exam-session-shell">
        <div class="exam-session-topbar">
          <div><span class="eyebrow">Real Use of English practice</span><h1>${escapeHTML(session.test.title)}</h1><p>${session.test.kind === "full" ? "Parts 2–4 · 28 available marks" : "Part 4 focus · 12 available marks"}</p></div>
          <div class="exam-session-actions">${renderPracticeTimerHTML()}<button class="btn btn-secondary" onclick="exitUseOfEnglishBankTest()">Exit</button><button class="btn btn-primary" id="finish-uoe-bank" onclick="finishUseOfEnglishBankTest()">Check answers</button></div>
        </div>
        <nav class="exam-part-navigation uoe" aria-label="Use of English paper parts">
          ${partKeys.map(partKey => {
            const partData = session.test.parts[partKey];
            const answered = partData.questions.filter(question => String(session.answers[question.number] || "").trim()).length;
            return `<button class="${activePart === partKey ? "active" : ""}" onclick="switchUseOfEnglishBankPart('${partKey}')"><span>Part ${partData.number}</span><small data-uoe-part-progress="${partKey}">${answered}/${partData.questions.length}</small></button>`;
          }).join("")}
          <span id="uoe-bank-total-progress">${allQuestions.filter(question => String(session.answers[question.number] || "").trim()).length} / ${allQuestions.length} answered</span>
        </nav>
        <div class="exam-reading-workspace exam-uoe-workspace" data-active-part="${activePart}">
          <article class="exam-reading-paper">
            <div class="exam-reading-prose exam-uoe-source">${renderUseOfEnglishPassageHTML(part)}</div>
          </article>
          <aside class="exam-reading-questions" aria-label="Part ${part.number} answer fields">
            <div class="exam-question-panel-head"><span>Answers</span><strong>${part.questions[0].number}–${part.questions.at(-1).number}</strong></div>
            ${part.questions.map(question => renderUseOfEnglishQuestionHTML(part, question, session.answers[question.number])).join("")}
            <div class="exam-part-footer">
              ${activePart !== partKeys[0] ? `<button class="btn btn-secondary" onclick="switchUseOfEnglishBankPart('${partKeys[partKeys.indexOf(activePart) - 1]}')">Previous part</button>` : "<span></span>"}
              ${activePart !== partKeys.at(-1) ? `<button class="btn btn-primary" onclick="switchUseOfEnglishBankPart('${partKeys[partKeys.indexOf(activePart) + 1]}')">Next part</button>` : `<button class="btn btn-primary" onclick="finishUseOfEnglishBankTest()">Check answers</button>`}
            </div>
          </aside>
        </div>
      </section>
    `;
  }

  function renderUseOfEnglishQuestionHTML(part, question, value) {
    return `
      <section class="exam-question-card uoe ${String(value || "").trim() ? "answered" : ""}" data-bank-question="${question.number}">
        <div class="exam-question-number">${question.number}</div>
        <div class="exam-question-content"><p>${escapeHTML(question.prompt)}</p><input class="exam-uoe-answer-input" type="text" value="${escapeHTML(value || "")}" autocomplete="off" spellcheck="false" placeholder="${part.number === 4 ? "3–8 words" : "Your answer"}" oninput="storeUseOfEnglishBankAnswer(${question.number}, this.value)"></div>
      </section>
    `;
  }

  function normalizeObjectiveAnswer(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[‘’´`]/g, "'")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  function matchesObjectiveAnswer(value, answerKey) {
    const normalizedValue = normalizeObjectiveAnswer(value);
    if (!normalizedValue) return false;
    return String(answerKey || "")
      .split("/")
      .some(option => normalizeObjectiveAnswer(option) === normalizedValue);
  }

  function getUseOfEnglishManualQuestions(session) {
    return [
      ...(session.test.parts.part2?.questions || []).map(question => ({ partKey: "part2", question })),
      ...(session.test.parts.part4?.questions || []).map(question => ({ partKey: "part4", question }))
    ];
  }

  function hasMissingUseOfEnglishManualGrades(session) {
    return getUseOfEnglishManualQuestions(session).some(({ partKey, question }) => {
      const grades = partKey === "part2" ? session.part2Grades : session.part4Grades;
      return !Number.isInteger(grades[question.number]);
    });
  }

  function finishUseOfEnglishBankTest() {
    const session = STATE.examBankSession;
    if (session?.section !== "useOfEnglish" || session.phase !== "answering") return;
    const partKeys = getUseOfEnglishPartKeys(session.test);
    const questions = partKeys.flatMap(partKey => session.test.parts[partKey].questions.map(question => question.number));
    const missing = questions.filter(question => !String(session.answers[question] || "").trim());
    if (missing.length) {
      alert(`Answer every question before checking the set. Missing: ${missing.map(question => `Q.${question}`).join(", ")}.`);
      return;
    }
    if (session.test.parts.part2) {
      session.test.parts.part2.questions.forEach(question => {
        session.part2Grades[question.number] = matchesObjectiveAnswer(
          session.answers[question.number],
          session.test.answers[question.number]
        ) ? 1 : 0;
      });
    }
    if (session.test.parts.part2 || session.test.parts.part4) {
      session.phase = "gradingPart4";
      renderExamBank();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    saveUseOfEnglishBankResult();
  }

  function setUseOfEnglishPart4Grade(question, points) {
    const session = STATE.examBankSession;
    if (session?.section !== "useOfEnglish" || session.phase !== "gradingPart4" || ![0, 1, 2].includes(points)) return;
    session.part4Grades[question] = points;
    document.querySelectorAll(`[data-uoe-grade-question="${question}"] button`).forEach(button => button.classList.toggle("active", Number(button.dataset.points) === points));
    const saveButton = document.getElementById("save-uoe-bank");
    if (saveButton) saveButton.disabled = hasMissingUseOfEnglishManualGrades(session);
  }

  function setUseOfEnglishPart2Grade(question, points) {
    const session = STATE.examBankSession;
    if (session?.section !== "useOfEnglish" || session.phase !== "gradingPart4" || ![0, 1].includes(points)) return;
    session.part2Grades[question] = points;
    document.querySelectorAll(`[data-uoe-grade-question="${question}"] button`).forEach(button => button.classList.toggle("active", Number(button.dataset.points) === points));
    const saveButton = document.getElementById("save-uoe-bank");
    if (saveButton) saveButton.disabled = hasMissingUseOfEnglishManualGrades(session);
  }

  function renderUseOfEnglishPart4GradingHTML(session) {
    const part2Questions = session.test.parts.part2?.questions || [];
    const part3Questions = session.test.parts.part3?.questions || [];
    const part4Questions = session.test.parts.part4?.questions || [];
    const includesPart2 = part2Questions.length > 0;
    const includesPart3 = part3Questions.length > 0;
    return `
      <section class="exam-uoe-grading">
        <div class="exam-session-topbar"><div><span class="eyebrow">Final correction</span><h1>${includesPart3 ? "Review Parts 2, 3 and 4" : "Score Part 4"}</h1><p>${includesPart3 ? "Confirm Part 2, review the automatic Part 3 marking, then award 0, 1 or 2 marks to every Part 4 transformation." : "Award 0, 1 or 2 marks after comparing each transformation with the key."}</p></div><div class="exam-session-actions"><button class="btn btn-secondary" onclick="exitUseOfEnglishBankTest()">Exit</button><button class="btn btn-primary" id="save-uoe-bank" onclick="saveUseOfEnglishBankResult()" ${hasMissingUseOfEnglishManualGrades(session) ? "disabled" : ""}>Save result</button></div></div>
        ${includesPart2 ? `
          <section class="uoe-grading-section">
            <div class="uoe-grading-heading"><div><span class="eyebrow">Part 2 · Open cloze</span><h2>Confirm the suggested marking</h2></div><p>Valid alternatives are separated by “/”. Change any pre-marked answer when context allows another form.</p></div>
            <div class="uoe-grading-grid">
              ${part2Questions.map(question => `
                <article>
                  <span>Question ${question.number}</span>
                  <div><small>Your answer</small><strong>${escapeHTML(session.answers[question.number])}</strong></div>
                  <div class="correct"><small>Answer key</small><strong>${escapeHTML(session.test.answers[question.number])}</strong></div>
                  <div class="uoe-grade-buttons binary" data-uoe-grade-question="${question.number}">
                    <button data-points="1" class="correct ${session.part2Grades[question.number] === 1 ? "active" : ""}" onclick="setUseOfEnglishPart2Grade(${question.number}, 1)">Correct</button>
                    <button data-points="0" class="missed ${session.part2Grades[question.number] === 0 ? "active" : ""}" onclick="setUseOfEnglishPart2Grade(${question.number}, 0)">Missed</button>
                  </div>
                </article>
              `).join("")}
            </div>
          </section>
        ` : ""}
        ${includesPart3 ? `
          <section class="uoe-grading-section">
            <div class="uoe-grading-heading"><div><span class="eyebrow">Part 3 · Word formation</span><h2>Automatic marking</h2></div><p>Check your answer against the key. Part 3 is marked automatically.</p></div>
            <div class="uoe-grading-grid">
              ${part3Questions.map(question => {
                const isCorrect = matchesObjectiveAnswer(session.answers[question.number], session.test.answers[question.number]);
                return `
                  <article>
                    <span>Question ${question.number}</span>
                    <div><small>Your answer</small><strong>${escapeHTML(session.answers[question.number])}</strong></div>
                    <div class="correct"><small>Answer key</small><strong>${escapeHTML(session.test.answers[question.number])}</strong></div>
                    <div class="uoe-auto-grade ${isCorrect ? "correct" : "missed"}"><small>Automatic result</small><strong>${isCorrect ? "Correct" : "Missed"}</strong></div>
                  </article>
                `;
              }).join("")}
            </div>
          </section>
        ` : ""}
        ${part4Questions.length ? `
          <section class="uoe-grading-section">
            ${includesPart2 ? `<div class="uoe-grading-heading"><div><span class="eyebrow">Part 4 · Key word transformations</span><h2>Award partial credit</h2></div><p>Compare the full phrase with the key and choose 0, 1 or 2 marks.</p></div>` : ""}
            <div class="uoe-grading-grid">
              ${part4Questions.map(question => `
                <article>
                  <span>Question ${question.number}</span>
                  <div><small>Your answer</small><strong>${escapeHTML(session.answers[question.number])}</strong></div>
                  <div class="correct"><small>Answer key</small><strong>${escapeHTML(session.test.answers[question.number])}</strong></div>
                  <div class="uoe-grade-buttons" data-uoe-grade-question="${question.number}">${[0, 1, 2].map(points => `<button data-points="${points}" class="${session.part4Grades[question.number] === points ? "active" : ""}" onclick="setUseOfEnglishPart4Grade(${question.number}, ${points})">${points} pt${points === 1 ? "" : "s"}</button>`).join("")}</div>
                </article>
              `).join("")}
            </div>
          </section>
        ` : ""}
      </section>
    `;
  }

  async function saveUseOfEnglishBankResult() {
    const session = STATE.examBankSession;
    if (session?.section !== "useOfEnglish" || session.saving) return;
    const partKeys = getUseOfEnglishPartKeys(session.test);
    if (hasMissingUseOfEnglishManualGrades(session)) return;
    session.saving = true;
    const gradedStates = {};
    const correctAnswers = {};
    const questionTexts = {};
    const useOfEnglishPartTexts = {};
    const missed = [];
    let rawScore = 0;
    let total = 0;
    const gradedQuestions = [];
    partKeys.forEach(partKey => {
      const part = session.test.parts[partKey];
      const weight = USE_OF_ENGLISH_PART_WEIGHTS[partKey];
      useOfEnglishPartTexts[partKey] = part.passage;
      part.questions.forEach(question => {
        const number = question.number;
        const correctAnswer = session.test.answers[number];
        const points = getUseOfEnglishQuestionPoints(session, partKey, number);
        gradedStates[number] = partKey === "part4" ? points : points === weight ? "correct" : "incorrect";
        correctAnswers[number] = correctAnswer;
        questionTexts[number] = `Part ${part.number} · Question ${number}`;
        gradedQuestions.push(number);
        rawScore += points;
        total += weight;
        if (points < weight) missed.push({ partKey, question: number, answer: session.answers[number], correctAnswer, points, weight });
      });
    });
    const scaleScore = session.test.kind === "full" ? calculateScaleScore("useOfEnglish", rawScore) : 0;
    const savedAt = Date.now();
    const durationSeconds = getPracticeTimerSeconds();
    const answers = {
      ...session.answers,
      meta: {
        examBank: {
          version: 2,
          id: session.id,
          collection: "useOfEnglish",
          testNumber: session.testNumber,
          label: session.label,
          source: "real-exam-bank",
          kind: session.test.kind,
          scoredParts: partKeys
        },
        ...(session.test.kind !== "full" ? { attemptType: "partial-practice" } : {}),
        attemptedParts: partKeys,
        gradedQuestions,
        correctAnswers,
        questionTexts,
        useOfEnglishPartTexts,
        durationSeconds,
        studyDataVersion: C2_STUDY_REVIEW.STUDY_DATA_VERSION
      }
    };
    const savedAttempt = {
      id: `session_uoe_bank_${session.testNumber}_${savedAt}`,
      section: "useOfEnglish",
      correct: rawScore,
      total,
      percentage: Math.round((rawScore / total) * 100),
      scaleScore,
      answers,
      gradedStates,
      date: savedAt,
      durationSeconds
    };
    STATE.history.push(savedAttempt);
    await persistHistory({ mode: "merge" });
    clearPracticeTimerInterval();
    session.phase = "result";
    session.saving = false;
    session.result = { rawScore, total, scaleScore, missed, durationSeconds };
    renderExamBank();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function getUseOfEnglishQuestionPoints(session, partKey, questionNumber) {
    if (partKey === "part4") return session.part4Grades[questionNumber];
    if (partKey === "part2") return session.part2Grades[questionNumber];
    const weight = USE_OF_ENGLISH_PART_WEIGHTS[partKey];
    return matchesObjectiveAnswer(session.answers[questionNumber], session.test.answers[questionNumber]) ? weight : 0;
  }

  function getExamReviewStatus(points, weight) {
    if (points === weight) return { className: "correct", label: "Correct" };
    if (points > 0) return { className: "partial", label: `${points}/${weight} marks` };
    return { className: "missed", label: "Missed" };
  }

  function renderExamReviewStatusHTML(points, weight) {
    const status = getExamReviewStatus(points, weight);
    return `<span class="exam-review-status ${status.className}">${status.label}</span>`;
  }

  function renderExamReviewAnswerPairHTML(answer, correctAnswer, options = {}) {
    return `
      <div class="exam-review-answer-grid">
        <div class="user ${options.isCorrect ? "correct" : "missed"}"><small>Your answer</small><strong>${escapeHTML(answer || "—")}</strong>${options.answerDetail ? `<p>${renderWritingMarkdownInline(options.answerDetail)}</p>` : ""}</div>
        <div class="key"><small>Correct answer</small><strong>${escapeHTML(correctAnswer || "—")}</strong>${options.correctDetail ? `<p>${renderWritingMarkdownInline(options.correctDetail)}</p>` : ""}</div>
      </div>
    `;
  }

  function renderUseOfEnglishFullReviewHTML(session) {
    const partKeys = getUseOfEnglishPartKeys(session.test);
    return `<div class="exam-full-review">${partKeys.map(partKey => {
      const part = session.test.parts[partKey];
      const weight = USE_OF_ENGLISH_PART_WEIGHTS[partKey];
      const earned = part.questions.reduce((sum, question) => sum + getUseOfEnglishQuestionPoints(session, partKey, question.number), 0);
      const available = part.questions.length * weight;
      return `
        <section class="exam-review-part">
          <div class="exam-review-part-head"><div><span class="eyebrow">Part ${part.number}</span><h3>${escapeHTML(part.title)}</h3></div><strong>${earned}/${available} marks</strong></div>
          <details class="exam-review-source">
            <summary>View the original Part ${part.number} text</summary>
            <div class="exam-review-source-content exam-reading-prose exam-uoe-source">${renderUseOfEnglishPassageHTML(part)}</div>
          </details>
          <div class="exam-review-question-grid">
            ${part.questions.map(question => {
              const points = getUseOfEnglishQuestionPoints(session, partKey, question.number);
              const isCorrect = points === weight;
              const status = getExamReviewStatus(points, weight);
              return `
                <article class="exam-review-question ${status.className}">
                  <header><div><span>Question ${question.number}</span><h4>${renderWritingMarkdownInline(question.prompt)}</h4></div>${renderExamReviewStatusHTML(points, weight)}</header>
                  ${renderExamReviewAnswerPairHTML(session.answers[question.number], session.test.answers[question.number], { isCorrect })}
                </article>
              `;
            }).join("")}
          </div>
        </section>
      `;
    }).join("")}</div>`;
  }

  function renderUseOfEnglishResultHTML(session) {
    const result = session.result;
    const isFull = session.test.kind === "full";
    return `
      <section class="exam-reading-result">
        <div class="exam-result-hero ${!isFull || result.scaleScore >= 200 ? "pass" : "risk"}">
          <div><span class="eyebrow">${escapeHTML(session.test.title)} marked</span><h1>${isFull ? result.scaleScore : `${result.rawScore}/${result.total}`}</h1><p>${isFull ? getCambridgeGrade(result.scaleScore) : "Focused Part 4 practice"}</p></div>
          <div class="exam-result-stats"><article><span>Raw marks</span><strong>${result.rawScore}/${result.total}</strong></article><article><span>Accuracy</span><strong>${Math.round((result.rawScore / result.total) * 100)}%</strong></article><article><span>Review</span><strong>${result.missed.length}</strong></article><article><span>Time</span><strong>${formatPracticeTimer(result.durationSeconds)}</strong></article></div>
        </div>
        <div class="exam-result-note"><strong>Saved to Progress.</strong> This bank starts independently from the historical attempts used only to recover the original source material.</div>
        <div class="exam-result-actions"><button class="btn btn-secondary" onclick="openExamBank('useOfEnglish')">Back to library</button><button class="btn btn-secondary" onclick="retryUseOfEnglishBankTest()">Try again</button><button class="btn btn-primary" onclick="renderDashboard()">Open Progress</button></div>
        <section class="exam-answer-review"><div class="exam-library-heading"><div><span class="eyebrow">Complete answer review</span><h2>Every question, part by part</h2></div><p>${result.missed.length ? `${result.missed.length} answers need attention; correct answers remain visible for context.` : "Every answer was correct."}</p></div>
          ${renderUseOfEnglishFullReviewHTML(session)}
        </section>
      </section>
    `;
  }

  function getReadingPartKeys(test) {
    return READING_PART_KEYS.filter(partKey => test.parts[partKey]);
  }

  function getReadingActualMax(test) {
    return getReadingPartKeys(test).reduce((sum, partKey) => sum + test.parts[partKey].questions.length * READING_PART_WEIGHTS[partKey], 0);
  }

  function startReadingBankTest(id) {
    const test = getReadingTest(id);
    if (!test) return;
    const partKeys = getReadingPartKeys(test);
    const totalQuestions = partKeys.reduce((sum, partKey) => sum + test.parts[partKey].questions.length, 0);
    STATE.examBankCollection = "reading";
    STATE.currentView = "examBank";
    STATE.examBankSession = {
      section: "reading",
      collection: "reading",
      id: test.id,
      testNumber: test.number,
      label: `Reading Bank · Test ${test.number}`,
      subtitle: `${test.parts.part1 ? "Parts 1, 5–7" : "Parts 5–7"} · ${totalQuestions} questions`,
      test,
      activePart: partKeys[0],
      phase: "answering",
      answers: {},
      saving: false,
      result: null
    };
    resetPracticeTimer({ keepRunning: true });
    renderExamBank();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exitReadingBankTest() {
    if (STATE.examBankSession?.phase === "answering" && Object.keys(STATE.examBankSession.answers || {}).length > 0) {
      if (!confirm("Leave this Reading paper? Your unsaved answers will be lost.")) return;
    }
    clearPracticeTimerInterval();
    STATE.examBankSession = null;
    openExamBank("reading");
  }

  function retryReadingBankTest() {
    const id = STATE.examBankSession?.id;
    if (id) startReadingBankTest(id);
  }

  function switchReadingBankPart(partKey) {
    if (STATE.examBankSession?.section !== "reading" || !STATE.examBankSession.test.parts[partKey]) return;
    STATE.examBankSession.activePart = partKey;
    renderExamBank();
  }

  function storeReadingBankAnswer(question, value) {
    const session = STATE.examBankSession;
    if (session?.section !== "reading" || session.phase !== "answering") return;
    if (value) session.answers[question] = value;
    else delete session.answers[question];
    const row = document.querySelector(`[data-bank-question="${question}"]`);
    if (row) {
      row.classList.toggle("answered", Boolean(value));
      row.querySelectorAll(".exam-mcq-options label").forEach(option => {
        const input = option.querySelector('input[type="radio"]');
        option.classList.toggle("selected", input?.value === value);
      });
    }
    const sessionView = document.querySelector(".exam-session-view");
    if (sessionView) {
      sessionView.scrollTop = 0;
      sessionView.scrollLeft = 0;
    }
    updateReadingProgressDOM();
  }

  function getReadingPartQuestionNumbers(test, partKey) {
    return test.parts[partKey].questions.map(question => question.number);
  }

  function updateReadingProgressDOM() {
    const session = STATE.examBankSession;
    if (session?.section !== "reading") return;
    const partKeys = getReadingPartKeys(session.test);
    const totalQuestions = partKeys.reduce((sum, partKey) => sum + session.test.parts[partKey].questions.length, 0);
    const answered = partKeys.flatMap(partKey => getReadingPartQuestionNumbers(session.test, partKey)).filter(question => session.answers[question]).length;
    const totalElement = document.getElementById("reading-bank-total-progress");
    if (totalElement) totalElement.textContent = `${answered} / ${totalQuestions} answered`;
    partKeys.forEach(partKey => {
      const questions = getReadingPartQuestionNumbers(session.test, partKey);
      const count = questions.filter(question => session.answers[question]).length;
      const element = document.querySelector(`[data-reading-part-progress="${partKey}"]`);
      if (element) element.textContent = `${count}/${questions.length}`;
    });
  }

  function renderReadingSessionHTML(session) {
    if (session.phase === "result") return renderReadingResultHTML(session);
    const test = session.test;
    const partKeys = getReadingPartKeys(test);
    const activePart = partKeys.includes(session.activePart) ? session.activePart : partKeys[0];
    const part = test.parts[activePart];
    const totalQuestions = partKeys.reduce((sum, partKey) => sum + test.parts[partKey].questions.length, 0);
    const answeredTotal = partKeys.flatMap(partKey => getReadingPartQuestionNumbers(test, partKey)).filter(question => session.answers[question]).length;
    return `
      <section class="exam-session-shell">
        <div class="exam-session-topbar">
          <div><span class="eyebrow">Real Reading paper</span><h1>Test ${test.number}</h1><p>${test.parts.part1 ? "Parts 1, 5–7 · full 44-mark component" : "Parts 5–7 · 36 marks · normalised scale estimate"}</p></div>
          <div class="exam-session-actions">${renderPracticeTimerHTML()}<button class="btn btn-secondary" onclick="exitReadingBankTest()">Exit</button><button class="btn btn-primary" id="finish-reading-bank" onclick="finishReadingBankTest()">Finish & mark</button></div>
        </div>
        <nav class="exam-part-navigation" aria-label="Reading paper parts">
          ${partKeys.map(partKey => {
            const partData = test.parts[partKey];
            const answered = getReadingPartQuestionNumbers(test, partKey).filter(question => session.answers[question]).length;
            return `<button class="${activePart === partKey ? "active" : ""}" onclick="switchReadingBankPart('${partKey}')"><span>Part ${partData.number}</span><small data-reading-part-progress="${partKey}">${answered}/${partData.questions.length}</small></button>`;
          }).join("")}
          <span id="reading-bank-total-progress">${answeredTotal} / ${totalQuestions} answered</span>
        </nav>
        <div class="exam-reading-workspace" data-active-part="${activePart}">
          <article class="exam-reading-paper">
            <div class="exam-paper-heading"><span>Part ${part.number}</span><h2>${renderWritingMarkdownInline(part.title)}</h2><div class="exam-paper-instructions">${renderRichText(part.instructions)}</div></div>
            ${renderReadingSourceHTML(test, activePart, session)}
          </article>
          <aside class="exam-reading-questions" aria-label="Part ${part.number} questions">
            ${activePart === "part6" ? renderReadingParagraphBankHTML(session) : `<div class="exam-question-panel-head"><span>Questions</span><strong>${part.questions[0].number}–${part.questions.at(-1).number}</strong></div>${part.questions.map(question => renderReadingQuestionHTML(test, activePart, question, session.answers[question.number])).join("")}`}
            <div class="exam-part-footer">
              ${activePart !== partKeys[0] ? `<button class="btn btn-secondary" onclick="switchReadingBankPart('${partKeys[partKeys.indexOf(activePart) - 1]}')">Previous part</button>` : "<span></span>"}
              ${activePart !== partKeys.at(-1) ? `<button class="btn btn-primary" onclick="switchReadingBankPart('${partKeys[partKeys.indexOf(activePart) + 1]}')">Next part</button>` : `<button class="btn btn-primary" onclick="finishReadingBankTest()">Finish paper</button>`}
            </div>
          </aside>
        </div>
      </section>
    `;
  }

  function renderReadingSourceHTML(test, partKey, session) {
    const part = test.parts[partKey];
    if (partKey === "part1" || partKey === "part5") return `<div class="exam-reading-prose">${renderRichText(part.passage)}</div>`;
    if (partKey === "part6") {
      return `<div class="exam-reading-prose exam-reading-gapped-passage">${renderReadingPart6PassageHTML(session)}</div>`;
    }
    return `<section class="exam-reading-sections">${part.sections.map(section => `<article id="exam-reading-section-${section.label}"><div><strong>${section.label}</strong><h3>${escapeHTML(section.title)}</h3></div>${renderRichText(section.text)}</article>`).join("")}</section>`;
  }

  function renderReadingPart6PassageHTML(session) {
    const blocks = String(session.test.parts.part6.passage || "").replace(/\r\n?/g, "\n").trim().split(/\n{2,}/).filter(Boolean);
    return blocks.map(block => {
      let html = renderWritingMarkdownInline(block.replace(/\n/g, " "));
      html = html.replace(/\[(3[7-9]|4[0-3])\]/g, (_, question) => renderReadingGapDropzoneHTML(session, Number(question)));
      return `<p>${html}</p>`;
    }).join("");
  }

  function renderReadingGapDropzoneHTML(session, question) {
    const label = session.answers[question];
    const paragraph = session.test.parts.part6.paragraphs.find(item => item.label === label);
    if (!paragraph) {
      return `<span class="exam-reading-dropzone" data-reading-gap="${question}" ondragover="handleReadingGapDragOver(event)" ondragleave="handleReadingGapDragLeave(event)" ondrop="dropReadingParagraph(event, ${question})"><strong>Gap ${question}</strong><small>Drop a paragraph here</small></span>`;
    }
    return `<span class="exam-reading-dropzone filled" data-reading-gap="${question}" ondragover="handleReadingGapDragOver(event)" ondragleave="handleReadingGapDragLeave(event)" ondrop="dropReadingParagraph(event, ${question})"><span class="exam-reading-inserted-paragraph" draggable="true" ondragstart="startReadingParagraphDrag(event, '${paragraph.label}', ${question})"><b>${paragraph.label}</b>${renderWritingMarkdownInline(paragraph.text)}<button type="button" aria-label="Remove paragraph ${paragraph.label} from gap ${question}" onclick="event.preventDefault(); event.stopPropagation(); removeReadingParagraph(${question})">×</button></span></span>`;
  }

  function renderReadingParagraphBankHTML(session) {
    const part = session.test.parts.part6;
    const assigned = new Set(part.questions.map(question => session.answers[question.number]).filter(Boolean));
    const available = part.paragraphs.filter(paragraph => !assigned.has(paragraph.label));
    return `
      <div class="exam-question-panel-head"><span>Paragraph bank</span><strong>${available.length} available</strong></div>
      <div class="exam-paragraph-drag-help"><strong>Drag into the text.</strong><span>Removing a paragraph returns it here in its original A–H order.</span></div>
      <div class="exam-paragraph-drag-bank">
        ${available.length ? available.map(paragraph => `
          <article draggable="true" ondragstart="startReadingParagraphDrag(event, '${paragraph.label}')">
            <strong>${paragraph.label}</strong><div>${renderRichText(paragraph.text)}</div>
            <label><span>Place without dragging</span><select onchange="placeReadingParagraph('${paragraph.label}', this.value)"><option value="">Choose gap</option>${part.questions.map(question => `<option value="${question.number}">Gap ${question.number}</option>`).join("")}</select></label>
          </article>
        `).join("") : '<div class="exam-paragraph-bank-empty">All paragraphs are currently placed. Remove one from the text to return it here.</div>'}
      </div>
    `;
  }

  function startReadingParagraphDrag(event, label, sourceQuestion = null) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify({ label, sourceQuestion }));
  }

  function handleReadingGapDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.add("drag-over");
  }

  function handleReadingGapDragLeave(event) {
    event.currentTarget.classList.remove("drag-over");
  }

  function getReadingWorkspaceScroll() {
    return {
      paper: document.querySelector(".exam-reading-paper")?.scrollTop || 0,
      questions: document.querySelector(".exam-reading-questions")?.scrollTop || 0
    };
  }

  function rerenderReadingWorkspace(scroll = getReadingWorkspaceScroll()) {
    renderExamBank();
    const paper = document.querySelector(".exam-reading-paper");
    const questions = document.querySelector(".exam-reading-questions");
    if (paper) paper.scrollTop = scroll.paper;
    if (questions) questions.scrollTop = scroll.questions;
  }

  function assignReadingParagraph(label, question) {
    const session = STATE.examBankSession;
    if (session?.section !== "reading" || session.activePart !== "part6" || session.phase !== "answering") return;
    const validLabel = session.test.parts.part6.paragraphs.some(paragraph => paragraph.label === label);
    const validQuestion = session.test.parts.part6.questions.some(item => item.number === Number(question));
    if (!validLabel || !validQuestion) return;
    session.test.parts.part6.questions.forEach(item => {
      if (session.answers[item.number] === label) delete session.answers[item.number];
    });
    session.answers[Number(question)] = label;
    rerenderReadingWorkspace();
  }

  function dropReadingParagraph(event, question) {
    event.preventDefault();
    event.currentTarget.classList.remove("drag-over");
    try {
      const payload = JSON.parse(event.dataTransfer.getData("text/plain"));
      assignReadingParagraph(payload.label, question);
    } catch {
      // Ignore unrelated drag payloads.
    }
  }

  function placeReadingParagraph(label, question) {
    if (question) assignReadingParagraph(label, Number(question));
  }

  function removeReadingParagraph(question) {
    const session = STATE.examBankSession;
    if (session?.section !== "reading" || session.activePart !== "part6" || session.phase !== "answering") return;
    const scroll = getReadingWorkspaceScroll();
    delete session.answers[question];
    rerenderReadingWorkspace(scroll);
  }

  function renderReadingQuestionHTML(test, partKey, question, selected) {
    const answerOptions = partKey === "part1" || partKey === "part5"
      ? question.options
      : partKey === "part6"
        ? test.parts.part6.paragraphs.map(paragraph => ({ value: paragraph.label, text: `Paragraph ${paragraph.label}` }))
        : test.parts.part7.sections.map(section => ({ value: section.label, text: section.title ? `${section.label} · ${section.title}` : `Section ${section.label}` }));
    const input = partKey === "part1" || partKey === "part5"
      ? `<div class="exam-mcq-options">${answerOptions.map(option => `<label class="${selected === option.value ? "selected" : ""}"><input type="radio" name="bank-reading-${question.number}" value="${option.value}" ${selected === option.value ? "checked" : ""} onchange="storeReadingBankAnswer(${question.number}, this.value)"><span>${option.value}</span><p>${renderWritingMarkdownInline(option.text)}</p></label>`).join("")}</div>`
      : `<select onchange="storeReadingBankAnswer(${question.number}, this.value)"><option value="">Choose an answer</option>${answerOptions.map(option => `<option value="${option.value}" ${selected === option.value ? "selected" : ""}>${escapeHTML(option.text)}</option>`).join("")}</select>`;
    return `
      <section class="exam-question-card ${selected ? "answered" : ""}" data-bank-question="${question.number}">
        <div class="exam-question-number">${question.number}</div>
        <div class="exam-question-content"><p>${renderWritingMarkdownInline(question.prompt)}</p>${input}</div>
      </section>
    `;
  }

  function serializeReadingPart(test, partKey) {
    const part = test.parts[partKey];
    if (partKey === "part1" || partKey === "part5") {
      return [`Part ${part.number} — ${part.title}`, part.passage, ...part.questions.map(question => `${question.number}. ${question.prompt}\n${question.options.map(option => `${option.value}. ${option.text}`).join("\n")}`)].join("\n\n");
    }
    if (partKey === "part6") {
      return [`Part 6 — ${part.title}`, part.passage, "Paragraphs A–H", ...part.paragraphs.map(paragraph => `${paragraph.label}. ${paragraph.text}`)].join("\n\n");
    }
    return [`Part 7 — ${part.title}`, part.questionHeading, ...part.questions.map(question => `${question.number}. ${question.prompt}`), ...part.sections.map(section => `${section.label}. ${section.title}\n${section.text}`)].join("\n\n");
  }

  function getReadingQuestionText(test, partKey, question) {
    if (partKey === "part1" || partKey === "part5") return `${question.number}. ${question.prompt}\n${question.options.map(option => `${option.value}. ${option.text}`).join("\n")}`;
    return `${question.number}. ${question.prompt}`;
  }

  async function finishReadingBankTest() {
    const session = STATE.examBankSession;
    if (session?.section !== "reading" || session.phase !== "answering" || session.saving) return;
    const partKeys = getReadingPartKeys(session.test);
    const questionNumbers = partKeys.flatMap(partKey => getReadingPartQuestionNumbers(session.test, partKey));
    const missing = questionNumbers.filter(question => !session.answers[question]);
    if (missing.length > 0) {
      alert(`Answer every question before marking the paper. Missing: ${missing.map(question => `Q.${question}`).join(", ")}.`);
      return;
    }
    session.saving = true;
    const button = document.getElementById("finish-reading-bank");
    if (button) { button.disabled = true; button.textContent = "Marking…"; }

    const gradedStates = {};
    const correctAnswers = {};
    const questionTexts = {};
    const readingPartTexts = {};
    let rawScore = 0;
    const missed = [];
    partKeys.forEach(partKey => {
      const weight = READING_PART_WEIGHTS[partKey];
      readingPartTexts[partKey] = serializeReadingPart(session.test, partKey);
      session.test.parts[partKey].questions.forEach(question => {
        const correctAnswer = session.test.answers[question.number];
        const isCorrect = session.answers[question.number] === correctAnswer;
        gradedStates[question.number] = isCorrect ? "correct" : "incorrect";
        correctAnswers[question.number] = correctAnswer;
        questionTexts[question.number] = getReadingQuestionText(session.test, partKey, question);
        if (isCorrect) rawScore += weight;
        else missed.push({ partKey, question: question.number, answer: session.answers[question.number], correctAnswer, prompt: question.prompt });
      });
    });

    const actualMax = getReadingActualMax(session.test);
    const equivalentRaw = Math.round((rawScore / actualMax) * 44);
    const scaleScore = calculateScaleScore("reading", equivalentRaw);
    const savedAt = Date.now();
    const durationSeconds = getPracticeTimerSeconds();
    const answers = {
      ...session.answers,
      meta: {
        examBank: {
          version: 2,
          id: session.id,
          collection: "reading",
          testNumber: session.testNumber,
          label: session.label,
          source: "real-exam-bank",
          scoredParts: partKeys,
          actualRaw: rawScore,
          actualMax,
          equivalentRaw,
          equivalentMax: 44
        },
        attemptedParts: partKeys,
        gradedQuestions: questionNumbers,
        correctAnswers,
        questionTexts,
        readingPartTexts,
        durationSeconds,
        studyDataVersion: C2_STUDY_REVIEW.STUDY_DATA_VERSION
      }
    };
    const savedAttempt = {
      id: `session_reading_bank_${session.testNumber}_${savedAt}`,
      section: "reading",
      correct: rawScore,
      total: actualMax,
      percentage: Math.round((rawScore / actualMax) * 100),
      scaleScore,
      answers,
      gradedStates,
      date: savedAt,
      durationSeconds
    };
    STATE.history.push(savedAttempt);
    await persistHistory({ mode: "merge" });
    clearPracticeTimerInterval();
    session.phase = "result";
    session.saving = false;
    session.result = { rawScore, actualMax, equivalentRaw, scaleScore, missed, savedAttemptId: savedAttempt.id, durationSeconds };
    renderExamBank();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderReadingReviewSourceHTML(test, partKey) {
    const part = test.parts[partKey];
    let content = "";
    if (partKey === "part1" || partKey === "part5") {
      content = `<div class="exam-reading-prose">${renderRichText(part.passage)}</div>`;
    } else if (partKey === "part6") {
      content = `
        <div class="exam-reading-prose">${renderRichText(part.passage, { highlightGaps: true })}</div>
        <div class="exam-review-paragraph-list">${part.paragraphs.map(paragraph => `<article><strong>${paragraph.label}</strong><p>${renderWritingMarkdownInline(paragraph.text)}</p></article>`).join("")}</div>
      `;
    } else {
      content = `<section class="exam-reading-sections exam-review-sections">${part.sections.map(section => `<article><div><strong>${section.label}</strong><h3>${escapeHTML(section.title)}</h3></div>${renderRichText(section.text)}</article>`).join("")}</section>`;
    }
    return `<details class="exam-review-source"><summary>View the original Part ${part.number} text</summary><div class="exam-review-source-content">${content}</div></details>`;
  }

  function renderReadingReviewOptionsHTML(question, answer, correctAnswer) {
    return `<ul class="exam-review-options">${question.options.map(option => {
      const isUser = answer === option.value;
      const isCorrect = correctAnswer === option.value;
      const labels = [isUser ? "Your answer" : "", isCorrect ? "Correct answer" : ""].filter(Boolean).join(" · ");
      return `<li class="${isCorrect ? "correct" : ""} ${isUser && !isCorrect ? "missed" : ""}"><b>${option.value}</b><span>${renderWritingMarkdownInline(option.text)}</span>${labels ? `<em>${labels}</em>` : ""}</li>`;
    }).join("")}</ul>`;
  }

  function renderReadingReviewAnswerHTML(test, partKey, question, answer, correctAnswer) {
    if (partKey === "part1" || partKey === "part5") {
      return renderReadingReviewOptionsHTML(question, answer, correctAnswer);
    }
    if (partKey === "part6") {
      const paragraphs = test.parts.part6.paragraphs;
      const answerParagraph = paragraphs.find(paragraph => paragraph.label === answer);
      const correctParagraph = paragraphs.find(paragraph => paragraph.label === correctAnswer);
      return renderExamReviewAnswerPairHTML(
        answer ? `Paragraph ${answer}` : "—",
        correctAnswer ? `Paragraph ${correctAnswer}` : "—",
        {
          isCorrect: answer === correctAnswer,
          answerDetail: answerParagraph?.text || "",
          correctDetail: correctParagraph?.text || ""
        }
      );
    }
    const sections = test.parts.part7.sections;
    const answerSection = sections.find(section => section.label === answer);
    const correctSection = sections.find(section => section.label === correctAnswer);
    return renderExamReviewAnswerPairHTML(
      answer ? `Section ${answer}` : "—",
      correctAnswer ? `Section ${correctAnswer}` : "—",
      {
        isCorrect: answer === correctAnswer,
        answerDetail: answerSection?.title || "",
        correctDetail: correctSection?.title || ""
      }
    );
  }

  function renderReadingFullReviewHTML(session) {
    const partKeys = getReadingPartKeys(session.test);
    return `<div class="exam-full-review">${partKeys.map(partKey => {
      const part = session.test.parts[partKey];
      const weight = READING_PART_WEIGHTS[partKey];
      const correctCount = part.questions.filter(question => session.answers[question.number] === session.test.answers[question.number]).length;
      const earned = correctCount * weight;
      const available = part.questions.length * weight;
      return `
        <section class="exam-review-part">
          <div class="exam-review-part-head"><div><span class="eyebrow">Part ${part.number}</span><h3>${renderWritingMarkdownInline(part.title)}</h3></div><strong>${earned}/${available} marks</strong></div>
          ${renderReadingReviewSourceHTML(session.test, partKey)}
          <div class="exam-review-question-grid">
            ${part.questions.map(question => {
              const answer = session.answers[question.number];
              const correctAnswer = session.test.answers[question.number];
              const isCorrect = answer === correctAnswer;
              return `
                <article class="exam-review-question ${isCorrect ? "correct" : "missed"}">
                  <header><div><span>Question ${question.number}</span><h4>${renderWritingMarkdownInline(question.prompt)}</h4></div>${renderExamReviewStatusHTML(isCorrect ? weight : 0, weight)}</header>
                  ${renderReadingReviewAnswerHTML(session.test, partKey, question, answer, correctAnswer)}
                </article>
              `;
            }).join("")}
          </div>
        </section>
      `;
    }).join("")}</div>`;
  }

  function renderReadingResultHTML(session) {
    const result = session.result;
    const partKeys = getReadingPartKeys(session.test);
    const totalQuestions = partKeys.reduce((sum, partKey) => sum + session.test.parts[partKey].questions.length, 0);
    const correctCount = totalQuestions - result.missed.length;
    const isFullReading = result.actualMax === 44;
    return `
      <section class="exam-reading-result">
        <div class="exam-result-hero ${result.scaleScore >= 200 ? "pass" : "risk"}">
          <div><span class="eyebrow">Reading Test ${session.testNumber} marked</span><h1>${result.scaleScore}</h1><p>${getCambridgeGrade(result.scaleScore)} · ${isFullReading ? "full Reading component" : "estimated from Parts 5–7"}</p></div>
          <div class="exam-result-stats"><article><span>Questions</span><strong>${correctCount}/${totalQuestions}</strong></article><article><span>Actual marks</span><strong>${result.rawScore}/${result.actualMax}</strong></article><article><span>${isFullReading ? "Reading raw" : "Equivalent raw"}</span><strong>${result.equivalentRaw}/44</strong></article><article><span>Time</span><strong>${formatPracticeTimer(result.durationSeconds)}</strong></article></div>
        </div>
        <div class="exam-result-note"><strong>Saved to Progress.</strong> ${isFullReading ? "This paper includes the complete 44 available marks across Parts 1 and 5–7." : "Test 12 currently contains Parts 5–7, so its 36 available marks are normalised to the full Reading component until one more Part 1 source is added."}</div>
        <div class="exam-result-actions"><button class="btn btn-secondary" onclick="openExamBank('reading')">Back to library</button><button class="btn btn-secondary" onclick="retryReadingBankTest()">Try again</button><button class="btn btn-primary" onclick="renderDashboard()">Open Progress</button></div>
        <section class="exam-answer-review"><div class="exam-library-heading"><div><span class="eyebrow">Complete answer review</span><h2>Every question, part by part</h2></div><p>${correctCount}/${totalQuestions} correct. Open each source text whenever you need the full context.</p></div>
          ${renderReadingFullReviewHTML(session)}
        </section>
      </section>
    `;
  }

  root.openExamBank = openExamBank;
  root.renderExamBank = renderExamBank;
  root.setUseOfEnglishBankFilter = setUseOfEnglishBankFilter;
  root.startUseOfEnglishBankTest = startUseOfEnglishBankTest;
  root.exitUseOfEnglishBankTest = exitUseOfEnglishBankTest;
  root.retryUseOfEnglishBankTest = retryUseOfEnglishBankTest;
  root.switchUseOfEnglishBankPart = switchUseOfEnglishBankPart;
  root.storeUseOfEnglishBankAnswer = storeUseOfEnglishBankAnswer;
  root.finishUseOfEnglishBankTest = finishUseOfEnglishBankTest;
  root.setUseOfEnglishPart2Grade = setUseOfEnglishPart2Grade;
  root.setUseOfEnglishPart4Grade = setUseOfEnglishPart4Grade;
  root.saveUseOfEnglishBankResult = saveUseOfEnglishBankResult;
  root.selectListeningBankTest = selectListeningBankTest;
  root.selectRandomListeningTest = selectRandomListeningTest;
  root.selectWritingBankTask = selectWritingBankTask;
  root.startListeningBankTest = startListeningBankTest;
  root.startWritingBankTest = startWritingBankTest;
  root.renderActiveExamBankListeningMediaHTML = renderActiveExamBankListeningMediaHTML;
  root.initializeActiveListeningPlayer = initializeActiveListeningPlayer;
  root.renderActiveExamBankWritingPromptHTML = renderActiveExamBankWritingPromptHTML;
  root.getActiveExamBankWritingAssessmentContext = getActiveExamBankWritingAssessmentContext;
  root.getActiveExamBankAttemptMeta = getActiveExamBankAttemptMeta;
  root.startReadingBankTest = startReadingBankTest;
  root.exitReadingBankTest = exitReadingBankTest;
  root.retryReadingBankTest = retryReadingBankTest;
  root.switchReadingBankPart = switchReadingBankPart;
  root.storeReadingBankAnswer = storeReadingBankAnswer;
  root.startReadingParagraphDrag = startReadingParagraphDrag;
  root.handleReadingGapDragOver = handleReadingGapDragOver;
  root.handleReadingGapDragLeave = handleReadingGapDragLeave;
  root.dropReadingParagraph = dropReadingParagraph;
  root.placeReadingParagraph = placeReadingParagraph;
  root.removeReadingParagraph = removeReadingParagraph;
  root.finishReadingBankTest = finishReadingBankTest;
})(typeof globalThis !== "undefined" ? globalThis : this);
