"use client";

import { useCallback, useEffect, useState } from "react";
import type { RunSummary } from "@/app/runs";
import { NavItem } from "@/components/nav-link";
import { Badge } from "@/components/ui/badge";
import { RUNS_CHANGED } from "@/components/use-run";

const REFRESH_MS = 2000;

/** Runs that haven't ended: being fetched, waiting, or running. */
const OPEN: RunSummary["status"][] = ["fetching", "queued", "running"];

/**
 * The sidebar's link to the Runs list, with how many of the selected profile's runs are
 * active or waiting (F35). It only counts; the Runs list tells about ended runs (F38).
 */
export function RunsIndicator() {
  const [open, setOpen] = useState(0);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/runs").catch(() => null);
    if (!response?.ok) return setOpen(0);
    const { runs } = (await response.json()) as { runs: RunSummary[] };
    setOpen(runs.filter((run) => OPEN.includes(run.status)).length);
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, REFRESH_MS);
    window.addEventListener(RUNS_CHANGED, refresh);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener(RUNS_CHANGED, refresh);
    };
  }, [refresh]);

  return (
    <NavItem href="/#runs" current={false}>
      <span>Runs</span>
      {open > 0 && (
        <Badge aria-label={`${open} active or waiting`}>{open}</Badge>
      )}
    </NavItem>
  );
}
