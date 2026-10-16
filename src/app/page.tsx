import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogFiltersForm } from "@/components/catalog/catalog-filters";
import { CatalogGrid } from "@/components/catalog/catalog-grid";
import { StatusPanel } from "@/components/status-panel";
import { getCatalog } from "@/lib/catalog/queries";
import { getPublicSupabaseEnvironment } from "@/lib/supabase/env";
import { catalogFiltersSchema } from "@/lib/validators/catalog";

export const metadata: Metadata = { title: "Katalog Sneakers" };

type HomeProps = {
  searchParams: Promise<{ q?: string; brand?: string }>;
};

export default function Home({ searchParams }: HomeProps) {
  if (!getPublicSupabaseEnvironment()) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel
          title="Katalog belum terhubung"
          message="Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di .env.local, lalu jalankan migrasi serta seed database. Katalog akan tampil setelah koneksi aktif."
        />
      </main>
    );
  }

  return (
    <Suspense fallback={<CatalogLoading />}>
      <CatalogContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CatalogContent({ searchParams }: HomeProps) {
  const params = await searchParams;
  const parsedFilters = catalogFiltersSchema.safeParse({
    q: params.q,
    brand: params.brand || undefined,
  });
  if (!parsedFilters.success) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Filter tidak valid" message="Kata kunci terlalu panjang atau merek tidak dikenal. Hapus filter untuk menampilkan katalog." actionHref="/" actionLabel="Hapus filter" />
      </main>
    );
  }

  const filters = parsedFilters.data;
  const catalog = await getCatalog(filters);
  if (catalog.status === "error") {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Katalog tidak tersedia" message={catalog.message} actionHref="/" actionLabel="Coba lagi" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
      <section className="relative my-6 overflow-hidden bg-foreground px-5 py-10 text-background sm:my-10 sm:px-10 sm:py-14">
        <div aria-hidden="true" className="absolute -right-12 -top-14 size-64 rotate-12 border-[28px] border-primary/70 sm:right-8 sm:top-[-5rem] sm:size-80" />
        <div className="relative max-w-2xl">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground">Red Sneakers HQ / Jakarta</p>
          <h1 className="mt-4 font-heading text-5xl font-bold uppercase leading-[0.9] tracking-tight sm:text-7xl">
            Dibuat untuk<br />bergerak.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-background/80 sm:text-base">
            Temukan pasangan berikutnya. Cek ukuran, warna, dan stok terbaru untuk toko maupun pengiriman online.
          </p>
        </div>
      </section>
      <section className="space-y-5" aria-labelledby="catalog-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Pilihan Red Sneakers</p>
            <h2 id="catalog-heading" className="mt-1 font-heading text-4xl font-bold uppercase">Katalog terbaru</h2>
          </div>
        </div>
        <CatalogFiltersForm brands={catalog.brands} filters={filters} />
        <CatalogGrid products={catalog.products} initialStock={catalog.stock} />
      </section>
    </main>
  );
}

function CatalogLoading() {
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="h-48 animate-pulse bg-secondary sm:h-64" />
      <div className="h-20 animate-pulse border border-border bg-card" />
      <p className="text-sm text-muted-foreground">Memuat katalog...</p>
    </main>
  );
}
