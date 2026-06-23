import { Workbench } from "@/components/workbench";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function ProblemsPage() {
  return <Workbench active="problems" data={await getDashboardData()} />;
}
