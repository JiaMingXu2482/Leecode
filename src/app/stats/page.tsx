import { Workbench } from "@/components/workbench";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  return <Workbench active="stats" data={await getDashboardData()} />;
}
