import { EntityListPage } from "@/components/entity/entity-list";
import { productsConfig } from "@/lib/entities";

export default function Page({ searchParams }: { searchParams?: { error?: string } }) {
  return <EntityListPage config={productsConfig} errorMessage={searchParams?.error} />;
}
