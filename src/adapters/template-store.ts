import { readFile } from "node:fs/promises";
import path from "node:path";
import { isCountryName, parseTemplate, type ParseTemplateResult } from "@/core/template/template";

export interface TemplateStore {
  /** Reads and checks templates/<country>.html (Art. VII). A missing file is a problem, not a fallback. */
  loadTemplate(country: string): Promise<ParseTemplateResult>;
}

export function createFsTemplateStore(templatesDir: string): TemplateStore {
  return {
    async loadTemplate(country) {
      if (!isCountryName(country)) throw new Error("Invalid template name");
      const file = `templates/${country}.html`;
      const html = await readFile(path.join(/* turbopackIgnore: true */ templatesDir, `${country}.html`), "utf8").catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null;
          throw error;
        },
      );
      if (html === null) return { ok: false, error: { file, problems: ["file is missing"] } };
      return parseTemplate(country, file, html);
    },
  };
}
