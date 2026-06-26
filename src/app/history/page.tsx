import { Workbench } from "@/components/workbench";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  return <Workbench active="history" data={await getDashboardData()} />;
}
