import type { Metadata } from "next";
import { Suspense } from "react";
import { StatusPanel } from "@/components/status-panel";
import { AdjustStockForm, CreateBrandForm, CreateProductForm, CreateVariantForm, ProductImageUpload, ProductVisibilityForm } from "@/components/admin/product-admin-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicSupabaseEnvironment } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/viewer";

export const metadata: Metadata = { title: "Kelola produk" };

export const instant = false;

export default function AdminProductsPage() {
  if (!getPublicSupabaseEnvironment()) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Supabase belum disiapkan" message="Konfigurasikan Supabase sebelum membuka konsol admin." actionHref="/login" actionLabel="Masuk" />
      </main>
    );
  }

  return (
    <Suspense fallback={<AdminProductsLoading />}>
      <AdminProductsContent />
    </Suspense>
  );
}

async function AdminProductsContent() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const [productResult, variantResult, stockResult, brandResult] = await Promise.all([
    supabase.from("products").select("id, name, slug, is_active").order("name"),
    supabase.from("product_variants").select("id, product_id, size, color, sku").order("sku"),
    supabase.from("stock_levels").select("variant_id, location_code, on_hand, reserved_qty, available_qty"),
    supabase.from("brands").select("id, name").order("name"),
  ]);
  const error = productResult.error ?? variantResult.error ?? stockResult.error ?? brandResult.error;
  if (error || !productResult.data || !variantResult.data || !stockResult.data || !brandResult.data) {
    if (error) {
      console.error("Admin product inventory query failed:", error.message);
    } else {
      console.error("Admin product inventory query returned an incomplete result.");
    }
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Data admin tidak tersedia" message="Produk dan stok belum dapat dimuat. Silakan muat ulang halaman." />
      </main>
    );
  }

  const productById = new Map(productResult.data.map((product) => [product.id, product]));
  const variants = variantResult.data.map((variant) => ({
    ...variant,
    product_name: productById.get(variant.product_id)?.name ?? "Produk tidak dikenal",
  }));
  const stockByVariant = new Map<string, typeof stockResult.data>();
  for (const row of stockResult.data) {
    const current = stockByVariant.get(row.variant_id) ?? [];
    current.push(row);
    stockByVariant.set(row.variant_id, current);
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="border-b border-border pb-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Konsol staf / Admin</p>
        <h1 className="mt-2 font-heading text-5xl font-bold uppercase">Produk &amp; stok</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Ubah data katalog dan saldo yang sama-sama digunakan kanal online serta toko. Penyesuaian stok selalu membuat catatan ledger.</p>
      </header>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="font-heading text-2xl uppercase">Tambah produk</CardTitle></CardHeader>
          <CardContent><CreateProductForm brands={brandResult.data} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="font-heading text-2xl uppercase">Tambah merek</CardTitle></CardHeader>
          <CardContent><CreateBrandForm /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="font-heading text-2xl uppercase">Tambah varian</CardTitle></CardHeader>
          <CardContent><CreateVariantForm products={productResult.data} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="font-heading text-2xl uppercase">Penyesuaian stok</CardTitle></CardHeader>
          <CardContent><AdjustStockForm variants={variants} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="font-heading text-2xl uppercase">Gambar produk</CardTitle></CardHeader>
          <CardContent><ProductImageUpload variants={variants} /></CardContent>
        </Card>
      </section>

      <section className="space-y-4" aria-labelledby="products-list-heading">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Inventaris bersama</p>
          <h2 id="products-list-heading" className="font-heading text-3xl font-bold uppercase">Daftar produk dan saldo</h2>
        </div>
        {productResult.data.length === 0 ? (
          <div className="border border-dashed border-border bg-card p-8 text-sm text-muted-foreground">Belum ada produk. Tambahkan produk di atas untuk memulai katalog.</div>
        ) : (
          <div className="space-y-4">
            {productResult.data.map((product) => {
              const productVariants = variants.filter((variant) => variant.product_id === product.id);
              return (
                <Card key={product.id}>
                  <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
                    <div>
                      <CardTitle className="font-heading text-2xl uppercase">{product.name}</CardTitle>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">/{product.slug} · {product.is_active ? "Tampil di katalog" : "Tersembunyi"}</p>
                    </div>
                    <ProductVisibilityForm product={product} />
                  </CardHeader>
                  <CardContent>
                    {productVariants.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Belum ada varian.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[32rem] text-left text-sm">
                          <thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 pr-3 font-medium">SKU / Varian</th><th className="px-3 py-2 font-medium">Online</th><th className="px-3 py-2 font-medium">Toko</th></tr></thead>
                          <tbody>
                            {productVariants.map((variant) => {
                              const levels = stockByVariant.get(variant.id) ?? [];
                              const online = levels.find((level) => level.location_code === "ONLINE");
                              const store = levels.find((level) => level.location_code === "STORE");
                              return (
                                <tr key={variant.id} className="border-b border-border last:border-0">
                                  <td className="py-3 pr-3"><span className="font-mono text-xs">{variant.sku}</span><span className="mt-1 block">{variant.size} / {variant.color}</span></td>
                                  <td className="px-3 py-3">{online?.available_qty ?? 0} tersedia <span className="text-xs text-muted-foreground">({online?.reserved_qty ?? 0} dipesan)</span></td>
                                  <td className="px-3 py-3">{store?.available_qty ?? 0} tersedia <span className="text-xs text-muted-foreground">({store?.reserved_qty ?? 0} dipesan)</span></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function AdminProductsLoading() {
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="h-20 animate-pulse border-b border-border bg-secondary" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-60 animate-pulse border border-border bg-card" />
        <div className="h-60 animate-pulse border border-border bg-card" />
      </div>
      <p className="text-sm text-muted-foreground">Memuat konsol admin...</p>
    </main>
  );
}
