"use server";

import { profileStore, writeSelectedProfile } from "./profiles";

export async function selectProfile(slug: string): Promise<void> {
  const { slugs } = await profileStore().listProfiles();
  if (!slugs.includes(slug)) throw new Error("Unknown profile");
  await writeSelectedProfile(slug);
}
