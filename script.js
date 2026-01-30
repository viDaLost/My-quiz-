// -------------------------
// STORAGE KEYS
// -------------------------
const COMPLETED_PREFIX = 'quiz_master_completed:';  // блок повтора для чужих викторин
const MY_QUIZZES_KEY = 'quiz_master_my_quizzes';    // "мои викторины"

// -------------------------
// STATE
// -------------------------
let currentQuiz = null;
let pendingQuiz = null;        // квиз из ссылки до нажатия "Пройти"
let quizEncoded = '';
let currentQIndex = 0;
let score = 0;
let startTime = 0;

let timerTickInterval = null;  // общий интервал обновления таймера (любой режим)
let totalDeadline = 0;         // дедлайн для total-режима (timestamp)
let questionLocked = false;

let answersLog = [];
let allowRepeat = false;

// -------------------------
// BOOT
// -------------------------
window.onload = () => {
  wireModeSelect();

  const hash = window.location.hash;
  if (hash.includes('quiz=')) {
    const encoded = hash.split('quiz=')[1];
    // по ссылке показываем превью, а игру запускаем только по кнопке
    loadQuizFromURL(encoded, { allowRepeat: false, showIntro: true });
  } else {
    setActiveScreen('home-screen');
    applyHomeCentering();
  }
};

// -------------------------
// UI SCREEN HELPERS
// -------------------------
function setActiveScreen(id) {
  const ids = ['home-screen', 'myquizzes-screen', 'creator-screen', 'link-screen', 'intro-screen', 'game-screen', 'result-screen']
    .filter((x) => document.getElementById(x));

  ids.forEach((x) => document.getElementById(x).classList.toggle('hidden', x !== id));

  // центрируем HOME, когда он активен
  if (id === 'home-screen') applyHomeCentering();
  else removeHomeCentering();
}

function applyHomeCentering() {
  const home = document.getElementById('home-screen');
  if (!home) return;

  home.classList.add('home-center');

  // оборачиваем 2 кнопки в контейнер, чтобы красиво центрировать
  let actions = home.querySelector('.home-actions');
  const buttons = [...home.querySelectorAll('button.btn')];

  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'home-actions';

    // оставляем brand сверху, а кнопки переносим в actions
    buttons.forEach((b) => actions.appendChild(b));
    home.appendChild(actions);
  }
}

function removeHomeCentering() {
  const home = document.getElementById('home-screen');
  if (!home) return;
  home.classList.remove('home-center');
}

function goHome() {
  setActiveScreen('home-screen');
}

function goHomeClearHash() {
  try { history.replaceState(null, '', window.location.pathname); } catch {}
  window.location.hash = '';
  pendingQuiz = null;
  currentQuiz = null;
  setActiveScreen('home-screen');
}

// -------------------------
// CREATOR
// -------------------------
function wireModeSelect() {
  const el = document.getElementById('quiz-mode');
  if (!el) return;

  el.onchange = (e) => {
    const mode = e.target.value;

    // per-question timer
    const timerSetting = document.getElementById('timer-setting');
    if (timerSetting) timerSetting.classList.toggle('hidden', mode !== 'timer');

    // total quiz timer (если есть отдельный блок)
    const totalSetting = document.getElementById('total-setting');
    if (totalSetting) totalSetting.classList.toggle('hidden', mode !== 'total');

    // если отдельного total-setting нет, можно переиспользовать timer-setting
    // (но лучше иметь отдельный блок в HTML)
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
        <label>Варианты (выбери правильный слева):</label>
        <div class="options-wrap" data-options></div>
        <button type="button" class="btn secondary" style="margin-top:10px; padding:12px; font-size:0.95rem; border-radius:14px;"
          onclick="addOption('${blockId}')">+ Добавить вариант (до 5)</button>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Пояснение (покажется по кнопке в игре):</label>
        <textarea class="q-expl" placeholder="Например: потому что ..."></textarea>
      </div>
    </div>
  `;

  container.appendChild(details);

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

    // уникальная радио-группа на вопрос
    const radios = b.querySelectorAll('input[type="radio"]');
    radios.forEach((r) => (r.name = `correct-${idx}`));

    normalizeOptions(b);
  });
}

function addOption(blockId) {
  const block = document.querySelector(`.qdetails[data-blockid="${blockId}"]`);
  if (!block) return;

  const wrap = block.querySelector('[data-options]');
  const rows = wrap.querySelectorAll('.option-row');
  if (rows.length >= 5) return;

  const row = document.createElement('div');
  row.className = 'option-row';
  row.dataset.optid = `opt-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const qIndex = Number(block.dataset.qindex || 0);
  const optIndex = rows.length;

  row.innerHTML = `
    <input type="radio" name="correct-${qIndex}" value="${optIndex}" aria-label="Правильный вариант" />
    <input type="text" class="opt-text" placeholder="Вариант ответа ${optIndex + 1}" oninput="updateMini('${blockId}')"/>
    <button type="button" class="opt-del" aria-label="Удалить вариант" onclick="removeOption('${blockId}', '${row.dataset.optid}')">✕</button>
  `;

  wrap.appendChild(row);
  normalizeOptions(block);
  updateMini(blockId);
}

function removeOption(blockId, optId) {
  const block = document.querySelector(`.qdetails[data-blockid="${blockId}"]`);
  if (!block) return;

  const wrap = block.querySelector('[data-options]');
  const row = wrap.querySelector(`.option-row[data-optid="${optId}"]`);
  if (!row) return;

  // не даём удалить, если останется < 2 вариантов
  const rows = [...wrap.querySelectorAll('.option-row')];
  if (rows.length <= 2) return;

  // запомним текущий выбранный correct
  const qIndex = Number(block.dataset.qindex || 0);
  const checked = block.querySelector(`input[type="radio"][name="correct-${qIndex}"]:checked`);
  const checkedVal = checked ? Number(checked.value) : -1;

  // индекс удаляемой строки
  const rowIndex = rows.indexOf(row);

  row.remove();

  // если выбранный был после удалённого — он смещается на -1
  normalizeOptions(block);

  // восстановим checked при возможности
  const newRows = [...wrap.querySelectorAll('.option-row')];
  let newChecked = checkedVal;

  if (checkedVal === rowIndex) {
    // удалили выбранный правильный — сбросим
    newChecked = -1;
  } else if (checkedVal > rowIndex) {
    newChecked = checkedVal - 1;
  }

  if (newChecked >= 0 && newChecked < newRows.length) {
    const r = block.querySelector(`input[type="radio"][name="correct-${qIndex}"][value="${newChecked}"]`);
    if (r) r.checked = true;
  }

  updateMini(blockId);
}

function normalizeOptions(block) {
  const qIndex = Number(block.dataset.qindex || 0);
  const rows = [...block.querySelectorAll('.option-row')];

  rows.forEach((row, idx) => {
    const r = row.querySelector('input[type="radio"]');
    const t = row.querySelector('.opt-text');
    const del = row.querySelector('.opt-del');

    if (r) {
      r.name = `correct-${qIndex}`;
      r.value = String(idx);
    }
    if (t) t.placeholder = `Вариант ответа ${idx + 1}`;

    // блокируем удаление, если всего 2 варианта
    if (del) del.disabled = rows.length <= 2;
  });
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
  if (!blocks.length) { chipsHost.innerHTML = ''; return; }

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

  // per-question timer
  const perLimit = Number(document.getElementById('time-limit')?.value || 0);

  // total timer (если есть отдельный инпут)
  const totalLimit = Number(document.getElementById('total-time-limit')?.value || 0);

  const title = (document.getElementById('quiz-title').value || '').trim();

  const blocks = [...document.querySelectorAll('.qdetails')];
  if (blocks.length === 0) { alert('Добавь хотя бы один вопрос.'); return; }

  const data = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const qText = (b.querySelector('.q-text').value || '').trim();
    const expl = (b.querySelector('.q-expl').value || '').trim();

    const rawOpts = [...b.querySelectorAll('.opt-text')].map((x) => (x.value || '').trim());
    const radioChecked = b.querySelector(`input[type="radio"][name="correct-${i}"]:checked`);
    const correctIndex = radioChecked ? Number(radioChecked.value) : -1;

    if (!qText) { alert(`Заполни текст вопроса №${i + 1}`); return; }
    if (rawOpts.length < 2 || rawOpts.some((x) => !x)) {
      alert(`В вопросе №${i + 1} нужно минимум 2 варианта и без пустых строк.`);
      return;
    }
    if (correctIndex < 0) { alert(`Выбери правильный вариант в вопросе №${i + 1}`); return; }

    data.push({ q: qText, o: rawOpts, a: correctIndex, e: expl });
  }

  let t = 0;
  if (mode === 'timer') t = perLimit;
  if (mode === 'total') t = totalLimit;

  if ((mode === 'timer' || mode === 'total') && (!t || t <= 0)) {
    alert('Укажи время (в секундах).');
    return;
  }

  const quizObj = { v: 3, title, m: mode, t, d: data };

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
  loadQuizFromURL(encoded, { allowRepeat: true, showIntro: true });
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
function loadQuizFromURL(encoded, opts = { allowRepeat: false, showIntro: false }) {
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

  quizEncoded = encoded;

  // повтор блокируем только для чужих (allowRepeat=false)
  if (!allowRepeat) {
    const saved = readCompleted(quizEncoded);
    if (saved) {
      showSavedResult(saved);
      return;
    }
  }

  // показываем превью
  pendingQuiz = json;
  currentQuiz = null;

  if (opts.showIntro) {
    fillIntro(pendingQuiz);
    setActiveScreen('intro-screen');
  } else {
    // fallback: сразу старт
    startQuizInternal(pendingQuiz);
  }
}

function fillIntro(quiz) {
  const title = (quiz?.title || 'Викторина').trim();
  const qCount = quiz?.d?.length || 0;

  const tTitle = document.getElementById('intro-title');
  const tQ = document.getElementById('intro-questions');
  const tM = document.getElementById('intro-mode');

  if (tTitle) tTitle.innerText = title || 'Викторина';
  if (tQ) tQ.innerText = `${qCount} вопрос(ов)`;

  const modeName = modeLabel(quiz?.m, quiz?.t);
  if (tM) tM.innerText = modeName;
}

function modeLabel(mode, t) {
  if (mode === 'classic') return 'Режим: классика';
  if (mode === 'timer') return `Режим: таймер на вопрос (${Number(t || 0)} сек)`;
  if (mode === 'total') return `Режим: время на всю викторину (${Number(t || 0)} сек)`;
  return 'Режим: неизвестный';
}

function startFromIntro() {
  if (!pendingQuiz) {
    goHomeClearHash();
    return;
  }
  startQuizInternal(pendingQuiz);
}

function startQuizInternal(quiz) {
  currentQuiz = quiz;
  pendingQuiz = null;

  answersLog = [];
  currentQIndex = 0;
  score = 0;
  startTime = Date.now();

  setActiveScreen('game-screen');

  // запуск таймера в зависимости от режима
  if (currentQuiz.m === 'total') {
    startTotalTimer(Number(currentQuiz.t || 0));
  } else {
    stopTimer(); // пер-вопрос будет в showQuestion
  }

  showQuestion();
}

// -------------------------
// GAME
// -------------------------
function showQuestion() {
  // пер-вопрос таймер только для timer режима
  if (currentQuiz?.m === 'timer') stopTimer();

  questionLocked = false;

  // UI: в total режиме не показываем пост-блок (переход автоматом)
  document.getElementById('post-answer-box')?.classList.add('hidden');
  document.getElementById('explanation-area')?.classList.add('hidden');
  document.getElementById('btn-show-expl')?.classList.add('hidden');

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

  if (currentQuiz.m === 'timer') startTimerPerQuestion(Number(currentQuiz.t || 0));
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

  // в timer режиме таймер на вопрос останавливаем
  if (currentQuiz.m === 'timer') stopTimer();
  // в total режиме НЕ останавливаем таймер

  const btns = [...document.querySelectorAll('.option-btn')];
  btns.forEach((b) => (b.disabled = true));

  const correctText = options[correctIndex];
  const selectedText = selectedIndex === null ? null : options[selectedIndex];
  const isCorrect = selectedIndex !== null && selectedIndex === correctIndex;

  if (isCorrect) score++;

  // подсветка (и для total тоже, просто быстро переключим вопрос)
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

  // TOTAL режим: авто-переход без пост-экрана
  if (currentQuiz.m === 'total') {
    // если это последний вопрос — завершаем сразу
    const isLast = currentQIndex >= currentQuiz.d.length - 1;
    const delay = 420; // короткая пауза, чтобы увидеть подсветку

    if (isLast) {
      setTimeout(() => finishGame(), delay);
    } else {
      setTimeout(() => {
        currentQIndex++;
        showQuestion();
      }, delay);
    }
    return;
  }

  // Обычные режимы: показываем summary и кнопку Далее
  const summaryEl = document.getElementById('post-summary');
  if (summaryEl) {
    if (reason === 'timeout') summaryEl.innerText = `⏰ Время вышло.`;
    else if (isCorrect) summaryEl.innerText = `✅ Верно!`;
    else summaryEl.innerText = `❌ Неверно. Правильный ответ: ${correctText}`;
  }

  const btnShow = document.getElementById('btn-show-expl');
  const expText = (explanation || '').trim();
  if (btnShow) {
    if (reason !== 'timeout' && expText.length > 0) {
      btnShow.classList.remove('hidden');
      document.getElementById('explanation-text').innerText = expText;
    } else {
      btnShow.classList.add('hidden');
    }
  }

  document.getElementById('post-answer-box')?.classList.remove('hidden');
}

function toggleExplanation(show) {
  const area = document.getElementById('explanation-area');
  const btn = document.getElementById('btn-show-expl');
  if (!area || !btn) return;

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
// TIMER (per-question + total)
// -------------------------
function startTimerPerQuestion(sec) {
  startTimerCommon(sec, {
    mode: 'per',
    onEnd: () => onTimeoutPerQuestion(),
  });
}

function startTotalTimer(sec) {
  if (!sec || sec <= 0) {
    // если вдруг 0 — просто без таймера
    stopTimer();
    return;
  }

  totalDeadline = Date.now() + sec * 1000;

  // запускаем общий таймер, который при 0 переводит на финиш
  startTimerCommon(sec, {
    mode: 'total',
    onEnd: () => onTotalTimeout(),
  });
}

function onTotalTimeout() {
  // отмечаем все оставшиеся как "не успел"
  if (!currentQuiz || !currentQuiz.d) return finishGame();

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

  // не увеличиваем score, просто финиш
  finishGame();
}

function startTimerCommon(sec, { mode, onEnd }) {
  const disp = document.getElementById('timer-display');
  const digits = document.getElementById('time-left');
  const fill = document.getElementById('timer-bar-fill');
  const top = disp ? disp.querySelector('.timer-top') : null;

  if (!disp || !digits || !fill || !sec || sec <= 0) {
    stopTimer();
    return;
  }

  disp.classList.remove('hidden');
  fill.style.width = '100%';
  fill.classList.remove('danger', 'blink');
  if (top) top.classList.remove('danger');

  // для per-question: старт сейчас
  // для total: секунда "sec" — это общий лимит, но дедлайн уже выставлен
  const startedAt = Date.now();
  const durationMs = sec * 1000;

  const update = () => {
    const now = Date.now();

    let leftMs;
    let totalMs;

    if (mode === 'total') {
      totalMs = durationMs;
      leftMs = Math.max(0, totalDeadline - now);
    } else {
      totalMs = durationMs;
      const elapsed = now - startedAt;
      leftMs = Math.max(0, durationMs - elapsed);
    }

    const leftSec = Math.ceil(leftMs / 1000);
    digits.innerText = String(leftSec);

    const pct = totalMs > 0 ? Math.max(0, (leftMs / totalMs) * 100) : 0;
    fill.style.width = `${pct}%`;

    if (pct <= 20 || leftSec <= 3) {
      fill.classList.add('danger');
      if (top) top.classList.add('danger');
    }
    if (leftSec <= 3) fill.classList.add('blink');

    if (leftMs <= 0) {
      stopTimer();
      if (typeof onEnd === 'function') onEnd();
    }
  };

  update();
  if (timerTickInterval) clearInterval(timerTickInterval);
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
// FINISH + SAVED RESULTS
// -------------------------
function finishGame() {
  stopTimer();
  setActiveScreen('result-screen');

  const totalQuestions = currentQuiz?.d?.length || pendingQuiz?.d?.length || 0;
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
  document.getElementById('answer-review')?.classList.remove('hidden');

  confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 } });
}

function showSavedResult(saved) {
  setActiveScreen('result-screen');
  document.getElementById('already-completed')?.classList.remove('hidden');

  document.getElementById('score-val').innerText = String(saved.score ?? 0);

  const sr = document.getElementById('speed-result');
  if (sr) sr.classList.add('hidden');

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
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
