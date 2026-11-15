import { templatesDir } from "@/adapters/config";
import { createFsTemplateStore } from "@/adapters/template-store";

/** Every resume uses the Ireland template for now (backlog F11). */
export const DEFAULT_TEMPLATE = "ireland";

export function templateStore() {
  return createFsTemplateStore(templatesDir());
}
