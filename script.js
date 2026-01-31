// script.js — обновлённый целиком

// -------------------------
// STORAGE KEYS
// -------------------------
const COMPLETED_PREFIX = 'quiz_master_completed:';  // блок повтора для чужих викторин
const MY_QUIZZES_KEY = 'quiz_master_my_quizzes';    // "мои викторины"
const THEME_KEY = 'quiz_master_theme';              // "dark" | "light"

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

// Total timer state
let totalTimerActive = false;
let totalStartedAt = 0;
let totalDurationMs = 0;

// -------------------------
// BOOT
// -------------------------
window.addEventListener('load', () => {
  // убрать/не использовать старый фон с вопросиками (на всякий)
  try {
    const host = document.getElementById('bg-questions');
    if (host) {
      host.innerHTML = '';
      host.style.display = 'none';
    }
  } catch {}

  wireModeSelect();
  wireThemeToggle();

  // если в URL есть викторина — показываем интро, НЕ стартуем игру сразу
  const hash = window.location.hash || '';
  if (hash.includes('quiz=')) {
    const encoded = hash.split('quiz=')[1];
    loadQuizFromURL(encoded, { allowRepeat: false, showPreview: true });
  } else {
    setActiveScreen('home-screen');
  }
});

// -------------------------
// THEME
// -------------------------
function wireThemeToggle() {
  const btn = document.getElementById('theme-toggle');

  // применяем сохранённую тему
  const saved = (localStorage.getItem(THEME_KEY) || 'dark').toLowerCase();
  setTheme(saved === 'light' ? 'light' : 'dark');

  if (!btn) return;

  btn.addEventListener('click', () => {
    const isLight = document.body.classList.contains('theme-light');
    setTheme(isLight ? 'dark' : 'light');
  });
}

function setTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('theme-light', isLight);
  localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');

  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = isLight ? '🌙 Тема' : '☀️ Тема';
}

// -------------------------
// UI SCREEN HELPERS
// -------------------------
function setActiveScreen(id) {
  const ids = [
    'home-screen',
    'preview-screen',
    'myquizzes-screen',
    'creator-screen',
    'link-screen',
    'game-screen',
    'result-screen'
  ];

  ids.forEach((x) => {
    const el = document.getElementById(x);
    if (!el) return;
    el.classList.toggle('hidden', x !== id);
  });

  // классы для фона/центровки
  document.body.classList.toggle('home', id === 'home-screen');
}

function goHome() {
  setActiveScreen('home-screen');
}

function goHomeClearHash() {
  try { history.replaceState(null, '', window.location.pathname); } catch {}
  window.location.hash = '';
  currentQuiz = null;
  quizEncoded = '';
  stopTimer(true);
  totalTimerActive = false;
  setActiveScreen('home-screen');
}

// -------------------------
// CREATOR
// -------------------------
function wireModeSelect() {
  const el = document.getElementById('quiz-mode');
  if (!el) return;

  const perQ = document.getElementById('timer-setting');
  const total = document.getElementById('total-timer-setting');

  const apply = () => {
    const v = el.value;
    if (perQ) perQ.classList.toggle('hidden', v !== 'timer');
    if (total) total.classList.toggle('hidden', v !== 'total');
  };

  el.addEventListener('change', apply);
  apply();
}

function showCreator() {
  setActiveScreen('creator-screen');
  const container = document.getElementById('questions-container');
  if (container && container.children.length === 0) addQuestionField();
  buildQuestionNav();
}

// -------------------------
// (ВАЖНО) ВАШИ ФУНКЦИИ addQuestionField / removeQuestion / renumberQuestions / addOption / updateMini
// здесь остаются как у вас, включая крестики удаления вариантов.
// Я НЕ менял их в этом файле, чтобы не сломать текущую разметку/кнопки.
// -------------------------

// -------------------------
// LINK GENERATION
// -------------------------
function generateLink() {
  const mode = document.getElementById('quiz-mode').value;

  const timeLimit = Number(document.getElementById('time-limit')?.value || 0);
  const totalTimeLimit = Number(document.getElementById('total-time-limit')?.value || 0);

  const title = (document.getElementById('quiz-title').value || '').trim();

  const blocks = [...document.querySelectorAll('.qdetails')];
  if (blocks.length === 0) {
    alert('Добавь хотя бы один вопрос.');
    return;
  }

  const data = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const qText = (b.querySelector('.q-text')?.value || '').trim();
    const expl = (b.querySelector('.q-expl')?.value || '').trim();

    const rawOpts = [...b.querySelectorAll('.opt-text')].map((x) => (x.value || '').trim());
    const radioChecked = b.querySelector(`input[type="radio"][name="correct-${i}"]:checked`);
    const correctIndex = radioChecked ? Number(radioChecked.value) : -1;

    if (!qText) { alert(`Заполни текст вопроса №${i + 1}`); return; }
    if (rawOpts.length < 2 || rawOpts.some((x) => !x)) {
      alert(`В вопросе №${i + 1} нужно минимум 2 варианта и без пустых строк.`);
      return;
    }
    if (correctIndex < 0) { alert(`Отметь правильный вариант в вопросе №${i + 1}`); return; }

    data.push({ q: qText, o: rawOpts, a: correctIndex, e: expl });
  }

  // ВАЖНО:
  // t  = секунд на вопрос (timer)
  // tt = секунд на всю викторину (total)
  const quizObj = {
    v: 3,
    title,
    m: mode,
    t: timeLimit,
    tt: totalTimeLimit,
    d: data
  };

  if (mode === 'timer' && (!timeLimit || timeLimit <= 0)) {
    alert('Укажи секунды на ответ для режима "Таймер на каждый вопрос".');
    return;
  }
  if (mode === 'total' && (!totalTimeLimit || totalTimeLimit <= 0)) {
    alert('Укажи секунды на всю викторину для режима "Время на всю викторину".');
    return;
  }

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

  if (!host) return;

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

  // если нельзя повторять — проверяем сохранённый результат
  if (!allowRepeat) {
    const saved = readCompleted(quizEncoded);
    if (saved) {
      showSavedResult(saved);
      return;
    }
  }

  // ПРЕВЬЮ (интро)
  if (opts.showPreview) {
    showPreviewScreen();
    return;
  }

  // если вдруг вызывают без превью
  startGame();
}

function showPreviewScreen() {
  const title = (currentQuiz?.title || 'Викторина').trim() || 'Викторина';
  const count = currentQuiz?.d?.length || 0;

  const titleEl = document.getElementById('preview-title');
  const countEl = document.getElementById('preview-count');
  const modeEl = document.getElementById('preview-mode');

  if (titleEl) titleEl.innerText = title;
  if (countEl) countEl.innerText = `${count} ${pluralRu(count, 'вопрос', 'вопроса', 'вопросов')}`;
  if (modeEl) modeEl.innerText = `Режим: ${modeLabel(currentQuiz)}`;

  setActiveScreen('preview-screen');

  // привязываем кнопку старта
  const btn = document.getElementById('btn-start-quiz');
  if (btn) {
    btn.onclick = () => startGame();
  }
}

function modeLabel(qz) {
  const m = qz?.m;
  if (m === 'classic') return 'классика';
  if (m === 'timer') return `таймер на вопрос (${Number(qz?.t || 0)} сек)`;
  if (m === 'speed') return 'на скорость';
  if (m === 'total') return `время на всю викторину (${Number(qz?.tt || 0)} сек)`;
  return '—';
}

// -------------------------
// GAME START
// -------------------------
function startGame() {
  if (!currentQuiz || !Array.isArray(currentQuiz.d)) {
    alert('Ошибка данных викторины.');
    goHomeClearHash();
    return;
  }

  answersLog = [];
  currentQIndex = 0;
  score = 0;
  startTime = Date.now();
  questionLocked = false;

  // total timer reset
  totalTimerActive = false;
  totalStartedAt = 0;
  totalDurationMs = 0;

  setActiveScreen('game-screen');

  // включаем total timer сразу (и он НЕ должен пропадать)
  if (currentQuiz.m === 'total') {
    const totalSec = Number(currentQuiz.tt || 0);
    startTotalTimer(totalSec);
  }

  showQuestion();
}

// -------------------------
// GAME FLOW
// -------------------------
function showQuestion() {
  // ВАЖНО: если total-режим — НЕ гасим таймер между вопросами
  if (currentQuiz?.m !== 'total') stopTimer(false);

  questionLocked = false;

  const post = document.getElementById('post-answer-box');
  const explArea = document.getElementById('explanation-area');
  const btnExpl = document.getElementById('btn-show-expl');

  post?.classList.add('hidden');
  explArea?.classList.add('hidden');
  btnExpl?.classList.add('hidden');

  if (!currentQuiz || currentQIndex >= currentQuiz.d.length) {
    return finishGame();
  }

  const q = currentQuiz.d[currentQIndex];

  const qTextEl = document.getElementById('question-text');
  if (qTextEl) qTextEl.innerText = q.q;

  // “красивее выделить вопрос” — добавим класс для анимации (стили будут в style.css)
  const card = document.getElementById('question-card');
  if (card) {
    card.classList.remove('question-pop');
    // рефлоу, чтобы анимация сработала снова
    void card.offsetWidth;
    card.classList.add('question-pop');
  }

  const container = document.getElementById('options-container');
  if (container) container.innerHTML = '';

  q.o.forEach((opt, idx) => {
    const b = document.createElement('button');
    b.className = 'btn option-btn';
    b.innerText = opt;
    b.onclick = () => onAnswerClick(idx);
    container?.appendChild(b);
  });

  // таймер на каждый вопрос
  if (currentQuiz.m === 'timer') {
    const sec = Number(currentQuiz.t || 0);
    startPerQuestionTimer(sec);
  }

  // speed/classic/total — таймер на вопрос не нужен
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

  // пер-вопросный таймер стопаем, total — НЕ трогаем
  if (currentQuiz.m === 'timer') stopTimer(false);

  const btns = [...document.querySelectorAll('.option-btn')];
  btns.forEach((b) => (b.disabled = true));

  const correctText = options[correctIndex];
  const selectedText = selectedIndex === null ? null : options[selectedIndex];
  const isCorrect = selectedIndex !== null && selectedIndex === correctIndex;

  if (isCorrect) score++;

  // подсветка ответа (стили яркие будут в style.css)
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

  // В TOTAL-режиме: вопросы должны переключаться автоматически, таймер не останавливается
  if (currentQuiz.m === 'total') {
    // маленькая пауза, чтобы человек увидел подсветку
    setTimeout(() => {
      currentQIndex++;
      showQuestion();
    }, 350);
    return;
  }

  // обычное поведение (с блоком после ответа)
  const summaryEl = document.getElementById('post-summary');
  if (reason === 'timeout') {
    if (summaryEl) summaryEl.innerText = `⏰ Время вышло.`;
  } else if (isCorrect) {
    if (summaryEl) summaryEl.innerText = `✅ Верно!`;
  } else {
    if (summaryEl) summaryEl.innerText = `❌ Неверно. Правильный ответ: ${correctText}`;
  }

  const btnShow = document.getElementById('btn-show-expl');
  const expText = (explanation || '').trim();
  if (reason !== 'timeout' && expText.length > 0) {
    btnShow?.classList.remove('hidden');
    const expEl = document.getElementById('explanation-text');
    if (expEl) expEl.innerText = expText;
  } else {
    btnShow?.classList.add('hidden');
  }

  document.getElementById('post-answer-box')?.classList.remove('hidden');
}

function toggleExplanation(show) {
  const area = document.getElementById('explanation-area');
  const btn = document.getElementById('btn-show-expl');
  if (show) {
    area?.classList.remove('hidden');
    btn?.classList.add('hidden');
  }
}

function nextQuestion() {
  currentQIndex++;
  showQuestion();
}

// -------------------------
// TIMER (универсальный)
// -------------------------
function startPerQuestionTimer(sec) {
  if (!sec || sec <= 0) {
    stopTimer(false);
    return;
  }
  startTimerCommon({ seconds: sec, mode: 'per-question' });
}

function startTotalTimer(sec) {
  if (!sec || sec <= 0) return;

  totalTimerActive = true;
  totalStartedAt = Date.now();
  totalDurationMs = sec * 1000;

  // запускаем общий таймер-дисплей в режиме total
  startTimerCommon({ seconds: sec, mode: 'total', startedAt: totalStartedAt, durationMs: totalDurationMs });
}

function startTimerCommon({ seconds, mode, startedAt, durationMs }) {
  const disp = document.getElementById('timer-display');
  const digits = document.getElementById('time-left');
  const fill = document.getElementById('timer-bar-fill');
  const top = disp?.querySelector('.timer-top');

  if (!disp || !digits || !fill || !top) return;

  disp.classList.remove('hidden');
  fill.style.width = '100%';
  fill.classList.remove('danger', 'blink');
  top.classList.remove('danger');

  const _startedAt = startedAt ?? Date.now();
  const _durationMs = durationMs ?? (seconds * 1000);

  const update = () => {
    const now = Date.now();
    const elapsed = now - _startedAt;
    const leftMs = Math.max(0, _durationMs - elapsed);
    const leftSec = Math.ceil(leftMs / 1000);

    digits.innerText = String(leftSec);

    const pct = Math.max(0, (leftMs / _durationMs) * 100);
    fill.style.width = `${pct}%`;

    if (pct <= 25 || leftSec <= 4) {
      fill.classList.add('danger');
      top.classList.add('danger');
    }
    if (leftSec <= 4) fill.classList.add('blink');

    if (leftMs <= 0) {
      // TIMEOUT
      if (mode === 'per-question') {
        stopTimer(false);
        onTimeoutPerQuestion();
        return;
      }

      if (mode === 'total') {
        stopTimer(true);
        onTimeoutTotal();
        return;
      }
    }
  };

  // перезапуск интервала
  if (timerTickInterval) clearInterval(timerTickInterval);
  update();
  timerTickInterval = setInterval(update, 50);
}

function stopTimer(forceHide) {
  const disp = document.getElementById('timer-display');

  // если forceHide=true — скрываем всегда
  // если forceHide=false — скрываем только НЕ total
  if (disp) {
    if (forceHide) disp.classList.add('hidden');
    else {
      if (currentQuiz?.m !== 'total') disp.classList.add('hidden');
    }
  }

  if (timerTickInterval) {
    clearInterval(timerTickInterval);
    timerTickInterval = null;
  }
}

// total timeout: финиш + все неотвеченные = "не успел"
function onTimeoutTotal() {
  if (!currentQuiz) return;

  // если уже всё отвечено — просто финиш
  if (currentQIndex >= currentQuiz.d.length) {
    finishGame();
    return;
  }

  // добавляем все оставшиеся вопросы как skip
  for (let i = currentQIndex; i < currentQuiz.d.length; i++) {
    const q = currentQuiz.d[i];
    answersLog.push({
      index: i,
      question: q.q,
      selected: null,
      correct: q.o[q.a],
      status: 'skip',
    });
  }

  currentQIndex = currentQuiz.d.length;
  finishGame();
}

// -------------------------
// FINISH + SAVED RESULTS
// -------------------------
function finishGame() {
  // total таймер останавливаем
  totalTimerActive = false;
  stopTimer(true);

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

  if (!allowRepeat) {
    const payload = {
      quizEncoded,
      mode: currentQuiz?.m,
      finishedAt: Date.now(),
      score,
      totalQuestions,
      answersLog,
      timeTakenSec: Number(((Date.now() - startTime) / 1000).toFixed(1)),
    };
    writeCompleted(quizEncoded, payload);
  }

  renderAnswerReview(answersLog);
  document.getElementById('answer-review')?.classList.remove('hidden');

  confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 } });
}

function showSavedResult(saved) {
  setActiveScreen('result-screen');
  document.getElementById('already-completed')?.classList.remove('hidden');

  const scoreEl = document.getElementById('score-val');
  if (scoreEl) scoreEl.innerText = String(saved.score ?? 0);

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
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function pluralRu(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
