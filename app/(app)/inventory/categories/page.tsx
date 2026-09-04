import { EntityListPage } from "@/components/entity/entity-list";
import { productCategoriesConfig } from "@/lib/entities";

export default function Page({ searchParams }: { searchParams?: { error?: string } }) {
  return <EntityListPage config={productCategoriesConfig} errorMessage={searchParams?.error} />;
}
