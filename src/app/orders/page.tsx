import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StatusPanel } from "@/components/status-panel";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, orderStatusLabel, paymentStatusLabel } from "@/lib/orders/labels";
import { listOrdersForViewer } from "@/lib/orders/queries";
import { formatCurrency } from "@/lib/format";
import { getViewerState } from "@/lib/supabase/viewer";

export const metadata: Metadata = { title: "Pesanan saya" };

export const instant = false;

export default async function OrdersPage() {
  const viewer = await getViewerState();
  if (viewer.status === "signed_out") redirect("/login?next=%2Forders");
  if (viewer.status !== "signed_in") {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel
          title="Sesi tidak tersedia"
          message="Sesi akun tidak dapat diperiksa. Masuk kembali untuk melihat pesanan."
          actionHref="/login"
          actionLabel="Masuk"
        />
      </main>
    );
  }

  const result = await listOrdersForViewer();
  if (result.status === "unauthenticated") redirect("/login?next=%2Forders");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Red Sneakers HQ / Pesanan
          </p>
          <h1 className="mt-2 font-heading text-5xl font-bold uppercase leading-none sm:text-6xl">
            Pesanan
          </h1>
        </div>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 hover:text-primary"
        >
          Kembali ke katalog
        </Link>
      </div>

      {result.status === "error" ? (
        <StatusPanel
          title="Daftar pesanan tidak tersedia"
          message={result.message}
          actionHref="/orders"
          actionLabel="Muat ulang"
        />
      ) : result.orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Belum ada pesanan. Pilih sepatu di katalog lalu lakukan checkout untuk melihat pesanan
          Anda di sini.
        </p>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Daftar pesanan beserta status dan totalnya</caption>
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Nomor</th>
                <th scope="col" className="px-3 py-2 font-medium">Tanggal</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 font-medium">Pembayaran</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {result.orders.map((order) => (
                <tr key={order.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link
                      className="font-medium underline underline-offset-4 hover:text-primary"
                      href={`/orders/${encodeURIComponent(order.order_number)}`}
                    >
                      {order.order_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{formatDateTime(order.created_at)}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={order.status === "pending_payment" ? "secondary" : "default"}
                    >
                      {orderStatusLabel(order.status)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {paymentStatusLabel(order.payment?.status ?? null)}
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(Number(order.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
