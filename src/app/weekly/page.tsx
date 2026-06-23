import { Workbench } from "@/components/workbench";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function WeeklyPage() {
  return <Workbench active="weekly" data={await getDashboardData()} />;
}
