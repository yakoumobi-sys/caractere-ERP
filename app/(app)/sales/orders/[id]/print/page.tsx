import { SalesPrint } from "@/components/documents/sales-print";

export default function Page({ params }: { params: { id: string } }) {
  return <SalesPrint kind="order" id={params.id} />;
}
