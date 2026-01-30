// -------------------------
// STORAGE KEYS
// -------------------------
const COMPLETED_PREFIX = 'quiz_master_completed:';  // блок повтора для чужих викторин
const MY_QUIZZES_KEY = 'quiz_master_my_quizzes';    // "мои викторины"

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

// total timer state
let totalTimerStartedAt = 0;
let totalDurationMs = 0;

// -------------------------
// BOOT
// -------------------------
window.onload = () => {
  wireModeSelect();

  const hash = window.location.hash;
  if (hash.includes('quiz=')) {
    const encoded = hash.split('quiz=')[1];
    loadQuizFromURL(encoded, { allowRepeat: false });
  } else {
    setActiveScreen('home-screen');
  }
};

// -------------------------
// UI SCREEN HELPERS
// -------------------------
function setActiveScreen(id) {
  const ids = [
    'home-screen',
    'myquizzes-screen',
    'creator-screen',
    'link-screen',
    'intro-screen',
    'game-screen',
    'result-screen'
  ];
  ids.forEach((x) => document.getElementById(x).classList.toggle('hidden', x !== id));
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
  const per = document.getElementById('timer-setting');
  const tot = document.getElementById('total-setting');

  const apply = (mode) => {
    per.classList.toggle('hidden', mode !== 'timer');
    tot.classList.toggle('hidden', mode !== 'total');
  };

  apply(el.value);

  el.onchange = (e) => {
    apply(e.target.value);
  };
}

function showCreator() {
  setActiveScreen('creator-screen');
  const container = document.getElementById('questions-container');
  if (container.children.length === 0) addQuestionField();
  buildQuestionNav();
}

function addQuestionField() {
  // сворачиваем все текущие вопросы (чтобы не превращалось в простыню)
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
        <button type="button" class="btn secondary"
          style="margin-top:10px; padding:12px; font-size:0.95rem; border-radius:14px;"
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
    <input type="radio" name="correct-${qIndex}" value="${optIndex}" aria-label="Правильный вариант" />
    <input type="text" class="opt-text" placeholder="Вариант ответа ${optIndex + 1}" oninput="updateMini('${blockId}')"/>
    <button type="button" class="opt-del" aria-label="Удалить вариант" title="Удалить вариант"
      onclick="removeOption(this, '${blockId}'); event.stopPropagation();">✕</button>
  `;
  wrap.appendChild(row);

  updateMini(blockId);
}

function removeOption(btnEl, blockId) {
  const block = document.querySelector(`.qdetails[data-blockid="${blockId}"]`);
  if (!block) return;

  const wrap = block.querySelector('[data-options]');
  const rows = [...wrap.querySelectorAll('.option-row')];

  if (rows.length <= 2) {
    alert('Должно быть минимум 2 варианта.');
    return;
  }

  const row = btnEl.closest('.option-row');
  if (!row) return;

  // если удаляем выбранный правильный — сбросим выбор
  const radio = row.querySelector('input[type="radio"]');
  const wasChecked = radio && radio.checked;

  row.remove();

  // переиндексация value + placeholder
  const qIndex = Number(block.dataset.qindex || 0);
  const newRows = [...wrap.querySelectorAll('.option-row')];
  newRows.forEach((r, idx) => {
    const rr = r.querySelector('input[type="radio"]');
    const tt = r.querySelector('.opt-text');
    if (rr) {
      rr.name = `correct-${qIndex}`;
      rr.value = String(idx);
      if (wasChecked) rr.checked = false;
    }
    if (tt) tt.placeholder = `Вариант ответа ${idx + 1}`;
  });

  updateMini(blockId);
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
    const label = `Вопрос ${idx + 1}`;
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
  const timeLimit = Number(document.getElementById('time-limit').value || 0);
  const totalTimeLimit = Number(document.getElementById('total-time-limit').value || 0);
  const title = (document.getElementById('quiz-title').value || '').trim();

  const blocks = [...document.querySelectorAll('.qdetails')];
  if (blocks.length === 0) {
    alert('Добавь хотя бы один вопрос.');
    return;
  }

  if (mode === 'timer' && (!timeLimit || timeLimit <= 0)) {
    alert('Укажи секунды на ответ (на каждый вопрос).');
    return;
  }

  if (mode === 'total' && (!totalTimeLimit || totalTimeLimit <= 0)) {
    alert('Укажи секунды на всю викторину.');
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

  // v:3 — добавили total time
  const quizObj = {
    v: 3,
    title,
    m: mode,
    t: mode === 'timer' ? timeLimit : 0,
    tt: mode === 'total' ? totalTimeLimit : 0,
    d: data
  };

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
  loadQuizFromURL(encoded, { allowRepeat: true });
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
// QUIZ LOADING + INTRO
// -------------------------
function loadQuizFromURL(encoded, opts = { allowRepeat: false }) {
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

  currentQuiz = normalizeQuiz(json);
  quizEncoded = encoded;

  if (!allowRepeat) {
    const saved = readCompleted(quizEncoded);
    if (saved) {
      showSavedResult(saved);
      return;
    }
  }

  // показываем превью-экран (а не стартуем сразу)
  showIntro();
}

function normalizeQuiz(q) {
  // поддержка старых ссылок:
  // v2 speed -> total (если кто-то уже создал по старой логике)
  // если m === 'speed' и есть t => переедем на total tt=t
  if (!q || typeof q !== 'object') return q;
  const out = { ...q };

  if (out.m === 'speed') {
    out.m = 'total';
    out.tt = Number(out.t || 0);
    out.t = 0;
  }
  out.t = Number(out.t || 0);
  out.tt = Number(out.tt || 0);
  if (!Array.isArray(out.d)) out.d = [];
  return out;
}

function modeLabel(m) {
  if (m === 'classic') return 'Классика';
  if (m === 'timer') return 'Таймер на каждый вопрос';
  if (m === 'total') return 'Общее время на всю викторину';
  return '—';
}

function showIntro() {
  setActiveScreen('intro-screen');

  const title = (currentQuiz?.title || '').trim() || 'Викторина';
  const count = currentQuiz?.d?.length || 0;
  const m = currentQuiz?.m;

  document.getElementById('intro-title').innerText = title;
  document.getElementById('intro-count').innerText = `${count} ${pluralRu(count, 'вопрос', 'вопроса', 'вопросов')}`;
  document.getElementById('intro-mode').innerText = `Режим: ${modeLabel(m)}`;

  const hint = document.getElementById('intro-hint');
  if (m === 'timer') {
    hint.innerText = `На каждый вопрос: ${Number(currentQuiz.t || 0)} сек.`;
  } else if (m === 'total') {
    hint.innerText = `На всю викторину: ${Number(currentQuiz.tt || 0)} сек.`;
  } else {
    hint.innerText = `Без таймера.`;
  }
}

function pluralRu(n, one, two, five) {
  n = Math.abs(Number(n)) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return five;
  if (n1 > 1 && n1 < 5) return two;
  if (n1 === 1) return one;
  return five;
}

function startQuiz() {
  answersLog = [];
  currentQIndex = 0;
  score = 0;
  startTime = Date.now();

  totalTimerStartedAt = 0;
  totalDurationMs = 0;

  setActiveScreen('game-screen');
  document.getElementById('already-completed').classList.add('hidden');

  // если общий таймер — запускаем один раз на весь квиз
  if (currentQuiz?.m === 'total') {
    const sec = Number(currentQuiz.tt || 0);
    startTotalTimer(sec);
  } else {
    // на classic/timer — подпись уберём
    setTimerCaption('');
  }

  showQuestion();
}

// -------------------------
// GAME
// -------------------------
function showQuestion() {
  // per-question timer только в режиме timer
  stopPerQuestionTimer();
  questionLocked = false;

  document.getElementById('post-answer-box').classList.add('hidden');
  document.getElementById('explanation-area').classList.add('hidden');
  document.getElementById('btn-show-expl').classList.add('hidden');

  if (!currentQuiz || currentQIndex >= currentQuiz.d.length) return finishGame();

  const q = currentQuiz.d[currentQIndex];
  document.getElementById('question-text').innerText = q.q;

  const container = document.getElementById('options-container');
  container.innerHTML = '';

  q.o.forEach((opt, idx) => {
    const b = document.createElement('button');
    b.className = 'btn option-btn';
    b.innerText = opt;
    b.onclick = () => onAnswerClick(idx);
    container.appendChild(b);
  });

  // режим "таймер на каждый вопрос"
  if (currentQuiz.m === 'timer') {
    startPerQuestionTimer(Number(currentQuiz.t || 0));
    setTimerCaption('на вопрос');
  }

  // режим "общее время" — таймер уже идёт, тут просто обновим UI сразу
  if (currentQuiz.m === 'total') {
    setTimerCaption('на всю викторину');
    // важно: не перезапускать интервал — он уже запущен
    // просто принудительно обновим надпись (если экран сменился/перерисовка)
    // (интервал делает update сам)
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

function resolveQuestion({ selectedIndex, correctIndex, options, explanation, reason }) {
  questionLocked = true;

  // в режиме timer — стопаем таймер вопроса, но НЕ общий таймер
  stopPerQuestionTimer();

  const btns = [...document.querySelectorAll('.option-btn')];
  btns.forEach((b) => (b.disabled = true));

  const correctText = options[correctIndex];
  const selectedText = selectedIndex === null ? null : options[selectedIndex];
  const isCorrect = selectedIndex !== null && selectedIndex === correctIndex;

  if (isCorrect) score++;

  // подсветка только если пользователь ответил
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
  if (reason === 'timeout') {
    summaryEl.innerText = `⏰ Время вышло.`;
  } else if (isCorrect) {
    summaryEl.innerText = `✅ Верно!`;
  } else {
    summaryEl.innerText = `❌ Неверно. Правильный ответ: ${correctText}`;
  }

  const btnShow = document.getElementById('btn-show-expl');
  const expText = (explanation || '').trim();
  if (reason !== 'timeout' && expText.length > 0) {
    btnShow.classList.remove('hidden');
    document.getElementById('explanation-text').innerText = expText;
  } else {
    btnShow.classList.add('hidden');
  }

  document.getElementById('post-answer-box').classList.remove('hidden');
}

function toggleExplanation(show) {
  const area = document.getElementById('explanation-area');
  const btn = document.getElementById('btn-show-expl');
  if (show) {
    area.classList.remove('hidden');
    btn.classList.add('hidden');
  }
}

function nextQuestion() {
  currentQIndex++;
  showQuestion();
}

// -------------------------
// TIMER UI HELPERS
// -------------------------
function setTimerCaption(txt) {
  const el = document.getElementById('timer-caption');
  if (!el) return;
  el.innerText = txt ? `Таймер: ${txt}` : '';
}

// -------------------------
// PER-QUESTION TIMER
// -------------------------
function startPerQuestionTimer(sec) {
  const disp = document.getElementById('timer-display');
  const digits = document.getElementById('time-left');
  const fill = document.getElementById('timer-bar-fill');
  const top = disp.querySelector('.timer-top');

  if (!sec || sec <= 0) {
    disp.classList.add('hidden');
    return;
  }

  disp.classList.remove('hidden');
  fill.style.width = '100%';
  fill.classList.remove('danger', 'blink');
  top.classList.remove('danger');

  const startedAt = Date.now();
  const durationMs = sec * 1000;

  const update = () => {
    const now = Date.now();
    const elapsed = now - startedAt;
    const leftMs = Math.max(0, durationMs - elapsed);
    const leftSec = Math.ceil(leftMs / 1000);

    digits.innerText = String(leftSec);

    const pct = Math.max(0, (leftMs / durationMs) * 100);
    fill.style.width = `${pct}%`;

    if (pct <= 20 || leftSec <= 3) {
      fill.classList.add('danger');
      top.classList.add('danger');
    }
    if (leftSec <= 3) fill.classList.add('blink');

    if (leftMs <= 0) {
      stopPerQuestionTimer();
      onTimeoutPerQuestion();
    }
  };

  update();
  timerTickInterval = setInterval(update, 50);
}

function stopPerQuestionTimer() {
  if (timerTickInterval) {
    clearInterval(timerTickInterval);
    timerTickInterval = null;
  }
  // важно: дисплей не прячем тут безусловно, потому что он нужен для total-таймера
  if (currentQuiz?.m !== 'total') {
    const disp = document.getElementById('timer-display');
    if (disp) disp.classList.add('hidden');
  }
}

// -------------------------
// TOTAL QUIZ TIMER
// -------------------------
function startTotalTimer(sec) {
  const disp = document.getElementById('timer-display');
  const digits = document.getElementById('time-left');
  const fill = document.getElementById('timer-bar-fill');
  const top = disp.querySelector('.timer-top');

  if (!sec || sec <= 0) {
    disp.classList.add('hidden');
    return;
  }

  disp.classList.remove('hidden');
  fill.style.width = '100%';
  fill.classList.remove('danger', 'blink');
  top.classList.remove('danger');

  totalTimerStartedAt = Date.now();
  totalDurationMs = sec * 1000;

  const update = () => {
    const now = Date.now();
    const elapsed = now - totalTimerStartedAt;
    const leftMs = Math.max(0, totalDurationMs - elapsed);
    const leftSec = Math.ceil(leftMs / 1000);

    digits.innerText = String(leftSec);

    const pct = totalDurationMs > 0 ? Math.max(0, (leftMs / totalDurationMs) * 100) : 0;
    fill.style.width = `${pct}%`;

    if (pct <= 20 || leftSec <= 3) {
      fill.classList.add('danger');
      top.classList.add('danger');
    }
    if (leftSec <= 3) fill.classList.add('blink');

    if (leftMs <= 0) {
      stopTotalTimer();
      finishGameDueToTotalTimeout();
    }
  };

  update();
  // отдельный интервал для total, чтобы не конфликтовать с per-question
  // (храним его тоже в timerTickInterval, потому что per-question в total не запускается)
  timerTickInterval = setInterval(update, 50);
}

function stopTotalTimer() {
  const disp = document.getElementById('timer-display');
  if (disp) disp.classList.add('hidden');

  if (timerTickInterval) {
    clearInterval(timerTickInterval);
    timerTickInterval = null;
  }
}

function finishGameDueToTotalTimeout() {
  // помечаем оставшиеся вопросы как "не успел"
  if (currentQuiz?.d?.length) {
    for (let i = currentQIndex; i < currentQuiz.d.length; i++) {
      const q = currentQuiz.d[i];
      const correctText = q.o?.[q.a];
      answersLog.push({
        index: i,
        question: q.q,
        selected: null,
        correct: correctText,
        status: 'skip'
      });
    }
  }
  // чтобы игра не считала что мы на вопросе
  currentQIndex = currentQuiz?.d?.length || currentQIndex;
  finishGame(true);
}

// -------------------------
// FINISH + SAVED RESULTS
// -------------------------
function finishGame(isTimeoutTotal = false) {
  // стопаем таймеры
  if (currentQuiz?.m === 'total') stopTotalTimer();
  else stopPerQuestionTimer();

  setActiveScreen('result-screen');

  const totalQuestions = currentQuiz?.d?.length || 0;
  document.getElementById('score-val').innerText = String(score);

  const sr = document.getElementById('speed-result');
  // теперь "speed" нет — но покажем время для total (и вообще можно показывать всегда)
  const totalTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(1));
  if (currentQuiz?.m === 'total') {
    sr.innerText = isTimeoutTotal
      ? `⏰ Время вышло. Прошло: ${totalTimeSec} сек.`
      : `Время: ${totalTimeSec} сек.`;
    sr.classList.remove('hidden');
  } else {
    sr.classList.add('hidden');
  }

  if (!allowRepeat) {
    const payload = {
      quizEncoded,
      mode: currentQuiz.m,
      finishedAt: Date.now(),
      score,
      totalQuestions,
      answersLog,
      timeTakenSec: totalTimeSec,
    };
    writeCompleted(quizEncoded, payload);
  }

  renderAnswerReview(answersLog);
  document.getElementById('answer-review').classList.remove('hidden');

  confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 } });
}

function showSavedResult(saved) {
  setActiveScreen('result-screen');
  document.getElementById('already-completed').classList.remove('hidden');

  document.getElementById('score-val').innerText = String(saved.score ?? 0);

  const sr = document.getElementById('speed-result');
  if (saved.mode === 'total' && saved.timeTakenSec != null) {
    sr.innerText = `Время: ${saved.timeTakenSec} сек.`;
    sr.classList.remove('hidden');
  } else {
    sr.classList.add('hidden');
  }

  renderAnswerReview(saved.answersLog || []);
  document.getElementById('answer-review').classList.remove('hidden');
}

function renderAnswerReview(items) {
  const tbody = document.getElementById('review-body');
  tbody.innerHTML = (items || [])
    .map((it, i) => {
      const your = it.selected === null ? '— (не успел)' : escapeHtml(String(it.selected));
      const corr = escapeHtml(String(it.correct ?? ''));
      const q = escapeHtml(String(it.question ?? ''));
      const statusLabel = it.status === 'ok' ? 'Верно' : it.status === 'bad' ? 'Неверно' : 'Не засчитан';
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
