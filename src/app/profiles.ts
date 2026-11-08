import { cookies } from "next/headers";
import { profilesDir } from "@/adapters/config";
import { createFsProfileStore } from "@/adapters/profile-store";

// The selected profile lives in a cookie, not in the URL (F03).
const PROFILE_COOKIE = "profile";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function profileStore() {
  return createFsProfileStore(profilesDir());
}

/** The selected profile, if the cookie names one that still exists. */
export async function readSelectedProfile(slugs: string[]): Promise<string | null> {
  const slug = (await cookies()).get(PROFILE_COOKIE)?.value;
  return slug && slugs.includes(slug) ? slug : null;
}

export async function writeSelectedProfile(slug: string): Promise<void> {
  (await cookies()).set(PROFILE_COOKIE, slug, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
}
