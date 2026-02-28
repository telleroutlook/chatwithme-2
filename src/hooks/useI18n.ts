import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  createElement
} from "react";
import {
  UI_LANG_STORAGE_KEY,
  getDefaultUiLang,
  isUiLang,
  uiMessages,
  type UiLang,
  type UiMessageKey,
} from "../i18n/ui";

interface TranslateParams {
  [key: string]: string;
}

interface UseI18nResult {
  lang: UiLang;
  setLang: (lang: UiLang) => void;
  t: (key: UiMessageKey, params?: TranslateParams) => string;
}

const fallbackLang: UiLang = getDefaultUiLang();
const fallbackMessages = uiMessages[fallbackLang];

const fallbackI18n: UseI18nResult = {
  lang: fallbackLang,
  setLang: () => {},
  t: (key, params) => {
    const template = fallbackMessages[key] ?? uiMessages.en[key] ?? key;
    if (!params) {
      return template;
    }
    return template.replace(/\{(\w+)\}/g, (_, paramKey: string) => {
      return params[paramKey] ?? `{${paramKey}}`;
    });
  }
};

const I18nContext = createContext<UseI18nResult>(fallbackI18n);

function resolveInitialLang(): UiLang {
  if (typeof window === "undefined") {
    return "en";
  }

  const saved = window.localStorage.getItem(UI_LANG_STORAGE_KEY);
  if (saved && isUiLang(saved)) {
    return saved;
  }

  return getDefaultUiLang();
}

function useI18nState(): UseI18nResult {
  const [lang, setLang] = useState<UiLang>(() => resolveInitialLang());

  useEffect(() => {
    window.localStorage.setItem(UI_LANG_STORAGE_KEY, lang);
  }, [lang]);

  const messages = useMemo(() => uiMessages[lang], [lang]);

  const t = useCallback((key: UiMessageKey, params?: TranslateParams) => {
    const template = messages[key] ?? uiMessages.en[key] ?? key;
    if (!params) {
      return template;
    }

    return template.replace(/\{(\w+)\}/g, (_, paramKey: string) => {
      return params[paramKey] ?? `{${paramKey}}`;
    });
  }, [messages]);

  return { lang, setLang, t };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const value = useI18nState();
  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): UseI18nResult {
  return useContext(I18nContext);
}
