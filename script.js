let currentQuiz = null;
let currentQIndex = 0;
let score = 0;
let startTime = 0;
let timerInterval = null;
let userAnswers = []; // Для финального отчета
let quizID = ""; // Уникальный ключ для этой викторины

window.onload = () => {
    const hash = window.location.hash;
    if (hash.includes('quiz=')) {
        quizID = hash.split('quiz=')[1].substring(0, 20); // Используем часть хеша как ID
        if (localStorage.getItem('completed_' + quizID)) {
            showCompletedView();
        } else {
            loadQuizFromURL(hash.split('quiz=')[1]);
        }
    }
};

function showCompletedView() {
    const saved = JSON.parse(localStorage.getItem('completed_' + quizID));
    score = saved.score;
    userAnswers = saved.answers;
    currentQuiz = saved.quiz;
    document.getElementById('home-screen').classList.add('hidden');
    finishGame(true); // Пропускаем игру сразу к результатам
}

function loadQuizFromURL(hash) {
    try {
        currentQuiz = JSON.parse(decodeURIComponent(escape(atob(hash))));
        document.getElementById('home-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        startTime = Date.now();
        showQuestion();
    } catch (e) { alert("Ошибка загрузки!"); }
}

function showQuestion() {
    if (currentQIndex >= currentQuiz.d.length) return finishGame();

    const q = currentQuiz.d[currentQIndex];
    document.getElementById('question-text').innerText = q.q;
    document.getElementById('explanation-box').classList.add('hidden');
    document.getElementById('timer-container').classList.add('hidden');
    
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

    if (currentQuiz.m === 'timer') startVisualTimer(currentQuiz.t);
}

function startVisualTimer(seconds) {
    const bar = document.getElementById('timer-bar');
    const container = document.getElementById('timer-container');
    container.classList.remove('hidden');
    container.classList.remove('timer-danger');
    
    let timeLeft = seconds * 10;
    const total = seconds * 10;

    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        let percent = (timeLeft / total) * 100;
        bar.style.width = percent + "%";

        if (percent < 30) container.classList.add('timer-danger');

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleTimeout();
        }
    }, 100);
}

function handleTimeout() {
    const q = currentQuiz.d[currentQIndex];
    userAnswers.push({ q: q.q, a: "Время вышло ⏳", c: q.c, ok: false });
    
    const btns = document.querySelectorAll('.option-btn');
    btns.forEach(b => {
        b.disabled = true;
        if (b.innerText === q.c) b.classList.add('correct');
    });

    document.getElementById('explanation-status').innerText = "❌ Время вышло!";
    document.getElementById('explanation-text').innerText = q.e || "";
    document.getElementById('explanation-box').classList.remove('hidden');
}

function checkAnswer(val, correct, expl, btn) {
    clearInterval(timerInterval);
    const q = currentQuiz.d[currentQIndex];
    const isCorrect = val === correct;
    
    userAnswers.push({ q: q.q, a: val, c: correct, ok: isCorrect });

    const btns = document.querySelectorAll('.option-btn');
    btns.forEach(b => b.disabled = true);

    if (isCorrect) {
        score++;
        btn.classList.add('correct');
        confetti({ particleCount: 30, spread: 40 });
        document.getElementById('explanation-status').innerText = "✅ Правильно!";
    } else {
        btn.classList.add('wrong');
        btns.forEach(b => { if(b.innerText === correct) b.classList.add('correct'); });
        document.getElementById('explanation-status').innerText = "❌ Неверно!";
    }

    document.getElementById('explanation-text').innerText = expl || "";
    document.getElementById('explanation-box').classList.remove('hidden');
}

function nextQuestion() {
    currentQIndex++;
    showQuestion();
}

function finishGame(alreadyDone = false) {
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('result-screen').classList.remove('hidden');
    document.getElementById('score-val').innerText = score + "/" + currentQuiz.d.length;

    // Сохраняем в браузер, чтобы нельзя было пройти дважды
    if (!alreadyDone) {
        localStorage.setItem('completed_' + quizID, JSON.stringify({
            score: score,
            answers: userAnswers,
            quiz: currentQuiz
        }));
        confetti({ particleCount: 150, spread: 100 });
    }

    // Генерация отчета
    const reportList = document.getElementById('report-list');
    reportList.innerHTML = userAnswers.map(item => `
        <div class="report-item">
            <div class="report-q">${item.q}</div>
            <span class="report-ans ${item.ok ? 'text-success' : 'text-danger'}">Ваш ответ: ${item.a}</span>
            ${!item.ok ? `<span class="report-ans text-success">Правильный: ${item.c}</span>` : ''}
        </div>
    `).join('');
}

// Функции конструктора (без изменений)
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
    container.insertAdjacentHTML('beforeend', `
        <div class="question-block">
            <input type="text" class="q-text" placeholder="Вопрос">
            <input type="text" class="q-correct" placeholder="Верный ответ">
            <input type="text" class="q-wrong" placeholder="Ложный ответ">
            <input type="text" class="q-expl" placeholder="Пояснение">
        </div>`);
}

function generateLink() {
    const quizObj = {
        m: document.getElementById('quiz-mode').value,
        t: document.getElementById('time-limit').value,
        d: Array.from(document.querySelectorAll('.question-block')).map(b => ({
            q: b.querySelector('.q-text').value,
            c: b.querySelector('.q-correct').value,
            w: b.querySelector('.q-wrong').value,
            e: b.querySelector('.q-expl').value
        }))
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(quizObj))));
    document.getElementById('share-link').value = `${window.location.origin}${window.location.pathname}#quiz=${encoded}`;
    document.getElementById('creator-screen').classList.add('hidden');
    document.getElementById('link-screen').classList.remove('hidden');
}

function copyLink() {
    document.getElementById('share-link').select();
    document.execCommand('copy');
    alert("Ссылка скопирована!");
}
