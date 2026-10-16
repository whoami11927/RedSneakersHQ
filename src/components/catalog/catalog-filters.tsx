import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import type { CatalogFilters } from "@/lib/validators/catalog";

type BrandOption = { id: string; name: string };

export function CatalogFiltersForm({
  brands,
  filters,
}: {
  brands: BrandOption[];
  filters: CatalogFilters;
}) {
  return (
    <form action="/" className="grid gap-3 border border-border bg-card p-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(10rem,0.5fr)_auto] sm:items-end">
      <div className="space-y-1.5">
        <label htmlFor="catalog-search" className="text-xs font-semibold uppercase tracking-wide">Cari sneaker</label>
        <Input id="catalog-search" name="q" type="search" placeholder="Nama model" defaultValue={filters.q} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="catalog-brand" className="text-xs font-semibold uppercase tracking-wide">Merek</label>
        <select
          id="catalog-brand"
          name="brand"
          defaultValue={filters.brand ?? ""}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <option value="">Semua merek</option>
          {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1 sm:flex-none">Terapkan</Button>
        <Button variant="outline" render={<Link href="/" />}>
          Reset
        </Button>
      </div>
    </form>
  );
}
