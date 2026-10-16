"use client";

import { useActionState } from "react";
import {
  createPreorderBatchAction,
  receivePreorderBatchAction,
  setPreorderBatchStatusAction,
  type PreorderAdminActionState,
} from "@/app/admin/preorders/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";

type VariantOption = {
  id: string;
  sku: string;
  size: string;
  color: string;
  product_name: string;
};

type BatchRow = Database["public"]["Tables"]["preorder_batches"]["Row"];

function ActionFeedback({ state }: { state: PreorderAdminActionState }) {
  if (state.error) return <p role="alert" className="text-sm font-medium text-destructive">{state.error}</p>;
  if (state.success) return <p role="status" className="text-sm font-medium">{state.success}</p>;
  return null;
}

export function CreatePreorderBatchForm({ variants }: { variants: VariantOption[] }) {
  const [state, action, pending] = useActionState(createPreorderBatchAction, {});
  if (variants.length === 0) {
    return <p className="text-sm text-muted-foreground">Tambahkan produk dan varian aktif sebelum membuat batch.</p>;
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="preorder-variant">Varian</Label>
          <select id="preorder-variant" name="variantId" required className="min-h-11 w-full border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.product_name} · {variant.size} / {variant.color} · {variant.sku}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="preorder-name">Nama batch</Label>
          <Input id="preorder-name" name="name" required minLength={3} maxLength={120} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="preorder-quota">Kuota</Label>
          <Input id="preorder-quota" name="quota" type="number" min={1} max={100000} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="preorder-price">Harga per pasang (Rp)</Label>
          <Input id="preorder-price" name="price" type="number" min={1} max={100000000} step={1} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="preorder-opens">Mulai dibuka (WIB)</Label>
          <Input id="preorder-opens" name="opensAt" type="datetime-local" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="preorder-closes">Batas pemesanan (WIB)</Label>
          <Input id="preorder-closes" name="closesAt" type="datetime-local" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="preorder-arrival">Perkiraan barang tiba</Label>
          <Input id="preorder-arrival" name="estimatedArrival" type="date" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="preorder-plan">Skema pembayaran</Label>
          <select id="preorder-plan" name="paymentPlan" className="min-h-11 w-full border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <option value="deposit">DP lalu pelunasan</option>
            <option value="full">Pembayaran penuh</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="preorder-deposit-percent">Persentase DP</Label>
          <Input id="preorder-deposit-percent" name="depositPercent" type="number" min={1} max={99} step={1} placeholder="Kosongkan untuk pembayaran penuh" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="preorder-initial-status">Status awal</Label>
          <select id="preorder-initial-status" name="status" className="min-h-11 w-full border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <option value="draft">Draft</option>
            <option value="open">Buka sesuai periode</option>
          </select>
        </div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Waktu batch dicatat dalam WIB. DP dihitung di database dari harga batch, bukan dari nilai formulir pelanggan.
      </p>
      <ActionFeedback state={state} />
      <Button type="submit" disabled={pending}>{pending ? "Membuat batch..." : "Buat batch pre-order"}</Button>
    </form>
  );
}

export function PreorderBatchStatusForm({ batch }: { batch: BatchRow }) {
  const [state, action, pending] = useActionState(setPreorderBatchStatusAction, {});
  const nextStatus = batch.status === "open" ? "closed" : "open";
  if (batch.status === "received" || batch.status === "cancelled") return null;

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="batchId" value={batch.id} />
      <input type="hidden" name="status" value={nextStatus} />
      <ActionFeedback state={state} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Memperbarui..." : batch.status === "open" ? "Tutup pemesanan" : "Buka pemesanan"}
      </Button>
    </form>
  );
}

export function ReceivePreorderBatchForm({ batch }: { batch: BatchRow }) {
  const [state, action, pending] = useActionState(receivePreorderBatchAction, {});
  if (batch.status === "received" || batch.status === "cancelled") return null;

  return (
    <form action={action} className="space-y-3 border-t border-border pt-4">
      <h3 className="font-heading text-lg font-bold uppercase">Catat barang tiba</h3>
      {batch.reserved_quantity > 0 ? (
        <p className="text-sm text-muted-foreground">
          Ada {batch.reserved_quantity} unit dalam reservasi pembayaran. Tunggu sampai pembayaran selesai atau reservasi kedaluwarsa.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Minimal diterima {batch.ordered_quantity} unit untuk memenuhi pre-order yang sudah dibayar.
          </p>
          <input type="hidden" name="batchId" value={batch.id} />
          <div className="space-y-2">
            <Label htmlFor={`receipt-quantity-${batch.id}`}>Jumlah diterima</Label>
            <Input
              id={`receipt-quantity-${batch.id}`}
              name="receivedQuantity"
              type="number"
              min={Math.max(1, batch.ordered_quantity)}
              max={100000}
              defaultValue={Math.max(1, batch.ordered_quantity)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`receipt-note-${batch.id}`}>Catatan penerimaan (opsional)</Label>
            <Input id={`receipt-note-${batch.id}`} name="note" maxLength={500} />
          </div>
        </>
      )}
      <ActionFeedback state={state} />
      {batch.reserved_quantity === 0 && (
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Mencatat penerimaan..." : "Terima barang dan alokasikan"}
        </Button>
      )}
    </form>
  );
}

export function PreorderBatchSummary({
  batch,
}: {
  batch: BatchRow & { product_name: string; variant_label: string };
}) {
  const available = batch.quota - batch.reserved_quantity - batch.ordered_quantity;
  const statusLabel: Record<BatchRow["status"], string> = {
    draft: "Draft",
    open: "Terbuka",
    closed: "Ditutup",
    received: "Barang diterima",
    cancelled: "Dibatalkan",
  };

  return (
    <section className="space-y-4 border border-border bg-card p-4 sm:p-5" aria-labelledby={`batch-${batch.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <h2 id={`batch-${batch.id}`} className="font-heading text-2xl font-bold uppercase">{batch.name}</h2>
          <p className="mt-1 text-sm">{batch.product_name} · {batch.variant_label}</p>
          <p className="mt-1 text-xs text-muted-foreground">Tiba sekitar {batch.estimated_arrival}</p>
        </div>
        <span className="border border-border px-2 py-1 text-xs font-semibold">{statusLabel[batch.status]}</span>
      </header>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-muted-foreground">Harga batch</dt><dd className="mt-1 font-semibold">{formatCurrency(Number(batch.price))}</dd></div>
        <div><dt className="text-muted-foreground">Kuota tersisa</dt><dd className="mt-1 font-mono">{available}</dd></div>
        <div><dt className="text-muted-foreground">DP</dt><dd className="mt-1">{batch.payment_plan === "full" ? "Pembayaran penuh" : `${batch.deposit_percent}%`}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span>{batch.reserved_quantity} menunggu pembayaran</span>
        <span>{batch.ordered_quantity} sudah dibayar</span>
        <span>{batch.received_quantity} diterima</span>
      </div>
      <PreorderBatchStatusForm batch={batch} />
      <ReceivePreorderBatchForm batch={batch} />
    </section>
  );
}
