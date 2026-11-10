"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ISO_639_1, languageName } from "@/core/application/languages";

const POSTING_LANGUAGE = "posting";
const LANGUAGES = [
  { value: POSTING_LANGUAGE, label: "Same as the posting" },
  ...ISO_639_1.map((code) => ({ value: code, label: languageName(code) })).sort((a, b) => a.label.localeCompare(b.label)),
];

/** Chooses the resume's language; an empty value means the posting's language (F14). */
export function LanguageSelect({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (language: string) => void;
}) {
  return (
    <Select
      items={LANGUAGES}
      value={value || POSTING_LANGUAGE}
      disabled={disabled}
      onValueChange={(next) => next && onChange(next === POSTING_LANGUAGE ? "" : next)}
    >
      <SelectTrigger aria-label="Resume language" className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map(({ value, label }) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
