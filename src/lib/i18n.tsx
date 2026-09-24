import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "zh" | "en";

type LanguageContextValue = {
  language: Language;
  locale: "zh-CN" | "en-US";
  setLanguage: (language: Language) => void;
  text: (zh: string, en: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = "piano-workbench-language";

function initialLanguage(): Language {
  if (typeof window === "undefined") return "zh";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "zh" || saved === "en") return saved;
  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("zh");

  useEffect(() => {
    setLanguageState(initialLanguage());
  }, []);

  const value = useMemo<LanguageContextValue>(() => {
    const setLanguage = (next: Language) => {
      setLanguageState(next);
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
    };
    return {
      language,
      locale: language === "zh" ? "zh-CN" : "en-US",
      setLanguage,
      text: (zh, en) => (language === "zh" ? zh : en),
    };
  }, [language]);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}

export function useLocalizedDocumentTitle(zh: string, en: string) {
  const { text } = useLanguage();
  useEffect(() => {
    document.title = text(zh, en);
  }, [en, text, zh]);
}