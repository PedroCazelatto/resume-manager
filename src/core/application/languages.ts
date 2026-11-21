/**
 * English name of a language code, e.g. `pt` → "Portuguese": the posting's detected language,
 * or the language of a resume written before every resume was in English (F51).
 */
export function languageName(code: string): string {
  return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
}
