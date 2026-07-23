import { runCutoverSimulationAction, getEngineeringChangeAction } from "@/app/actions";
import { DEFAULT_SIMULATION_INPUTS } from "@/domains/deltaledger/cutover/dispositionModel";
import { CutoverSimulatorClient } from "@/components/cutover/CutoverSimulatorClient";
import { EmptyState } from "@/components/shared/States";

export default async function CutoverSimulatorPage({ params }: { params: { id: string } }) {
  const [outcome, ec] = await Promise.all([
    runCutoverSimulationAction(params.id, DEFAULT_SIMULATION_INPUTS()),
    getEngineeringChangeAction(params.id),
  ]);

  if (!outcome.ok) {
    return (
      <EmptyState
        title="Cutover Simulator not available"
        body={outcome.reason}
      />
    );
  }

  return <CutoverSimulatorClient ecId={params.id} ecName={ec?.name ?? ""} initialResponse={outcome.response} />;
}
