"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { recordOfflineSaleAction } from "@/app/admin/pos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLiveStock } from "@/lib/stock/use-live-stock";
import type { CatalogStock } from "@/lib/catalog/queries";
import { formatCurrency } from "@/lib/format";

type StoreOption = { id: string; name: string; address: string };
type VariantOption = {
  id: string;
  product_name: string;
  sku: string;
  size: string;
  color: string;
  price: number;
};
type PaymentMethod = "cash" | "card" | "bank_transfer" | "qris";
type SaleLine = { variantId: string; quantity: number };
type Receipt = { orderNumber: string; total: number; itemCount: number };

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Tunai" },
  { value: "card", label: "Kartu" },
  { value: "bank_transfer", label: "Transfer bank" },
  { value: "qris", label: "QRIS" },
];

export function PosSaleForm({
  stores,
  variants,
  initialStock,
}: {
  stores: StoreOption[];
  variants: VariantOption[];
  initialStock: CatalogStock[];
}) {
  const router = useRouter();
  const { stock, liveStatus } = useLiveStock(initialStock);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState(variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [storeLocationId, setStoreLocationId] = useState(stores[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [error, setError] = useState<string>();
  const [receipt, setReceipt] = useState<Receipt>();
  const [pending, startTransition] = useTransition();
  const requestId = useRef<string | undefined>(undefined);
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const selectedVariant = variantById.get(selectedVariantId);
  const selectedAvailable = stock.find(
    (row) => row.variant_id === selectedVariantId && row.location_code === "STORE",
  )?.available_qty ?? 0;

  function addLine() {
    setError(undefined);
    if (!selectedVariant || !Number.isInteger(quantity) || quantity < 1) {
      setError("Pilih varian dan jumlah yang valid.");
      return;
    }
    const existingQuantity = lines.find((line) => line.variantId === selectedVariant.id)?.quantity ?? 0;
    if (existingQuantity + quantity > selectedAvailable) {
      setError(`Stok toko untuk ${selectedVariant.sku} hanya ${selectedAvailable} pasang tersedia.`);
      return;
    }
    setLines((current) => {
      const existing = current.find((line) => line.variantId === selectedVariant.id);
      return existing
        ? current.map((line) => line.variantId === selectedVariant.id
          ? { ...line, quantity: line.quantity + quantity }
          : line)
        : [...current, { variantId: selectedVariant.id, quantity }];
    });
  }

  function updateQuantity(variantId: string, nextQuantity: number) {
    setError(undefined);
    const available = stock.find(
      (row) => row.variant_id === variantId && row.location_code === "STORE",
    )?.available_qty ?? 0;
    if (!Number.isInteger(nextQuantity) || nextQuantity < 1 || nextQuantity > available) {
      setError(`Jumlah tidak boleh melebihi ${available} pasang stok toko yang tersedia.`);
      return;
    }
    setLines((current) => current.map((line) => line.variantId === variantId
      ? { ...line, quantity: nextQuantity }
      : line));
  }

  function submitSale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setReceipt(undefined);
    if (!storeLocationId) {
      setError("Pilih lokasi toko untuk transaksi ini.");
      return;
    }
    if (!lines.length) {
      setError("Tambahkan minimal satu varian ke transaksi.");
      return;
    }
    const stockChanged = lines.some((line) => {
      const available = stock.find(
        (row) => row.variant_id === line.variantId && row.location_code === "STORE",
      )?.available_qty ?? 0;
      return line.quantity > available;
    });
    if (stockChanged) {
      setError("Stok berubah dan tidak lagi mencukupi. Perbarui jumlah sebelum menyimpan.");
      return;
    }

    const saleRequestId = requestId.current ?? crypto.randomUUID();
    requestId.current = saleRequestId;
    startTransition(async () => {
      try {
        const result = await recordOfflineSaleAction({
          requestId: saleRequestId,
          storeLocationId,
          paymentMethod,
          items: lines,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setReceipt({
          orderNumber: result.orderNumber,
          total: result.total,
          itemCount: result.itemCount,
        });
        setLines([]);
        requestId.current = undefined;
        router.refresh();
      } catch (actionError: unknown) {
        console.error("POS sale submission failed:", actionError);
        setError("Transaksi belum dapat dipastikan. Periksa riwayat sebelum mengulang.");
      }
    });
  }

  const hasInvalidLiveStock = lines.some((line) => {
    const available = stock.find(
      (row) => row.variant_id === line.variantId && row.location_code === "STORE",
    )?.available_qty ?? 0;
    return line.quantity > available;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <p className="text-sm">
          Stok toko: {liveStatus === "connected" ? "terhubung realtime" :
            liveStatus === "connecting" ? "menghubungkan..." : "koneksi realtime terputus"}
        </p>
        {liveStatus === "disconnected" && (
          <Button type="button" size="sm" variant="outline" onClick={() => router.refresh()}>
            Muat ulang stok
          </Button>
        )}
      </div>

      {stores.length === 0 || variants.length === 0 ? (
        <p className="border border-dashed border-border p-5 text-sm text-muted-foreground">
          {stores.length === 0
            ? "Tidak ada lokasi toko aktif. Minta admin mengaktifkan lokasi sebelum berjualan."
            : "Belum ada varian produk aktif untuk transaksi."}
        </p>
      ) : (
        <>
          <form className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto]" onSubmit={(event) => {
            event.preventDefault();
            addLine();
          }}>
            <div className="space-y-2">
              <Label htmlFor="pos-variant">Varian</Label>
              <select
                id="pos-variant"
                value={selectedVariantId}
                onChange={(event) => setSelectedVariantId(event.target.value)}
                className="min-h-11 w-full border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {variants.map((variant) => {
                  const available = stock.find(
                    (row) => row.variant_id === variant.id && row.location_code === "STORE",
                  )?.available_qty ?? 0;
                  return (
                    <option key={variant.id} value={variant.id}>
                      {variant.product_name} · {variant.size} / {variant.color} · {variant.sku} · {available} tersedia
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pos-quantity">Jumlah</Label>
              <Input
                id="pos-quantity"
                type="number"
                min={1}
                max={Math.max(1, selectedAvailable)}
                value={quantity}
                onChange={(event) => setQuantity(event.currentTarget.valueAsNumber)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" variant="outline" disabled={!selectedVariant || selectedAvailable < 1}>
                Tambah varian
              </Button>
            </div>
          </form>

          {lines.length > 0 && (
            <div className="overflow-x-auto border border-border">
              <table className="w-full min-w-[42rem] text-sm">
                <caption className="sr-only">Rincian barang untuk transaksi POS saat ini</caption>
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Varian</th>
                    <th scope="col" className="px-3 py-2 font-medium">Harga satuan</th>
                    <th scope="col" className="px-3 py-2 font-medium">Jumlah</th>
                    <th scope="col" className="px-3 py-2 font-medium">Stok toko</th>
                    <th scope="col" className="px-3 py-2 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const variant = variantById.get(line.variantId);
                    if (!variant) return null;
                    const available = stock.find(
                      (row) => row.variant_id === line.variantId && row.location_code === "STORE",
                    )?.available_qty ?? 0;
                    return (
                      <tr key={line.variantId} className="border-t border-border">
                        <td className="px-3 py-3">
                          {variant.product_name} · {variant.size} / {variant.color}
                          <span className="block font-mono text-xs text-muted-foreground">{variant.sku}</span>
                        </td>
                        <td className="px-3 py-3">{formatCurrency(variant.price)}</td>
                        <td className="px-3 py-3">
                          <Input
                            aria-label={`Jumlah ${variant.product_name} ${variant.size} ${variant.color}`}
                            type="number"
                            min={1}
                            max={Math.max(1, available)}
                            value={line.quantity}
                            onChange={(event) => updateQuantity(line.variantId, event.currentTarget.valueAsNumber)}
                            className="w-24"
                          />
                        </td>
                        <td className="px-3 py-3">{available} tersedia</td>
                        <td className="px-3 py-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setLines((current) => current.filter((item) => item.variantId !== line.variantId))}
                          >
                            Hapus
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <form className="space-y-5 border-t border-border pt-5" onSubmit={submitSale}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pos-store">Lokasi toko</Label>
                <select
                  id="pos-store"
                  required
                  value={storeLocationId}
                  onChange={(event) => setStoreLocationId(event.target.value)}
                  className="min-h-11 w-full border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>{store.name} · {store.address}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pos-payment-method">Metode pembayaran</Label>
                <select
                  id="pos-payment-method"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                  className="min-h-11 w-full border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method.value} value={method.value}>{method.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Harga akhir dan ketersediaan dikunci ulang di database. Stok hanya berkurang jika seluruh item berhasil disimpan.
            </p>
            {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
            {receipt && (
              <div role="status" className="space-y-1 border border-border bg-muted/30 p-4 text-sm">
                <p className="font-semibold">Penjualan tercatat · {receipt.orderNumber}</p>
                <p>{receipt.itemCount} varian · {formatCurrency(receipt.total)}</p>
              </div>
            )}
            <Button
              type="submit"
              disabled={pending || !lines.length || !storeLocationId || hasInvalidLiveStock}
            >
              {pending ? "Mencatat penjualan..." : "Selesaikan penjualan"}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
