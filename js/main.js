// ================= КОНФИГУРАЦИЯ =================
const CONFIG = {
    // ✅ ПРАВИЛЬНЫЙ АДРЕС ДЖЕТТОНА NKH (из TonAPI)
    JETTON_ADDRESS: '0:3abac3ea9ac6bd236407ac35135bf73ac63d2fe963f07dfc96f6e5e2c232812f',
    
    // TonAPI.io endpoint
    TONAPI_BASE: 'https://tonapi.io/v2',
    
    // Manifest URL (должен быть HTTPS)
    MANIFEST_URL: 'https://nakhuyproject.github.io/akhueno-project/tonconnect-manifest.json',
    
    // Возврат в Mini App после подключения кошелька
    TWA_RETURN_URL: 'https://t.me/akhueno_nakhuy_bot/akhueno',
    
    // Стандартные decimals для TON-джеттонов
    DECIMALS: 9,
    
    // Символ токена для fallback
    SYMBOL: 'NKH'
};

// ================= DOM ELEMENTS =================
const elements = {
    logoClickable: document.getElementById('logoClickable'),
    walletInfo: document.getElementById('walletInfo'),
    walletAddress: document.getElementById('walletAddress'),
    tokenBalance: document.getElementById('tokenBalance'),
    themeToggle: document.getElementById('themeToggle'),
    langSelector: document.getElementById('langSelector'),
    roadmapBtn: document.getElementById('roadmapBtn'),
    backHomeBtn: document.getElementById('backHomeBtn'),
    sections: {
        home: document.getElementById('home'),
        roadmap: document.getElementById('roadmap')
    }
};

// ================= STATE =================
let tonConnectUI = null;
let userAddress = null;
let currentLang = 'ru';
let translations = {};

// ================= TELEGRAM WEBAPP =================
function initTelegramWebApp() {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    
    tg.ready();
    tg.expand();
    
    // Адаптация под тему Telegram
    if (tg.colorScheme === 'light') {
        document.body.classList.add('light');
    }
    
    // Настройка цветов хедера и нижней панели
    if (tg.setHeaderColor) {
        tg.setHeaderColor(document.body.classList.contains('light') ? '#ffffff' : '#000000');
    }
    if (tg.setBottomBarColor) {
        tg.setBottomBarColor(document.body.classList.contains('light') ? '#ffffff' : '#000000');
    }
}

// ================= ТЕМА =================
function loadTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
        document.body.classList.add('light');
    }
}

function toggleTheme() {
    document.body.classList.toggle('light');
    localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark');
    
    // Обновляем цвета Telegram WebApp
    const tg = window.Telegram?.WebApp;
    if (tg?.setHeaderColor) {
        tg.setHeaderColor(document.body.classList.contains('light') ? '#ffffff' : '#000000');
    }
    if (tg?.setBottomBarColor) {
        tg.setBottomBarColor(document.body.classList.contains('light') ? '#ffffff' : '#000000');
    }
    
    // Haptic feedback для Telegram
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

// ================= ЯЗЫК =================
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

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[key]) {
            el.textContent = translations[key];
        }
    });
    
    document.title = translations.page_title || 'AKHUENO PROJECT';
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
}

async function changeLanguage(newLang) {
    if (newLang !== currentLang) {
        currentLang = newLang;
        localStorage.setItem('preferredLanguage', newLang);
        translations = await loadTranslations(newLang);
        applyTranslations();
    }
}

async function initLanguage() {
    // Автоопределение из Telegram
    let detected = 'ru';
    const tg = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (tg?.language_code) {
        const code = tg.language_code;
        if (['ru', 'uk', 'be', 'kk'].includes(code)) detected = 'ru';
        else if (code.startsWith('zh')) detected = 'zh';
        else if (['ar', 'fa', 'he'].includes(code)) detected = 'ar';
        else if (['en', 'es', 'fr', 'de', 'it'].includes(code)) detected = 'en';
    }
    
    currentLang = localStorage.getItem('preferredLanguage') || detected;
    elements.langSelector.value = currentLang;
    translations = await loadTranslations(currentLang);
    applyTranslations();
}

// ================= НАВИГАЦИЯ =================
function showSection(sectionId) {
    Object.values(elements.sections).forEach(el => el.classList.remove('active'));
    elements.sections[sectionId]?.classList.add('active');
    window.scrollTo(0, 0);
    
    // Haptic feedback
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    }
}

// ================= ФОРМАТИРОВАНИЕ БАЛАНСА =================
function formatBalance(balanceBigInt, decimals) {
    const divisor = 10n ** BigInt(decimals);
    const whole = balanceBigInt / divisor;
    const fraction = balanceBigInt % divisor;
    
    if (fraction === 0n) return whole.toString();
    
    const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${whole}.${fractionStr}`;
}

// Короткое отображение адреса
function formatAddress(rawAddress) {
    if (rawAddress.length > 20) {
        return rawAddress.slice(0, 10) + '...' + rawAddress.slice(-6);
    }
    return rawAddress;
}

// ================= БАЛАНС ДЖЕТТОНА (TonAPI) =================
async function fetchJettonBalance(rawAddress) {
    elements.tokenBalance.textContent = translations.loading_balance || 'Загрузка...';
    
    try {
        // ✅ Запрос к TonAPI с параметром currencies=* (показывает unverifed-джеттоны)
        // TonAPI принимает raw-адрес напрямую: "0:abc123..."
        const url = `${CONFIG.TONAPI_BASE}/accounts/${rawAddress}/jettons?currencies=*`;
        
        const res = await fetch(url, { 
            headers: { 'accept': 'application/json' } 
        });
        
        if (!res.ok) {
            throw new Error(`TonAPI ${res.status}`);
        }
        
        const data = await res.json();
        console.log('TonAPI response:', JSON.stringify(data).slice(0, 500));
        
        // ✅ Поиск джеттона по ТОЧНОМУ адресу (сравнение в нижнем регистре)
        const jetton = data.balances?.find(j => 
            j.jetton?.address?.toLowerCase() === CONFIG.JETTON_ADDRESS.toLowerCase()
        );
        
        if (!jetton) {
            console.log('Jetton not found. Available:', data.balances?.map(b => b.jetton?.symbol));
            elements.tokenBalance.textContent = `0 ${CONFIG.SYMBOL}`;
            return;
        }
        
        // ✅ Форматирование баланса
        const balance = BigInt(jetton.balance);
        const decimals = jetton.jetton?.decimals || CONFIG.DECIMALS;
        const formatted = formatBalance(balance, decimals);
        const symbol = jetton.jetton?.symbol || CONFIG.SYMBOL;
        
        elements.tokenBalance.textContent = `${formatted} ${symbol}`;
        console.log('✅ Balance:', formatted, symbol);
        
    } catch (e) {
        console.error('Balance fetch error:', e);
        elements.tokenBalance.textContent = 'Ошибка';
    }
}

// ================= TONCONNECT (ИСПРАВЛЕННЫЙ ДЛЯ MINI APP) =================
function initTonConnect() {
    const TC = window.TonConnectUI || window.TON_CONNECT_UI?.TonConnectUI;
    
    if (!TC) {
        console.error('TonConnect UI not loaded');
        elements.tokenBalance.textContent = 'Ошибка загрузки';
        return;
    }

    try {
        // ✅ Инициализация TonConnect UI с настройками для Mini App
        tonConnectUI = typeof TC === 'function' 
            ? new TC({ 
                manifestUrl: CONFIG.MANIFEST_URL,
                buttonRootId: 'tonconnect-button',  // ✅ Скрытый контейнер в index.html
                
                // ✅ Конфигурация действий для Telegram Mini App
                actionsConfiguration: {
                    twaReturnUrl: CONFIG.TWA_RETURN_URL  // Возврат в Mini App после подключения
                }
            })
            : TC.create({ 
                manifestUrl: CONFIG.MANIFEST_URL,
                buttonRootId: 'tonconnect-button',
                actionsConfiguration: {
                    twaReturnUrl: CONFIG.TWA_RETURN_URL
                }
            });

        // ✅ Подписка на изменения кошелька
        tonConnectUI.onStatusChange(async (wallet) => {
            if (wallet) {
                console.log('✅ Кошелек подключен:', wallet.account.address);
                userAddress = wallet.account.address;
                
                // Показываем адрес (короткая версия)
                elements.walletAddress.textContent = formatAddress(userAddress);
                elements.walletInfo.classList.add('active');
                
                // Загружаем баланс
                await fetchJettonBalance(userAddress);
                
                // ✅ Haptic feedback для Telegram
                if (window.Telegram?.WebApp?.HapticFeedback) {
                    window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                }
            } else {
                console.log('❌ Кошелек отключен');
                userAddress = null;
                elements.walletInfo.classList.remove('active');
                elements.walletAddress.textContent = '';
                elements.tokenBalance.textContent = translations.loading_balance || 'Загрузка...';
            }
        });
        
        // ✅ Восстановление сессии при перезагрузке
        tonConnectUI.restoreConnection();
        console.log('TonConnect initialized');
        
    } catch (e) {
        console.error('TonConnect init error:', e);
        elements.tokenBalance.textContent = 'Ошибка подключения';
    }
}

// ✅ Подключение кошелька по клику на логотип
async function connectWallet() {
    if (!tonConnectUI) {
        console.error('TonConnect not initialized');
        return;
    }
    
    // ✅ Haptic feedback перед открытием модалки
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('heavy');
    }
    
    // ✅ Открываем модальное окно подключения
    // В Mini App это автоматически откроет список кошельков с правильными deep links
    try {
        await tonConnectUI.openModal();
    } catch (e) {
        console.error('openModal error:', e);
    }
}

// ================= EVENT LISTENERS =================
function setupEventListeners() {
    // ✅ Логотип → подключение кошелька
    elements.logoClickable?.addEventListener('click', connectWallet);
    
    // Тема
    elements.themeToggle?.addEventListener('click', toggleTheme);
    
    // Язык
    elements.langSelector?.addEventListener('change', (e) => changeLanguage(e.target.value));
    
    // Навигация
    elements.roadmapBtn?.addEventListener('click', () => showSection('roadmap'));
    elements.backHomeBtn?.addEventListener('click', () => showSection('home'));
}

// ================= ИНИЦИАЛИЗАЦИЯ =================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 DOM loaded');
    
    // 1. Тема
    loadTheme();
    
    // 2. Telegram WebApp
    initTelegramWebApp();
    
    // 3. Язык
    await initLanguage();
    
    // 4. TonConnect (с настройками для Mini App)
    initTonConnect();
    
    // 5. Event listeners
    setupEventListeners();
    
    console.log('✅ App initialized');
});

// ✅ Проверка загрузки TonConnect UI библиотеки
window.addEventListener('load', () => {
    if (typeof window.TonConnectUI === 'undefined' && 
        typeof window.TON_CONNECT_UI?.TonConnectUI === 'undefined') {
        console.error('❌ TonConnect UI library failed to load!');
        elements.tokenBalance.textContent = 'Ошибка: TON Connect недоступен';
        if (elements.logoClickable) {
            elements.logoClickable.style.pointerEvents = 'none';
            elements.logoClickable.style.opacity = '0.5';
        }
    }
});