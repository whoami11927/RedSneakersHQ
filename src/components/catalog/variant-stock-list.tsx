"use client";

import { useLiveStock } from "@/lib/stock/use-live-stock";
import type { CatalogProduct, CatalogStock } from "@/lib/catalog/queries";
import { useCart } from "@/components/cart/cart-provider";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

export function VariantStockList({
  productName,
  variants,
  initialStock,
}: {
  productName: string;
  variants: CatalogProduct["variants"];
  initialStock: CatalogStock[];
}) {
  const { stock, liveStatus } = useLiveStock(initialStock);
  const { addLine } = useCart();

  if (variants.length === 0) {
    return <p className="text-sm text-muted-foreground">Varian produk belum tersedia.</p>;
  }

  return (
    <div className="space-y-3">
      <p role="status" className="text-xs text-muted-foreground">
        {liveStatus === "connected" ? "Stok diperbarui langsung." : liveStatus === "disconnected" ? "Pembaruan stok langsung tidak tersedia." : "Memuat pembaruan stok..."}
      </p>
      <ul className="divide-y divide-border border-y border-border">
        {variants.map((variant) => {
          const storeQty = stock.find((row) => row.variant_id === variant.id && row.location_code === "STORE")?.available_qty ?? 0;
          const onlineQty = stock.find((row) => row.variant_id === variant.id && row.location_code === "ONLINE")?.available_qty ?? 0;
          return (
            <li key={variant.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="font-semibold">Ukuran {variant.size} <span className="font-normal text-muted-foreground">/ {variant.color}</span></p>
                <p className="font-mono text-xs text-muted-foreground">{variant.sku}</p>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span>Online: <strong>{onlineQty}</strong></span>
                <span>Toko: <strong>{storeQty}</strong></span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
                <p className="font-semibold">{formatCurrency(variant.price)}</p>
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={onlineQty < 1}
                  onClick={() => addLine({
                    variantId: variant.id,
                    productId: variant.product_id,
                    productName,
                    variantLabel: `${variant.size} / ${variant.color}`,
                    sku: variant.sku,
                    unitPrice: variant.price,
                    imageUrl: variant.image_url,
                  }, onlineQty)}
                >
                  {onlineQty < 1 ? "Stok online habis" : "Tambah ke keranjang"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
