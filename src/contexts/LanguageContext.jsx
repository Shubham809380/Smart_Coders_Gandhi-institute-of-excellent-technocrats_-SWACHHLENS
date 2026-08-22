import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { translate } from "../i18n/translations.js";
import { profileService } from "../services.js";

const LANG_KEY = "swachhlens-lang";
const SUPPORTED = ["en", "hi", "or"];

const LanguageContext = createContext({ lang: "en", setLang: () => {}, t: (k) => k });

function readStoredLang() {
  try {
    const stored = window.localStorage.getItem(LANG_KEY);
    return SUPPORTED.includes(stored) ? stored : "en";
  } catch {
    return "en";
  }
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readStoredLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next) => {
    if (!SUPPORTED.includes(next)) return;
    setLangState(next);
    try { window.localStorage.setItem(LANG_KEY, next); } catch { /* private mode */ }
    // Best-effort server sync so the preference survives reinstalls.
    profileService.updateProfile({ language: next }).catch(() => {});
  }, []);

  const t = useCallback((key, params) => translate(lang, key, params), [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
