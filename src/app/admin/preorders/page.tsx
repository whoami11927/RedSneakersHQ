import type { Metadata } from "next";
import { Suspense } from "react";
import { CreatePreorderBatchForm, PreorderBatchSummary } from "@/components/admin/preorder-admin-forms";
import { StatusPanel } from "@/components/status-panel";
import { getPublicSupabaseEnvironment } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/viewer";

export const metadata: Metadata = { title: "Kelola pre-order" };

export const instant = false;

export default function AdminPreordersPage() {
  if (!getPublicSupabaseEnvironment()) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Supabase belum disiapkan" message="Konfigurasikan Supabase sebelum mengelola batch pre-order." actionHref="/login" actionLabel="Masuk" />
      </main>
    );
  }
  return (
    <Suspense fallback={<AdminPreordersLoading />}>
      <AdminPreordersContent />
    </Suspense>
  );
}

async function AdminPreordersContent() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const [batchResult, variantResult] = await Promise.all([
    supabase.from("preorder_batches").select("*").order("created_at", { ascending: false }),
    supabase.from("product_variants").select("id, product_id, sku, size, color").order("sku"),
  ]);
  const queryError = batchResult.error ?? variantResult.error;
  if (queryError) {
    console.error("Admin preorder query failed:", queryError.message);
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Data pre-order tidak tersedia" message="Batch dan varian gagal dimuat. Muat ulang untuk mencoba kembali." actionHref="/admin/preorders" actionLabel="Coba lagi" />
      </main>
    );
  }

  const batchRows = batchResult.data ?? [];
  const variantRows = variantResult.data ?? [];
  const productIds = [...new Set(variantRows.map((variant) => variant.product_id))];
  const productResult = productIds.length
    ? await supabase.from("products").select("id, name").in("id", productIds)
    : { data: [], error: null };
  if (productResult.error) {
    console.error("Admin preorder product query failed:", productResult.error.message);
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Varian belum dapat dimuat" message="Nama produk untuk varian pre-order gagal dimuat. Muat ulang untuk mencoba kembali." actionHref="/admin/preorders" actionLabel="Coba lagi" />
      </main>
    );
  }

  const productById = new Map(productResult.data.map((product) => [product.id, product.name]));
  const variants = variantRows.map((variant) => ({
    ...variant,
    product_name: productById.get(variant.product_id) ?? "Produk tidak dikenal",
  }));
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const batches = batchRows.map((batch) => {
    const variant = variantById.get(batch.variant_id);
    return {
      ...batch,
      product_name: variant?.product_name ?? "Produk tidak dikenal",
      variant_label: variant ? `${variant.size} / ${variant.color} · ${variant.sku}` : "Varian tidak ditemukan",
    };
  });

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="border-b border-border pb-5">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Konsol staf / Admin</p>
        <h1 className="mt-2 font-heading text-5xl font-bold uppercase leading-none sm:text-6xl">Batch pre-order</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Kuota dikunci saat pesanan dibuat. Penerimaan barang mem-posting saldo dan alokasi ke ledger stok dalam satu transaksi.
        </p>
      </header>

      <section className="max-w-4xl border border-border bg-card p-4 sm:p-6" aria-labelledby="create-batch-heading">
        <h2 id="create-batch-heading" className="mb-5 font-heading text-3xl font-bold uppercase">Buat batch</h2>
        <CreatePreorderBatchForm variants={variants.filter((variant) => variant.product_name !== "Produk tidak dikenal")} />
      </section>

      <section className="space-y-4" aria-labelledby="batch-list-heading">
        <div className="border-b border-border pb-3">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Operasional batch dan alokasi</p>
          <h2 id="batch-list-heading" className="font-heading text-3xl font-bold uppercase">Semua batch</h2>
        </div>
        {batches.length === 0 ? (
          <p className="border border-dashed border-border p-6 text-sm text-muted-foreground">
            Belum ada batch pre-order. Buat batch di atas untuk mencatat periode, kuota, dan skema pembayaran.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {batches.map((batch) => <PreorderBatchSummary key={batch.id} batch={batch} />)}
          </div>
        )}
      </section>
    </main>
  );
}

function AdminPreordersLoading() {
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <p role="status" className="border-b border-border pb-5 text-sm text-muted-foreground">Memuat batch pre-order...</p>
      <div className="h-64 animate-pulse border border-border bg-card" />
    </main>
  );
}
