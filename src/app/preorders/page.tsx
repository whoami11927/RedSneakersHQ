import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PreorderPurchaseForm } from "@/components/preorders/preorder-purchase-form";
import { StatusPanel } from "@/components/status-panel";
import { formatCurrency } from "@/lib/format";
import { getPublicSupabaseEnvironment } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewerState } from "@/lib/supabase/viewer";

export const metadata: Metadata = { title: "Pre-order sneakers" };

export const instant = false;

export default function PreordersPage() {
  if (!getPublicSupabaseEnvironment()) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel
          title="Pre-order belum terhubung"
          message="Hubungkan Supabase dan jalankan migrasi untuk menampilkan batch pre-order."
          actionHref="/"
          actionLabel="Kembali ke katalog"
        />
      </main>
    );
  }
  return (
    <Suspense fallback={<PreordersLoading />}>
      <PreordersContent />
    </Suspense>
  );
}

async function PreordersContent() {
  const viewer = await getViewerState();
  if (viewer.status === "error" || viewer.status === "unconfigured") {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Sesi akun tidak tersedia" message="Sesi akun gagal diperiksa. Muat ulang atau masuk kembali sebelum membuat pre-order." actionHref="/login?next=%2Fpreorders" actionLabel="Masuk kembali" />
      </main>
    );
  }
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const { data: batches, error: batchError } = await supabase
    .from("preorder_batches")
    .select("*")
    .eq("status", "open")
    .lte("opens_at", now)
    .gt("closes_at", now)
    .order("closes_at");
  if (batchError) {
    console.error("Unable to load preorder batches:", batchError.message);
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Batch belum dapat dimuat" message="Daftar pre-order gagal dimuat. Muat ulang untuk mencoba kembali." actionHref="/preorders" actionLabel="Coba lagi" />
      </main>
    );
  }
  if (!batches.length) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8 border-b border-border pb-5">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Red Sneakers HQ / Pre-order</p>
          <h1 className="mt-2 font-heading text-5xl font-bold uppercase">Batch yang sedang dibuka</h1>
        </header>
        <StatusPanel title="Belum ada batch terbuka" message="Admin belum membuka batch yang berada dalam periode pemesanan. Kembali lagi nanti untuk melihat jadwal berikutnya." actionHref="/" actionLabel="Lihat katalog reguler" />
      </main>
    );
  }

  const variantIds = [...new Set(batches.map((batch) => batch.variant_id))];
  const { data: variants, error: variantError } = await supabase
    .from("product_variants")
    .select("id, product_id, sku, size, color, is_active")
    .in("id", variantIds)
    .eq("is_active", true);
  if (variantError) {
    console.error("Unable to load preorder variants:", variantError.message);
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Varian pre-order belum dapat dimuat" message="Rincian varian gagal dimuat. Muat ulang untuk mencoba kembali." actionHref="/preorders" actionLabel="Coba lagi" />
      </main>
    );
  }

  const productIds = [...new Set(variants.map((variant) => variant.product_id))];
  const { data: products, error: productError } = productIds.length
    ? await supabase.from("products").select("id, name, is_active").in("id", productIds).eq("is_active", true)
    : { data: [], error: null };
  if (productError) {
    console.error("Unable to load preorder products:", productError.message);
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Produk pre-order belum dapat dimuat" message="Rincian produk gagal dimuat. Muat ulang untuk mencoba kembali." actionHref="/preorders" actionLabel="Coba lagi" />
      </main>
    );
  }

  const productById = new Map(products.map((product) => [product.id, product]));
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const visibleBatches = batches.filter((batch) => {
    const variant = variantById.get(batch.variant_id);
    return variant && productById.has(variant.product_id)
      && batch.quota - batch.reserved_quantity - batch.ordered_quantity > 0;
  });
  const storesResult = viewer.status === "signed_in" && viewer.profile.role === "customer"
    ? await supabase.from("store_locations").select("id, name, address, latitude, longitude").eq("is_active", true).order("name")
    : { data: [], error: null };
  if (storesResult.error) {
    console.error("Unable to load preorder pickup locations:", storesResult.error.message);
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Lokasi toko belum dapat dimuat" message="Lokasi pengambilan gagal dimuat. Muat ulang untuk mencoba kembali." actionHref="/preorders" actionLabel="Coba lagi" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Red Sneakers HQ / Pre-order</p>
          <h1 className="mt-2 font-heading text-5xl font-bold uppercase leading-none sm:text-6xl">Batch yang sedang dibuka</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Kuota dicadangkan selama 15 menit setelah pesanan dibuat. Harga dan ketersediaan dikonfirmasi oleh server.
          </p>
        </div>
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 hover:text-primary">
          Katalog reguler
        </Link>
      </header>

      {visibleBatches.length === 0 ? (
        <StatusPanel title="Kuota batch sudah habis" message="Semua batch yang sedang dibuka telah mencapai kuota. Periksa kembali nanti untuk batch berikutnya." actionHref="/" actionLabel="Lihat katalog reguler" />
      ) : (
        <div className="space-y-5">
          {visibleBatches.map((batch) => {
            const variant = variantById.get(batch.variant_id);
            const product = variant ? productById.get(variant.product_id) : undefined;
            if (!variant || !product) return null;
            const remaining = batch.quota - batch.reserved_quantity - batch.ordered_quantity;
            return (
              <article key={batch.id} className="grid gap-5 border border-border bg-card p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
                <div className="flex flex-col justify-between gap-6">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">{batch.name}</p>
                    <h2 className="mt-2 font-heading text-4xl font-bold uppercase leading-none">{product.name}</h2>
                    <p className="mt-3 text-sm">{variant.size} / {variant.color} · {variant.sku}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Perkiraan tiba {new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(`${batch.estimated_arrival}T00:00:00`))}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Pendaftaran ditutup {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(batch.closes_at))}
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
                    <div><dt className="text-xs text-muted-foreground">Harga</dt><dd className="mt-1 font-semibold">{formatCurrency(Number(batch.price))}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Kuota tersisa</dt><dd className="mt-1 font-mono">{remaining}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Pembayaran</dt><dd className="mt-1 text-sm">{batch.payment_plan === "full" ? "Penuh" : `DP ${batch.deposit_percent}%`}</dd></div>
                  </dl>
                </div>
                <div className="min-w-0 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                  {viewer.status === "signed_in" && viewer.profile.role === "customer" ? (
                    storesResult.data.length > 0 ? (
                      <PreorderPurchaseForm
                        batch={{
                          id: batch.id,
                          price: Number(batch.price),
                          payment_plan: batch.payment_plan,
                          deposit_percent: batch.deposit_percent,
                          remaining,
                        }}
                        stores={storesResult.data}
                      />
                    ) : (
                      <p role="status" className="text-sm text-muted-foreground">Admin belum mengaktifkan lokasi toko untuk pengambilan atau ongkir.</p>
                    )
                  ) : viewer.status === "signed_in" ? (
                    <p role="status" className="text-sm text-muted-foreground">Pemesanan online hanya tersedia untuk akun customer.</p>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">Masuk ke akun customer untuk mencadangkan kuota batch.</p>
                      <Link href="/login?next=%2Fpreorders" className="inline-flex min-h-11 items-center bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        Masuk untuk memesan
                      </Link>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

function PreordersLoading() {
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <p role="status" className="border-b border-border pb-5 text-sm text-muted-foreground">Memuat batch pre-order...</p>
      <div className="h-52 animate-pulse border border-border bg-card" />
    </main>
  );
}
