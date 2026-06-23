import { Workbench } from "@/components/workbench";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function SyncSettingsPage() {
  return <Workbench active="sync" data={await getDashboardData()} />;
}
