import type { Metadata } from "next";
import Link from "next/link";
import { StatusPanel } from "@/components/status-panel";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { formatDate, formatDateTime } from "@/lib/orders/labels";
import { getPublicSupabaseEnvironment } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/viewer";

export const metadata: Metadata = { title: "Laporan admin" };
export const instant = false;

export default async function AdminDashboardPage() {
  if (!getPublicSupabaseEnvironment()) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Dashboard belum terhubung" message="Konfigurasikan Supabase untuk memuat laporan operasional." actionHref="/login" actionLabel="Masuk" />
      </main>
    );
  }

  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const [salesResult, variantResult, stockResult, batchResult] = await Promise.all([
    supabase.rpc("get_admin_sales_summary", { p_days: 30 }),
    supabase.from("product_variants")
      .select("id, product_id, sku, size, color, low_stock_threshold")
      .eq("is_active", true)
      .order("sku"),
    supabase.from("stock_levels").select("variant_id, location_code, available_qty"),
    supabase.rpc("get_admin_active_preorder_batches"),
  ]);
  const queryError = salesResult.error ?? variantResult.error ?? stockResult.error ?? batchResult.error;
  if (queryError) {
    console.error("Admin dashboard query failed:", queryError.message);
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Laporan tidak tersedia" message="Ringkasan pembayaran, stok, atau preorder gagal dimuat. Muat ulang untuk mencoba kembali." actionHref="/admin" actionLabel="Coba lagi" />
      </main>
    );
  }

  const variants = variantResult.data ?? [];
  const variantIds = variants.map((variant) => variant.id);
  const productIds = [...new Set(variants.map((variant) => variant.product_id))];
  const productResult = productIds.length
    ? await supabase.from("products").select("id, name").in("id", productIds)
    : { data: [], error: null };
  if (productResult.error) {
    console.error("Admin dashboard product query failed:", productResult.error.message);
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Daftar produk belum tersedia" message="Nama produk untuk laporan stok gagal dimuat." actionHref="/admin" actionLabel="Coba lagi" />
      </main>
    );
  }

  const productById = new Map((productResult.data ?? []).map((product) => [product.id, product.name]));
  const stockByKey = new Map(
    (stockResult.data ?? []).map((row) => [`${row.variant_id}:${row.location_code}`, row.available_qty]),
  );
  const lowStock = variants.flatMap((variant) => (
    (["STORE", "ONLINE"] as const)
      .map((location) => ({
        id: `${variant.id}:${location}`,
        productName: productById.get(variant.product_id) ?? "Produk tidak dikenal",
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        location,
        available: stockByKey.get(`${variant.id}:${location}`) ?? 0,
        threshold: variant.low_stock_threshold,
      }))
      .filter((row) => row.available <= row.threshold)
  ));
  const sales = salesResult.data ?? [];
  const onlineSales = sales.find((row) => row.provider === "midtrans");
  const offlineSales = sales.find((row) => row.provider === "offline");
  const batches = batchResult.data ?? [];
  const batchVariantIds = [...new Set(batches.map((batch) => batch.variant_id))];
  const batchVariantResult = batchVariantIds.length
    ? await supabase.from("product_variants").select("id, product_id, sku, size, color").in("id", batchVariantIds)
    : { data: [], error: null };
  if (batchVariantResult.error) {
    console.error("Admin dashboard preorder variant query failed:", batchVariantResult.error.message);
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Daftar preorder belum tersedia" message="Informasi varian untuk batch aktif gagal dimuat." actionHref="/admin" actionLabel="Coba lagi" />
      </main>
    );
  }
  const batchVariantById = new Map((batchVariantResult.data ?? []).map((variant) => [variant.id, variant]));
  const activeBatches = batches
    .map((batch) => {
      const variant = batchVariantById.get(batch.variant_id);
      return {
        ...batch,
        variantLabel: variant
          ? `${variant.sku} · ${variant.size} / ${variant.color}`
          : "Varian tidak ditemukan",
        productName: variant
          ? productById.get(variant.product_id) ?? "Produk tidak dikenal"
          : "Produk tidak dikenal",
        remaining: batch.quota - batch.reserved_quantity - batch.ordered_quantity,
      };
    })
    .filter((batch) => batch.remaining > 0);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-9 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Operasional / Admin</p>
          <h1 className="mt-2 font-heading text-5xl font-bold uppercase leading-none sm:text-6xl">Laporan toko</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Pembayaran settlement 30 hari terakhir; transaksi refund tidak dihitung.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/admin/orders" className="underline underline-offset-4 hover:text-primary">Pesanan</Link>
          <Link href="/admin/pos" className="underline underline-offset-4 hover:text-primary">Buka POS</Link>
          <Link href="/admin/products" className="underline underline-offset-4 hover:text-primary">Kelola produk</Link>
        </div>
      </header>

      <section aria-labelledby="sales-summary-heading" className="max-w-4xl">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Nilai pembayaran yang diterima</p>
            <h2 id="sales-summary-heading" className="font-heading text-3xl font-bold uppercase">Online vs toko</h2>
          </div>
          <Link href="/admin/reports/export?days=30" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 hover:text-primary">
            Ekspor CSV · 30 hari
          </Link>
        </div>
        <div className="overflow-x-auto border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Ringkasan pembayaran online dan toko fisik dalam 30 hari terakhir</caption>
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Kanal</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Transaksi lunas</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Nilai diterima</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <th scope="row" className="px-3 py-3 font-medium">Online · Midtrans</th>
                <td className="px-3 py-3 text-right">{onlineSales?.payment_count ?? 0}</td>
                <td className="px-3 py-3 text-right font-semibold">{formatCurrency(Number(onlineSales?.total_amount ?? 0))}</td>
              </tr>
              <tr className="border-t border-border">
                <th scope="row" className="px-3 py-3 font-medium">Toko fisik · POS</th>
                <td className="px-3 py-3 text-right">{offlineSales?.payment_count ?? 0}</td>
                <td className="px-3 py-3 text-right font-semibold">{formatCurrency(Number(offlineSales?.total_amount ?? 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="low-stock-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Berdasarkan ambang per varian</p>
            <h2 id="low-stock-heading" className="font-heading text-3xl font-bold uppercase">Stok perlu ditinjau</h2>
          </div>
          <Badge variant={lowStock.length ? "secondary" : "outline"}>{lowStock.length} lokasi stok</Badge>
        </div>
        {lowStock.length === 0 ? (
          <p className="border border-dashed border-border p-5 text-sm text-muted-foreground">
            Tidak ada saldo varian di bawah atau sama dengan ambang saat ini.
          </p>
        ) : (
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[38rem] text-sm">
              <caption className="sr-only">Varian dengan saldo yang mencapai ambang stok menipis</caption>
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Produk / SKU</th>
                  <th scope="col" className="px-3 py-2 font-medium">Lokasi</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Tersedia</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Ambang</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-3">
                      {row.productName} · {row.size} / {row.color}
                      <span className="block font-mono text-xs text-muted-foreground">{row.sku}</span>
                    </td>
                    <td className="px-3 py-3">{row.location === "STORE" ? "Toko" : "Online"}</td>
                    <td className="px-3 py-3 text-right font-semibold">{row.available}</td>
                    <td className="px-3 py-3 text-right">{row.threshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="active-batches-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Periode pemesanan masih berlangsung</p>
            <h2 id="active-batches-heading" className="font-heading text-3xl font-bold uppercase">Pre-order aktif</h2>
          </div>
          <Link href="/admin/preorders" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 hover:text-primary">
            Kelola batch
          </Link>
        </div>
        {activeBatches.length === 0 ? (
          <p className="border border-dashed border-border p-5 text-sm text-muted-foreground">
            Tidak ada batch aktif dengan kuota tersisa saat ini.
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {activeBatches.map((batch) => (
              <li key={batch.id} className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2 py-4">
                <div>
                  <p className="font-semibold">{batch.name} · {batch.productName}</p>
                  <p className="text-sm text-muted-foreground">{batch.variantLabel} · tutup {formatDateTime(batch.closes_at)}</p>
                </div>
                <p className="text-sm">{batch.remaining} kuota · estimasi tiba {formatDate(batch.estimated_arrival)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-muted-foreground">Varian yang dipantau: {variantIds.length}.</p>
    </main>
  );
}
