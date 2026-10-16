"use client";

import Image from "next/image";
import Link from "next/link";
import { Footprints } from "lucide-react";
import { useLiveStock } from "@/lib/stock/use-live-stock";
import type { CatalogProduct, CatalogStock } from "@/lib/catalog/queries";
import { formatCurrency } from "@/lib/format";

export function CatalogGrid({
  products,
  initialStock,
}: {
  products: CatalogProduct[];
  initialStock: CatalogStock[];
}) {
  const { stock, liveStatus } = useLiveStock(initialStock);

  if (products.length === 0) {
    return (
      <div className="border border-dashed border-border bg-card px-6 py-14 text-center">
        <h2 className="font-heading text-2xl font-semibold uppercase">Belum ada sneaker di sini</h2>
        <p className="mt-2 text-sm text-muted-foreground">Coba kata kunci atau merek lain.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{products.length} model ditampilkan</p>
        <p role="status" className="text-xs text-muted-foreground">
          <span aria-hidden="true" className={`mr-2 inline-block size-2 rounded-full ${liveStatus === "connected" ? "bg-emerald-600" : liveStatus === "disconnected" ? "bg-destructive" : "bg-muted-foreground"}`} />
          {liveStatus === "connected" ? "Stok diperbarui langsung" : liveStatus === "disconnected" ? "Pembaruan stok langsung tidak tersedia" : "Menghubungkan stok langsung..."}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => {
          const available = product.variants.reduce(
            (total, variant) =>
              total +
              stock
                .filter((level) => level.variant_id === variant.id)
                .reduce((sum, level) => sum + level.available_qty, 0),
            0,
          );
          const fromPrice = product.variants.length
            ? Math.min(...product.variants.map((variant) => variant.price))
            : null;
          const image = product.variants.find((variant) => variant.image_url)?.image_url;

          return (
            <article key={product.id} className="group overflow-hidden border border-border bg-card">
              <Link href={`/products/${product.slug}`} className="block focus-visible:outline-offset-[-4px]">
                <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
                  {image ? (
                    <Image
                      src={image}
                      alt={`${product.name}, tampak produk`}
                      width={720}
                      height={540}
                      unoptimized
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-primary/70">
                      <Footprints aria-hidden="true" className="size-20 stroke-[1.25]" />
                    </div>
                  )}
                  <span className="absolute left-3 top-3 bg-background/95 px-2.5 py-1 font-mono text-xs uppercase">
                    {product.brand_name ?? "Red Sneakers"}
                  </span>
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <h2 className="font-heading text-2xl font-semibold uppercase leading-tight group-hover:text-primary">
                      {product.name}
                    </h2>
                    {product.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
                    )}
                  </div>
                  <div className="flex items-end justify-between gap-3 border-t border-border pt-3">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Mulai dari</p>
                      <p className="font-semibold">{fromPrice === null ? "Harga belum tersedia" : formatCurrency(fromPrice)}</p>
                    </div>
                    <p className={`text-right text-xs font-semibold ${available > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                      {available > 0 ? `${available} pasang tersedia` : "Stok habis"}
                    </p>
                  </div>
                </div>
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
