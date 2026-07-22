import { redirect } from "next/navigation";

export default function EcIndexPage({ params }: { params: { id: string } }) {
  redirect(`/engineering-changes/${params.id}/overview`);
}
