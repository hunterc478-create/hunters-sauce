import { loadBundle } from "@/lib/load-dashboard";
import { TeasersView } from "@/components/hs/views";

export default function Page() {
  return <TeasersView bundle={loadBundle()} />;
}
