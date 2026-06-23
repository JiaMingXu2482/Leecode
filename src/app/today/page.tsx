import { Workbench } from "@/components/workbench";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  return <Workbench active="today" data={await getDashboardData()} />;
}
