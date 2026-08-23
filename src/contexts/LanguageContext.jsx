import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { translate } from "../i18n/translations.js";
import { profileService, authService } from "../services.js";

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

  // persist=false is used when the value comes from the signed-in user's
  // server-side profile (avoids a pointless update round-trip).
  const applyLang = useCallback((next, { persist = true } = {}) => {
    if (!SUPPORTED.includes(next)) return;
    setLangState((prev) => {
      if (prev !== next && persist) {
        // Best-effort server sync so the preference survives reinstalls.
        profileService.updateProfile({ language: next }).catch(() => {});
      }
      return next;
    });
    try { window.localStorage.setItem(LANG_KEY, next); } catch { /* private mode */ }
  }, []);

  const setLang = useCallback((next) => applyLang(next), [applyLang]);

  // The signed-in account's saved language wins over stale localStorage so the
  // preference follows the user across devices (rehydrated on boot + login).
  useEffect(() => {
    let lastUid = null;
    return authService.subscribe((snap) => {
      const uid = snap.currentUser?.uid || null;
      const pref = snap.currentUser?.language;
      if (!uid || uid === lastUid) {
        if (!uid) lastUid = null;
        return;
      }
      lastUid = uid;
      if (SUPPORTED.includes(pref)) applyLang(pref, { persist: false });
    });
  }, [applyLang]);

  const t = useCallback((key, params) => translate(lang, key, params), [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
