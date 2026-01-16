const JETTON_MASTER = 'EQA6usPqmsa9I2QHrDUTW_c6xj0v6WPwffyW9uXiwjKBLwBX';
const TON_CENTER_API = 'https://toncenter.com/api/v2/jsonRPC';

// --- DOM Elements ---
const logoClickable = document.getElementById('logoClickable');
const walletInfo = document.getElementById('walletInfo');
const walletAddressEl = document.getElementById('walletAddress');
const tokenBalanceEl = document.getElementById('tokenBalance');
const themeToggle = document.getElementById('themeToggle');
const roadmapBtn = document.getElementById('roadmapBtn');
const backHomeBtn = document.getElementById('backHomeBtn');
const langSelector = document.getElementById('langSelector');

// Элементы для перевода
const mainTitle = document.getElementById('mainTitle');
const taglineText = document.getElementById('taglineText');
const footerPrediction = document.getElementById('footerPrediction');
const footerHeart = document.getElementById('footerHeart');
const roadmapTitle = document.getElementById('roadmapTitle');
const roadmapSubtitle = document.getElementById('roadmapSubtitle');
const finalNote = document.getElementById('finalNote');

// --- State Variables ---
let tonConnectUI = null;
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

async function initializeTonConnect() {
    try {
        if (tonConnectUI && tonConnectUI.wallet) return; // Уже инициализировано и подключено

        tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
            manifestUrl: 'https://nakhuyproject.github.io/akhueno-project/tonconnect-manifest.json'
        });

        tonConnectUI.onStatusChange(async wallet => {
            if (wallet) {
                console.log("Кошелек подключен:", wallet);
                userAddress = wallet.account.address;
                walletAddressEl.textContent = userAddress;
                walletInfo.classList.add('active');
                await fetchJettonBalance(userAddress);
            } else {
                console.log("Кошелек отключен");
                userAddress = null;
                walletInfo.classList.remove('active');
            }
        });

        await tonConnectUI.restoreConnection();

    } catch (error) {
        console.error('TonConnect error:', error);
    }
}

async function fetchJettonBalance(address) {
    try {
        tokenBalanceEl.textContent = 'Загрузка...';
        console.log("Fetching balance for address:", address);

        const { Address } = window.ton_core;
        const { beginCell } = window.ton_core;

        const jettonMasterAddress = Address.parse(JETTON_MASTER);
        const userWalletAddress = Address.parse(address);

        const walletAddressCell = beginCell().storeAddress(userWalletAddress).endCell();
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
                    stack: [["tvm.Slice", bocBase64]]
                }
            })
        });

        const data1 = await response1.json();
        console.log("Response 1 (get_wallet_address):", data1);

        if (!data1.result?.stack || data1.result.stack.length === 0) {
            console.error("No result stack for get_wallet_address");
            tokenBalanceEl.textContent = 'Баланс: 0 NAKHUY';
            return;
        }

        const cellSlice = data1.result.stack[0];
        if (cellSlice.type !== 'tvm.Cell') {
            console.error("Unexpected result type for get_wallet_address, expected tvm.Cell, got:", cellSlice.type);
            tokenBalanceEl.textContent = 'Баланс: 0 NAKHUY';
            return;
        }

        const cellBoc = Uint8Array.from(atob(cellSlice.value), c => c.charCodeAt(0));
        const cell = window.ton_core.Cell.fromBoc(cellBoc)[0];
        const slice = cell.beginParse();
        const jettonWalletAddress = slice.loadAddress();

        if (!jettonWalletAddress) {
            console.error("Could not parse jetton wallet address from cell");
            tokenBalanceEl.textContent = 'Баланс: ошибка';
            return;
        }

        const jettonWalletAddressString = jettonWalletAddress.toString();
        console.log("Calculated Jetton Wallet Address:", jettonWalletAddressString);

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

        if (!data2.result?.stack || data2.result.stack.length < 3) {
             console.error("Insufficient stack length for get_wallet_data");
             tokenBalanceEl.textContent = 'Баланс: недоступен';
             return;
        }

        const balanceStack = data2.result.stack[0];
        if (balanceStack.type !== 'num') {
            console.error("Balance stack item is not a number, got:", balanceStack.type);
            tokenBalanceEl.textContent = 'Баланс: недоступен';
            return;
        }

        const balanceString = balanceStack.number;
        const balanceBigInt = BigInt(balanceString);
        console.log("Raw Balance BigInt:", balanceBigInt);

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

// --- Event Listeners ---
logoClickable.addEventListener('click', () => {
     if (tonConnectUI) {
         tonConnectUI.connectWallet();
     } else {
         console.error("TonConnectUI not initialized yet.");
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

    await initializeTonConnect();

    if (tgWebApp) {
        tgWebApp.ready();
        tgWebApp.expand();
    }
});