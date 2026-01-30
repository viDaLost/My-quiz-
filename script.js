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

// -------------------------
// BOOT
// -------------------------
window.onload = () => {
  initBgQuestions();
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
  const ids = ['home-screen', 'myquizzes-screen', 'creator-screen', 'link-screen', 'game-screen', 'result-screen'];
  ids.forEach((x) => document.getElementById(x).classList.toggle('hidden', x !== id));

  // фон ❓ только на главном
  document.body.classList.toggle('show-bg', id === 'home-screen');
  // прозрачный контейнер только на главном
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
// BACKGROUND ❓ FALLING
// -------------------------
function initBgQuestions() {
  const host = document.getElementById('bg-questions');
  if (!host) return;

  host.innerHTML = '';

  // больше, чаще
  const count = 55;
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'qmark';
    s.textContent = '❓';

    const size = rand(14, 44);
    const dur = rand(5, 11);          // быстрее
    const delay = rand(0, 4);         // чаще
    const left = rand(-10, 110);      // по всей ширине

    s.style.fontSize = `${size}px`;
    s.style.animationDuration = `${dur}s`;
    s.style.animationDelay = `${delay}s`;
    s.style.left = `${left}vw`;

    host.appendChild(s);
  }
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// -------------------------
// CREATOR
// -------------------------
function wireModeSelect() {
  const el = document.getElementById('quiz-mode');
  el.onchange = (e) => {
    document.getElementById('timer-setting').classList.toggle('hidden', e.target.value !== 'timer');
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

  // 2 варианта по умолчанию
  addOption(blockId);
  addOption(blockId);

  renumberQuestions();
  buildQuestionNav();

  // прокрутить к новому вопросу
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

  const activeIndex = blocks.findIndex((b) => b.open) >= 0 ? blocks.findIndex((b) => b.open) : 0;

  chipsHost.innerHTML = blocks.map((b, idx) => {
    const blockId = b.dataset.blockid;
    const mini = document.getElementById(`qmini-${blockId}`)?.textContent || '';
    const label = `Q${idx + 1}`;
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

  const quizObj = { v: 2, title, m: mode, t: timeLimit, d: data };

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
// QUIZ LOADING
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

// -------------------------
// GAME
// -------------------------
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

  if (currentQuiz.m === 'timer') startTimer(Number(currentQuiz.t || 0));
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
  stopTimer();

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
// TIMER
// -------------------------
function startTimer(sec) {
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
// FINISH + SAVED RESULTS
// -------------------------
function finishGame() {
  stopTimer();
  setActiveScreen('result-screen');

  const totalQuestions = currentQuiz?.d?.length || 0;
  document.getElementById('score-val').innerText = String(score);

  const sr = document.getElementById('speed-result');
  if (currentQuiz.m === 'speed') {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    sr.innerText = `Время: ${totalTime} сек.`;
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
      timeTakenSec: Number(((Date.now() - startTime) / 1000).toFixed(1)),
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
  if (saved.mode === 'speed' && saved.timeTakenSec != null) {
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
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
