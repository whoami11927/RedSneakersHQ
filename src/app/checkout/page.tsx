import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { StatusPanel } from "@/components/status-panel";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSupabaseEnvironment } from "@/lib/supabase/env";
import { getViewerState } from "@/lib/supabase/viewer";

export const metadata: Metadata = { title: "Checkout" };

export const instant = false;

export default async function CheckoutPage() {
  if (!getPublicSupabaseEnvironment()) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel
          title="Checkout belum terhubung"
          message="Hubungkan Supabase untuk membuat pesanan dan mengunci stok."
          actionHref="/"
          actionLabel="Kembali ke katalog"
        />
      </main>
    );
  }

  const viewer = await getViewerState();
  if (viewer.status === "signed_out") redirect("/login?next=%2Fcheckout");
  if (viewer.status === "unconfigured" || viewer.status === "error") {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Akun tidak tersedia" message="Sesi akun tidak dapat diperiksa. Muat ulang atau masuk kembali." actionHref="/login?next=%2Fcheckout" actionLabel="Masuk kembali" />
      </main>
    );
  }
  if (viewer.profile.role !== "customer") {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Checkout customer" message="Gunakan akun customer untuk membuat pesanan online." actionHref="/" actionLabel="Kembali ke katalog" />
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: stores, error } = await supabase
    .from("store_locations")
    .select("id, name, address, latitude, longitude")
    .eq("is_active", true)
    .order("name");
  if (error) {
    console.error("Unable to load checkout store locations:", error.message);
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Lokasi toko tidak tersedia" message="Daftar lokasi toko gagal dimuat. Muat ulang halaman untuk mencoba kembali." actionHref="/checkout" actionLabel="Coba lagi" />
      </main>
    );
  }
  if (!stores.length) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <StatusPanel title="Lokasi toko belum diatur" message="Admin perlu mengaktifkan lokasi toko sebelum checkout bisa digunakan." actionHref="/" actionLabel="Kembali ke katalog" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Red Sneakers HQ / Pesanan</p>
          <h1 className="mt-2 font-heading text-5xl font-bold uppercase leading-none sm:text-6xl">Checkout</h1>
        </div>
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 hover:text-primary">
          Kembali ke katalog
        </Link>
      </div>
      <CheckoutForm stores={stores} />
    </main>
  );
}
