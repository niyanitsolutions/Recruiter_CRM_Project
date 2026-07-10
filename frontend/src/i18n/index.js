import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from '../locales/en/common.json'
import ta from '../locales/ta/common.json'
import hi from '../locales/hi/common.json'
import te from '../locales/te/common.json'
import kn from '../locales/kn/common.json'
import ml from '../locales/ml/common.json'
import fr from '../locales/fr/common.json'
import de from '../locales/de/common.json'
import es from '../locales/es/common.json'
import ar from '../locales/ar/common.json'

// Languages a tenant can pick in Company Settings → Localization
// (tenant_settings.py's _VALID_LANGUAGES must stay in sync with this list).
export const SUPPORTED_LANGUAGES = ['en', 'ta', 'hi', 'te', 'kn', 'ml', 'fr', 'de', 'es', 'ar']
export const RTL_LANGUAGES = ['ar']

i18next
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en },
      ta: { common: ta },
      hi: { common: hi },
      te: { common: te },
      kn: { common: kn },
      ml: { common: ml },
      fr: { common: fr },
      de: { common: de },
      es: { common: es },
      ar: { common: ar },
    },
    lng: 'en',
    // Any key not yet migrated in a given language (or a language not yet
    // fully translated) falls back to English rather than showing blank text.
    fallbackLng: 'en',
    ns: ['common'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  })

export default i18next
