// --- ИНИЦИАЛИЗАЦИЯ ---
let currentQuiz = null;
let currentQIndex = 0;
let score = 0;
let startTime = 0;
let timerInterval = null;
const LEADERBOARD_KEY = 'quiz_master_records';

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

    blocks.forEach(b => {
        data.push({
            q: b.querySelector('.q-text').value,
            c: b.querySelector('.q-correct').value,
            w: b.querySelector('.q-wrong').value,
            e: b.querySelector('.q-expl').value
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
function loadQuizFromURL(hash) {
    try {
        const json = JSON.parse(decodeURIComponent(escape(atob(hash))));
        currentQuiz = json;
        document.getElementById('home-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        startTime = Date.now();
        showQuestion();
    } catch (e) {
        alert("Ошибка ссылки!");
        location.hash = "";
    }
}

function showQuestion() {
    if (currentQIndex >= currentQuiz.d.length) return finishGame();

    const q = currentQuiz.d[currentQIndex];
    document.getElementById('question-text').innerText = q.q;
    document.getElementById('explanation-box').classList.add('hidden');
    
    let opts = [q.c, q.w].sort(() => Math.random() - 0.5);
    const container = document.getElementById('options-container');
    container.innerHTML = '';

    opts.forEach(opt => {
        const b = document.createElement('button');
        b.className = 'btn option-btn';
        b.innerText = opt;
        b.onclick = () => checkAnswer(opt, q.c, q.e, b);
        container.appendChild(b);
    });

    if (currentQuiz.m === 'timer') startTimer(currentQuiz.t);
}

function checkAnswer(val, correct, expl, btn) {
    clearInterval(timerInterval);
    const btns = document.querySelectorAll('.option-btn');
    btns.forEach(b => b.disabled = true);

    if (val === correct) {
        score++;
        btn.classList.add('correct');
        confetti({ particleCount: 40, spread: 50 });
    } else {
        btn.classList.add('wrong');
        document.getElementById('main-container').classList.add('shake');
        setTimeout(() => document.getElementById('main-container').classList.remove('shake'), 400);
        btns.forEach(b => { if(b.innerText === correct) b.classList.add('correct'); });
    }

    document.getElementById('explanation-text').innerText = expl || "Нет пояснения.";
    document.getElementById('explanation-box').classList.remove('hidden');
}

function nextQuestion() {
    currentQIndex++;
    showQuestion();
}

function startTimer(sec) {
    const disp = document.getElementById('timer-display');
    const span = document.getElementById('time-left');
    disp.classList.remove('hidden');
    let left = sec;
    span.innerText = left;

    timerInterval = setInterval(() => {
        left--;
        span.innerText = left;
        if (left <= 0) {
            clearInterval(timerInterval);
            checkAnswer('', currentQuiz.d[currentQIndex].c, "Время вышло!", {classList: {add:()=>{}}});
        }
    }, 1000);
}

// --- ФИНИШ И РЕКОРДЫ ---
function finishGame() {
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('result-screen').classList.remove('hidden');
    document.getElementById('score-val').innerText = score;

    if (currentQuiz.m === 'speed') {
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        document.getElementById('speed-result').innerText = `Время: ${totalTime} сек.`;
        document.getElementById('speed-result').classList.remove('hidden');
    }

    confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 } });
    updateLeaderboardUI();
}

function saveScore() {
    const name = document.getElementById('player-name').value || "Аноним";
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
    tbody.innerHTML = leaders.map(l => `<tr><td>${l.name}</td><td>${l.score}</td><td>${l.date}</td></tr>`).join('');
}
