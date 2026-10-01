// Languages Sara can converse in. Each entry maps one conversation language to:
// - the Murf locale Khyati speaks in (Falcon model voices are multilingual),
// - the Deepgram streaming model/language (null when Deepgram has no streaming support),
// - the browser speech-recognition locale used as the fallback.

export interface Language {
  code: string;
  label: string;
  native: string;
  murfLocale: string;
  deepgram: { model: string; language: string } | null;
  browserLocale: string;
}

export const LANGUAGES: Language[] = [
  // "multi" lets Deepgram follow English/Hindi code-switching (Hinglish) inside one sentence.
  { code: 'en', label: 'English / Hinglish', native: 'English', murfLocale: 'en-IN', deepgram: { model: 'nova-3', language: 'multi' }, browserLocale: 'en-IN' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी', murfLocale: 'hi-IN', deepgram: { model: 'nova-3', language: 'hi' }, browserLocale: 'hi-IN' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা', murfLocale: 'bn-IN', deepgram: { model: 'nova-3', language: 'bn' }, browserLocale: 'bn-IN' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்', murfLocale: 'ta-IN', deepgram: { model: 'nova-3', language: 'ta' }, browserLocale: 'ta-IN' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు', murfLocale: 'te-IN', deepgram: { model: 'nova-3', language: 'te' }, browserLocale: 'te-IN' },
  { code: 'mr', label: 'Marathi', native: 'मराठी', murfLocale: 'mr-IN', deepgram: { model: 'nova-3', language: 'mr' }, browserLocale: 'mr-IN' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ', murfLocale: 'kn-IN', deepgram: { model: 'nova-3', language: 'kn' }, browserLocale: 'kn-IN' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી', murfLocale: 'gu-IN', deepgram: { model: 'nova-3', language: 'gu' }, browserLocale: 'gu-IN' },
  { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', murfLocale: 'pa-IN', deepgram: { model: 'nova-3', language: 'pa' }, browserLocale: 'pa-IN' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം', murfLocale: 'ml-IN', deepgram: null, browserLocale: 'ml-IN' },
  { code: 'as', label: 'Assamese', native: 'অসমীয়া', murfLocale: 'as-IN', deepgram: { model: 'nova-3', language: 'as' }, browserLocale: 'as-IN' },
  { code: 'or', label: 'Odia', native: 'ଓଡ଼ିଆ', murfLocale: 'or-IN', deepgram: null, browserLocale: 'or-IN' },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);
export const MURF_LOCALES = new Set(LANGUAGES.map((l) => l.murfLocale));

export function languageByCode(code: string | undefined): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
