import Link from "next/link";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { CartLink } from "@/components/cart/cart-link";
import { getViewerState } from "@/lib/supabase/viewer";
import type { ViewerState } from "@/lib/supabase/viewer";

function SiteHeaderNavigation({ viewer }: { viewer: ViewerState }) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Red Sneakers HQ, katalog" className="group flex items-baseline gap-2">
          <span className="font-heading text-2xl font-bold leading-none tracking-tight text-foreground sm:text-3xl">
            RED SNEAKERS
          </span>
          <span className="font-mono text-xs font-semibold text-primary">HQ</span>
        </Link>
        <nav aria-label="Navigasi utama" className="flex flex-wrap items-center gap-2 sm:gap-4">
          <Link className="min-h-11 inline-flex items-center px-2 text-sm font-semibold hover:text-primary" href="/">
            Katalog
          </Link>
          <Link className="min-h-11 inline-flex items-center px-2 text-sm font-semibold hover:text-primary" href="/preorders">
            Pre-order
          </Link>
          <CartLink />
          {viewer.status === "signed_in" ? (
            <>
              <Link
                className="min-h-11 inline-flex items-center px-2 text-sm font-semibold hover:text-primary"
                href={viewer.profile.role === "admin" || viewer.profile.role === "cashier" ? "/admin/orders" : "/orders"}
              >
                Pesanan
              </Link>
              {viewer.profile.role === "admin" && (
                <>
                  <Link className="min-h-11 inline-flex items-center px-2 text-sm font-semibold hover:text-primary" href="/admin">
                    Laporan
                  </Link>
                  <Link className="min-h-11 inline-flex items-center px-2 text-sm font-semibold hover:text-primary" href="/admin/products">
                    Produk
                  </Link>
                  <Link className="min-h-11 inline-flex items-center px-2 text-sm font-semibold hover:text-primary" href="/admin/preorders">
                    Batch
                  </Link>
                  <Link className="min-h-11 inline-flex items-center px-2 text-sm font-semibold hover:text-primary" href="/admin/pos">
                    POS
                  </Link>
                </>
              )}
              {viewer.profile.role === "cashier" && (
                <>
                  <Link className="min-h-11 inline-flex items-center px-2 text-sm font-semibold hover:text-primary" href="/admin/pos">
                    POS
                  </Link>
                </>
              )}
              <span className="hidden max-w-40 truncate text-sm text-muted-foreground md:inline">
                {viewer.profile.full_name || viewer.profile.email}
              </span>
              <form action={signOutAction}>
                <Button type="submit" variant="outline" size="sm">Keluar</Button>
              </form>
            </>
          ) : (
            <>
              <Link className="min-h-11 inline-flex items-center px-2 text-sm font-semibold hover:text-primary" href="/login">
                Masuk
              </Link>
              <Button size="sm" render={<Link href="/signup" />}>
                Buat akun
              </Button>
            </>
          )}
          {viewer.status === "error" && (
            <span role="status" className="text-sm text-destructive">Status akun tidak tersedia</span>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export async function SiteHeader() {
  const viewer = await getViewerState();
  return <SiteHeaderNavigation viewer={viewer} />;
}

export function SiteHeaderFallback() {
  return <SiteHeaderNavigation viewer={{ status: "signed_out" }} />;
}
