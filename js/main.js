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
    SYMBOL: 'NKH',
    
    // ⏱️ Время долгого нажатия для отключения (мс)
    LONG_PRESS_DURATION: 2000
};

// ================= DOM ELEMENTS =================
const elements = {
    logoClickable: document.getElementById('logoClickable'),
    logo: document.querySelector('.logo'),
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

// ⏱️ Переменные для long press
let longPressTimer = null;
let longPressStartTime = null;
let isLongPress = false;
let progressInterval = null;

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
        const url = `${CONFIG.TONAPI_BASE}/accounts/${rawAddress}/jettons?currencies=*`;
        
        const res = await fetch(url, { 
            headers: { 'accept': 'application/json' } 
        });
        
        if (!res.ok) {
            throw new Error(`TonAPI ${res.status}`);
        }
        
        const data = await res.json();
        console.log('TonAPI response:', JSON.stringify(data).slice(0, 500));
        
        // ✅ Поиск джеттона по ТОЧНОМУ адресу
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

// ================= TONCONNECT =================
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
                buttonRootId: 'tonconnect-button',
                actionsConfiguration: {
                    twaReturnUrl: CONFIG.TWA_RETURN_URL
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
                
                elements.walletAddress.textContent = formatAddress(userAddress);
                elements.walletInfo.classList.add('active');
                
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
                
                // ✅ Haptic feedback для отключения
                if (window.Telegram?.WebApp?.HapticFeedback) {
                    window.Telegram.WebApp.HapticFeedback.notificationOccurred('warning');
                }
            }
        });
        
        // ✅ Восстановление сессии
        tonConnectUI.restoreConnection();
        console.log('TonConnect initialized');
        
    } catch (e) {
        console.error('TonConnect init error:', e);
        elements.tokenBalance.textContent = 'Ошибка подключения';
    }
}

// ================= ЛОГИКА LONG PRESS (3 секунды) =================

// Начало нажатия
function handlePressStart(e) {
    if (e.type === 'touchstart') {
        e.preventDefault();
    }
    
    isLongPress = false;
    longPressStartTime = Date.now();
    
    // Запускаем таймер долгого нажатия
    longPressTimer = setTimeout(() => {
        isLongPress = true;
        
        // Визуальный фидбек — сильная вибрация
        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('heavy');
        }
        
        // Визуальная индикация на логотипе
        if (elements.logo) {
            elements.logo.style.transform = 'scale(0.9)';
            elements.logo.style.filter = 'brightness(0.7) sepia(1) hue-rotate(-50deg) saturate(3)';
        }
        
        console.log('🔴 Long press detected — disconnect wallet');
        
        // Отключаем кошелек
        disconnectWallet();
        
    }, CONFIG.LONG_PRESS_DURATION);
    
    // Анимация прогресса
    let progress = 0;
    progressInterval = setInterval(() => {
        progress += 100 / (CONFIG.LONG_PRESS_DURATION / 50);
        if (elements.logo && progress < 100) {
            const scale = 1 - (progress / 200);
            elements.logo.style.transform = `scale(${scale})`;
        }
    }, 50);
}

// Конец нажатия
function handlePressEnd(e) {
    clearTimeout(longPressTimer);
    clearInterval(progressInterval);
    
    // Возвращаем стили логотипа
    if (elements.logo) {
        elements.logo.style.transform = '';
        elements.logo.style.filter = '';
    }
    
    // Если это было короткое нажатие (< 3 сек) — подключаем кошелек
    if (!isLongPress) {
        const pressDuration = Date.now() - longPressStartTime;
        
        if (pressDuration < 200) {
            console.log('⚠️ Too short tap, ignored');
            return;
        }
        
        console.log('🟢 Short tap detected — connect wallet');
        connectWallet();
    }
}

// Отмена нажатия
function handlePressCancel() {
    clearTimeout(longPressTimer);
    clearInterval(progressInterval);
    isLongPress = false;
    
    if (elements.logo) {
        elements.logo.style.transform = '';
        elements.logo.style.filter = '';
    }
}

// ✅ Подключение кошелька (короткий тап)
async function connectWallet() {
    if (!tonConnectUI) {
        console.error('TonConnect not initialized');
        return;
    }
    
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    }
    
    try {
        await tonConnectUI.openModal();
    } catch (e) {
        console.error('openModal error:', e);
    }
}

// ✅ Отключение кошелька (долгое нажатие)
async function disconnectWallet() {
    if (!tonConnectUI) {
        console.error('TonConnect not initialized');
        return;
    }
    
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('warning');
    }
    
    try {
        await tonConnectUI.disconnect();
        console.log('✅ Wallet disconnected');
        
        userAddress = null;
        elements.walletInfo.classList.remove('active');
        elements.walletAddress.textContent = '';
        elements.tokenBalance.textContent = translations.loading_balance || 'Загрузка...';
        
    } catch (e) {
        console.error('disconnect error:', e);
    }
}

// ================= EVENT LISTENERS =================
function setupEventListeners() {
    // ✅ Логотип — поддержка touch и mouse для long press
    if (elements.logoClickable) {
        // Touch события (мобильные)
        elements.logoClickable.addEventListener('touchstart', handlePressStart, { passive: false });
        elements.logoClickable.addEventListener('touchend', handlePressEnd);
        elements.logoClickable.addEventListener('touchcancel', handlePressCancel);
        
        // Mouse события (ПК)
        elements.logoClickable.addEventListener('mousedown', handlePressStart);
        elements.logoClickable.addEventListener('mouseup', handlePressEnd);
        elements.logoClickable.addEventListener('mouseleave', handlePressCancel);
        
        // Предотвращаем контекстное меню при долгом нажатии
        elements.logoClickable.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }
    
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
    
    // 4. TonConnect
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
