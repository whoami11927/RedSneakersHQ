import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SnapPaymentButton } from "@/components/payment/snap-payment-button";
import { StatusPanel } from "@/components/status-panel";
import { Badge } from "@/components/ui/badge";
import {
  formatDateTime,
  orderStatusLabel,
  paymentStatusLabel,
} from "@/lib/orders/labels";
import { readShippingDetails } from "@/lib/orders/shipping-details";
import { getOrderByNumber } from "@/lib/orders/queries";
import { formatCurrency } from "@/lib/format";
import { getViewerState } from "@/lib/supabase/viewer";

export const metadata: Metadata = { title: "Pesanan" };

// Halaman ini membaca sesi pengguna dan `params` rute dinamis, sehingga navigasinya tidak
// bisa instan. Dinyatakan eksplisit agar validasi Cache Components tidak gagal saat build.
export const instant = false;

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;

  const viewer = await getViewerState();
  if (viewer.status === "signed_out") redirect(`/login?next=%2Forders%2F${orderNumber}`);
  if (viewer.status !== "signed_in") {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel
          title="Sesi tidak tersedia"
          message="Sesi akun tidak dapat diperiksa. Masuk kembali untuk melihat pesanan."
          actionHref="/login"
          actionLabel="Masuk"
        />
      </main>
    );
  }

  const result = await getOrderByNumber(orderNumber);
  if (result.status === "unauthenticated") redirect(`/login?next=%2Forders%2F${orderNumber}`);
  if (result.status === "not_found") notFound();
  if (result.status === "error") {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel
          title="Pesanan tidak dapat dimuat"
          message={result.message}
          actionHref="/orders"
          actionLabel="Kembali ke daftar pesanan"
        />
      </main>
    );
  }

  const { order } = result;
  const isOwner = order.customer_id === viewer.userId;
  const preorderItems = order.items.filter((item) => item.preorder_batch_id !== null);
  const isPreorder = preorderItems.length > 0;
  const isFullPaymentPreorder = isPreorder
    && preorderItems.every((item) => Number(item.balance_amount ?? 0) === 0);
  const initialPaymentAmount = preorderItems.reduce(
    (total, item) => total + Number(item.deposit_amount ?? 0),
    0,
  ) + Number(order.shipping_fee);
  const balanceAmount = preorderItems.reduce(
    (total, item) => total + Number(item.balance_amount ?? 0),
    0,
  );
  const preorderStatusLabels = {
    awaiting_deposit: isFullPaymentPreorder ? "Menunggu pembayaran penuh" : "Menunggu DP",
    deposit_paid: "DP diterima",
    awaiting_arrival: "Menunggu barang tiba",
    awaiting_balance: "Menunggu pelunasan",
    ready: "Siap dikirim atau diambil",
    completed: "Selesai",
    cancelled: "Dibatalkan",
  } as const;
  const canPay = isOwner && !isPreorder && order.status === "pending_payment";
  const canPayPreorderInitial = isOwner && isPreorder
    && order.status === "pending_payment"
    && preorderItems.some((item) => item.preorder_status === "awaiting_deposit");
  const canPayPreorderBalance = isOwner && isPreorder
    && ["paid", "processing"].includes(order.status)
    && preorderItems.some((item) => item.preorder_status === "awaiting_balance");
  const shippingDetails = readShippingDetails(order.shipping_address_snapshot);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 border-b border-border pb-5">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Red Sneakers HQ / Pesanan
        </p>
        <h1 className="mt-2 font-heading text-4xl font-bold uppercase leading-none sm:text-5xl">
          {order.order_number}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Dibuat {formatDateTime(order.created_at)} ·{" "}
          {order.fulfillment_method === "shipping" ? "Pengiriman" : "Ambil di toko"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="items-heading" className="space-y-4">
          <h2 id="items-heading" className="font-heading text-2xl font-bold uppercase">
            Barang pesanan
          </h2>
          <div className="overflow-x-auto border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">Daftar barang pada pesanan {order.order_number}</caption>
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Barang</th>
                  <th scope="col" className="px-3 py-2 font-medium">SKU</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Jumlah</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Harga</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      {item.product_name_snapshot}
                      <span className="block text-xs text-muted-foreground">
                        {item.variant_label_snapshot}
                      </span>
                      {item.preorder_status && (
                        <span className="mt-1 block text-xs font-semibold">
                          Pre-order: {preorderStatusLabels[item.preorder_status]}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{item.sku_snapshot}</td>
                    <td className="px-3 py-2 text-right">{item.quantity}</td>
                    <td className="px-3 py-2 text-right">
                      {formatCurrency(Number(item.unit_price) * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section aria-labelledby="history-heading" className="space-y-3">
            <h2 id="history-heading" className="font-heading text-2xl font-bold uppercase">
              Riwayat status
            </h2>
            {order.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada perubahan status yang tercatat untuk pesanan ini.
              </p>
            ) : (
              <ol className="space-y-2">
                {order.history.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="font-medium">
                      {entry.old_status ? orderStatusLabel(entry.old_status) : "Pesanan dibuat"}
                      {" → "}
                      {orderStatusLabel(entry.new_status)}
                    </span>
                    <span className="text-muted-foreground">{formatDateTime(entry.changed_at)}</span>
                    {entry.note && <span className="text-muted-foreground">· {entry.note}</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </section>

        <aside
          className="space-y-4 border border-border bg-card p-4 sm:p-5"
          aria-labelledby="summary-heading"
        >
          <h2 id="summary-heading" className="font-heading text-2xl font-bold uppercase">
            Ringkasan
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={order.status === "pending_payment" ? "secondary" : "default"}>
              {orderStatusLabel(order.status)}
            </Badge>
            <Badge variant="outline">{paymentStatusLabel(order.payment?.status ?? null)}</Badge>
          </div>
          {isPreorder && (
            <dl className="space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Pembayaran awal</dt>
                <dd>{formatCurrency(initialPaymentAmount)}</dd>
              </div>
              {balanceAmount > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Pelunasan setelah barang tiba</dt>
                  <dd>{formatCurrency(balanceAmount)}</dd>
                </div>
              )}
            </dl>
          )}
          <dl className="space-y-1 border-t border-border pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{formatCurrency(Number(order.subtotal))}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Ongkos kirim</dt>
              <dd>{formatCurrency(Number(order.shipping_fee))}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
              <dt>Total</dt>
              <dd>{formatCurrency(Number(order.total))}</dd>
            </div>
          </dl>

          {canPay && (
            <div className="space-y-2 border-t border-border pt-4">
              <SnapPaymentButton orderId={order.id} amount={Number(order.total)} />
              <p className="text-sm text-muted-foreground">
                Stok ditahan sampai{" "}
                {formatDateTime(order.reservation_expires_at)}. Pesanan otomatis dibatalkan bila
                pembayaran tidak selesai sebelum batas tersebut.
              </p>
            </div>
          )}

          {canPayPreorderInitial && (
            <div className="space-y-2 border-t border-border pt-4">
              <SnapPaymentButton
                orderId={order.id}
                amount={initialPaymentAmount}
                purpose="preorder_deposit"
                label={isFullPaymentPreorder ? "Bayar penuh" : "Bayar DP"}
              />
              <p className="text-sm text-muted-foreground">
                Kuota dicadangkan sampai {formatDateTime(order.reservation_expires_at)}.
                Pesanan dibatalkan otomatis bila pembayaran awal tidak selesai.
              </p>
            </div>
          )}

          {canPayPreorderBalance && (
            <div className="space-y-2 border-t border-border pt-4">
              <SnapPaymentButton
                orderId={order.id}
                amount={balanceAmount}
                purpose="preorder_balance"
                label="Bayar pelunasan"
              />
              <p className="text-sm text-muted-foreground">
                Selesaikan pelunasan setelah barang diterima toko sebelum pesanan disiapkan untuk dikirim atau diambil.
              </p>
            </div>
          )}

          {order.status === "pending_payment" && !canPay && !canPayPreorderInitial && (
            <p className="border-t border-border pt-4 text-sm text-muted-foreground">
              {isPreorder
                ? "Batas waktu reservasi kuota pre-order sudah lewat. Buat pesanan baru bila batch masih terbuka."
                : "Batas waktu reservasi stok sudah lewat. Buat pesanan baru bila stok masih tersedia."}
            </p>
          )}

          {order.status === "paid" && !isPreorder && (
            <p className="border-t border-border pt-4 text-sm text-muted-foreground">
              Pembayaran diterima
              {order.payment?.paid_at ? ` ${formatDateTime(order.payment.paid_at)}` : ""}. Toko
              sedang menyiapkan pesanan.
            </p>
          )}

          {isPreorder && (
            <section className="space-y-2 border-t border-border pt-4" aria-labelledby="preorder-progress-heading">
              <h3 id="preorder-progress-heading" className="font-heading text-xl font-bold uppercase">Tahap pre-order</h3>
              {preorderItems.map((item) => (
                <p key={item.id} className="text-sm">
                  {item.product_name_snapshot} · {preorderStatusLabels[item.preorder_status ?? "awaiting_deposit"]}
                </p>
              ))}
            </section>
          )}

          {order.payments.length > 0 && (
            <section className="space-y-2 border-t border-border pt-4" aria-labelledby="payment-history-heading">
              <h3 id="payment-history-heading" className="font-heading text-xl font-bold uppercase">Riwayat pembayaran</h3>
              <ul className="space-y-2 text-sm">
                {order.payments.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                    <span>
                      {payment.purpose === "preorder_deposit" ? "DP / pembayaran awal" :
                        payment.purpose === "preorder_balance" ? "Pelunasan" : "Pembayaran"}
                      {" · "}{paymentStatusLabel(payment.status)}
                    </span>
                    <span>{formatCurrency(Number(payment.amount))}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {order.fulfillment_method === "shipping" ? (
            <dl className="space-y-1 border-t border-border pt-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Nomor resi</dt>
                <dd>{order.tracking_number ?? "Belum diisi toko"}</dd>
              </div>
              {shippingDetails && (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Zona</dt>
                    <dd>{shippingDetails.zoneName}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Jarak</dt>
                    <dd>{shippingDetails.distanceKm} km dari {shippingDetails.storeName}</dd>
                  </div>
                </>
              )}
            </dl>
          ) : (
            <p className="border-t border-border pt-4 text-sm text-muted-foreground">
              Pesanan diambil di toko. Toko akan memberi kabar saat pesanan siap diambil.
            </p>
          )}

          <Link
            href="/orders"
            className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 hover:text-primary"
          >
            Semua pesanan
          </Link>
        </aside>
      </div>
    </main>
  );
}
