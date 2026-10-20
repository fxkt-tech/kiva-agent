import { KivaWorkbench } from "@/components/kiva-workbench";
import { getBootstrapData } from "@/server/bootstrap";

export const dynamic = "force-dynamic";

export default function Home() {
  return <KivaWorkbench data={getBootstrapData()} />;
}
