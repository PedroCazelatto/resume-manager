"use client";

import { useTransition } from "react";
import { selectProfile } from "@/app/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ProfilePicker({ slugs, selected }: { slugs: string[]; selected: string | null }) {
  const [pending, startTransition] = useTransition();

  return (
    <Select
      defaultValue={selected}
      disabled={pending}
      onValueChange={(slug) => {
        if (slug) startTransition(() => selectProfile(slug));
      }}
    >
      <SelectTrigger aria-label="Profile" className="w-full">
        <SelectValue placeholder="Choose a profile" />
      </SelectTrigger>
      <SelectContent>
        {slugs.map((slug) => (
          <SelectItem key={slug} value={slug}>
            {slug}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
