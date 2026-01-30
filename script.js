// --- ИНИЦИАЛИЗАЦИЯ ---
let currentQuiz = null;
let currentQIndex = 0;
let score = 0;
let startTime = 0;

let timerInterval = null;
let timerTickInterval = null;
let questionLocked = false;

let quizId = '';
let answersLog = [];

const LEADERBOARD_KEY = 'quiz_master_records';
const COMPLETED_PREFIX = 'quiz_master_completed:';

// Проверка ссылки при загрузке
window.onload = () => {
  const hash = window.location.hash;
  if (hash.includes('quiz=')) {
    loadQuizFromURL(hash.split('quiz=')[1]);
  }
};

// --- КОНСТРУКТОР ---
function showCreator() {
  document.getElementById('home-screen').classList.add('hidden');
  document.getElementById('creator-screen').classList.remove('hidden');
  addQuestionField();

  document.getElementById('quiz-mode').onchange = (e) => {
    document.getElementById('timer-setting').classList.toggle('hidden', e.target.value !== 'timer');
  };
}

function addQuestionField() {
  const container = document.getElementById('questions-container');
  const html = `
    <div class="question-block">
      <input type="text" class="q-text" placeholder="Вопрос">
      <input type="text" class="q-correct" placeholder="Правильный ответ">
      <input type="text" class="q-wrong" placeholder="Неправильный ответ">
      <input type="text" class="q-expl" placeholder="Пояснение (после ответа)">
    </div>`;
  container.insertAdjacentHTML('beforeend', html);
}

function generateLink() {
  const mode = document.getElementById('quiz-mode').value;
  const time = document.getElementById('time-limit').value;
  const blocks = document.querySelectorAll('.question-block');
  let data = [];

  blocks.forEach((b) => {
    data.push({
      q: b.querySelector('.q-text').value,
      c: b.querySelector('.q-correct').value,
      w: b.querySelector('.q-wrong').value,
      e: b.querySelector('.q-expl').value,
    });
  });

  const quizObj = { m: mode, t: time, d: data };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(quizObj))));
  const link = `${window.location.origin}${window.location.pathname}#quiz=${encoded}`;

  document.getElementById('creator-screen').classList.add('hidden');
  document.getElementById('link-screen').classList.remove('hidden');
  document.getElementById('share-link').value = link;
}

function copyLink() {
  const el = document.getElementById('share-link');
  el.select();
  document.execCommand('copy');
  confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
}

// --- ИГРА ---
function loadQuizFromURL(encoded) {
  try {
    const json = JSON.parse(decodeURIComponent(escape(atob(encoded))));
    currentQuiz = json;
    quizId = encoded;

    // Если уже проходили — показываем сохранённые результаты и блокируем повторное прохождение
    const saved = readCompleted(quizId);
    if (saved) {
      showSavedResult(saved);
      return;
    }

    // Иначе запускаем игру
    answersLog = [];
    currentQIndex = 0;
    score = 0;
    startTime = Date.now();

    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('creator-screen').classList.add('hidden');
    document.getElementById('link-screen').classList.add('hidden');
    document.getElementById('result-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('already-completed').classList.add('hidden');

    showQuestion();
  } catch (e) {
    alert('Ошибка ссылки!');
    location.hash = '';
  }
}

function showQuestion() {
  stopTimer();
  questionLocked = false;

  if (!currentQuiz || currentQIndex >= currentQuiz.d.length) return finishGame();

  const q = currentQuiz.d[currentQIndex];
  document.getElementById('question-text').innerText = q.q;
  document.getElementById('explanation-box').classList.add('hidden');

  const opts = [q.c, q.w].sort(() => Math.random() - 0.5);
  const container = document.getElementById('options-container');
  container.innerHTML = '';

  opts.forEach((opt) => {
    const b = document.createElement('button');
    b.className = 'btn option-btn';
    b.innerText = opt;
    b.onclick = () => onAnswerClick(opt);
    container.appendChild(b);
  });

  if (currentQuiz.m === 'timer') startTimer(Number(currentQuiz.t || 0));
}

function onAnswerClick(selectedVal) {
  if (questionLocked) return;
  const q = currentQuiz.d[currentQIndex];
  resolveQuestion({
    selected: selectedVal,
    correct: q.c,
    explanation: q.e,
    reason: 'answered',
  });
}

function onTimeout() {
  if (questionLocked) return;
  const q = currentQuiz.d[currentQIndex];
  resolveQuestion({
    selected: null,
    correct: q.c,
    explanation: 'Время вышло! Этот вопрос не засчитан.',
    reason: 'timeout',
  });
}

function resolveQuestion({ selected, correct, explanation, reason }) {
  questionLocked = true;
  stopTimer();

  const btns = document.querySelectorAll('.option-btn');
  btns.forEach((b) => (b.disabled = true));

  const isCorrect = selected !== null && selected === correct;

  // В режиме таймера: если время вышло — вопрос не засчитывается (и не считается ошибкой)
  if (isCorrect) {
    score++;
  }

  // Визуальные подсветки
  if (reason === 'answered') {
    btns.forEach((b) => {
      if (b.innerText === correct) b.classList.add('correct');
      if (selected !== null && b.innerText === selected && selected !== correct) b.classList.add('wrong');
    });
    if (isCorrect) {
      confetti({ particleCount: 40, spread: 50 });
    } else {
      document.getElementById('main-container').classList.add('shake');
      setTimeout(() => document.getElementById('main-container').classList.remove('shake'), 400);
    }
  } else if (reason === 'timeout') {
    // При таймауте показываем правильный ответ, но не помечаем как wrong
    btns.forEach((b) => {
      if (b.innerText === correct) b.classList.add('correct');
    });
  }

  // Лог для итогового разбора
  const q = currentQuiz.d[currentQIndex];
  answersLog.push({
    index: currentQIndex,
    question: q.q,
    selected: selected,
    correct: correct,
    status: reason === 'timeout' ? 'skip' : isCorrect ? 'ok' : 'bad',
  });

  document.getElementById('explanation-text').innerText = explanation || 'Нет пояснения.';
  document.getElementById('explanation-box').classList.remove('hidden');
}

function nextQuestion() {
  currentQIndex++;
  showQuestion();
}

function startTimer(sec) {
  const disp = document.getElementById('timer-display');
  const span = document.getElementById('time-left');
  const fill = document.getElementById('timer-bar-fill');

  if (!sec || sec <= 0) {
    disp.classList.add('hidden');
    return;
  }

  disp.classList.remove('hidden');
  fill.style.width = '100%';
  fill.classList.remove('danger', 'blink');

  const startedAt = Date.now();
  const durationMs = sec * 1000;

  const update = () => {
    const now = Date.now();
    const elapsed = now - startedAt;
    const leftMs = Math.max(0, durationMs - elapsed);
    const leftSec = Math.ceil(leftMs / 1000);
    span.innerText = String(leftSec);

    const pct = Math.max(0, (leftMs / durationMs) * 100);
    fill.style.width = `${pct}%`;

    // В конце — краснеет и мерцает
    if (pct <= 20 || leftSec <= 3) {
      fill.classList.add('danger');
    }
    if (leftSec <= 3) {
      fill.classList.add('blink');
    }

    if (leftMs <= 0) {
      stopTimer();
      onTimeout();
      return;
    }
  };

  // Частые тики для плавной полоски
  update();
  timerTickInterval = setInterval(update, 50);
}

function stopTimer() {
  const disp = document.getElementById('timer-display');
  if (disp) disp.classList.add('hidden');

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (timerTickInterval) {
    clearInterval(timerTickInterval);
    timerTickInterval = null;
  }
}

// --- ФИНИШ И РЕКОРДЫ ---
function finishGame() {
  stopTimer();
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('result-screen').classList.remove('hidden');

  const totalQuestions = currentQuiz?.d?.length || 0;
  document.getElementById('score-val').innerText = score;

  if (currentQuiz.m === 'speed') {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const sr = document.getElementById('speed-result');
    sr.innerText = `Время: ${totalTime} сек.`;
    sr.classList.remove('hidden');
  }

  // Сохраняем прохождение (блок повторного прохождения)
  const payload = {
    quizId,
    mode: currentQuiz.m,
    finishedAt: Date.now(),
    score,
    totalQuestions,
    answersLog,
    timeTakenSec: Number(((Date.now() - startTime) / 1000).toFixed(1)),
  };
  writeCompleted(quizId, payload);

  renderAnswerReview(answersLog);
  document.getElementById('answer-review').classList.remove('hidden');

  confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 } });
  updateLeaderboardUI();
}

function showSavedResult(saved) {
  // Показываем экран результатов, не давая пройти снова
  document.getElementById('home-screen').classList.add('hidden');
  document.getElementById('creator-screen').classList.add('hidden');
  document.getElementById('link-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('result-screen').classList.remove('hidden');

  document.getElementById('already-completed').classList.remove('hidden');

  score = Number(saved.score ?? 0);
  document.getElementById('score-val').innerText = String(score);

  const sr = document.getElementById('speed-result');
  if (saved.mode === 'speed' && saved.timeTakenSec != null) {
    sr.innerText = `Время: ${saved.timeTakenSec} сек.`;
    sr.classList.remove('hidden');
  } else {
    sr.classList.add('hidden');
  }

  renderAnswerReview(saved.answersLog || []);
  document.getElementById('answer-review').classList.remove('hidden');
  updateLeaderboardUI();
}

function renderAnswerReview(items) {
  const wrap = document.getElementById('answer-review');
  const tbody = document.getElementById('review-body');
  if (!wrap || !tbody) return;

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
        </tr>`;
    })
    .join('');

  wrap.classList.toggle('hidden', !(items && items.length));
}

function saveScore() {
  const name = document.getElementById('player-name').value || 'Аноним';
  let leaders = JSON.parse(localStorage.getItem(LEADERBOARD_KEY)) || [];
  leaders.push({ name, score, date: new Date().toLocaleDateString() });
  leaders.sort((a, b) => b.score - a.score);
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(leaders.slice(0, 5)));
  document.getElementById('save-score-block').classList.add('hidden');
  updateLeaderboardUI();
}

function updateLeaderboardUI() {
  const tbody = document.getElementById('leaderboard-body');
  const leaders = JSON.parse(localStorage.getItem(LEADERBOARD_KEY)) || [];
  tbody.innerHTML = leaders
    .map((l) => `<tr><td>${escapeHtml(l.name)}</td><td>${l.score}</td><td>${escapeHtml(l.date)}</td></tr>`)
    .join('');
}

// --- localStorage helpers (один раз пройти викторину) ---
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
  } catch {
    // ignore
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
