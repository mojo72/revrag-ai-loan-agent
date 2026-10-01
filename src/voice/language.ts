import { create } from 'zustand';
import { languageByCode, type Language } from '../../shared/languages';

const KEY = 'kosh-language';

function initial(): string {
  try {
    return localStorage.getItem(KEY) ?? 'en';
  } catch {
    return 'en';
  }
}

/** The conversation language. Changed from the panel picker or by Riya via the set_language tool. */
export const useLanguage = create<{ code: string; set: (code: string) => void }>((set) => ({
  code: initial(),
  set: (code) => {
    try {
      localStorage.setItem(KEY, code);
    } catch {
      /* private mode */
    }
    set({ code });
  },
}));

export function currentLanguage(): Language {
  return languageByCode(useLanguage.getState().code);
}
