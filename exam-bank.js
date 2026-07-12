(function initialiseExamBank(root) {
  const BANK = root.C2_EXAM_BANK || { reading: [], listening: [], writing: [] };
  const READING_PART_KEYS = ["part5", "part6", "part7"];
  const READING_PART_WEIGHTS = { part5: 2, part6: 2, part7: 1 };

  function getCollection(value = STATE.examBankCollection) {
    return ["reading", "listening", "writing"].includes(value) ? value : "reading";
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
      let html = renderWritingMarkdownInline(block.replace(/\n/g, " "));
      if (options.highlightGaps) {
        html = html.replace(/\[(3[7-9]|4[0-3])\]/g, '<mark class="exam-gap-marker" id="exam-gap-$1">[$1]</mark>');
      }
      return `<p>${html}</p>`;
    }).join("");
  }

  function renderExamBankHomeFeatureHTML() {
    return `
      <section class="exam-bank-home-feature" aria-labelledby="exam-bank-home-title">
        <div class="exam-bank-home-copy">
          <span class="eyebrow">Real exam library</span>
          <h2 id="exam-bank-home-title">Practise the paper, not just the answer sheet.</h2>
          <p>Open complete Reading material, video-led Listening tests and authentic Writing task sets in a Cambridge-style workspace.</p>
          <button class="btn btn-primary" onclick="openExamBank('reading')">Explore real exams</button>
        </div>
        <div class="exam-bank-home-stats" aria-label="Exam library size">
          <button onclick="openExamBank('reading')"><strong>${BANK.reading.length}</strong><span>Reading tests</span><small>Parts 5–7 · auto-marked</small></button>
          <button onclick="openExamBank('listening')"><strong>${BANK.listening.length}</strong><span>Listening tests</span><small>Video + answer sheet</small></button>
          <button onclick="openExamBank('writing')"><strong>${BANK.writing.length}</strong><span>Writing sets</span><small>${BANK.writing.reduce((sum, test) => sum + 1 + test.part2Tasks.length, 0)} authentic tasks</small></button>
        </div>
      </section>
    `;
  }

  function openExamBank(collection = STATE.examBankCollection) {
    const nextCollection = getCollection(collection);
    const returningFromSheet = STATE.currentView === "sheet";
    if (returningFromSheet) {
      clearPracticeTimerInterval();
      STATE.examBankSession = null;
    }
    if (STATE.examBankCollection !== nextCollection && STATE.examBankSession?.section === "reading") {
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
    const readingSession = STATE.examBankSession?.section === "reading" ? STATE.examBankSession : null;
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
          ${readingSession ? renderReadingSessionHTML(readingSession) : `
            ${renderLibraryHeroHTML(collection)}
            ${renderCollectionTabsHTML(collection)}
            ${renderRegisteredArchiveHTML()}
            ${collection === "reading" ? renderReadingLibraryHTML() : collection === "listening" ? renderListeningLibraryHTML() : renderWritingLibraryHTML()}
          `}
        </main>
      </div>
    `;
    updatePracticeTimerDisplay();
  }

  function renderLibraryHeroHTML(collection) {
    const copy = {
      reading: ["Reading papers", "12 complete Parts 5–7 papers", "Read and answer in a split-screen workspace. All 23 questions are marked instantly and saved as an estimated Reading result based on 36 available marks."],
      listening: ["Listening papers", "33 full video-led tests", "The video carries the audio and on-screen questions. Keep the familiar answer sheet alongside it, then lock and self-correct all 30 responses."],
      writing: ["Writing papers", "10 authentic task sets", "Work from the real source texts and prompts without leaving the editor. Use the timer, word limits, GPT assessment prompt and Cambridge rubric as usual."]
    }[collection];
    return `
      <section class="exam-bank-hero">
        <div><span class="eyebrow">Exam repository</span><h1>${copy[1]}</h1><p>${copy[2]}</p></div>
        <div class="exam-bank-hero-mark"><strong>${collection === "reading" ? BANK.reading.length : collection === "listening" ? BANK.listening.length : BANK.writing.length}</strong><span>${copy[0]}</span></div>
      </section>
    `;
  }

  function renderCollectionTabsHTML(active) {
    const collections = [
      ["reading", "Reading", `${BANK.reading.length} tests`],
      ["listening", "Listening", `${BANK.listening.length} videos`],
      ["writing", "Writing", `${BANK.writing.length} sets`]
    ];
    return `<nav class="exam-bank-tabs" aria-label="Exam collections">${collections.map(([key, label, count]) => `
      <button class="${active === key ? "active" : ""}" onclick="openExamBank('${key}')"><span>${label}</span><small>${count}</small></button>
    `).join("")}</nav>`;
  }

  function renderRegisteredArchiveHTML() {
    const useOfEnglishAttempts = STATE.history.filter(item => {
      const texts = getPlainObject(getPlainObject(getPlainObject(item.answers).meta).useOfEnglishPartTexts);
      return item.section === "useOfEnglish" && Object.keys(texts).length > 0;
    });
    const readingPart1Attempts = STATE.history.filter(item => {
      const texts = getPlainObject(getPlainObject(getPlainObject(item.answers).meta).readingPartTexts);
      return item.section === "reading" && Boolean(texts.part1);
    });
    return `
      <details class="registered-exam-archive">
        <summary><div><span class="eyebrow">Already in your log</span><strong>Use of English and Reading Part 1 archive</strong></div><span>${useOfEnglishAttempts.length + readingPart1Attempts.length} saved source exercises</span></summary>
        <div class="registered-exam-archive-body">
          <article><strong>${useOfEnglishAttempts.length}</strong><div><span>Use of English papers</span><p>Parts 2–4 source texts, submitted answers and corrections remain attached to their saved attempts.</p></div><button class="btn btn-secondary" onclick="openAnswerSheet('useOfEnglish')">New answer sheet</button></article>
          <article><strong>${readingPart1Attempts.length}</strong><div><span>Reading Part 1 exercises</span><p>Your registered multiple-choice cloze texts and keys stay available through saved reviews.</p></div><button class="btn btn-secondary" onclick="openAnswerSheet('reading')">New answer sheet</button></article>
          <button class="btn btn-primary" onclick="renderDashboard()">Browse saved papers in Progress</button>
        </div>
      </details>
    `;
  }

  function renderReadingLibraryHTML() {
    return `
      <section class="exam-library-section">
        <div class="exam-library-heading"><div><span class="eyebrow">Choose a paper</span><h2>Reading Parts 5, 6 and 7</h2></div><p>23 questions · 36 marks · automatic answer key</p></div>
        <div class="reading-test-grid">
          ${BANK.reading.map(test => `
            <article class="reading-test-card">
              <div class="exam-card-number">${String(test.number).padStart(2, "0")}</div>
              <div class="reading-test-card-copy">
                <span>Reading Test ${test.number}</span>
                <h3>${renderWritingMarkdownInline(test.parts.part5.title)}</h3>
                <ul>
                  <li><b>Part 5</b>${renderWritingMarkdownInline(test.parts.part5.title)}</li>
                  <li><b>Part 6</b>${renderWritingMarkdownInline(test.parts.part6.title)}</li>
                  <li><b>Part 7</b>${renderWritingMarkdownInline(test.parts.part7.title)}</li>
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
        <div class="exam-library-heading"><div><span class="eyebrow">Choose a video test</span><h2>Full Listening paper</h2></div><p>4 parts · 30 answers · manual correction</p></div>
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
                <h3>${escapeHTML(test.title)}</h3>
                <div class="writing-task-preview"><span>Part 1 · Essay</span><strong>${test.part1.texts.map(text => escapeHTML(text.title)).join(" / ")}</strong></div>
                ${test.part2Tasks.length ? `
                  <label class="writing-bank-task-select"><span>Part 2 choice</span><select onchange="selectWritingBankTask('${test.id}', this.value)">
                    ${test.part2Tasks.map(task => `<option value="${task.id}" ${task.id === selectedTask.id ? "selected" : ""}>Question ${task.question} · ${escapeHTML(task.label)}</option>`).join("")}
                  </select></label>
                ` : '<div class="writing-bank-single-note">Part 1 only in this source set · score is normalised to 40.</div>'}
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
        <div class="exam-video-frame"><iframe src="${video.embedUrl}" title="${escapeHTML(video.title)}" loading="eager" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>
        <p>Use the controls in the video. Its question numbers 1–30 match the local numbers on the answer sheet below.</p>
      </section>
    `;
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
      version: 1,
      id: session.id,
      collection: session.collection,
      testNumber: session.testNumber,
      label: session.label,
      source: "real-exam-bank"
    };
    if (session.section === "listening") {
      return { ...base, youtubeId: session.video.youtubeId, watchUrl: session.video.watchUrl };
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

  function startReadingBankTest(id) {
    const test = getReadingTest(id);
    if (!test) return;
    STATE.examBankCollection = "reading";
    STATE.currentView = "examBank";
    STATE.examBankSession = {
      section: "reading",
      collection: "reading",
      id: test.id,
      testNumber: test.number,
      label: `Reading Bank · Test ${test.number}`,
      subtitle: "Parts 5–7 · 23 questions",
      test,
      activePart: "part5",
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
    if (!READING_PART_KEYS.includes(partKey) || STATE.examBankSession?.section !== "reading") return;
    STATE.examBankSession.activePart = partKey;
    renderExamBank();
    document.querySelector(".exam-reading-workspace")?.scrollIntoView({ block: "start" });
  }

  function storeReadingBankAnswer(question, value) {
    const session = STATE.examBankSession;
    if (session?.section !== "reading" || session.phase !== "answering") return;
    if (value) session.answers[question] = value;
    else delete session.answers[question];
    const row = document.querySelector(`[data-bank-question="${question}"]`);
    if (row) row.classList.toggle("answered", Boolean(value));
    updateReadingProgressDOM();
  }

  function getReadingPartQuestionNumbers(test, partKey) {
    return test.parts[partKey].questions.map(question => question.number);
  }

  function updateReadingProgressDOM() {
    const session = STATE.examBankSession;
    if (session?.section !== "reading") return;
    const answered = Object.keys(session.answers).length;
    const totalElement = document.getElementById("reading-bank-total-progress");
    if (totalElement) totalElement.textContent = `${answered} / 23 answered`;
    READING_PART_KEYS.forEach(partKey => {
      const questions = getReadingPartQuestionNumbers(session.test, partKey);
      const count = questions.filter(question => session.answers[question]).length;
      const element = document.querySelector(`[data-reading-part-progress="${partKey}"]`);
      if (element) element.textContent = `${count}/${questions.length}`;
    });
  }

  function renderReadingSessionHTML(session) {
    if (session.phase === "result") return renderReadingResultHTML(session);
    const test = session.test;
    const activePart = READING_PART_KEYS.includes(session.activePart) ? session.activePart : "part5";
    const part = test.parts[activePart];
    return `
      <section class="exam-session-shell">
        <div class="exam-session-topbar">
          <div><span class="eyebrow">Real Reading paper</span><h1>Test ${test.number}</h1><p>Parts 5–7 · 36 available marks · estimated scale normalised to the 44-mark Reading component</p></div>
          <div class="exam-session-actions">${renderPracticeTimerHTML()}<button class="btn btn-secondary" onclick="exitReadingBankTest()">Exit</button><button class="btn btn-primary" id="finish-reading-bank" onclick="finishReadingBankTest()">Finish & mark</button></div>
        </div>
        <nav class="exam-part-navigation" aria-label="Reading paper parts">
          ${READING_PART_KEYS.map(partKey => {
            const partData = test.parts[partKey];
            const answered = getReadingPartQuestionNumbers(test, partKey).filter(question => session.answers[question]).length;
            return `<button class="${activePart === partKey ? "active" : ""}" onclick="switchReadingBankPart('${partKey}')"><span>Part ${partData.number}</span><small data-reading-part-progress="${partKey}">${answered}/${partData.questions.length}</small></button>`;
          }).join("")}
          <span id="reading-bank-total-progress">${Object.keys(session.answers).length} / 23 answered</span>
        </nav>
        <div class="exam-reading-workspace" data-active-part="${activePart}">
          <article class="exam-reading-paper">
            <div class="exam-paper-heading"><span>Part ${part.number}</span><h2>${renderWritingMarkdownInline(part.title)}</h2><div class="exam-paper-instructions">${renderRichText(part.instructions)}</div></div>
            ${renderReadingSourceHTML(test, activePart)}
          </article>
          <aside class="exam-reading-questions" aria-label="Part ${part.number} questions">
            <div class="exam-question-panel-head"><span>Questions</span><strong>${part.questions[0].number}–${part.questions.at(-1).number}</strong></div>
            ${part.questions.map(question => renderReadingQuestionHTML(test, activePart, question, session.answers[question])).join("")}
            <div class="exam-part-footer">
              ${activePart !== "part5" ? `<button class="btn btn-secondary" onclick="switchReadingBankPart('${READING_PART_KEYS[READING_PART_KEYS.indexOf(activePart) - 1]}')">Previous part</button>` : "<span></span>"}
              ${activePart !== "part7" ? `<button class="btn btn-primary" onclick="switchReadingBankPart('${READING_PART_KEYS[READING_PART_KEYS.indexOf(activePart) + 1]}')">Next part</button>` : `<button class="btn btn-primary" onclick="finishReadingBankTest()">Finish paper</button>`}
            </div>
          </aside>
        </div>
      </section>
    `;
  }

  function renderReadingSourceHTML(test, partKey) {
    const part = test.parts[partKey];
    if (partKey === "part5") return `<div class="exam-reading-prose">${renderRichText(part.passage)}</div>`;
    if (partKey === "part6") {
      return `<div class="exam-reading-prose">${renderRichText(part.passage, { highlightGaps: true })}</div><section class="exam-paragraph-bank"><h3>Paragraphs A–H</h3>${part.paragraphs.map(paragraph => `<article><strong>${paragraph.label}</strong>${renderRichText(paragraph.text)}</article>`).join("")}</section>`;
    }
    return `<section class="exam-reading-sections">${part.sections.map(section => `<article id="exam-reading-section-${section.label}"><div><strong>${section.label}</strong><h3>${escapeHTML(section.title)}</h3></div>${renderRichText(section.text)}</article>`).join("")}</section>`;
  }

  function renderReadingQuestionHTML(test, partKey, question, selected) {
    const answerOptions = partKey === "part5"
      ? question.options
      : partKey === "part6"
        ? test.parts.part6.paragraphs.map(paragraph => ({ value: paragraph.label, text: `Paragraph ${paragraph.label}` }))
        : test.parts.part7.sections.map(section => ({ value: section.label, text: section.title ? `${section.label} · ${section.title}` : `Section ${section.label}` }));
    const input = partKey === "part5"
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
    if (partKey === "part5") {
      return [`Part 5 — ${part.title}`, part.passage, ...part.questions.map(question => `${question.number}. ${question.prompt}\n${question.options.map(option => `${option.value}. ${option.text}`).join("\n")}`)].join("\n\n");
    }
    if (partKey === "part6") {
      return [`Part 6 — ${part.title}`, part.passage, "Paragraphs A–H", ...part.paragraphs.map(paragraph => `${paragraph.label}. ${paragraph.text}`)].join("\n\n");
    }
    return [`Part 7 — ${part.title}`, part.questionHeading, ...part.questions.map(question => `${question.number}. ${question.prompt}`), ...part.sections.map(section => `${section.label}. ${section.title}\n${section.text}`)].join("\n\n");
  }

  function getReadingQuestionText(test, partKey, question) {
    if (partKey === "part5") return `${question.number}. ${question.prompt}\n${question.options.map(option => `${option.value}. ${option.text}`).join("\n")}`;
    return `${question.number}. ${question.prompt}`;
  }

  async function finishReadingBankTest() {
    const session = STATE.examBankSession;
    if (session?.section !== "reading" || session.phase !== "answering" || session.saving) return;
    const missing = [];
    for (let question = 31; question <= 53; question += 1) if (!session.answers[question]) missing.push(question);
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
    READING_PART_KEYS.forEach(partKey => {
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

    const actualMax = 36;
    const equivalentRaw = Math.round((rawScore / actualMax) * 44);
    const scaleScore = calculateScaleScore("reading", equivalentRaw);
    const savedAt = Date.now();
    const durationSeconds = getPracticeTimerSeconds();
    const answers = {
      ...session.answers,
      meta: {
        examBank: {
          version: 1,
          id: session.id,
          collection: "reading",
          testNumber: session.testNumber,
          label: session.label,
          source: "real-exam-bank",
          scoredParts: READING_PART_KEYS,
          actualRaw: rawScore,
          actualMax,
          equivalentRaw,
          equivalentMax: 44
        },
        attemptedParts: READING_PART_KEYS,
        gradedQuestions: Array.from({ length: 23 }, (_, index) => 31 + index),
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

  function renderReadingResultHTML(session) {
    const result = session.result;
    const correctCount = 23 - result.missed.length;
    return `
      <section class="exam-reading-result">
        <div class="exam-result-hero ${result.scaleScore >= 200 ? "pass" : "risk"}">
          <div><span class="eyebrow">Reading Test ${session.testNumber} marked</span><h1>${result.scaleScore}</h1><p>${getCambridgeGrade(result.scaleScore)} · estimated from Parts 5–7</p></div>
          <div class="exam-result-stats"><article><span>Questions</span><strong>${correctCount}/23</strong></article><article><span>Actual marks</span><strong>${result.rawScore}/36</strong></article><article><span>Equivalent raw</span><strong>${result.equivalentRaw}/44</strong></article><article><span>Time</span><strong>${formatPracticeTimer(result.durationSeconds)}</strong></article></div>
        </div>
        <div class="exam-result-note"><strong>Saved to Progress.</strong> The scale is an estimate: this source paper contains Parts 5–7, so the 36 available marks are normalised to the full 44-mark Reading component.</div>
        <div class="exam-result-actions"><button class="btn btn-secondary" onclick="openExamBank('reading')">Back to library</button><button class="btn btn-secondary" onclick="retryReadingBankTest()">Try again</button><button class="btn btn-primary" onclick="renderDashboard()">Open Progress</button></div>
        <section class="exam-answer-review"><div class="exam-library-heading"><div><span class="eyebrow">Answer review</span><h2>${result.missed.length ? `${result.missed.length} answers to revisit` : "Perfect paper"}</h2></div><p>Every answer remains available in the saved attempt.</p></div>
          ${result.missed.length ? `<div class="exam-missed-grid">${result.missed.map(item => `<article><span>${escapeHTML(session.test.parts[item.partKey].title)} · Q.${item.question}</span><p>${renderWritingMarkdownInline(item.prompt)}</p><div><small>Your answer</small><strong>${escapeHTML(item.answer)}</strong><small>Correct</small><strong>${escapeHTML(item.correctAnswer)}</strong></div></article>`).join("")}</div>` : '<div class="exam-perfect-result">All 23 answers correct. That is offensively tidy.</div>'}
        </section>
      </section>
    `;
  }

  root.renderExamBankHomeFeatureHTML = renderExamBankHomeFeatureHTML;
  root.openExamBank = openExamBank;
  root.renderExamBank = renderExamBank;
  root.selectListeningBankTest = selectListeningBankTest;
  root.selectRandomListeningTest = selectRandomListeningTest;
  root.selectWritingBankTask = selectWritingBankTask;
  root.startListeningBankTest = startListeningBankTest;
  root.startWritingBankTest = startWritingBankTest;
  root.renderActiveExamBankListeningMediaHTML = renderActiveExamBankListeningMediaHTML;
  root.renderActiveExamBankWritingPromptHTML = renderActiveExamBankWritingPromptHTML;
  root.getActiveExamBankWritingAssessmentContext = getActiveExamBankWritingAssessmentContext;
  root.getActiveExamBankAttemptMeta = getActiveExamBankAttemptMeta;
  root.startReadingBankTest = startReadingBankTest;
  root.exitReadingBankTest = exitReadingBankTest;
  root.retryReadingBankTest = retryReadingBankTest;
  root.switchReadingBankPart = switchReadingBankPart;
  root.storeReadingBankAnswer = storeReadingBankAnswer;
  root.finishReadingBankTest = finishReadingBankTest;
})(typeof globalThis !== "undefined" ? globalThis : this);
