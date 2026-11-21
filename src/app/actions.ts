"use server";

import { revalidatePath } from "next/cache";
import { profileStore, readSelectedProfile, writeSelectedProfile } from "./profiles";
import { applyUpdate, type ShownUpdate } from "./update";

export async function selectProfile(slug: string): Promise<void> {
  const { slugs } = await profileStore().listProfiles();
  if (!slugs.includes(slug)) throw new Error("Unknown profile");
  await writeSelectedProfile(slug);
}

/**
 * The user confirmed the one-time update of the selected profile's old applications, as the home
 * page showed it (Art. IV.8, F50). Only the selected profile is touched (Art. III.7).
 */
export async function updateApplications(shown: ShownUpdate): Promise<{ ok: true } | { ok: false; problems: string[] }> {
  const lists = [shown?.rewrite, shown?.rename, shown?.delete];
  if (!lists.every((list) => Array.isArray(list) && list.every((id) => typeof id === "string"))) {
    throw new Error("Invalid update");
  }
  const slug = await readSelectedProfile((await profileStore().listProfiles()).slugs);
  if (!slug) return { ok: false, problems: ["Choose a profile first."] };
  const result = await applyUpdate(slug, shown);
  revalidatePath("/");
  return result;
}
