import { getPurchaseDataAction, getExchangeRatesAction } from "@/app/actions";
import { PoClient } from "@/components/po/PoClient";

export default async function PoPage({ params }: { params: { id: string } }) {
  const purchaseData = await getPurchaseDataAction(params.id);
  const exchangeRates = await getExchangeRatesAction();
  return (
    <PoClient
      ecId={params.id}
      purchaseOrders={purchaseData.purchaseOrders}
      poLines={purchaseData.poLines}
      suppliers={purchaseData.suppliers}
      exchangeRates={exchangeRates}
    />
  );
}
