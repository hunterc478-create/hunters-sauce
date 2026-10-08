import { loadBundle } from "@/lib/load-dashboard";
import { ParlaysView } from "@/components/day/views";

export default function Page() {
  return <ParlaysView bundle={loadBundle()} />;
}
