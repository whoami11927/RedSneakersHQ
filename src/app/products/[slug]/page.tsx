import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { VariantStockList } from "@/components/catalog/variant-stock-list";
import { StatusPanel } from "@/components/status-panel";
import { Button } from "@/components/ui/button";
import { getProductBySlug } from "@/lib/catalog/queries";
import { formatCurrency } from "@/lib/format";
import { getPublicSupabaseEnvironment } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Detail produk" };

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export default function ProductPage({ params }: ProductPageProps) {
  if (!getPublicSupabaseEnvironment()) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Detail produk belum tersedia" message="Hubungkan Supabase dan muat data katalog untuk melihat detail produk." actionHref="/" actionLabel="Kembali ke katalog" />
      </main>
    );
  }

  return (
    <Suspense fallback={<ProductLoading />}>
      <ProductContent params={params} />
    </Suspense>
  );
}

async function ProductContent({ params }: ProductPageProps) {
  const { slug } = await params;
  const result = await getProductBySlug(slug);
  if (result.status === "not_found") notFound();
  if (result.status === "error") {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Detail tidak tersedia" message={result.message} actionHref="/" actionLabel="Kembali ke katalog" />
      </main>
    );
  }

  const product = result.product;
  const image = product.variants.find((variant) => variant.image_url);
  const price = product.variants.length ? Math.min(...product.variants.map((variant) => variant.price)) : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Button variant="ghost" className="-ml-2" render={<Link href="/" />}>
          ← Kembali ke katalog
        </Button>
      </div>
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
        <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
          {image?.image_url ? (
            <Image src={image.image_url} alt={`${product.name}, tampak produk`} width={1200} height={900} unoptimized className="size-full object-cover" priority />
          ) : (
            <div className="flex size-full items-center justify-center font-heading text-5xl font-bold uppercase text-primary/60 sm:text-7xl">
              RED SNEAKERS
            </div>
          )}
        </div>
        <section className="space-y-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{product.brand_name ?? "Red Sneakers HQ"}</p>
            <h1 className="mt-2 font-heading text-5xl font-bold uppercase leading-[0.95] sm:text-6xl">{product.name}</h1>
            {product.description && <p className="mt-4 max-w-prose text-sm leading-6 text-muted-foreground">{product.description}</p>}
          </div>
          <div className="border-y border-border py-4">
            <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Harga mulai dari</p>
            <p className="mt-1 text-2xl font-semibold">{price === null ? "Harga belum tersedia" : formatCurrency(price)}</p>
          </div>
          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-semibold uppercase">Pilih ukuran dan warna</h2>
            <p className="text-sm text-muted-foreground">Stok dipisahkan untuk kanal toko dan online, lalu diperbarui otomatis.</p>
            <VariantStockList productName={product.name} variants={product.variants} initialStock={result.stock} />
          </div>
        </section>
      </div>
    </main>
  );
}

function ProductLoading() {
  return (
    <main aria-busy="true" className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
      <div className="aspect-[4/3] animate-pulse bg-secondary" />
      <p className="text-sm text-muted-foreground">Memuat detail sneaker...</p>
    </main>
  );
}
