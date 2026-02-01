// js/main.js
// Исправленный URL API TON Center
const JETTON_MASTER = 'EQA6usPqmsa9I2QHrDUTW_c6xj0v6WPwffyW9uXiwjKBLwBX';
const TON_CENTER_API = 'https://toncenter.com/api/v2/jsonRPC'; // Убраны пробелы

// --- DOM Elements ---
const logoClickable = document.getElementById('logoClickable');
const walletInfo = document.getElementById('walletInfo');
const walletAddressEl = document.getElementById('walletAddress');
const tokenBalanceEl = document.getElementById('tokenBalance');
const themeToggle = document.getElementById('themeToggle');
const roadmapBtn = document.getElementById('roadmapBtn');
const backHomeBtn = document.getElementById('backHomeBtn');
const langSelector = document.getElementById('langSelector');

// Элементы для перевода (можно оставить, если они используются в других функциях)
const mainTitle = document.getElementById('mainTitle');
const taglineText = document.getElementById('taglineText');
const footerPrediction = document.getElementById('footerPrediction');
const footerHeart = document.getElementById('footerHeart');
const roadmapTitle = document.getElementById('roadmapTitle');
const roadmapSubtitle = document.getElementById('roadmapSubtitle');
const finalNote = document.getElementById('finalNote');

// --- State Variables ---
let tonConnectUI = null; // Переменная будет инициализирована позже
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
    }
}

// --- UI & Logic Functions ---

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    window.scrollTo(0, 0);
}

// --- Функция для форматирования баланса ---
function formatJettonAmount(amount, decimals = 9) { // Используем 9 как стандартное значение для TON
    const amountStr = amount.toString();
    const negative = amountStr.startsWith('-');
    const cleanAmountStr = amountStr.replace(/^-/, '');

    let wholePart;
    let fractionalPart;

    if (cleanAmountStr.length > decimals) {
        const offset = cleanAmountStr.length - decimals;
        wholePart = cleanAmountStr.slice(0, offset);
        fractionalPart = cleanAmountStr.slice(offset);
    } else {
        wholePart = '0';
        fractionalPart = cleanAmountStr.padStart(decimals, '0');
    }

    // Удаляем ведущие нули в дробной части
    fractionalPart = fractionalPart.replace(/0+$/, '');
    if (fractionalPart === '') {
        fractionalPart = '0';
    }

    const formatted = `${negative ? '-' : ''}${wholePart}.${fractionalPart}`;
    // Используем toLocaleString только для форматирования разрядов, а не для округления
    // Разбиваем на целую и дробную часть, форматируем целую, потом склеиваем.
    const parts = formatted.split('.');
    const wholeFormatted = parseInt(parts[0]).toLocaleString(undefined, { maximumFractionDigits: 0 });
    return parts.length > 1 ? `${wholeFormatted}.${parts[1]}` : wholeFormatted;
}


async function fetchJettonBalance(address) {
    if (!address) {
        console.error("Адрес пользователя не определен.");
        tokenBalanceEl.textContent = 'Баланс: недоступен';
        return;
    }

    try {
        tokenBalanceEl.textContent = 'Загрузка...';
        console.log("Fetching balance for address:", address);

        const { Address, Cell, Slice } = window.ton_core; // Импортируем нужные классы

        const jettonMasterAddress = Address.parse(JETTON_MASTER);
        const userWalletAddress = Address.parse(address);

        // Подготовка параметра для метода get_wallet_address
        const walletAddressCell = new Cell().storeAddress(userWalletAddress);
        const bocBase64 = walletAddressCell.toBoc().toString('base64');

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
                    stack: [["tvm.Slice", bocBase64]] // Передаем BOC как Slice
                }
            })
        });

        const data1 = await response1.json();
        console.log("Response 1 (get_wallet_address):", data1);

        if (!data1.result || !data1.result.stack || data1.result.stack.length === 0) {
            console.error("No result stack or empty stack for get_wallet_address");
            tokenBalanceEl.textContent = 'Баланс: 0 NAKHUY';
            return;
        }

        const jettonWalletAddressResult = data1.result.stack[0];
        if (jettonWalletAddressResult.type !== 'slice') { // Ожидаем тип slice для адреса
            console.error("Unexpected result type for get_wallet_address, expected 'slice', got:", jettonWalletAddressResult.type);
            tokenBalanceEl.textContent = 'Баланс: 0 NAKHUY';
            return;
        }

        // Парсим адрес из результата типа slice
        try {
            // Декодируем hex строку из value (предполагается, что это hex BOC)
            const bocHex = jettonWalletAddressResult.value;
            // Используем ton-core для декодирования hex в bytes
            const bocBytes = Buffer.from(bocHex, 'hex');
            const cellFromBOC = Cell.fromBoc(bocBytes)[0];
            const sliceFromCell = Slice.fromCell(cellFromBOC);
            const jettonWalletAddressParsed = sliceFromCell.loadAddress();

            if (!jettonWalletAddressParsed) {
                console.error("Could not parse jetton wallet address from cell");
                tokenBalanceEl.textContent = 'Баланс: ошибка';
                return;
            }

            const jettonWalletAddressString = jettonWalletAddressParsed.toString();
            console.log("Calculated Jetton Wallet Address:", jettonWalletAddressString);

            // Теперь вызываем get_wallet_data на адресе jetton-кошелька пользователя
            const response2 = await fetch(TON_CENTER_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 2,
                    method: 'runGetMethod',
                    params: {
                        address: jettonWalletAddressString,
                        method: 'get_wallet_data',
                        stack: []
                    }
                })
            });

            const data2 = await response2.json();
            console.log("Response 2 (get_wallet_data):", data2);

            if (!data2.result || !data2.result.stack || data2.result.stack.length < 3) {
                 console.error("Insufficient stack length for get_wallet_data or no result");
                 tokenBalanceEl.textContent = 'Баланс: недоступен';
                 return;
            }

            const balanceStackItem = data2.result.stack[0]; // Баланс - первый элемент стека
            const ownerStackItem = data2.result.stack[1];   // Владелец - второй
            const jettonMasterStackItem = data2.result.stack[2]; // Мастер токена - третий

            if (balanceStackItem.type !== 'int') { // Проверяем тип баланса (ожидаем int)
                console.error("Balance stack item is not an integer, got:", balanceStackItem.type);
                tokenBalanceEl.textContent = 'Баланс: недоступен';
                return;
            }

            // Извлекаем баланс как BigInt
            const balanceBigInt = BigInt(balanceStackItem.number);
            console.log("Raw Balance BigInt:", balanceBigInt);

            // Форматируем баланс, используя функцию formatJettonAmount
            const formattedBalance = formatJettonAmount(balanceBigInt, 9);

            tokenBalanceEl.textContent = `Баланс: ${formattedBalance} NAKHUY`;

        } catch (parseError) {
            console.error("Error parsing jetton wallet address or balance:", parseError);
            tokenBalanceEl.textContent = 'Баланс: ошибка';
        }

    } catch (error) {
        console.error('Balance fetch error:', error);
        tokenBalanceEl.textContent = 'Баланс: недоступен';
    }
}


// --- Инициализация TonConnectUI ---
async function initializeTonConnect() {
    // Проверяем, инициализирован ли TonConnectUI, если нет - создаем
    if (!tonConnectUI) {
        console.log("Initializing TonConnectUI...");
        tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
            manifestUrl: 'https://nakhuyproject.github.io/akhueno-project/tonconnect-manifest.json' // Убраны пробелы
        });

        // Регистрируем обработчик статуса кошелька
        tonConnectUI.onStatusChange(async wallet => {
            if (wallet) {
                console.log("Кошелек подключен:", wallet);
                userAddress = wallet.account.address;
                walletAddressEl.textContent = userAddress;
                walletInfo.classList.add('active');
                // Обновляем баланс при подключении кошелька
                await fetchJettonBalance(userAddress);
            } else {
                console.log("Кошелек отключен");
                userAddress = null;
                walletInfo.classList.remove('active');
                tokenBalanceEl.textContent = 'Баланс: недоступен';
            }
        });
    }

    // Всегда пытаемся восстановить соединение при инициализации
    console.log("Attempting to restore connection...");
    try {
        await tonConnectUI.restoreConnection();
    } catch (error) {
        console.error('Ошибка восстановления соединения:', error);
    }
}


// --- Event Listeners ---
logoClickable.addEventListener('click', () => {
    if (tonConnectUI) {
        // Проверяем, подключен ли уже кошелек, чтобы не вызывать connectWallet дважды
        if (!tonConnectUI.wallet) {
             console.log("Вызвано окно подключения кошелька.");
             tonConnectUI.connectWallet();
        } else {
             console.log("Кошелек уже подключен.");
             // Можно добавить логику для отключения, если нужно
             // tonConnectUI.disconnect();
        }
    } else {
        // TonConnectUI еще не инициализирован, возможно, библиотека не загрузилась
        // или DOM еще не готов. Выведем сообщение.
        console.error("TonConnectUI not initialized yet. Cannot connect wallet.");
    }
});

themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light');
    localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark');
});

roadmapBtn.addEventListener('click', () => showSection('roadmap'));
backHomeBtn.addEventListener('click', () => showSection('home'));

langSelector.addEventListener('change', (e) => changeLanguage(e.target.value));

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM fully loaded and parsed.");

    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light');
    }

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
    langSelector.value = currentLang;

    const translations = await loadTranslations(currentLang);
    applyTranslations(translations);

    // Инициализируем TonConnectUI после загрузки DOM и переводов
    await initializeTonConnect();

    if (tgWebApp) {
        tgWebApp.ready();
        tgWebApp.expand();
    }
});

// --- Дополнительная проверка на случай, если TON Connect UI не загрузился до DOMContentLoaded ---
window.addEventListener('load', () => {
    console.log("Window 'load' event fired.");
    if (typeof TON_CONNECT_UI === 'undefined' || typeof TON_CONNECT_UI.TonConnectUI === 'undefined') {
        console.error("TON Connect UI library failed to load!");
        // Здесь можно отобразить сообщение пользователю о проблеме с подключением
        tokenBalanceEl.textContent = 'Ошибка: TON Connect недоступен';
        logoClickable.style.pointerEvents = 'none'; // Отключить клик по логотипу
        logoClickable.style.opacity = '0.5';
    }
});
