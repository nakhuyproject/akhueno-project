// ================= КОНФИГУРАЦИЯ =================
const JETTON_ADDRESS = '0:3abac3ea9ac6bd236407ac35135bf73ac63d2fe963f07dfc96f6e5e2c232812f'; // ✅ Правильный адрес NKH
const TONAPI_BASE = 'https://tonapi.io/v2';
const MANIFEST_URL = 'https://nakhuyproject.github.io/akhueno-project/tonconnect-manifest.json';

// ================= DOM ELEMENTS =================
const logoClickable = document.getElementById('logoClickable');
const walletInfo = document.getElementById('walletInfo');
const walletAddressEl = document.getElementById('walletAddress');
const tokenBalanceEl = document.getElementById('tokenBalance');
const themeToggle = document.getElementById('themeToggle');
const roadmapBtn = document.getElementById('roadmapBtn');
const backHomeBtn = document.getElementById('backHomeBtn');
const langSelector = document.getElementById('langSelector');

// ================= STATE =================
let tonConnectUI = null;
let userAddress = null;
let currentLang = 'ru';

// ================= ПЕРЕВОДЫ =================
async function loadTranslations(langCode) {
    try {
        const response = await fetch(`langs/${langCode}.json`);
        if (!response.ok) throw new Error(`Failed to load ${langCode}`);
        return await response.json();
    } catch (error) {
        console.error('Translation error:', error);
        if (langCode !== 'ru') {
            return await loadTranslations('ru');
        }
        return {};
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

// ================= НАВИГАЦИЯ =================
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    window.scrollTo(0, 0);
}

// ================= ФОРМАТИРОВАНИЕ БАЛАНСА =================
function formatJettonAmount(amount, decimals = 9) {
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
    
    fractionalPart = fractionalPart.replace(/0+$/, '');
    if (fractionalPart === '') {
        fractionalPart = '0';
    }
    
    const formatted = `${negative ? '-' : ''}${wholePart}.${fractionalPart}`;
    const parts = formatted.split('.');
    const wholeFormatted = parseInt(parts[0]).toLocaleString(undefined, { maximumFractionDigits: 0 });
    return parts.length > 1 ? `${wholeFormatted}.${parts[1]}` : wholeFormatted;
}

// ================= БАЛАНС ДЖЕТТОНА (TonAPI) =================
async function fetchJettonBalance(address) {
    if (!address) {
        console.error("Адрес пользователя не определен.");
        tokenBalanceEl.textContent = 'Баланс: недоступен';
        return;
    }
    
    try {
        tokenBalanceEl.textContent = 'Загрузка...';
        console.log("Fetching balance for address:", address);
        
        // ✅ Запрос к TonAPI с параметром currencies=* (показывает unverifed-джеттоны)
        const url = `${TONAPI_BASE}/accounts/${address}/jettons?currencies=*`;
        const response = await fetch(url, {
            headers: { 'accept': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(`TonAPI ${response.status}`);
        }
        
        const data = await response.json();
        console.log("TonAPI response:", data);
        
        // ✅ Поиск джеттона по ТОЧНОМУ адресу
        const jetton = data.balances?.find(j => 
            j.jetton?.address?.toLowerCase() === JETTON_ADDRESS.toLowerCase()
        );
        
        if (!jetton) {
            tokenBalanceEl.textContent = `0 NKH`;
            console.log("Jetton not found");
            return;
        }
        
        // ✅ Форматирование баланса
        const balance = BigInt(jetton.balance);
        const decimals = jetton.jetton?.decimals || 9;
        const formattedBalance = formatJettonAmount(balance, decimals);
        
        tokenBalanceEl.textContent = `${formattedBalance} ${jetton.jetton?.symbol || 'NKH'}`;
        console.log("Balance:", formattedBalance);
        
    } catch (error) {
        console.error('Balance fetch error:', error);
        tokenBalanceEl.textContent = 'Ошибка';
    }
}

// ================= TONCONNECT =================
async function initializeTonConnect() {
    if (!tonConnectUI) {
        console.log("Initializing TonConnectUI...");
        
        try {
            // ✅ Инициализация с buttonRootId (скрытый контейнер в index.html)
            tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
                manifestUrl: MANIFEST_URL,
                buttonRootId: 'tonconnect-button'  // ✅ Ссылка на скрытый div
            });
            
            // ✅ Обработчик статуса кошелька
            tonConnectUI.onStatusChange(async wallet => {
                if (wallet) {
                    console.log("Кошелек подключен:", wallet);
                    userAddress = wallet.account.address;
                    walletAddressEl.textContent = formatAddress(userAddress);
                    walletInfo.classList.add('active');
                    await fetchJettonBalance(userAddress);
                } else {
                    console.log("Кошелек отключен");
                    userAddress = null;
                    walletInfo.classList.remove('active');
                    tokenBalanceEl.textContent = 'Баланс: недоступен';
                }
            });
            
            // ✅ Восстановление соединения
            await tonConnectUI.restoreConnection();
            console.log("TonConnect UI initialized successfully");
            
        } catch (error) {
            console.error('TonConnect init error:', error);
            tokenBalanceEl.textContent = 'Ошибка подключения';
        }
    }
}

// ✅ Подключение кошелька по клику на логотип
logoClickable.addEventListener('click', () => {
    if (tonConnectUI) {
        console.log("Открываем модальное окно TonConnect...");
        tonConnectUI.openModal();  // ✅ Открываем модалку напрямую
    } else {
        console.error("TonConnectUI not initialized yet");
    }
});

// Форматирование адреса (короткая версия)
function formatAddress(rawAddress) {
    if (rawAddress.length > 20) {
        return rawAddress.slice(0, 10) + '...' + rawAddress.slice(-6);
    }
    return rawAddress;
}

// ================= EVENT LISTENERS =================
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light');
    localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark');
});

roadmapBtn.addEventListener('click', () => showSection('roadmap'));
backHomeBtn.addEventListener('click', () => showSection('home'));
langSelector.addEventListener('change', (e) => changeLanguage(e.target.value));

// ================= ИНИЦИАЛИЗАЦИЯ =================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM fully loaded and parsed.");
    
    // 1. Тема
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light');
    }
    
    // 2. Telegram WebApp
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
    
    // 3. Переводы
    const translations = await loadTranslations(currentLang);
    applyTranslations(translations);
    
    // 4. TonConnect
    await initializeTonConnect();
    
    // 5. Telegram WebApp ready
    if (tgWebApp) {
        tgWebApp.ready();
        tgWebApp.expand();
    }
});

// Проверка загрузки библиотеки TonConnect
window.addEventListener('load', () => {
    console.log("Window 'load' event fired.");
    if (typeof TON_CONNECT_UI === 'undefined' || typeof TON_CONNECT_UI.TonConnectUI === 'undefined') {
        console.error("TON Connect UI library failed to load!");
        tokenBalanceEl.textContent = 'Ошибка: TON Connect недоступен';
        logoClickable.style.pointerEvents = 'none';
        logoClickable.style.opacity = '0.5';
    }
});