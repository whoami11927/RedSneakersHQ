import type { Metadata } from "next";
import { PosSaleForm } from "@/components/admin/pos-sale-form";
import { StatusPanel } from "@/components/status-panel";
import type { CatalogStock } from "@/lib/catalog/queries";
import { getPublicSupabaseEnvironment } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/viewer";

export const metadata: Metadata = { title: "POS toko" };
export const instant = false;

export default async function AdminPosPage() {
  if (!getPublicSupabaseEnvironment()) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="POS belum terhubung" message="Konfigurasikan Supabase untuk mencatat penjualan toko." actionHref="/login" actionLabel="Masuk" />
      </main>
    );
  }

  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const [variantResult, productResult, stockResult, storeResult] = await Promise.all([
    supabase.from("product_variants")
      .select("id, product_id, sku, size, color, price")
      .eq("is_active", true)
      .order("sku"),
    supabase.from("products").select("id, name").eq("is_active", true).order("name"),
    supabase.from("stock_levels")
      .select("variant_id, location_code, available_qty")
      .eq("location_code", "STORE"),
    supabase.from("store_locations")
      .select("id, name, address")
      .eq("is_active", true)
      .order("name"),
  ]);

  const queryError = variantResult.error ?? productResult.error ?? stockResult.error ?? storeResult.error;
  if (queryError) {
    console.error("POS inventory query failed:", queryError.message);
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Data POS tidak tersedia" message="Varian, saldo toko, atau lokasi tidak dapat dimuat. Muat ulang untuk mencoba kembali." actionHref="/admin/pos" actionLabel="Coba lagi" />
      </main>
    );
  }

  const variants = variantResult.data ?? [];
  const productById = new Map((productResult.data ?? []).map((product) => [product.id, product.name]));
  const visibleVariants = variants
    .filter((variant) => productById.has(variant.product_id))
    .map((variant) => ({
      id: variant.id,
      product_name: productById.get(variant.product_id) ?? "Produk tidak dikenal",
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
      price: Number(variant.price),
    }));
  const initialStock: CatalogStock[] = stockResult.data ?? [];
  const stores = storeResult.data ?? [];

  return (
    <main className="mx-auto w-full max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
      <header className="border-b border-border pb-5">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Kasir / POS</p>
        <h1 className="mt-2 font-heading text-5xl font-bold uppercase leading-none sm:text-6xl">Penjualan toko</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Catat transaksi di toko fisik. Setiap transaksi mengurangi saldo STORE dan menulis movement ledger dalam satu transaksi database.
        </p>
      </header>

      <section className="max-w-5xl border border-border bg-card p-4 sm:p-6" aria-labelledby="pos-sale-heading">
        <div className="mb-5 border-b border-border pb-3">
          <h2 id="pos-sale-heading" className="font-heading text-3xl font-bold uppercase">Barang dan pembayaran</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pilih varian yang dijual; harga dan jumlah akhir dihitung kembali di database.
          </p>
        </div>
        <PosSaleForm stores={stores} variants={visibleVariants} initialStock={initialStock} />
      </section>
    </main>
  );
}
