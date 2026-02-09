import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import all translation files
import en from './locales/en.json';
import es from './locales/es.json';
import kuSor from './locales/ku-sor.json';
import kuKmr from './locales/ku-kmr.json';
import ar from './locales/ar.json';
import vi from './locales/vi.json';

// Language configurations
export const languages = [
  { code: 'en', name: 'English', flag: '🇺🇸', dir: 'ltr' },
  { code: 'es', name: 'Español', flag: '🇪🇸', dir: 'ltr' },
  { code: 'ku-sor', name: 'کوردی سۆرانی', flag: '🇮🇶', dir: 'rtl' },
  { code: 'ku-kmr', name: 'Kurdî Kurmancî', flag: '🇹🇷', dir: 'ltr' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳', dir: 'ltr' }
];

// Resources for all languages
const resources = {
  en: { translation: en },
  es: { translation: es },
  'ku-sor': { translation: kuSor },
  'ku-kmr': { translation: kuKmr },
  ar: { translation: ar },
  vi: { translation: vi }
};

// Safe localStorage helper
const safeGetLanguage = () => {
  try {
    return localStorage.getItem('preferredLanguage') || 'en';
  } catch (e) {
    console.warn('localStorage not available, using default language');
    return 'en';
  }
};

const safeSetLanguage = (langCode) => {
  try {
    localStorage.setItem('preferredLanguage', langCode);
  } catch (e) {
    console.warn('Could not save language preference to localStorage');
  }
};

// Get saved language from localStorage or default to English
const savedLanguage = safeGetLanguage();

// Track if language change is in progress to prevent rapid switches
let isChangingLanguage = false;

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // React already escapes values
    },
    // Performance optimizations
    react: {
      useSuspense: false, // Disable suspense to prevent loading states
      bindI18n: 'languageChanged', // Only re-render on language change
      bindI18nStore: false, // Don't re-render on store changes
    },
    // Reduce re-renders
    keySeparator: '.',
    nsSeparator: ':',
  });

// Function to change language and save preference - with debounce protection
export const changeLanguage = (langCode) => {
  // Prevent rapid language changes
  if (isChangingLanguage) {
    console.log('Language change already in progress, ignoring');
    return;
  }
  
  // Don't change if already on this language
  if (i18n.language === langCode) {
    return;
  }
  
  try {
    isChangingLanguage = true;
    
    // Update document direction for RTL languages FIRST (synchronous)
    const lang = languages.find(l => l.code === langCode);
    if (lang && typeof document !== 'undefined') {
      document.documentElement.dir = lang.dir;
      document.documentElement.lang = langCode;
    }
    
    // Change language
    i18n.changeLanguage(langCode);
    safeSetLanguage(langCode);
    
    // Reset flag after a short delay
    setTimeout(() => {
      isChangingLanguage = false;
    }, 100);
  } catch (e) {
    console.error('Error changing language:', e);
    isChangingLanguage = false;
  }
};

// Initialize direction on load
try {
  const initLang = languages.find(l => l.code === savedLanguage);
  if (initLang && typeof document !== 'undefined') {
    document.documentElement.dir = initLang.dir;
    document.documentElement.lang = savedLanguage;
  }
} catch (e) {
  console.warn('Could not initialize language direction');
}

export default i18n;
