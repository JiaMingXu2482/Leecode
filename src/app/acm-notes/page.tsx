import { Workbench } from "@/components/workbench";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function AcmNotesPage() {
  return <Workbench active="acm-notes" data={await getDashboardData("acm-notes")} />;
}
