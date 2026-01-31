// -------------------------
// STORAGE KEYS
// -------------------------
const COMPLETED_PREFIX = 'quiz_master_completed:';  // блок повтора для чужих викторин
const MY_QUIZZES_KEY = 'quiz_master_my_quizzes';    // "мои викторины"
const THEME_KEY = 'quiz_master_theme';              // light/dark

// -------------------------
// STATE
// -------------------------
let currentQuiz = null;
let quizEncoded = '';
let currentQIndex = 0;
let score = 0;
let startTime = 0;

let timerTickInterval = null;
let questionLocked = false;

let answersLog = [];
let allowRepeat = false;

// для режима total (время на всю викторину)
let totalTimer = {
  active: false,
  startedAt: 0,
  durationMs: 0,
  timeoutFired: false,
};

// -------------------------
// BOOT
// -------------------------
window.onload = () => {
  applySavedTheme();
  wireModeSelect();

  const hash = window.location.hash;
  if (hash.includes('quiz=')) {
    const encoded = hash.split('quiz=')[1];
    loadQuizFromURL(encoded, { allowRepeat: false, showPreview: true });
  } else {
    setActiveScreen('home-screen');
  }
};

// -------------------------
// THEME
// -------------------------
function applySavedTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem(THEME_KEY, next); } catch {}
}

// -------------------------
// UI SCREEN HELPERS
// -------------------------
function setActiveScreen(id) {
  const ids = [
    'home-screen',
    'myquizzes-screen',
    'creator-screen',
    'link-screen',
    'preview-screen',
    'game-screen',
    'result-screen'
  ];
  ids.forEach((x) => {
    const el = document.getElementById(x);
    if (el) el.classList.toggle('hidden', x !== id);
  });

  // home класс (для центрирования — в css)
  document.body.classList.toggle('home', id === 'home-screen');
}

function goHome() {
  setActiveScreen('home-screen');
}

function goHomeClearHash() {
  try { history.replaceState(null, '', window.location.pathname); } catch {}
  window.location.hash = '';
  setActiveScreen('home-screen');
}

// -------------------------
// CREATOR
// -------------------------
function wireModeSelect() {
  const el = document.getElementById('quiz-mode');
  if (!el) return;

  el.onchange = (e) => {
    const v = e.target.value;
    const perQ = document.getElementById('timer-setting');
    const total = document.getElementById('total-timer-setting');

    if (perQ) perQ.classList.toggle('hidden', v !== 'timer');
    if (total) total.classList.toggle('hidden', v !== 'total');
  };
}

function showCreator() {
  setActiveScreen('creator-screen');
  const container = document.getElementById('questions-container');
  if (container && container.children.length === 0) addQuestionField();
  buildQuestionNav();
}

function addQuestionField() {
  document.querySelectorAll('.qdetails').forEach((d) => (d.open = false));

  const container = document.getElementById('questions-container');
  const qIndex = container.querySelectorAll('.qdetails').length;
  const blockId = `qblock-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const details = document.createElement('details');
  details.className = 'qdetails';
  details.open = true;
  details.dataset.blockid = blockId;
  details.dataset.qindex = String(qIndex);

  details.innerHTML = `
    <summary>
      <div class="qsum-left">
        <div class="qsum-title">Вопрос ${qIndex + 1}</div>
        <div class="qsum-mini" id="qmini-${blockId}">Нажми, чтобы свернуть/развернуть</div>
      </div>
      <button type="button" class="btn secondary qremove" onclick="removeQuestion('${blockId}'); event.stopPropagation();">
        Удалить
      </button>
    </summary>

    <div style="margin-top: 10px;">
      <div class="field">
        <label>Текст вопроса:</label>
        <input type="text" class="q-text" placeholder="Текст" oninput="updateMini('${blockId}')"/>
      </div>

      <div class="field" style="margin-top: 6px;">
        <label>Варианты (отметь правильный слева):</label>
        <div class="options-wrap" data-options></div>
        <button type="button" class="btn secondary opt-add-btn"
          onclick="addOption('${blockId}')">+ Добавить вариант (до 5)</button>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Пояснение (покажется только по кнопке в игре):</label>
        <textarea class="q-expl" placeholder="Например: потому что ..."></textarea>
      </div>
    </div>
  `;

  container.appendChild(details);

  // 2 варианта по умолчанию
  addOption(blockId);
  addOption(blockId);

  renumberQuestions();
  buildQuestionNav();
  details.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function removeQuestion(blockId) {
  const el = document.querySelector(`.qdetails[data-blockid="${blockId}"]`);
  if (el) el.remove();
  renumberQuestions();
  buildQuestionNav();
}

function renumberQuestions() {
  const blocks = [...document.querySelectorAll('.qdetails')];
  blocks.forEach((b, idx) => {
    b.dataset.qindex = String(idx);

    const title = b.querySelector('.qsum-title');
    if (title) title.textContent = `Вопрос ${idx + 1}`;

    // радио-группа уникальна на вопрос
    const radios = b.querySelectorAll('input[type="radio"]');
    radios.forEach((r) => (r.name = `correct-${idx}`));
  });
}

function addOption(blockId) {
  const block = document.querySelector(`.qdetails[data-blockid="${blockId}"]`);
  if (!block) return;

  const qIndex = Number(block.dataset.qindex || 0);
  const wrap = block.querySelector('[data-options]');
  const rows = wrap.querySelectorAll('.option-row');
  if (rows.length >= 5) return;

  const optIndex = rows.length;

  const row = document.createElement('div');
  row.className = 'option-row';
  row.innerHTML = `
    <label class="correct-pick" title="Отметить правильный вариант">
      <input type="radio" name="correct-${qIndex}" value="${optIndex}" aria-label="Правильный вариант" />
      <span class="pick-badge" aria-hidden="true">✓</span>
    </label>

    <input type="text" class="opt-text" placeholder="Вариант ответа ${optIndex + 1}" oninput="updateMini('${blockId}')"/>

    <button type="button" class="opt-del" onclick="removeOption('${blockId}', ${optIndex}); event.preventDefault();">
      ✕
    </button>
  `;
  wrap.appendChild(row);

  // после добавления — переиндексация value у radio/кнопок удаления
  normalizeOptions(blockId);
  updateMini(blockId);
}

function removeOption(blockId, optIndex) {
  const block = document.querySelector(`.qdetails[data-blockid="${blockId}"]`);
  if (!block) return;

  const wrap = block.querySelector('[data-options]');
  const rows = [...wrap.querySelectorAll('.option-row')];
  if (rows.length <= 2) return; // минимум 2

  const row = rows[optIndex];
  if (row) row.remove();

  normalizeOptions(blockId);
  updateMini(blockId);
}

function normalizeOptions(blockId) {
  const block = document.querySelector(`.qdetails[data-blockid="${blockId}"]`);
  if (!block) return;

  const qIndex = Number(block.dataset.qindex || 0);
  const wrap = block.querySelector('[data-options]');
  const rows = [...wrap.querySelectorAll('.option-row')];

  // обновим индексы
  rows.forEach((row, i) => {
    const radio = row.querySelector('input[type="radio"]');
    if (radio) {
      radio.name = `correct-${qIndex}`;
      radio.value = String(i);
    }

    const input = row.querySelector('.opt-text');
    if (input) input.placeholder = `Вариант ответа ${i + 1}`;

    const delBtn = row.querySelector('.opt-del');
    if (delBtn) {
      delBtn.setAttribute('onclick', `removeOption('${blockId}', ${i}); event.preventDefault();`);
    }
  });

  // если правильный вариант исчез — снимем выбор
  const checked = block.querySelector(`input[type="radio"][name="correct-${qIndex}"]:checked`);
  if (!checked) {
    // ничего
  }
}

function updateMini(blockId) {
  const block = document.querySelector(`.qdetails[data-blockid="${blockId}"]`);
  const mini = document.getElementById(`qmini-${blockId}`);
  if (!block || !mini) return;

  const qText = (block.querySelector('.q-text')?.value || '').trim();
  const opts = [...block.querySelectorAll('.opt-text')]
    .map(x => (x.value || '').trim())
    .filter(Boolean);

  const title = qText ? qText : 'Без текста вопроса';
  const optInfo = opts.length ? `(${opts.length} вар.)` : '(нет вариантов)';
  mini.textContent = `${title} ${optInfo}`;
  buildQuestionNav();
}

function buildQuestionNav() {
  const chipsHost = document.getElementById('qnav-chips');
  if (!chipsHost) return;

  const blocks = [...document.querySelectorAll('.qdetails')];
  if (!blocks.length) {
    chipsHost.innerHTML = '';
    return;
  }

  const openIdx = blocks.findIndex((b) => b.open);
  const activeIndex = openIdx >= 0 ? openIdx : 0;

  chipsHost.innerHTML = blocks.map((b, idx) => {
    const blockId = b.dataset.blockid;
    const mini = document.getElementById(`qmini-${blockId}`)?.textContent || '';
    const label = `В${idx + 1}`;
    const active = idx === activeIndex ? 'active' : '';
    return `<button type="button" class="qchip ${active}" onclick="jumpToQuestion(${idx})" title="${escapeHtml(mini)}">${label}</button>`;
  }).join('');
}

function jumpToQuestion(idx) {
  const blocks = [...document.querySelectorAll('.qdetails')];
  const target = blocks[idx];
  if (!target) return;

  blocks.forEach((d) => (d.open = false));
  target.open = true;

  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  buildQuestionNav();
}

function generateLink() {
  const mode = document.getElementById('quiz-mode').value;
  const perQ = Number(document.getElementById('time-limit')?.value || 0);
  const totalT = Number(document.getElementById('total-time-limit')?.value || 0);
  const title = (document.getElementById('quiz-title').value || '').trim();

  const blocks = [...document.querySelectorAll('.qdetails')];
  if (blocks.length === 0) {
    alert('Добавь хотя бы один вопрос.');
    return;
  }

  const data = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const qText = (b.querySelector('.q-text').value || '').trim();
    const expl = (b.querySelector('.q-expl').value || '').trim();

    const rawOpts = [...b.querySelectorAll('.opt-text')].map((x) => (x.value || '').trim());
    const radioChecked = b.querySelector(`input[type="radio"][name="correct-${i}"]:checked`);
    const correctIndex = radioChecked ? Number(radioChecked.value) : -1;

    if (!qText) { alert(`Заполни текст вопроса №${i + 1}`); return; }
    if (rawOpts.length < 2 || rawOpts.some((x) => !x)) { alert(`В вопросе №${i + 1} нужно минимум 2 варианта и без пустых строк.`); return; }
    if (correctIndex < 0) { alert(`Отметь правильный вариант в вопросе №${i + 1}`); return; }

    data.push({ q: qText, o: rawOpts, a: correctIndex, e: expl });
  }

  // t = секунд (для timer или total — в зависимости от режима)
  const timeVal = mode === 'timer' ? perQ : mode === 'total' ? totalT : 0;

  if (mode === 'timer' && (!perQ || perQ <= 0)) { alert('Укажи секунд на каждый вопрос.'); return; }
  if (mode === 'total' && (!totalT || totalT <= 0)) { alert('Укажи секунд на всю викторину.'); return; }

  const quizObj = { v: 3, title, m: mode, t: timeVal, d: data };

  const encoded = LZString.compressToEncodedURIComponent(JSON.stringify(quizObj));
  const link = `${window.location.origin}${window.location.pathname}#quiz=${encoded}`;

  saveMyQuiz({
    encoded,
    title: title || `Викторина (${data.length} вопр.)`,
    createdAt: Date.now()
  });

  setActiveScreen('link-screen');
  document.getElementById('share-link').value = link;
}

function copyLink() {
  const el = document.getElementById('share-link');
  el.select();
  el.setSelectionRange(0, el.value.length);
  const ok = document.execCommand('copy');
  if (ok) confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
}

// -------------------------
// MY QUIZZES
// -------------------------
function showMyQuizzes() {
  setActiveScreen('myquizzes-screen');
  renderMyQuizzes();
}

function loadMyQuizzes() {
  try {
    const raw = localStorage.getItem(MY_QUIZZES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveMyQuiz(item) {
  const arr = loadMyQuizzes();
  const exists = arr.some((x) => x.encoded === item.encoded);
  if (!exists) {
    arr.unshift(item);
    localStorage.setItem(MY_QUIZZES_KEY, JSON.stringify(arr));
  }
}

function deleteMyQuiz(encoded) {
  const arr = loadMyQuizzes().filter((x) => x.encoded !== encoded);
  localStorage.setItem(MY_QUIZZES_KEY, JSON.stringify(arr));
  try { localStorage.removeItem(COMPLETED_PREFIX + encoded); } catch {}
  renderMyQuizzes();
}

function myQuizLink(encoded) {
  return `${window.location.origin}${window.location.pathname}#quiz=${encoded}`;
}

function copyMyQuizLink(encoded) {
  const link = myQuizLink(encoded);
  const ta = document.createElement('textarea');
  ta.value = link;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
}

function playMyQuiz(encoded) {
  window.location.hash = `quiz=${encoded}`;
  loadQuizFromURL(encoded, { allowRepeat: true, showPreview: true });
}

function renderMyQuizzes() {
  const host = document.getElementById('myquizzes-list');
  const arr = loadMyQuizzes();

  if (!arr.length) {
    host.innerHTML = `<div class="info-box">Тут пока пусто. Создай викторину — и она появится здесь.</div>`;
    return;
  }

  host.innerHTML = arr.map((q) => {
    const dt = new Date(q.createdAt || Date.now()).toLocaleString();
    const title = escapeHtml(q.title || 'Викторина');
    return `
      <div class="quiz-item">
        <div class="title">${title}</div>
        <div class="meta">Создано: ${escapeHtml(dt)}</div>
        <div class="actions">
          <button class="btn primary" onclick="playMyQuiz('${q.encoded}')">Пройти</button>
          <button class="btn secondary" onclick="copyMyQuizLink('${q.encoded}')">Ссылка</button>
          <button class="btn secondary" onclick="deleteMyQuiz('${q.encoded}')">Удалить</button>
        </div>
      </div>
    `;
  }).join('');
}

// -------------------------
// QUIZ LOADING + PREVIEW
// -------------------------
function loadQuizFromURL(encoded, opts = { allowRepeat: false, showPreview: true }) {
  let json;
  allowRepeat = !!opts.allowRepeat;

  try {
    const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
    if (!decompressed) throw new Error('decompress failed');
    json = JSON.parse(decompressed);
  } catch {
    alert('Ошибка ссылки/данных викторины.');
    goHomeClearHash();
    return;
  }

  currentQuiz = json;
  quizEncoded = encoded;

  // если чужая викторина — проверяем блок повтора
  if (!allowRepeat) {
    const saved = readCompleted(quizEncoded);
    if (saved) {
      showSavedResult(saved);
      return;
    }
  }

  // показываем интро вместо автозапуска
  if (opts.showPreview) {
    showPreviewScreen();
    return;
  }

  startQuizRun();
}

function showPreviewScreen() {
  const t = (currentQuiz?.title || '').trim() || 'Викторина';
  const count = currentQuiz?.d?.length || 0;

  const titleEl = document.getElementById('preview-title');
  const cEl = document.getElementById('preview-count');
  const mEl = document.getElementById('preview-mode');
  const timePill = document.getElementById('preview-time-pill');
  const timeEl = document.getElementById('preview-time');

  if (titleEl) titleEl.textContent = t;
  if (cEl) cEl.textContent = String(count);

  const mode = currentQuiz?.m || 'classic';
  const modeLabel =
    mode === 'classic' ? 'Классика' :
    mode === 'timer'   ? 'Таймер на вопрос' :
    mode === 'total'   ? 'Время на всю викторину' :
    mode === 'speed'   ? 'Скорость' :
    '—';

  if (mEl) mEl.textContent = modeLabel;

  const sec = Number(currentQuiz?.t || 0);
  if (mode === 'timer' && sec > 0) {
    timePill?.classList.remove('hidden');
    if (timeEl) timeEl.textContent = `${sec} сек/вопрос`;
  } else if (mode === 'total' && sec > 0) {
    timePill?.classList.remove('hidden');
    if (timeEl) timeEl.textContent = `${sec} сек всего`;
  } else {
    timePill?.classList.add('hidden');
  }

  setActiveScreen('preview-screen');
}

function startQuizFromPreview() {
  startQuizRun();
}

function startQuizRun() {
  answersLog = [];
  currentQIndex = 0;
  score = 0;
  startTime = Date.now();
  questionLocked = false;

  totalTimer.active = false;
  totalTimer.timeoutFired = false;

  setActiveScreen('game-screen');

  // режим total — стартуем общий таймер сразу
  if (currentQuiz?.m === 'total') {
    startTotalTimer(Number(currentQuiz.t || 0));
  }

  showQuestion();
}

// -------------------------
// GAME
// -------------------------
function showQuestion() {
  // таймер на вопрос перезапускаем каждый вопрос (кроме режима total)
  if (currentQuiz?.m !== 'total') stopTimer();

  questionLocked = false;

  const postBox = document.getElementById('post-answer-box');
  const explArea = document.getElementById('explanation-area');
  const btnExpl = document.getElementById('btn-show-expl');
  if (postBox) postBox.classList.add('hidden');
  if (explArea) explArea.classList.add('hidden');
  if (btnExpl) btnExpl.classList.add('hidden');

  if (!currentQuiz || currentQIndex >= currentQuiz.d.length) return finishGame();

  const q = currentQuiz.d[currentQIndex];
  const qText = document.getElementById('question-text');
  if (qText) qText.innerText = q.q;

  const container = document.getElementById('options-container');
  if (!container) return;

  container.innerHTML = '';

  q.o.forEach((opt, idx) => {
    const b = document.createElement('button');
    b.className = 'btn option-btn';
    b.innerText = opt;
    b.onclick = () => onAnswerClick(idx);
    container.appendChild(b);
  });

  // timer per question
  if (currentQuiz.m === 'timer') startTimer(Number(currentQuiz.t || 0));

  // total: таймер должен быть видим всегда (не пропадать)
  if (currentQuiz.m === 'total') {
    ensureTimerVisibleForTotal();
  }
}

function onAnswerClick(selectedIndex) {
  if (questionLocked) return;
  const q = currentQuiz.d[currentQIndex];
  resolveQuestion({
    selectedIndex,
    correctIndex: q.a,
    options: q.o,
    explanation: q.e || '',
    reason: 'answered',
  });
}

function onTimeoutPerQuestion() {
  if (questionLocked) return;
  const q = currentQuiz.d[currentQIndex];
  resolveQuestion({
    selectedIndex: null,
    correctIndex: q.a,
    options: q.o,
    explanation: q.e || '',
    reason: 'timeout',
  });
}

// режим total: по истечению времени — завершаем и помечаем остальные как "не успел"
function onTotalTimeout() {
  if (totalTimer.timeoutFired) return;
  totalTimer.timeoutFired = true;

  // помечаем текущий и остальные вопросы как не успел, если ещё не отвечены
  const total = currentQuiz?.d?.length || 0;

  // текущий вопрос, если он не был залочен и не отвечен
  if (!questionLocked && currentQIndex < total) {
    answersLog.push({
      index: currentQIndex,
      question: currentQuiz.d[currentQIndex].q,
      selected: null,
      correct: currentQuiz.d[currentQIndex].o[currentQuiz.d[currentQIndex].a],
      status: 'skip',
    });
  }

  for (let i = currentQIndex + 1; i < total; i++) {
    answersLog.push({
      index: i,
      question: currentQuiz.d[i].q,
      selected: null,
      correct: currentQuiz.d[i].o[currentQuiz.d[i].a],
      status: 'skip',
    });
  }

  stopTotalTimer();
  finishGame(true);
}

function resolveQuestion({ selectedIndex, correctIndex, options, explanation, reason }) {
  questionLocked = true;

  // per-question timer stop only (в total не трогаем общий таймер)
  if (currentQuiz?.m !== 'total') stopTimer();

  const btns = [...document.querySelectorAll('.option-btn')];
  btns.forEach((b) => (b.disabled = true));

  const correctText = options[correctIndex];
  const selectedText = selectedIndex === null ? null : options[selectedIndex];
  const isCorrect = selectedIndex !== null && selectedIndex === correctIndex;

  if (isCorrect) score++;

  // яркая подсветка
  if (reason === 'answered') {
    btns.forEach((b, idx) => {
      if (idx === correctIndex) b.classList.add('correct');
      if (selectedIndex !== null && idx === selectedIndex && selectedIndex !== correctIndex) b.classList.add('wrong');
    });

    if (isCorrect) confetti({ particleCount: 40, spread: 50 });
  }

  answersLog.push({
    index: currentQIndex,
    question: currentQuiz.d[currentQIndex].q,
    selected: selectedText,
    correct: correctText,
    status: reason === 'timeout' ? 'skip' : isCorrect ? 'ok' : 'bad',
  });

  const summaryEl = document.getElementById('post-summary');
  if (summaryEl) {
    if (reason === 'timeout') {
      summaryEl.innerText = `⏰ Время вышло.`;
    } else if (isCorrect) {
      summaryEl.innerText = `✅ Верно!`;
    } else {
      summaryEl.innerText = `❌ Неверно. Правильный ответ: ${correctText}`;
    }
  }

  const btnShow = document.getElementById('btn-show-expl');
  const expText = (explanation || '').trim();

  if (reason !== 'timeout' && expText.length > 0) {
    if (btnShow) btnShow.classList.remove('hidden');
    const expEl = document.getElementById('explanation-text');
    if (expEl) expEl.innerText = expText;
  } else {
    if (btnShow) btnShow.classList.add('hidden');
  }

  const postBox = document.getElementById('post-answer-box');
  if (postBox) postBox.classList.remove('hidden');

  // В режиме total — авто переход после ответа (без “Далее”)
  if (currentQuiz?.m === 'total') {
    // кнопку “Далее” можно спрятать стилем/логикой, но оставим на всякий случай
    setTimeout(() => {
      if (!totalTimer.timeoutFired) nextQuestion();
    }, 450);
  }
}

function toggleExplanation(show) {
  const area = document.getElementById('explanation-area');
  const btn = document.getElementById('btn-show-expl');
  if (show) {
    if (area) area.classList.remove('hidden');
    if (btn) btn.classList.add('hidden');
  }
}

function nextQuestion() {
  currentQIndex++;
  showQuestion();
}

// -------------------------
// TIMER (per-question)
// -------------------------
function startTimer(sec) {
  const disp = document.getElementById('timer-display');
  const digits = document.getElementById('time-left');
  const fill = document.getElementById('timer-bar-fill');
  const top = disp?.querySelector('.timer-top');

  if (!sec || sec <= 0) {
    if (disp) disp.classList.add('hidden');
    return;
  }

  if (disp) disp.classList.remove('hidden');
  if (fill) {
    fill.style.width = '100%';
    fill.classList.remove('danger', 'blink');
  }
  if (top) top.classList.remove('danger');

  const startedAt = Date.now();
  const durationMs = sec * 1000;

  const update = () => {
    const now = Date.now();
    const elapsed = now - startedAt;
    const leftMs = Math.max(0, durationMs - elapsed);
    const leftSec = Math.ceil(leftMs / 1000);

    if (digits) digits.innerText = String(leftSec);

    const pct = Math.max(0, (leftMs / durationMs) * 100);
    if (fill) fill.style.width = `${pct}%`;

    if (pct <= 20 || leftSec <= 3) {
      fill?.classList.add('danger');
      top?.classList.add('danger');
    }
    if (leftSec <= 3) fill?.classList.add('blink');

    if (leftMs <= 0) {
      stopTimer();
      onTimeoutPerQuestion();
    }
  };

  update();
  timerTickInterval = setInterval(update, 50);
}

function stopTimer() {
  const disp = document.getElementById('timer-display');
  if (disp) disp.classList.add('hidden');

  if (timerTickInterval) {
    clearInterval(timerTickInterval);
    timerTickInterval = null;
  }
}

// -------------------------
// TIMER (total quiz)
// -------------------------
function startTotalTimer(sec) {
  const disp = document.getElementById('timer-display');
  const digits = document.getElementById('time-left');
  const fill = document.getElementById('timer-bar-fill');
  const top = disp?.querySelector('.timer-top');

  if (!sec || sec <= 0) return;

  totalTimer.active = true;
  totalTimer.startedAt = Date.now();
  totalTimer.durationMs = sec * 1000;
  totalTimer.timeoutFired = false;

  if (disp) disp.classList.remove('hidden');
  if (fill) {
    fill.style.width = '100%';
    fill.classList.remove('danger', 'blink');
  }
  if (top) top.classList.remove('danger');

  const update = () => {
    if (!totalTimer.active) return;

    const now = Date.now();
    const elapsed = now - totalTimer.startedAt;
    const leftMs = Math.max(0, totalTimer.durationMs - elapsed);
    const leftSec = Math.ceil(leftMs / 1000);

    if (digits) digits.innerText = String(leftSec);

    const pct = Math.max(0, (leftMs / totalTimer.durationMs) * 100);
    if (fill) fill.style.width = `${pct}%`;

    if (pct <= 20 || leftSec <= 3) {
      fill?.classList.add('danger');
      top?.classList.add('danger');
    }
    if (leftSec <= 3) fill?.classList.add('blink');

    if (leftMs <= 0) {
      onTotalTimeout();
    }
  };

  // переиспользуем timerTickInterval
  if (timerTickInterval) clearInterval(timerTickInterval);
  timerTickInterval = setInterval(update, 50);
  update();
}

function ensureTimerVisibleForTotal() {
  const disp = document.getElementById('timer-display');
  if (!disp) return;
  disp.classList.remove('hidden');
}

function stopTotalTimer() {
  totalTimer.active = false;
  if (timerTickInterval) {
    clearInterval(timerTickInterval);
    timerTickInterval = null;
  }
  const disp = document.getElementById('timer-display');
  if (disp) disp.classList.add('hidden');
}

// -------------------------
// FINISH + SAVED RESULTS
// -------------------------
function finishGame(force = false) {
  // останавливаем оба
  if (currentQuiz?.m === 'total') stopTotalTimer();
  else stopTimer();

  setActiveScreen('result-screen');

  const totalQuestions = currentQuiz?.d?.length || 0;
  const scoreEl = document.getElementById('score-val');
  if (scoreEl) scoreEl.innerText = String(score);

  const sr = document.getElementById('speed-result');
  if (sr) {
    if (currentQuiz?.m === 'speed') {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      sr.innerText = `Время: ${totalTime} сек.`;
      sr.classList.remove('hidden');
    } else {
      sr.classList.add('hidden');
    }
  }

  // если total и игра закончилась без таймаута — всё ок.
  // если таймаут — answersLog уже дополнен “skip”.
  if (!allowRepeat) {
    const payload = {
      quizEncoded,
      mode: currentQuiz?.m,
      finishedAt: Date.now(),
      score,
      totalQuestions,
      answersLog: (answersLog || []).slice().sort((a,b)=>a.index-b.index),
      timeTakenSec: Number(((Date.now() - startTime) / 1000).toFixed(1)),
    };
    writeCompleted(quizEncoded, payload);
  }

  renderAnswerReview((answersLog || []).slice().sort((a,b)=>a.index-b.index));
  document.getElementById('answer-review')?.classList.remove('hidden');

  confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 } });
}

function showSavedResult(saved) {
  setActiveScreen('result-screen');
  document.getElementById('already-completed')?.classList.remove('hidden');

  document.getElementById('score-val').innerText = String(saved.score ?? 0);

  const sr = document.getElementById('speed-result');
  if (sr) {
    if (saved.mode === 'speed' && saved.timeTakenSec != null) {
      sr.innerText = `Время: ${saved.timeTakenSec} сек.`;
      sr.classList.remove('hidden');
    } else {
      sr.classList.add('hidden');
    }
  }

  renderAnswerReview(saved.answersLog || []);
  document.getElementById('answer-review')?.classList.remove('hidden');
}

function renderAnswerReview(items) {
  const tbody = document.getElementById('review-body');
  if (!tbody) return;

  tbody.innerHTML = (items || [])
    .map((it, i) => {
      const your = it.selected === null ? '— (не успел)' : escapeHtml(String(it.selected));
      const corr = escapeHtml(String(it.correct ?? ''));
      const q = escapeHtml(String(it.question ?? ''));
      const statusLabel = it.status === 'ok' ? 'Верно' : it.status === 'bad' ? 'Неверно' : 'Не успел';
      const statusClass = it.status === 'ok' ? 'status-ok' : it.status === 'bad' ? 'status-bad' : 'status-skip';

      return `
        <tr>
          <td>${i + 1}</td>
          <td>${q}</td>
          <td>${your}</td>
          <td>${corr}</td>
          <td class="${statusClass}">${statusLabel}</td>
        </tr>
      `;
    })
    .join('');
}

// -------------------------
// COMPLETED STORAGE
// -------------------------
function readCompleted(id) {
  try {
    const raw = localStorage.getItem(COMPLETED_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCompleted(id, payload) {
  try {
    localStorage.setItem(COMPLETED_PREFIX + id, JSON.stringify(payload));
  } catch {}
}

// -------------------------
// UTIL
// -------------------------
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
