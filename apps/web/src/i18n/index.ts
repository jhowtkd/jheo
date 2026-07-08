import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ptBR from './pt-BR.json';
import { resolveInitialLocale, type SupportedLocale } from './locale';

let initialized = false;

export async function ensureI18n(): Promise<void> {
  if (initialized) return;
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
    lng: resolveInitialLocale(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  initialized = true;
}

export function setLocale(loc: SupportedLocale): void {
  if (typeof window !== 'undefined') window.localStorage.setItem('jheo.locale', loc);
  i18n.changeLanguage(loc);
}

export function useLocale(): SupportedLocale {
  return (i18n.language as SupportedLocale) ?? 'en';
}

export { i18n };