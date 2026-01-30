// --- Логика создания ---
let questions = [];

function showCreator() {
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('creator-screen').classList.remove('hidden');
    addQuestionField(); // Сразу добавляем один вопрос
    
    // Показать настройку таймера, если выбран режим
    document.getElementById('quiz-mode').addEventListener('change', (e) => {
        const timerSet = document.getElementById('timer-setting');
        if(e.target.value === 'timer') timerSet.classList.remove('hidden');
        else timerSet.classList.add('hidden');
    });
}

function addQuestionField() {
    const container = document.getElementById('questions-container');
    const id = Date.now();
    const html = `
    <div class="question-block" id="q-${id}">
        <input type="text" class="q-text" placeholder="Вопрос">
        <input type="text" class="q-correct" placeholder="Правильный ответ">
        <input type="text" class="q-wrong1" placeholder="Неправильный ответ 1">
        <input type="text" class="q-wrong2" placeholder="Неправильный ответ 2">
        <input type="text" class="q-expl" placeholder="Пояснение (необязательно)">
    </div>`;
    container.insertAdjacentHTML('beforeend', html);
}

function generateLink() {
    const mode = document.getElementById('quiz-mode').value;
    const timeLimit = document.getElementById('time-limit').value;
    
    const qBlocks = document.querySelectorAll('.question-block');
    let quizData = [];

    qBlocks.forEach(block => {
        quizData.push({
            q: block.querySelector('.q-text').value,
            c: block.querySelector('.q-correct').value,
            w: [
                block.querySelector('.q-wrong1').value,
                block.querySelector('.q-wrong2').value
            ],
            e: block.querySelector('.q-expl').value
        });
    });

    const fullData = {
        m: mode, // режим
        t: timeLimit, // время
        d: quizData // вопросы
    };

    // Кодируем в Base64 с поддержкой русских букв
    const jsonStr = JSON.stringify(fullData);
    const encoded = btoa(unescape(encodeURIComponent(jsonStr)));
    
    const link = `${window.location.origin}${window.location.pathname}#quiz=${encoded}`;
    
    document.getElementById('creator-screen').classList.add('hidden');
    document.getElementById('link-screen').classList.remove('hidden');
    document.getElementById('share-link').value = link;
}

function copyLink() {
    const copyText = document.getElementById("share-link");
    copyText.select();
    document.execCommand("copy");
    alert("Ссылка скопирована!");
}

// --- Логика игры ---
let currentQuiz = null;
let currentQIndex = 0;
let score = 0;
let startTime = 0;
let timerInterval = null;

// Проверяем, есть ли викторина в ссылке при загрузке
window.onload = function() {
    if(window.location.hash.includes('quiz=')) {
        document.getElementById('home-screen').classList.add('hidden');
        loadQuiz();
    }
};

function loadQuiz() {
    try {
        const hash = window.location.hash.split('quiz=')[1];
        const jsonStr = decodeURIComponent(escape(atob(hash)));
        currentQuiz = JSON.parse(jsonStr);
        startGame();
    } catch (e) {
        alert("Ошибка загрузки викторины!");
        window.location.hash = "";
        location.reload();
    }
}

function startGame() {
    document.getElementById('game-screen').classList.remove('hidden');
    startTime = Date.now();
    showQuestion();
}

function showQuestion() {
    if (currentQIndex >= currentQuiz.d.length) {
        finishGame();
        return;
    }

    const qData = currentQuiz.d[currentQIndex];
    document.getElementById('question-text').innerText = qData.q;
    document.getElementById('explanation-box').classList.add('hidden');
    
    // Перемешиваем ответы
    let options = [qData.c, ...qData.w];
    options.sort(() => Math.random() - 0.5);

    const optsContainer = document.getElementById('options-container');
    optsContainer.innerHTML = '';

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.innerText = opt;
        btn.className = 'btn option-btn';
        btn.onclick = () => checkAnswer(opt, qData.c, qData.e, btn);
        optsContainer.appendChild(btn);
    });

    // Если режим таймера на вопрос
    if (currentQuiz.m === 'timer') {
        startTimer(currentQuiz.t);
    }
}

function startTimer(seconds) {
    const display = document.getElementById('timer-display');
    const span = document.getElementById('time-left');
    display.classList.remove('hidden');
    let left = seconds;
    span.innerText = left;

    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        left--;
        span.innerText = left;
        if (left <= 0) {
            clearInterval(timerInterval);
            // Время вышло - показываем правильный ответ
            handleTimeout();
        }
    }, 1000);
}

function handleTimeout() {
    // Находим правильную кнопку и подсвечиваем её, остальные отключаем
    const qData = currentQuiz.d[currentQIndex];
    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach(btn => {
        btn.disabled = true;
        if (btn.innerText === qData.c) btn.classList.add('correct');
    });
    showExplanation(qData.e);
}

function checkAnswer(selected, correct, explanation, btnElement) {
    clearInterval(timerInterval);
    
    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach(b => b.disabled = true); // Блокируем повторные нажатия

    if (selected === correct) {
        score++;
        btnElement.classList.add('correct');
    } else {
        btnElement.classList.add('wrong');
        // Подсветить правильный
        buttons.forEach(b => {
            if (b.innerText === correct) b.classList.add('correct');
        });
    }

    showExplanation(explanation);
}

function showExplanation(text) {
    const box = document.getElementById('explanation-box');
    const explText = document.getElementById('explanation-text');
    
    if (text && text.trim() !== "") {
        explText.innerText = text;
        box.classList.remove('hidden');
    } else {
        // Если пояснения нет, сразу показываем кнопку "Далее"
        explText.innerText = "Нет пояснения";
        box.classList.remove('hidden');
    }
}

function nextQuestion() {
    currentQIndex++;
    showQuestion();
}

function finishGame() {
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('result-screen').classList.remove('hidden');
    
    const total = currentQuiz.d.length;
    document.getElementById('score').innerText = `${score} из ${total}`;

    if (currentQuiz.m === 'speed') {
        const timeTaken = ((Date.now() - startTime) / 1000).toFixed(1);
        const speedRes = document.getElementById('speed-result');
        speedRes.innerText = `Время прохождения: ${timeTaken} сек.`;
        speedRes.classList.remove('hidden');
    }
}
