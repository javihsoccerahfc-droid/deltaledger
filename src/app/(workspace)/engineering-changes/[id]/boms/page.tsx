import { getBomStateAction } from "@/app/actions";
import { BomsClient } from "@/components/bom/BomsClient";

export default async function BomsPage({ params }: { params: { id: string } }) {
  const bomState = await getBomStateAction(params.id);
  return <BomsClient ecId={params.id} imports={bomState.imports} diff={bomState.diff} />;
}
