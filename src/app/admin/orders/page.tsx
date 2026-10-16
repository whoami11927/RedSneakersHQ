import type { Metadata } from "next";
import Link from "next/link";
import { OrderFulfillmentForm } from "@/components/admin/order-fulfillment-form";
import { StatusPanel } from "@/components/status-panel";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { formatDateTime, orderStatusLabel } from "@/lib/orders/labels";
import { getPublicSupabaseEnvironment } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/viewer";

export const metadata: Metadata = { title: "Operasional pesanan" };
export const instant = false;

export default async function AdminOrdersPage() {
  if (!getPublicSupabaseEnvironment()) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Pesanan belum terhubung" message="Konfigurasikan Supabase untuk mengelola pemenuhan pesanan." actionHref="/login" actionLabel="Masuk" />
      </main>
    );
  }

  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_number, status, fulfillment_method, total, created_at, tracking_number")
    .in("status", ["paid", "processing", "shipped", "ready_for_pickup"])
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) {
    console.error("Unable to load staff orders:", error.message);
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Daftar pesanan tidak tersedia" message="Pesanan operasional gagal dimuat. Muat ulang untuk mencoba kembali." actionHref="/admin/orders" actionLabel="Coba lagi" />
      </main>
    );
  }
  const orderIds = orders.map((order) => order.id);
  const { data: items, error: itemsError } = orderIds.length
    ? await supabase.from("order_items")
      .select("order_id, preorder_batch_id, preorder_status")
      .in("order_id", orderIds)
    : { data: [], error: null };
  if (itemsError) {
    console.error("Unable to load staff order items:", itemsError.message);
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Rincian pesanan tidak tersedia" message="Status preorder tidak dapat diverifikasi sebelum pemenuhan." actionHref="/admin/orders" actionLabel="Coba lagi" />
      </main>
    );
  }
  const preorderNotReadyOrderIds = new Set(
    items
      .filter((item) => item.preorder_batch_id !== null && item.preorder_status !== "ready")
      .map((item) => item.order_id),
  );
  const fulfillmentOrders = orders.filter((order) => !preorderNotReadyOrderIds.has(order.id));

  return (
    <main className="mx-auto w-full max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
      <header className="border-b border-border pb-5">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Operasional toko</p>
        <h1 className="mt-2 font-heading text-5xl font-bold uppercase leading-none sm:text-6xl">Pemenuhan pesanan</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Siapkan pesanan yang sudah dibayar, catat resi pengiriman, atau konfirmasi serah-terima pesanan pick-up.
        </p>
      </header>

      {fulfillmentOrders.length === 0 ? (
        <p className="border border-dashed border-border p-6 text-sm text-muted-foreground">
          Tidak ada pesanan yang menunggu tindakan staf saat ini.
        </p>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {fulfillmentOrders.map((order) => (
            <article key={order.id} className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_minmax(17rem,0.8fr)]">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/orders/${encodeURIComponent(order.order_number)}`}
                    className="font-mono text-sm font-semibold underline underline-offset-4 hover:text-primary"
                  >
                    {order.order_number}
                  </Link>
                  <Badge variant={order.status === "ready_for_pickup" ? "default" : "secondary"}>
                    {orderStatusLabel(order.status)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(order.created_at)} · {order.fulfillment_method === "pickup" ? "Ambil di toko" : "Pengiriman"}
                </p>
                <p className="font-semibold">{formatCurrency(Number(order.total))}</p>
                {order.tracking_number && (
                  <p className="text-sm text-muted-foreground">Resi: {order.tracking_number}</p>
                )}
              </div>
              <div className="md:justify-self-end">
                <OrderFulfillmentForm
                  orderId={order.id}
                  status={order.status}
                  fulfillmentMethod={order.fulfillment_method}
                  trackingNumber={order.tracking_number}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
