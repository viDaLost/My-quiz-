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

let timerTickInterval = null;       // для режима timer (на вопрос)
let totalTimerInterval = null;      // для режима total (на всю викторину)
let totalStartedAt = 0;
let totalDurationMs = 0;

let questionLocked = false;

let answersLog = [];
let allowRepeat = false;

// Когда открыли по ссылке — сначала показываем intro, игра стартует только по кнопке
let pendingIntroStart = false;

// -------------------------
// BOOT
// -------------------------
window.onload = () => {
  wireModeSelect();

  const encoded = getEncodedFromHash();
  if (encoded) {
    // Открыли по приглашению -> грузим, но НЕ стартуем автоматически
    loadQuizFromURL(encoded, { allowRepeat: false, autoStart: false });
  } else {
    setActiveScreen('home-screen');
  }
};

// -------------------------
// HASH / URL HELPERS
// -------------------------
function getEncodedFromHash() {
  const h = String(window.location.hash || '');
  const m = h.match(/quiz=([^&]+)/);
  return m ? m[1] : null;
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
    'intro-screen',
    'game-screen',
    'result-screen'
  ];

  ids.forEach((x) => {
    const el = document.getElementById(x);
    if (el) el.classList.toggle('hidden', x !== id);
  });
}

function goHome() {
  setActiveScreen('home-screen');
}

function goHomeClearHash() {
  try { history.replaceState(null, '', window.location.pathname); } catch {}
  window.location.hash = '';
  stopTimer();
  stopTotalTimer();
  setActiveScreen('home-screen');
}

// -------------------------
// CREATOR
// -------------------------
function wireModeSelect() {
  const el = document.getElementById('quiz-mode');
  if (!el) return;

  const timerBlock = document.getElementById('timer-setting');
  const totalBlock = document.getElementById('total-setting');

  const apply = (mode) => {
    if (timerBlock) timerBlock.classList.toggle('hidden', mode !== 'timer');
    if (totalBlock) totalBlock.classList.toggle('hidden', mode !== 'total');
  };

  el.onchange = (e) => apply(e.target.value);
  apply(el.value);
}

function showCreator() {
  setActiveScreen('creator-screen');
  const container = document.getElementById('questions-container');
  if (container && container.children.length === 0) addQuestionField();
  buildQuestionNav();
}

// -------------------------
// ВОПРОСЫ В СОЗДАНИИ (ваш текущий функционал)
// -------------------------
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
      <button type="button" class="btn secondary qremove"
        onclick="removeQuestion('${blockId}'); event.stopPropagation();">
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
  `;
  wrap.appendChild(row);
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
  if (!blocks.length) {
    chipsHost.innerHTML = '';
    return;
  }

  const openIdx = blocks.findIndex((b) => b.open);
  const activeIndex = openIdx >= 0 ? openIdx : 0;

  chipsHost.innerHTML = blocks.map((b, idx) => {
    const blockId = b.dataset.blockid;
    const mini = document.getElementById(`qmini-${blockId}`)?.textContent || '';
    const label = `Вопрос${idx + 1}`;
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
// GENERATE LINK
// -------------------------
function generateLink() {
  const mode = document.getElementById('quiz-mode').value;

  const perQuestion = Number(document.getElementById('time-limit')?.value || 0);
  const totalTime = Number(document.getElementById('total-time-limit')?.value || 0);

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

  if (mode === 'timer' && (!perQuestion || perQuestion <= 0)) {
    alert('Укажи секунды на ответ (таймер на вопрос).');
    return;
  }
  if (mode === 'total' && (!totalTime || totalTime <= 0)) {
    alert('Укажи секунды на всю викторину.');
    return;
  }

  // v:3 чтобы различать новые ссылки (но и старые v2 будут читаться)
  const quizObj = {
    v: 3,
    title,
    m: mode,
    t: perQuestion,    // таймер на вопрос (для timer)
    tt: totalTime,     // таймер на всю викторину (для total)
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
  // свои викторины можно запускать сразу
  loadQuizFromURL(encoded, { allowRepeat: true, autoStart: true });
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
          <button type="button" class="btn primary" onclick="playMyQuiz('${q.encoded}')">Пройти</button>
          <button type="button" class="btn secondary" onclick="copyMyQuizLink('${q.encoded}')">Ссылка</button>
          <button type="button" class="btn secondary" onclick="deleteMyQuiz('${q.encoded}')">Удалить</button>
        </div>
      </div>
    `;
  }).join('');
}

// -------------------------
// QUIZ LOADING + INTRO
// -------------------------
function loadQuizFromURL(encoded, opts = { allowRepeat: false, autoStart: false }) {
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

  // Совместимость со старыми структурами
  // Ожидаем: { title, m, d } + таймеры (t / tt)
  if (!json || !Array.isArray(json.d)) {
    alert('Некорректная викторина (нет вопросов).');
    goHomeClearHash();
    return;
  }

  currentQuiz = json;
  quizEncoded = encoded;

  // Если повтор запрещён — проверяем сохранённый результат
  if (!allowRepeat) {
    const saved = readCompleted(quizEncoded);
    if (saved) {
      showSavedResult(saved);
      return;
    }
  }

  // Готовим игру
  answersLog = [];
  currentQIndex = 0;
  score = 0;
  startTime = Date.now();

  stopTimer();
  stopTotalTimer();

  if (opts.autoStart) {
    pendingIntroStart = false;
    setActiveScreen('game-screen');
    showQuestion();
  } else {
    // Показать intro
    pendingIntroStart = true;
    renderIntro();
    setActiveScreen('intro-screen');
  }
}

function renderIntro() {
  const title = (currentQuiz?.title || 'Викторина').trim() || 'Викторина';
  const qCount = currentQuiz?.d?.length || 0;
  const mode = currentQuiz?.m || 'classic';

  const titleEl = document.getElementById('intro-title');
  const qEl = document.getElementById('intro-questions');
  const mEl = document.getElementById('intro-mode');

  if (titleEl) titleEl.textContent = title;
  if (qEl) qEl.textContent = `${qCount} ${pluralRu(qCount, 'вопрос', 'вопроса', 'вопросов')}`;

  if (mEl) {
    if (mode === 'timer') {
      const sec = Number(currentQuiz.t || 0) || 0;
      mEl.textContent = `Режим: таймер на вопрос (${sec} сек)`;
    } else if (mode === 'total') {
      const sec = Number(currentQuiz.tt || 0) || 0;
      mEl.textContent = `Режим: время на всю викторину (${sec} сек)`;
    } else {
      mEl.textContent = `Режим: классика`;
    }
  }
}

function startFromIntro() {
  if (!currentQuiz || !pendingIntroStart) return;

  pendingIntroStart = false;
  answersLog = [];
  currentQIndex = 0;
  score = 0;
  startTime = Date.now();

  setActiveScreen('game-screen');
  showQuestion();

  // Для total запускаем таймер сразу при старте игры
  if (currentQuiz.m === 'total') {
    startTotalTimer(Number(currentQuiz.tt || 0));
  }
}

// -------------------------
// GAME
// -------------------------
function showQuestion() {
  // таймер на вопрос сбрасываем всегда при новом вопросе
  stopTimer();
  questionLocked = false;

  const postBox = document.getElementById('post-answer-box');
  const explArea = document.getElementById('explanation-area');
  const btnExpl = document.getElementById('btn-show-expl');

  if (postBox) postBox.classList.add('hidden');
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

  // таймер на вопрос — только в timer
  if (currentQuiz.m === 'timer') startTimer(Number(currentQuiz.t || 0));

  // таймер total уже должен быть запущен в startFromIntro / autoStart,
  // здесь ничего не трогаем (он должен идти непрерывно)
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

  // Для timer остановить таймер вопроса
  if (currentQuiz.m === 'timer') stopTimer();

  // Для total таймер НЕ останавливаем
  const btns = [...document.querySelectorAll('.option-btn')];
  btns.forEach((b) => (b.disabled = true));

  const correctText = options[correctIndex];
  const selectedText = selectedIndex === null ? null : options[selectedIndex];
  const isCorrect = selectedIndex !== null && selectedIndex === correctIndex;

  if (isCorrect) score++;

  // ЛОГ
  answersLog.push({
    index: currentQIndex,
    question: currentQuiz.d[currentQIndex].q,
    selected: selectedText,
    correct: correctText,
    status: reason === 'timeout' ? 'skip' : isCorrect ? 'ok' : 'bad',
  });

  // TOTAL: сразу следующий вопрос (без остановки времени и без "далее")
  if (currentQuiz.m === 'total') {
    // маленькая пауза чтобы пользователь видел клик (и можно подсветить коротко)
    btns.forEach((b, idx) => {
      if (idx === correctIndex) b.classList.add('correct');
      if (selectedIndex !== null && idx === selectedIndex && selectedIndex !== correctIndex) b.classList.add('wrong');
    });

    if (reason === 'answered' && isCorrect) {
      confetti({ particleCount: 35, spread: 55, origin: { y: 0.6 } });
    }

    setTimeout(() => {
      currentQIndex++;
      showQuestion();
    }, 220);

    return;
  }

  // CLASSIC / TIMER: показываем пост-блок
  if (reason === 'answered') {
    btns.forEach((b, idx) => {
      if (idx === correctIndex) b.classList.add('correct');
      if (selectedIndex !== null && idx === selectedIndex && selectedIndex !== correctIndex) b.classList.add('wrong');
    });

    if (isCorrect) confetti({ particleCount: 40, spread: 50, origin: { y: 0.6 } });
  }

  const summaryEl = document.getElementById('post-summary');
  if (summaryEl) {
    if (reason === 'timeout') summaryEl.innerText = `⏰ Время вышло.`;
    else if (isCorrect) summaryEl.innerText = `✅ Верно!`;
    else summaryEl.innerText = `❌ Неверно. Правильный ответ: ${correctText}`;
  }

  const btnShow = document.getElementById('btn-show-expl');
  const expText = (explanation || '').trim();
  if (reason !== 'timeout' && expText.length > 0) {
    if (btnShow) btnShow.classList.remove('hidden');
    document.getElementById('explanation-text').innerText = expText;
  } else {
    if (btnShow) btnShow.classList.add('hidden');
  }

  const postBox = document.getElementById('post-answer-box');
  if (postBox) postBox.classList.remove('hidden');
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
// TIMER: PER QUESTION (mode=timer)
// -------------------------
function startTimer(sec) {
  const disp = document.getElementById('timer-display');
  const digits = document.getElementById('time-left');
  const fill = document.getElementById('timer-bar-fill');
  const top = disp?.querySelector('.timer-top');

  if (!disp || !digits || !fill || !top) return;

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
// TIMER: TOTAL (mode=total)
// -------------------------
function startTotalTimer(sec) {
  const disp = document.getElementById('timer-display');
  const digits = document.getElementById('time-left');
  const fill = document.getElementById('timer-bar-fill');
  const top = disp?.querySelector('.timer-top');

  if (!disp || !digits || !fill || !top) return;

  if (!sec || sec <= 0) {
    disp.classList.add('hidden');
    return;
  }

  stopTotalTimer();

  disp.classList.remove('hidden');
  fill.style.width = '100%';
  fill.classList.remove('danger', 'blink');
  top.classList.remove('danger');

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
      top.classList.add('danger');
    }
    if (leftSec <= 5) fill.classList.add('blink');

    if (leftMs <= 0) {
      // Время вышло -> отметить оставшиеся как skip и на финиш
      finishDueToTotalTimeout();
    }
  };

  update();
  totalTimerInterval = setInterval(update, 80);
}

function stopTotalTimer() {
  if (totalTimerInterval) {
    clearInterval(totalTimerInterval);
    totalTimerInterval = null;
  }
}

function finishDueToTotalTimeout() {
  stopTotalTimer();
  stopTimer();

  // добить лог по оставшимся вопросам как "не успел"
  if (currentQuiz && Array.isArray(currentQuiz.d)) {
    for (let i = currentQIndex; i < currentQuiz.d.length; i++) {
      const q = currentQuiz.d[i];
      const correctText = q.o?.[q.a] ?? '';
      answersLog.push({
        index: i,
        question: q.q,
        selected: null,
        correct: correctText,
        status: 'skip',
      });
    }
  }

  // ставим индекс в конец и завершаем
  currentQIndex = currentQuiz?.d?.length || currentQIndex;
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
  if (sr) sr.classList.add('hidden');

  if (!allowRepeat) {
    const payload = {
      quizEncoded,
      mode: currentQuiz.m,
      finishedAt: Date.now(),
      score,
      totalQuestions,
      answersLog,
      timeTakenSec: Number(((Date.now() - startTime) / 1000).toFixed(1)),
    };
    writeCompleted(quizEncoded, payload);
  }

  renderAnswerReview(answersLog);
  const review = document.getElementById('answer-review');
  if (review) review.classList.remove('hidden');

  confetti({ particleCount: 150, spread: 100, origin: { y: 0.55 } });
}

function showSavedResult(saved) {
  stopTimer();
  stopTotalTimer();

  setActiveScreen('result-screen');
  document.getElementById('already-completed').classList.remove('hidden');

  document.getElementById('score-val').innerText = String(saved.score ?? 0);

  const sr = document.getElementById('speed-result');
  if (sr) sr.classList.add('hidden');

  renderAnswerReview(saved.answersLog || []);
  document.getElementById('answer-review').classList.remove('hidden');
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

// Русские склонения для "вопрос"
function pluralRu(n, one, few, many) {
  const x = Math.abs(Number(n)) % 100;
  const y = x % 10;
  if (x > 10 && x < 20) return many;
  if (y > 1 && y < 5) return few;
  if (y === 1) return one;
  return many;
}
