import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Minimal i18n bootstrap: inlined resources for boot; full catalogs live under src/locales/*
import en from './locales/en/translation.json'
import zhCN from './locales/zh-CN/translation.json'

const detected = (typeof navigator !== 'undefined' && navigator.language) || 'zh-CN'
// Default to Simplified Chinese for initial UI. Users can still switch in-app.
const normalized = 'zh-CN'

void i18n
  .use(initReactI18next)
  .init({
    lng: normalized,
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      'zh-CN': { translation: zhCN }
    },
    interpolation: { escapeValue: false }
  })

export default i18n
