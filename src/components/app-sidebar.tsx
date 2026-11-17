import Link from "next/link";
import { Suspense } from "react";
import { NavItem, NavLink } from "@/components/nav-link";
import { ProfilePicker } from "@/components/profile-picker";
import { RunsIndicator } from "@/components/runs-indicator";
import { ThemeToggle } from "@/components/theme-toggle";
import { profileStore, readSelectedProfile } from "@/app/profiles";

/** The app's name; it links home. */
export function AppName() {
  return (
    <Link href="/" className="px-2 text-base font-semibold tracking-tight">
      Resume Manager
    </Link>
  );
}

/**
 * The sidebar of every page: the app's name, the navigation, the runs indicator, the profile
 * picker and the dark-mode toggle (F35). On narrow screens it opens from the top bar's menu.
 */
export function SidebarContent() {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <AppName />
      <nav className="flex flex-col gap-1">
        <Suspense fallback={<NavItem href="/" current={false}>New application</NavItem>}>
          <NavLink href="/">New application</NavLink>
        </Suspense>
        <RunsIndicator />
      </nav>
      <Suspense fallback={null}>
        <SidebarProfile />
      </Suspense>
      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </div>
  );
}

async function SidebarProfile() {
  const { slugs } = await profileStore().listProfiles();
  if (slugs.length === 0) return null;
  const selected = await readSelectedProfile(slugs);
  return (
    <div className="space-y-1.5 px-2">
      <p className="text-xs font-medium text-muted-foreground">Profile</p>
      {/* A new key shows the selection again after it changes elsewhere. */}
      <ProfilePicker key={selected} slugs={slugs} selected={selected} />
    </div>
  );
}
