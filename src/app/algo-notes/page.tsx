import { Workbench } from "@/components/workbench";
import { listAlgoNotes } from "@/lib/algo-notes";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function AlgoNotesPage() {
  const [data, algoNotes] = await Promise.all([getDashboardData("algo"), listAlgoNotes()]);
  return <Workbench active="algo" data={data} algoNotes={algoNotes} />;
}
