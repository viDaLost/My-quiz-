// script.js — обновлённый целиком

// -------------------------
// STORAGE KEYS
// -------------------------
const COMPLETED_PREFIX = 'quiz_master_completed:';  // блок повтора для чужих викторин
const MY_QUIZZES_KEY   = 'quiz_master_my_quizzes';  // "мои викторины"
const THEME_KEY        = 'quiz_master_theme';       // light/dark

// -------------------------
// STATE
// -------------------------
let currentQuiz = null;
let quizEncoded = '';
let currentQIndex = 0;
let score = 0;
let startTime = 0;

let timerTickInterval = null;   // для timer (на вопрос)
let totalTickInterval = null;   // для total (на всю викторину)
let totalStartedAt = 0;
let totalDurationMs = 0;

let questionLocked = false;
let answersLog = [];
let allowRepeat = false;

let pendingStartEncoded = '';   // для превью-экрана по ссылке

// -------------------------
// BOOT
// -------------------------
window.onload = () => {
  applySavedTheme();
  wireModeSelect();

  // ❌ больше не делаем падающие вопросы: initBgQuestions() не вызываем

  const hash = window.location.hash || '';
  if (hash.includes('quiz=')) {
    const encoded = hash.split('quiz=')[1];
    // сначала грузим и показываем превью, не стартуем сразу
    loadQuizFromURL(encoded, { allowRepeat: false, openPreview: true });
  } else {
    setActiveScreen('home-screen');
  }
};

// -------------------------
// THEME
// -------------------------
function applySavedTheme() {
  const theme = (localStorage.getItem(THEME_KEY) || 'dark').toLowerCase();
  document.documentElement.dataset.theme = (theme === 'light') ? 'light' : 'dark';
}

function toggleTheme() {
  const cur = (document.documentElement.dataset.theme || 'dark');
  const next = (cur === 'light') ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
}

// -------------------------
// UI SCREEN HELPERS
// -------------------------
function setActiveScreen(id) {
  // добавили preview-screen
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
    if (!el) return;
    el.classList.toggle('hidden', x !== id);
  });

  // классы под дизайн (в CSS сделаем без "жидкого стекла")
  document.body.classList.toggle('home', id === 'home-screen');
}

function goHome() {
  stopTimer();
  stopTotalTimer();
  setActiveScreen('home-screen');
}

function goHomeClearHash() {
  stopTimer();
  stopTotalTimer();
  try { history.replaceState(null, '', window.location.pathname); } catch {}
  window.location.hash = '';
  setActiveScreen('home-screen');
}

// -------------------------
// CREATOR: MODE SELECT
// -------------------------
function wireModeSelect() {
  const el = document.getElementById('quiz-mode');
  if (!el) return;

  el.onchange = (e) => {
    const v = e.target.value;
    // timer-setting — сек на вопрос
    const timerBox = document.getElementById('timer-setting');
    // total-setting — сек на всю викторину (добавим в HTML позже, но код готов)
    const totalBox = document.getElementById('total-setting');

    if (timerBox) timerBox.classList.toggle('hidden', v !== 'timer');
    if (totalBox) totalBox.classList.toggle('hidden', v !== 'total');
  };
}

function showCreator() {
  setActiveScreen('creator-screen');
  const container = document.getElementById('questions-container');
  if (container && container.children.length === 0) addQuestionField();
  buildQuestionNav();
}

// -------------------------
// CREATOR: QUESTIONS UI
// -------------------------
function addQuestionField() {
  // сворачиваем все текущие вопросы
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
        <button type="button" class="btn secondary" style="margin-top:10px;"
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

    // переиндексация value у радио по порядку строк
    const rows = [...b.querySelectorAll('.option-row')];
    rows.forEach((row, optIdx) => {
      const radio = row.querySelector('input[type="radio"]');
      if (radio) radio.value = String(optIdx);
      const inp = row.querySelector('input.opt-text');
      if (inp) inp.placeholder = `Вариант ответа ${optIdx + 1}`;
    });
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
  const rowId = `opt-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const row = document.createElement('div');
  row.className = 'option-row';
  row.dataset.rowid = rowId;

  // ✕ крестик удалить вариант
  row.innerHTML = `
    <label class="pick-correct" title="Сделать правильным">
      <input type="radio" name="correct-${qIndex}" value="${optIndex}" aria-label="Правильный вариант" />
      <span class="pick-ui" aria-hidden="true"></span>
    </label>

    <input type="text" class="opt-text" placeholder="Вариант ответа ${optIndex + 1}" oninput="updateMini('${blockId}')"/>

    <button type="button" class="opt-del" title="Удалить вариант"
      onclick="removeOption('${blockId}', '${rowId}'); event.stopPropagation();">✕</button>
  `;

  wrap.appendChild(row);
  renumberQuestions();
  updateMini(blockId);
}

function removeOption(blockId, rowId) {
  const block = document.querySelector(`.qdetails[data-blockid="${blockId}"]`);
  if (!block) return;

  const wrap = block.querySelector('[data-options]');
  const rows = [...wrap.querySelectorAll('.option-row')];

  // минимум 2 варианта
  if (rows.length <= 2) return;

  const row = wrap.querySelector(`.option-row[data-rowid="${rowId}"]`);
  if (!row) return;

  // если удаляем выбранный правильный — после удаления выберем первый
  const wasChecked = !!row.querySelector('input[type="radio"]:checked');

  row.remove();
  renumberQuestions();

  // если правильный слетел — выберем первый
  if (wasChecked) {
    const qIndex = Number(block.dataset.qindex || 0);
    const firstRadio = block.querySelector(`input[type="radio"][name="correct-${qIndex}"]`);
    if (firstRadio) firstRadio.checked = true;
  }

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

// -------------------------
// CREATOR: GENERATE LINK
// -------------------------
function generateLink() {
  const mode = document.getElementById('quiz-mode').value;

  // timer = сек на вопрос (используем time-limit)
  const perQuestionLimit = Number(document.getElementById('time-limit')?.value || 0);

  // total = сек на всю викторину (элемент добавим в HTML, но если нет — тоже ок)
  const totalLimit = Number(document.getElementById('total-limit')?.value || 0);

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

  // m: classic | timer | total
  // t: сек на вопрос (timer)
  // T: сек на всю викторину (total)
  const quizObj = {
    v: 3,
    title,
    m: mode,
    t: perQuestionLimit,
    T: totalLimit,
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
  loadQuizFromURL(encoded, { allowRepeat: true, openPreview: true });
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
function normalizeQuizObject(obj) {
  if (!obj || typeof obj !== 'object') return null;

  // поддержка старых структур
  const title = (obj.title ?? obj.name ?? '').toString();
  const mode = (obj.m ?? obj.mode ?? 'classic').toString();

  // вопросы могут быть в d или questions
  const d = Array.isArray(obj.d) ? obj.d : (Array.isArray(obj.questions) ? obj.questions : []);
  const perQ = Number(obj.t ?? obj.timeLimit ?? 0);
  const total = Number(obj.T ?? obj.totalLimit ?? 0);

  return { v: Number(obj.v ?? 1), title, m: mode, t: perQ, T: total, d };
}

function loadQuizFromURL(encoded, opts = { allowRepeat: false, openPreview: true }) {
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

  const norm = normalizeQuizObject(json);
  if (!norm || !Array.isArray(norm.d)) {
    alert('Ошибка данных викторины.');
    goHomeClearHash();
    return;
  }

  currentQuiz = norm;
  quizEncoded = encoded;

  if (!allowRepeat) {
    const saved = readCompleted(quizEncoded);
    if (saved) {
      showSavedResult(saved);
      return;
    }
  }

  // не стартуем сразу — показываем превью
  if (opts.openPreview) {
    pendingStartEncoded = encoded;
    showPreview(currentQuiz);
    return;
  }

  // если вдруг вызываем без превью
  startGame();
}

function showPreview(qz) {
  // ожидаем, что в HTML есть preview-screen и элементы:
  // preview-title, preview-meta, btn-start-quiz
  const titleEl = document.getElementById('preview-title');
  const metaEl  = document.getElementById('preview-meta');
  const btnStart = document.getElementById('btn-start-quiz');

  if (titleEl) titleEl.textContent = qz.title?.trim() || 'Викторина';

  const count = Array.isArray(qz.d) ? qz.d.length : 0;
  const modeText = formatModeLabel(qz);

  if (metaEl) {
    metaEl.textContent = `${count} вопрос${pluralRu(count, ['','а','ов'])} • ${modeText}`;
  }

  if (btnStart) {
    btnStart.onclick = () => {
      // стартуем именно тот encoded, который в ссылке
      if (pendingStartEncoded) {
        // гарантируем, что currentQuiz уже нормализован
        startGame();
      }
    };
  }

  setActiveScreen('preview-screen');
}

function formatModeLabel(qz) {
  const m = (qz.m || 'classic');
  if (m === 'timer') return `таймер на вопрос (${Number(qz.t || 0)} сек)`;
  if (m === 'total') return `время на всю викторину (${Number(qz.T || 0)} сек)`;
  return 'классика';
}

// -------------------------
// GAME
// -------------------------
function startGame() {
  answersLog = [];
  currentQIndex = 0;
  score = 0;
  startTime = Date.now();

  questionLocked = false;

  stopTimer();
  stopTotalTimer();

  setActiveScreen('game-screen');
  const already = document.getElementById('already-completed');
  if (already) already.classList.add('hidden');

  // старт общего таймера если нужно
  if (currentQuiz?.m === 'total') {
    startTotalTimer(Number(currentQuiz.T || 0));
  }

  showQuestion();
}

function showQuestion() {
  questionLocked = false;

  // ВАЖНО:
  // - для режима timer (на вопрос) останавливаем и перезапускаем
  // - для режима total (на всю викторину) НЕ трогаем общий таймер
  if (currentQuiz?.m === 'timer') stopTimer();

  const post = document.getElementById('post-answer-box');
  const explArea = document.getElementById('explanation-area');
  const btnExpl = document.getElementById('btn-show-expl');
  if (post) post.classList.add('hidden');
  if (explArea) explArea.classList.add('hidden');
  if (btnExpl) btnExpl.classList.add('hidden');

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

  if (currentQuiz.m === 'timer') startTimer(Number(currentQuiz.t || 0));

  // для total — таймер уже идёт, просто убеждаемся что видим панель
  if (currentQuiz.m === 'total') ensureTimerVisible();
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

// timeout только для режима timer (на вопрос)
function onTimeout() {
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

  // per-question timer стопаем, total не трогаем
  if (currentQuiz?.m === 'timer') stopTimer();

  const btns = [...document.querySelectorAll('.option-btn')];
  btns.forEach((b) => (b.disabled = true));

  const correctText = options[correctIndex];
  const selectedText = selectedIndex === null ? null : options[selectedIndex];
  const isCorrect = selectedIndex !== null && selectedIndex === correctIndex;

  if (isCorrect) score++;

  // подсветка (CSS сделаем яркой)
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

  // режим total: вопросы переключаются автоматически
  if (currentQuiz?.m === 'total') {
    // маленькая пауза, чтобы человек увидел реакцию
    setTimeout(() => {
      currentQIndex++;
      showQuestion();
    }, 260);
    return;
  }

  // остальные режимы — показываем блок после ответа
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

  const post = document.getElementById('post-answer-box');
  if (post) post.classList.remove('hidden');
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
// TIMER: PER QUESTION
// -------------------------
function startTimer(sec) {
  const disp = document.getElementById('timer-display');
  const digits = document.getElementById('time-left');
  const fill = document.getElementById('timer-bar-fill');
  const top = disp?.querySelector('.timer-top');

  if (!disp || !digits || !fill) return;

  if (!sec || sec <= 0) {
    disp.classList.add('hidden');
    return;
  }

  disp.classList.remove('hidden');
  fill.style.width = '100%';
  fill.classList.remove('danger', 'blink');
  if (top) top.classList.remove('danger');

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
      if (top) top.classList.add('danger');
    }
    if (leftSec <= 3) fill.classList.add('blink');

    if (leftMs <= 0) {
      stopTimer();
      onTimeout();
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
// TIMER: TOTAL QUIZ
// -------------------------
function ensureTimerVisible() {
  const disp = document.getElementById('timer-display');
  if (disp) disp.classList.remove('hidden');
}

function startTotalTimer(sec) {
  const disp = document.getElementById('timer-display');
  const digits = document.getElementById('time-left');
  const fill = document.getElementById('timer-bar-fill');
  const top = disp?.querySelector('.timer-top');

  if (!disp || !digits || !fill) return;

  stopTotalTimer();

  if (!sec || sec <= 0) {
    disp.classList.add('hidden');
    return;
  }

  disp.classList.remove('hidden');
  fill.style.width = '100%';
  fill.classList.remove('danger', 'blink');
  if (top) top.classList.remove('danger');

  totalStartedAt = Date.now();
  totalDurationMs = sec * 1000;

  const update = () => {
    const now = Date.now();
    const elapsed = now - totalStartedAt;
    const leftMs = Math.max(0, totalDurationMs - elapsed);
    const leftSec = Math.ceil(leftMs / 1000);

    digits.innerText = String(leftSec);

    const pct = Math.max(0, (leftMs / totalDurationMs) * 100);
    fill.style.width = `${pct}%`;

    if (pct <= 20 || leftSec <= 5) {
      fill.classList.add('danger');
      if (top) top.classList.add('danger');
    }
    if (leftSec <= 5) fill.classList.add('blink');

    if (leftMs <= 0) {
      // время на всю викторину вышло
      stopTotalTimer();
      forceFinishDueToTotalTimeout();
    }
  };

  update();
  totalTickInterval = setInterval(update, 50);
}

function stopTotalTimer() {
  if (totalTickInterval) {
    clearInterval(totalTickInterval);
    totalTickInterval = null;
  }
  totalStartedAt = 0;
  totalDurationMs = 0;
}

function forceFinishDueToTotalTimeout() {
  // отмечаем оставшиеся как "не успел"
  if (!currentQuiz?.d?.length) return finishGame();

  for (let i = currentQIndex; i < currentQuiz.d.length; i++) {
    answersLog.push({
      index: i,
      question: currentQuiz.d[i].q,
      selected: null,
      correct: currentQuiz.d[i].o?.[currentQuiz.d[i].a] ?? '',
      status: 'skip',
    });
  }

  // чтобы не зависало в вопросе
  currentQIndex = currentQuiz.d.length;
  finishGame();
}

// -------------------------
// FINISH + SAVED RESULTS
// -------------------------
function finishGame() {
  stopTimer();
  stopTotalTimer();

  setActiveScreen('result-screen');

  const totalQuestions = currentQuiz?.d?.length || 0;
  document.getElementById('score-val').innerText = String(score);

  const sr = document.getElementById('speed-result');
  if (sr) sr.classList.add('hidden'); // speed режима больше нет

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
  const rev = document.getElementById('answer-review');
  if (rev) rev.classList.remove('hidden');

  confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 } });
}

function showSavedResult(saved) {
  stopTimer();
  stopTotalTimer();

  setActiveScreen('result-screen');

  const already = document.getElementById('already-completed');
  if (already) already.classList.remove('hidden');

  document.getElementById('score-val').innerText = String(saved.score ?? 0);

  const sr = document.getElementById('speed-result');
  if (sr) sr.classList.add('hidden');

  renderAnswerReview(saved.answersLog || []);
  const rev = document.getElementById('answer-review');
  if (rev) rev.classList.remove('hidden');
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

// склонение: 1 вопрос, 2 вопроса, 5 вопросов
function pluralRu(n, forms) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}
