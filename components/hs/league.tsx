"use client";
/** NFL / College switch: which league every list shows. Remembered on this device. */
import { createContext, useContext, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type Lg = "NFL" | "NCAAF";
const Ctx = createContext<{ league: Lg; setLeague: (l: Lg) => void }>({ league: "NFL", setLeague: () => {} });
const KEY = "hs-league";

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const [league, set] = useState<Lg>("NFL");
  useEffect(() => { try { const v = localStorage.getItem(KEY); if (v === "NFL" || v === "NCAAF") set(v); } catch {} }, []);
  const setLeague = (l: Lg) => { set(l); try { localStorage.setItem(KEY, l); } catch {} };
  return <Ctx.Provider value={{ league, setLeague }}>{children}</Ctx.Provider>;
}

export const useLeague = () => useContext(Ctx);

export function LeagueSwitch({ className }: { className?: string }) {
  const { league, setLeague } = useLeague();
  return (
    <div role="group" aria-label="League" className={cn("inline-flex rounded-lg border border-slate-line p-0.5 text-xs font-bold", className)}>
      {([["NFL", "NFL"], ["NCAAF", "College"]] as const).map(([k, label]) => (
        <button key={k} type="button" aria-pressed={league === k} onClick={() => setLeague(k)}
          className={cn("rounded-md px-3 py-1.5", league === k ? "bg-brand text-obsidian" : "text-ink/70 hover:text-ink")}>{label}</button>
      ))}
    </div>
  );
}
