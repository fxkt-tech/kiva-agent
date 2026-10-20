import { KivaWorkbenchClient } from "@/components/kiva-workbench-client";
import { getBootstrapData } from "@/server/bootstrap";

export const dynamic = "force-dynamic";

export default function Home() {
  return <KivaWorkbenchClient data={getBootstrapData()} />;
}
