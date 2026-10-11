import { loadBundle } from "@/lib/load-dashboard";
import { TdDerbyPage } from "@/components/hs/td-derby-page";

export default function Page() {
  const data = loadBundle().byDay.all;
  return <TdDerbyPage list={data.tdDerby ?? []} cards={data.matchups} />;
}
