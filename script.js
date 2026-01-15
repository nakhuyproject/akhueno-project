// script.js
const JETTON_MASTER = 'EQA6usPqmsa9I2QHrDUTW_c6xj0v6WPwffyW9uXiwjKBLwBX';
const TON_CENTER_API = 'https://toncenter.com/api/v2/jsonRPC';

// --- DOM Elements ---
const logoClickable = document.getElementById('logoClickable');
const walletInfo = document.getElementById('walletInfo');
const walletAddressEl = document.getElementById('walletAddress');
const tokenBalanceEl = document.getElementById('tokenBalance');
const errorMessageEl = document.getElementById('errorMessage');
const themeToggle = document.getElementById('themeToggle');
const roadmapBtn = document.getElementById('roadmapBtn');
const backHomeBtn = document.getElementById('backHomeBtn');
const langSelector = document.getElementById('langSelector');
// Элементы для перевода (добавлены id для удобства обновления)
const mainTitle = document.getElementById('mainTitle');
const taglineText = document.getElementById('taglineText');
const footerPrediction = document.getElementById('footerPrediction');
const footerHeart = document.getElementById('footerHeart');
const roadmapTitle = document.getElementById('roadmapTitle');
const roadmapSubtitle = document.getElementById('roadmapSubtitle');
const finalNote = document.getElementById('finalNote');

// --- State Variables ---
let tonConnectUI = null; // Оставляем как null
let userAddress = null;
let currentLang = 'ru';

// --- Translation Functions ---
async function loadTranslations(langCode) {
    try {
        const response = await fetch(`langs/${langCode}.json`);
        if (!response.ok) {
            throw new Error(`Failed to load translation for ${langCode}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading translations:', error);
        if (langCode !== 'ru') {
            console.warn(`Loading fallback language (ru) for ${langCode}`);
            return await loadTranslations('ru');
        } else {
            return {};
        }
    }
}

function applyTranslations(translations) {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translationValue = translations[key];
        if (translationValue !== undefined) {
            element.textContent = translationValue;
        }
    });
    document.title = translations.page_title || 'AKHUENO PROJECT';
    document.documentElement.lang = currentLang;
    document.documentElement.dir = ['ar'].includes(currentLang) ? 'rtl' : 'ltr';
}

async function changeLanguage(newLangCode) {
    if (newLangCode !== currentLang) {
        currentLang = newLangCode;
        const translations = await loadTranslations(newLangCode);
        applyTranslations(translations);
        localStorage.setItem('preferredLanguage', newLangCode);
        // Обновляем значение селектора языка после загрузки переводов
        langSelector.value = newLangCode;
    }
}

// --- UI & Logic Functions ---
function showError(message) {
    errorMessageEl.textContent = message;
    errorMessageEl.style.display = 'block';
    setTimeout(() => {
        errorMessageEl.style.display = 'none';
    }, 5000);
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    window.scrollTo(0, 0);
}

// --- ИНИЦИАЛИЗАЦИЯ TonConnect (без кнопки) ---
async function initializeTonConnect() {
    // Проверяем, инициализирован ли уже TonConnect UI
    if (tonConnectUI) {
        console.log("TonConnectUI уже инициализирован.");
        return;
    }

    try {
        console.log("Инициализация TonConnectUI...");
        tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
            manifestUrl: 'https://nakhuyproject.github.io/akhueno-project/tonconnect-manifest.json',
            // УБРАТЬ buttonRootId, чтобы не создавать кнопку
        });

        // Регистрируем обработчик событий статуса кошелька
        tonConnectUI.onStatusChange(async wallet => {
            if (wallet) {
                console.log("Кошелек подключен:", wallet);
                userAddress = wallet.account.address;
                // Обновляем элемент адреса
                walletAddressEl.textContent = userAddress;
                walletInfo.classList.add('active');
                await fetchJettonBalance(userAddress); // Загружаем баланс после подключения
            } else {
                console.log("Кошелек отключен");
                userAddress = null;
                // Очищаем элемент адреса при отключении
                walletAddressEl.textContent = '';
                walletInfo.classList.remove('active');
                // Опционально: сбросить баланс
                tokenBalanceEl.textContent = 'Баланс: 0 NAKHUY';
            }
        });

        // ПОПЫТКА ВОССТАНОВИТЬ СОЕДИНЕНИЕ ПРИ ЗАГРУЗКЕ
        await tonConnectUI.restoreConnection();

    } catch (error) {
        // Обработка ошибок инициализации и восстановления
        console.error('Ошибка инициализации TonConnectUI:', error);
        // showError('Ошибка подключения кошелька. Попробуйте снова.'); // Можно показать, если критично
    }
}

// Функция для ручного подключения кошелька
function connectWallet() {
    if (tonConnectUI) {
        tonConnectUI.connectWallet();
    } else {
        console.warn("TonConnectUI не инициализирован для подключения.");
    }
}


async function fetchJettonBalance(address) {
    try {
        tokenBalanceEl.textContent = 'Загрузка...'; // Обновляем статус
        console.log("Fetching balance for address:", address); // Лог для отладки

        const response1 = await fetch(TON_CENTER_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'runGetMethod',
                params: {
                    address: JETTON_MASTER,
                    method: 'get_wallet_address',
                    stack: [{ type: 'slice', value: address }]
                }
            })
        });

        const data1 = await response1.json();
        console.log("Response 1 (get_wallet_address):", data1); // Лог для отладки

        if (!data1.result?.stack || data1.result.stack.length === 0) {
            console.error("No result stack for get_wallet_address");
            tokenBalanceEl.textContent = 'Баланс: 0 NAKHUY';
            return;
        }

        const cellSlice = data1.result.stack[0];
        if (cellSlice.type !== 'cell_slice') {
            console.error("Unexpected result type for get_wallet_address");
            tokenBalanceEl.textContent = 'Баланс: 0 NAKHUY';
            return;
        }

        // Извлечение адреса jetton-wallet из cell_slice
        const addressCell = cellSlice.cell;
        // Преобразование Cell BOC в адрес (предполагается, что это base64 строка)
        const walletAddress = bufferToAddress(addressCell);
        // console.log("Calculated Jetton Wallet Address:", walletAddress); // <-- УДАЛЕНО

        if (!walletAddress) {
            console.error("Could not parse jetton wallet address");
            tokenBalanceEl.textContent = 'Баланс: ошибка';
            return;
        }

        const response2 = await fetch(TON_CENTER_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'runGetMethod',
                params: {
                    address: walletAddress,
                    method: 'get_wallet_data',
                    stack: []
                }
            })
        });

        const data2 = await response2.json();
        console.log("Response 2 (get_wallet_data):", data2); // Лог для отладки

        if (!data2.result?.stack || data2.result.stack.length < 3) {
             console.error("Insufficient stack length for get_wallet_data");
             tokenBalanceEl.textContent = 'Баланс: недоступен';
             return;
        }

        // Баланс обычно находится в первом элементе стека (stack[0])
        const balanceStack = data2.result.stack[0];
        if (balanceStack.type !== 'int') {
            console.error("Balance stack item is not an integer");
            tokenBalanceEl.textContent = 'Баланс: недоступен';
            return;
        }

        const balanceBigInt = BigInt(balanceStack.value);
        console.log("Raw Balance BigInt:", balanceBigInt); // Лог для отладки

        // Предполагаем, что токен имеет 9 децималей (как Ton)
        const balanceNumber = Number(balanceBigInt) / 1e9;
        const formattedBalance = balanceNumber.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 9
        });
        tokenBalanceEl.textContent = `Баланс: ${formattedBalance} NAKHUY`;

    } catch (error) {
        console.error('Balance fetch error:', error);
        tokenBalanceEl.textContent = 'Баланс: недоступен';
    }
}

// --- Address Conversion Helper --- (оставлен как есть, но помните о его слабости)
function bufferToAddress(cellBocBase64) {
    try {
        const binaryString = atob(cellBocBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        if (bytes.length < 34) {
            console.error("Cell BOC too short for address extraction");
            return null;
        }

        const workchain = bytes[0];
        const hashPart = bytes.slice(2, 34);

        let addressBuffer = new Uint8Array([workchain, 0]);
        addressBuffer = new Uint8Array([...addressBuffer, ...hashPart]);

        let addressString = '';
        for (let i = 0; i < addressBuffer.length; i++) {
            addressString += String.fromCharCode(addressBuffer[i]);
        }

        const base64Url = btoa(addressString)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');

        return 'EQ' + base64Url;

    } catch (e) {
        console.error("Error converting Cell BOC to address:", e);
        return null;
    }
}


// --- Event Listeners ---
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light');
    localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark');
});

roadmapBtn.addEventListener('click', () => showSection('roadmap'));
backHomeBtn.addEventListener('click', () => showSection('home'));

langSelector.addEventListener('change', (e) => changeLanguage(e.target.value));

// --- НОВОЕ: Обработчик клика на логотип ---
logoClickable.addEventListener('click', connectWallet);

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // Загрузка темы
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light');
    }

    // Определение языка
    const tgWebApp = window.Telegram?.WebApp;
    let detectedLang = 'ru';
    if (tgWebApp && tgWebApp.initDataUnsafe && tgWebApp.initDataUnsafe.user) {
         detectedLang = tgWebApp.initDataUnsafe.user.language_code || 'en';
         if (['uk', 'be', 'kk'].includes(detectedLang)) detectedLang = 'ru';
         if (detectedLang.startsWith('zh')) detectedLang = 'zh';
         if (['ar', 'fa', 'he'].includes(detectedLang)) detectedLang = 'ar';
         const supportedLangs = ['ru', 'en', 'ar', 'zh'];
         if (!supportedLangs.includes(detectedLang)) detectedLang = 'en';
    }
    const savedLang = localStorage.getItem('preferredLanguage');
    currentLang = savedLang || detectedLang;
    langSelector.value = currentLang; // Устанавливаем выбранный язык в селекторе

    // Загрузка и применение переводов
    const translations = await loadTranslations(currentLang);
    applyTranslations(translations);

    // ИНИЦИАЛИЗАЦИЯ TonConnect С ВОССТАНОВЛЕНИЕМ
    await initializeTonConnect();

    // Telegram Web App
    if (tgWebApp) {
        tgWebApp.ready();
        tgWebApp.expand();
    }
});