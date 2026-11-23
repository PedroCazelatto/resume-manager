import type { ComponentProps } from "react";
import { ArchiveIcon } from "@phosphor-icons/react/dist/ssr/Archive";
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { CaretUpIcon } from "@phosphor-icons/react/dist/ssr/CaretUp";
import { CheckIcon } from "@phosphor-icons/react/dist/ssr/Check";
import { ListIcon } from "@phosphor-icons/react/dist/ssr/List";
import { MoonIcon } from "@phosphor-icons/react/dist/ssr/Moon";
import { PlusIcon } from "@phosphor-icons/react/dist/ssr/Plus";
import { SunIcon } from "@phosphor-icons/react/dist/ssr/Sun";
import { XIcon } from "@phosphor-icons/react/dist/ssr/X";

// Every icon of the app is a Phosphor icon, and this file is the only place that imports
// them (F48). It lists the icons the app uses, by Phosphor's own name in kebab-case; a new
// icon is added here when it is needed. Each icon is imported from its own module, so the
// app loads only these, and the server-rendering variant works in server and client
// components alike.
const ICONS = {
  archive: ArchiveIcon,
  "caret-down": CaretDownIcon,
  "caret-up": CaretUpIcon,
  check: CheckIcon,
  list: ListIcon,
  moon: MoonIcon,
  plus: PlusIcon,
  sun: SunIcon,
  x: XIcon,
} as const;

export type IconName = keyof typeof ICONS;

type IconProps = { name: IconName } & ComponentProps<typeof XIcon>;

/**
 * One of the app's icons, e.g. `<Icon name="x" />`. It is hidden from screen readers unless
 * told otherwise: the button around it carries the accessible name.
 */
export function Icon({ name, ...props }: IconProps) {
  const Svg = ICONS[name];
  return <Svg aria-hidden {...props} />;
}
