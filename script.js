const COMPLETED_PREFIX = 'quiz_master_completed:';  // блок повтора для чужих викторин
const MY_QUIZZES_KEY = 'quiz_master_my_quizzes';

let currentQuiz = null;
let quizEncoded = '';
let currentQIndex = 0;
let score = 0;
let startTime = 0;

let timerTickInterval = null;
let questionLocked = false;

let answersLog = [];
let allowRepeat = false;

// DnD
let dragId = null;
const IS_TOUCH = (() => {
  try {
    return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return ('ontouchstart' in window);
  }
})();

// Touch-sort (Pointer Events)
let touchDrag = {
  active: false,
  el: null,
  placeholder: null,
  startY: 0,
  offsetY: 0,
  pointerId: null,
  host: null,
};

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

function setActiveScreen(id) {
  const ids = ['home-screen', 'myquizzes-screen', 'creator-screen', 'link-screen', 'game-screen', 'result-screen'];
  ids.forEach((x) => document.getElementById(x).classList.toggle('hidden', x !== id));

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

/* =========================
   CREATOR
========================= */

function wireModeSelect() {
  const el = document.getElementById('quiz-mode');
  el.onchange = () => refreshModeFields();

  refreshModeFields();
}

function refreshModeFields() {
  const mode = document.getElementById('quiz-mode').value;
  document.getElementById('timer-setting').classList.toggle('hidden', mode !== 'timer');
  document.getElementById('speed-setting').classList.toggle('hidden', mode !== 'speed');
}

// совместимость с inline onchange="onModeChange()" в HTML
function onModeChange() {
  refreshModeFields();
}

function resetCreatorForm() {
  document.getElementById('quiz-title').value = '';
  document.getElementById('quiz-mode').value = 'classic';
  document.getElementById('time-limit').value = '';
  document.getElementById('total-time-limit').value = '';
  document.getElementById('question-search').value = '';

  const qc = document.getElementById('questions-container');
  qc.innerHTML = '';

  refreshModeFields();
  addQuestionField(); // всегда стартуем с 1 вопроса
  buildQuestionNav();
}

function showCreator() {
  setActiveScreen('creator-screen');
  // ВАЖНО: очищаем прошлое наполнение
  resetCreatorForm();
}

function addQuestionField() {
  // сворачиваем все, чтобы не было “простыни”
  document.querySelectorAll('.qdetails').forEach((d) => (d.open = false));

  const container = document.getElementById('questions-container');
  const qIndex = container.querySelectorAll('.qdetails').length;
  const blockId = `qblock-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const details = document.createElement('details');
  details.className = 'qdetails';
  details.open = true;
  details.dataset.blockid = blockId;
  details.dataset.qindex = String(qIndex);

  // DnD:
  // - desktop: HTML5 drag & drop (мышь)
  // - touch: Pointer Events сортировка по drag-handle
  if (!IS_TOUCH) {
    details.draggable = true;
    details.addEventListener('dragstart', (e) => onDragStart(e, blockId));
    details.addEventListener('dragover', (e) => onDragOver(e, blockId));
    details.addEventListener('dragleave', () => details.classList.remove('drop-target'));
    details.addEventListener('drop', (e) => onDrop(e, blockId));
    details.addEventListener('dragend', () => cleanupDragStyles());
  } else {
    details.draggable = false;
  }

  details.innerHTML = `
    <summary onclick="setActiveChipByOpen();">
      <div class="qsum-left">
        <div class="qsum-title">Вопрос ${qIndex + 1}</div>
        <div class="qsum-mini" id="qmini-${blockId}">Нажми, чтобы свернуть/развернуть</div>
      </div>

      <div style="display:flex; gap:8px; align-items:center;">
        <span class="drag-handle" title="Перетащи вопрос">≡</span>
        <button type="button" class="btn secondary qremove"
          onclick="removeQuestion('${blockId}'); event.stopPropagation();">Удалить</button>
      </div>
    </summary>

    <div style="margin-top: 10px;">
      <div class="field">
        <label>Текст вопроса:</label>
        <input type="text" class="q-text" placeholder="Текст"
          oninput="updateMini('${blockId}')" />
      </div>

      <div class="field" style="margin-top: 6px;">
        <label>Варианты (отметь правильный слева):</label>
        <div class="options-wrap" data-options></div>
        <button type="button" class="btn secondary" style="margin-top:10px; padding:12px; font-size:0.95rem; border-radius:14px;"
          onclick="addOption('${blockId}')">+ Добавить вариант (до 5)</button>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Пояснение (покажется только по кнопке в игре):</label>
        <textarea class="q-expl" placeholder="Например: потому что ..."></textarea>
      </div>
    </div>
  `;

  container.appendChild(details);

  // Touch DnD hook
  if (IS_TOUCH) {
    const handle = details.querySelector('.drag-handle');
    if (handle) wireTouchSortHandle(handle, details);
  }

  addOption(blockId);
  addOption(blockId);

  renumberQuestions();
  buildQuestionNav();
  applyQuestionSearch();

  details.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function wireTouchSortHandle(handleEl, detailsEl) {
  // важное: иначе Safari скроллит вместо перетаскивания
  handleEl.style.touchAction = 'none';
  handleEl.addEventListener('pointerdown', (e) => {
    // только основной палец/кнопка
    if (e.button !== undefined && e.button !== 0) return;
    if (touchDrag.active) return;

    const host = document.getElementById('questions-container');
    if (!host) return;

    touchDrag.active = true;
    touchDrag.el = detailsEl;
    touchDrag.host = host;
    touchDrag.pointerId = e.pointerId;

    const rect = detailsEl.getBoundingClientRect();
    touchDrag.startY = e.clientY;
    touchDrag.offsetY = e.clientY - rect.top;

    // placeholder
    const ph = document.createElement('div');
    ph.className = 'qplaceholder';
    ph.style.height = rect.height + 'px';
    touchDrag.placeholder = ph;
    detailsEl.parentNode.insertBefore(ph, detailsEl.nextSibling);

    // фиксируем элемент поверх
    detailsEl.classList.add('touch-dragging');
    detailsEl.style.width = rect.width + 'px';
    detailsEl.style.left = rect.left + 'px';
    detailsEl.style.top = rect.top + 'px';
    detailsEl.style.position = 'fixed';
    detailsEl.style.zIndex = 9999;

    try { handleEl.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  });

  handleEl.addEventListener('pointermove', (e) => {
    if (!touchDrag.active || e.pointerId !== touchDrag.pointerId) return;
    const el = touchDrag.el;
    const ph = touchDrag.placeholder;
    const host = touchDrag.host;
    if (!el || !ph || !host) return;

    const y = e.clientY - touchDrag.offsetY;
    el.style.top = y + 'px';

    // авто-скролл внутри контейнера
    const hostRect = host.getBoundingClientRect();
    const edge = 64;
    if (e.clientY < hostRect.top + edge) host.scrollTop -= 10;
    if (e.clientY > hostRect.bottom - edge) host.scrollTop += 10;

    // найти ближайший блок под пальцем
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const over = under ? under.closest('.qdetails') : null;
    if (!over || over === el) return;

    const overRect = over.getBoundingClientRect();
    const before = e.clientY < (overRect.top + overRect.height / 2);
    host.insertBefore(ph, before ? over : over.nextSibling);
  });

  const end = (e) => {
    if (!touchDrag.active || e.pointerId !== touchDrag.pointerId) return;
    const el = touchDrag.el;
    const ph = touchDrag.placeholder;
    const host = touchDrag.host;
    if (el && ph && host) {
      // вернуть в поток
      el.classList.remove('touch-dragging');
      el.style.position = '';
      el.style.left = '';
      el.style.top = '';
      el.style.width = '';
      el.style.zIndex = '';
      host.insertBefore(el, ph);
      ph.remove();
      renumberQuestions();
      buildQuestionNav();
      applyQuestionSearch();
    }
    touchDrag.active = false;
    touchDrag.el = null;
    touchDrag.placeholder = null;
    touchDrag.pointerId = null;
    touchDrag.host = null;
  };

  handleEl.addEventListener('pointerup', end);
  handleEl.addEventListener('pointercancel', end);
}

function removeQuestion(blockId) {
  const el = document.querySelector(`.qdetails[data-blockid="${blockId}"]`);
  if (el) el.remove();
  renumberQuestions();
  buildQuestionNav();
  applyQuestionSearch();
}

function renumberQuestions() {
  const blocks = [...document.querySelectorAll('.qdetails')];
  blocks.forEach((b, idx) => {
    b.dataset.qindex = String(idx);

    const title = b.querySelector('.qsum-title');
    if (title) title.textContent = `Вопрос ${idx + 1}`;

    const radios = b.querySelectorAll('input[type="radio"]');
    radios.forEach((r) => (r.name = `correct-${idx}`));
  });
  setActiveChipByOpen();
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
    <input type="text" class="opt-text" placeholder="Вариант ответа ${optIndex + 1}"
      oninput="updateMini('${blockId}')" />
  `;
  wrap.appendChild(row);
  updateMini(blockId);
}

function updateMini(blockId) {
  const block = document.querySelector(`.qdetails[data-blockid="${blockId}"]`);
  const mini = document.getElementById(`qmini-${blockId}`);
  if (!block || !mini) return;

  const qText = (block.querySelector('.q-text')?.value || '').trim();
  const opts = [...block.querySelectorAll('.opt-text')].map(x => (x.value || '').trim()).filter(Boolean);

  const title = qText ? qText : 'Без текста вопроса';
  const optInfo = opts.length ? `(${opts.length} вар.)` : '(нет вариантов)';

  mini.textContent = `${title} ${optInfo}`;
  buildQuestionNav();
}

function buildQuestionNav() {
  const chipsHost = document.getElementById('qnav-chips');
  if (!chipsHost) return;

  const blocks = [...document.querySelectorAll('.qdetails')];
  chipsHost.innerHTML = blocks.map((b, idx) => {
    const blockId = b.dataset.blockid;
    const mini = document.getElementById(`qmini-${blockId}`)?.textContent || '';
    const active = b.open ? 'active' : '';
    return `<button type="button" class="qchip ${active}" onclick="jumpToQuestion(${idx})" title="${escapeHtml(mini)}">Вопрос ${idx + 1}</button>`;
  }).join('');
}

function setActiveChipByOpen() {
  buildQuestionNav();
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

function expandAll(open) {
  document.querySelectorAll('.qdetails').forEach((d) => (d.open = open));
  buildQuestionNav();
}

function applyQuestionSearch() {
  const q = (document.getElementById('question-search').value || '').trim().toLowerCase();
  const blocks = [...document.querySelectorAll('.qdetails')];

  if (!q) {
    blocks.forEach(b => b.setAttribute('hidden-by-search', '0'));
    return;
  }

  blocks.forEach((b) => {
    const text = (b.querySelector('.q-text')?.value || '').toLowerCase();
    const opts = [...b.querySelectorAll('.opt-text')].map(x => (x.value || '').toLowerCase()).join(' ');
    const mini = (b.querySelector('.qsum-mini')?.textContent || '').toLowerCase();

    const match = text.includes(q) || opts.includes(q) || mini.includes(q);
    b.setAttribute('hidden-by-search', match ? '0' : '1');
  });
}

// совместимость с разметкой (input oninput="filterQuestions()")
function filterQuestions() {
  applyQuestionSearch();
}

/* =========================
   DRAG & DROP (HTML5)
========================= */

function onDragStart(e, blockId) {
  dragId = blockId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', blockId);

  const el = document.querySelector(`.qdetails[data-blockid="${blockId}"]`);
  if (el) el.classList.add('dragging');
}

function onDragOver(e, overId) {
  e.preventDefault();
  if (!dragId || dragId === overId) return;

  const overEl = document.querySelector(`.qdetails[data-blockid="${overId}"]`);
  if (overEl) overEl.classList.add('drop-target');
}

function onDrop(e, dropId) {
  e.preventDefault();
  const fromId = dragId || e.dataTransfer.getData('text/plain');
  if (!fromId || fromId === dropId) return;

  const container = document.getElementById('questions-container');
  const fromEl = document.querySelector(`.qdetails[data-blockid="${fromId}"]`);
  const dropEl = document.querySelector(`.qdetails[data-blockid="${dropId}"]`);
  if (!fromEl || !dropEl) return;

  // вставляем fromEl перед/после в зависимости от позиции курсора
  const dropRect = dropEl.getBoundingClientRect();
  const before = (e.clientY || 0) < (dropRect.top + dropRect.height / 2);
  container.insertBefore(fromEl, before ? dropEl : dropEl.nextSibling);

  cleanupDragStyles();
  renumberQuestions();
  buildQuestionNav();
  applyQuestionSearch();
}

function cleanupDragStyles() {
  document.querySelectorAll('.qdetails').forEach(el => el.classList.remove('dragging', 'drop-target'));
  dragId = null;
}

/* =========================
   GENERATE LINK + VALIDATIONS
========================= */

function generateLink() {
  const mode = document.getElementById('quiz-mode').value;
  const timeLimit = Number(document.getElementById('time-limit').value || 0);
  const totalTimeLimit = Number(document.getElementById('total-time-limit').value || 0);
  const title = (document.getElementById('quiz-title').value || '').trim();

  // ОГРАНИЧЕНИЯ ПО ВРЕМЕНИ
  if (mode === 'timer' && (!timeLimit || timeLimit <= 0)) {
    alert('Укажи время на один вопрос (сек).');
    document.getElementById('time-limit').focus();
    return;
  }
  if (mode === 'speed' && (!totalTimeLimit || totalTimeLimit <= 0)) {
    alert('Укажи общее время на всю викторину (сек).');
    document.getElementById('total-time-limit').focus();
    return;
  }

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

  const quizObj = {
    v: 3,
    title,
    m: mode,
    t: (mode === 'timer') ? timeLimit : 0,
    tt: (mode === 'speed') ? totalTimeLimit : 0, // total time
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

/* =========================
   MY QUIZZES
========================= */

function showMyQuizzes() {
  setActiveScreen('myquizzes-screen');
  renderMyQuizzes();
}

function loadMyQuizzes() {
  try {
    const raw = localStorage.getItem(MY_QUIZZES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveMyQuiz(item) {
  const arr = loadMyQuizzes();
  if (!arr.some(x => x.encoded === item.encoded)) {
    arr.unshift(item);
    localStorage.setItem(MY_QUIZZES_KEY, JSON.stringify(arr));
  }
}

function deleteMyQuiz(encoded) {
  const arr = loadMyQuizzes().filter(x => x.encoded !== encoded);
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
    return `
      <div class="quiz-item">
        <div class="title">${escapeHtml(q.title || 'Викторина')}</div>
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

/* =========================
   QUIZ LOADING
========================= */

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

  currentQuiz = json;
  quizEncoded = encoded;

  if (!allowRepeat) {
    const saved = readCompleted(quizEncoded);
    if (saved) {
      showSavedResult(saved);
      return;
    }
  }

  answersLog = [];
  currentQIndex = 0;
  score = 0;
  startTime = Date.now();

  setActiveScreen('game-screen');
  document.getElementById('already-completed').classList.add('hidden');

  showQuestion();
}

/* =========================
   GAME
========================= */

function showQuestion() {
  stopTimer();
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

  // TIMER MODE: per question
  if (currentQuiz.m === 'timer') startTimer(Number(currentQuiz.t || 0), { mode: 'perQuestion' });

  // SPEED MODE: total time
  if (currentQuiz.m === 'speed') {
    // запускаем общий таймер один раз
    if (!window.__speedTimerStarted) {
      window.__speedTimerStarted = true;
      startTimer(Number(currentQuiz.tt || 0), { mode: 'total' });
    }
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

function onTimeout(modeInfo) {
  if (questionLocked) return;

  // если общий таймер (speed) — завершаем всю викторину
  if (modeInfo?.mode === 'total') {
    finishGame(true);
    return;
  }

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

  // В режиме speed общий таймер НЕ останавливаем
  if (currentQuiz.m !== 'speed') stopTimer();

  const btns = [...document.querySelectorAll('.option-btn')];
  btns.forEach((b) => (b.disabled = true));

  const correctText = options[correctIndex];
  const selectedText = selectedIndex === null ? null : options[selectedIndex];
  const isCorrect = selectedIndex !== null && selectedIndex === correctIndex;

  if (isCorrect) score++;

  // подсветка только если ответил сам
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
  if (reason === 'timeout') summaryEl.innerText = `⏰ Время вышло.`;
  else if (isCorrect) summaryEl.innerText = `✅ Верно!`;
  else summaryEl.innerText = `❌ Неверно. Правильный ответ: ${correctText}`;

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

/* =========================
   TIMER (supports perQuestion and total)
========================= */

function startTimer(sec, info = { mode: 'perQuestion' }) {
  const disp = document.getElementById('timer-display');
  const digits = document.getElementById('time-left');
  const fill = document.getElementById('timer-bar-fill');
  const top = document.getElementById('timer-top');

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

  // если это общий таймер — сохраняем параметры (чтобы не сбрасывать при вопросах)
  if (info.mode === 'total') {
    window.__speedTimerMeta = { startedAt, durationMs };
  }

  const update = () => {
    let leftMs;

    if (info.mode === 'total') {
      // общий таймер считаем от сохранённого старта
      const meta = window.__speedTimerMeta;
      const now = Date.now();
      leftMs = Math.max(0, meta.durationMs - (now - meta.startedAt));
    } else {
      const now = Date.now();
      leftMs = Math.max(0, durationMs - (now - startedAt));
    }

    const leftSec = Math.ceil(leftMs / 1000);
    digits.innerText = String(leftSec);

    const pct = Math.max(0, (leftMs / (info.mode === 'total' ? window.__speedTimerMeta.durationMs : durationMs)) * 100);
    fill.style.width = `${pct}%`;

    if (pct <= 20 || leftSec <= 3) {
      fill.classList.add('danger');
      if (top) top.classList.add('danger');
    }
    if (leftSec <= 3) fill.classList.add('blink');

    if (leftMs <= 0) {
      stopTimer();
      onTimeout(info);
    }
  };

  stopTimer();
  update();
  timerTickInterval = setInterval(update, 60);
}

function stopTimer() {
  const disp = document.getElementById('timer-display');
  if (disp) disp.classList.add('hidden');
  if (timerTickInterval) {
    clearInterval(timerTickInterval);
    timerTickInterval = null;
  }
}

/* =========================
   FINISH + SAVED
========================= */

function finishGame(timeOver = false) {
  // если speed — сбросить флаг таймера
  window.__speedTimerStarted = false;
  window.__speedTimerMeta = null;

  stopTimer();
  setActiveScreen('result-screen');

  document.getElementById('score-val').innerText = String(score);

  const sr = document.getElementById('speed-result');
  if (currentQuiz.m === 'speed') {
    sr.innerText = timeOver ? `⏰ Время закончилось.` : `Готово!`;
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
      totalQuestions: currentQuiz?.d?.length || 0,
      answersLog,
      timeTakenSec: Number(((Date.now() - startTime) / 1000).toFixed(1)),
    };
    writeCompleted(quizEncoded, payload);
  }

  renderAnswerReview(answersLog);
  document.getElementById('answer-review').classList.remove('hidden');
  confetti({ particleCount: 140, spread: 100, origin: { y: 0.5 } });
}

function showSavedResult(saved) {
  setActiveScreen('result-screen');
  document.getElementById('already-completed').classList.remove('hidden');

  document.getElementById('score-val').innerText = String(saved.score ?? 0);

  const sr = document.getElementById('speed-result');
  sr.classList.toggle('hidden', saved.mode !== 'speed');

  renderAnswerReview(saved.answersLog || []);
  document.getElementById('answer-review').classList.remove('hidden');
}

function renderAnswerReview(items) {
  const tbody = document.getElementById('review-body');
  tbody.innerHTML = (items || []).map((it, i) => {
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
  }).join('');
}

/* =========================
   COMPLETED STORAGE
========================= */

function readCompleted(id) {
  try {
    const raw = localStorage.getItem(COMPLETED_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeCompleted(id, payload) {
  try { localStorage.setItem(COMPLETED_PREFIX + id, JSON.stringify(payload)); } catch {}
}

/* =========================
   UTIL
========================= */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
