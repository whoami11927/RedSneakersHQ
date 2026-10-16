import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/components/forms/sign-in-form";
import { StatusPanel } from "@/components/status-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicSupabaseEnvironment } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Masuk" };

type LoginPageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  if (!getPublicSupabaseEnvironment()) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <StatusPanel
          title="Supabase belum disiapkan"
          message="Isi URL dan anon key Supabase di .env.local, lalu jalankan ulang aplikasi untuk memakai autentikasi."
          actionHref="/"
          actionLabel="Kembali ke katalog"
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
      <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Memuat formulir masuk...</p>}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginContent({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="font-heading text-4xl uppercase">Masuk ke akun</CardTitle>
      </CardHeader>
      <CardContent>
        {params.error === "verification" && (
          <p role="alert" className="mb-4 text-sm font-medium text-destructive">
            Tautan verifikasi tidak valid atau sudah kedaluwarsa. Minta tautan baru dengan membuat akun kembali.
          </p>
        )}
        <SignInForm next={params.next} />
      </CardContent>
    </Card>
  );
}
