import { loadBundle } from "@/lib/load-dashboard";
import { TdDerbyPage } from "@/components/hs/td-derby-page";

export default function Page() {
  const bundle = loadBundle();
  const data = bundle.byDay.all;
  return <TdDerbyPage list={data.tdDerby ?? []} cards={data.matchups} propWhy={bundle.propWhy} logs={{ teamLogs: bundle.teamLogs, playerLogs: bundle.playerLogs }} />;
}
