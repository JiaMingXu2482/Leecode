import { Workbench } from "@/components/workbench";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  return <Workbench active="reviews" data={await getDashboardData()} />;
}
