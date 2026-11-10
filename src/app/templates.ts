import { templatesDir } from "@/adapters/config";
import { createFsTemplateStore } from "@/adapters/template-store";

/** M0 generates with the Ireland template only (Art. X). */
export const M0_TEMPLATE = "ireland";

export function templateStore() {
  return createFsTemplateStore(templatesDir());
}
