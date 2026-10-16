import type { Metadata } from "next";
import { SignUpForm } from "@/components/forms/sign-up-form";
import { StatusPanel } from "@/components/status-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicSupabaseEnvironment } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Buat akun" };

export default function SignUpPage() {
  if (!getPublicSupabaseEnvironment()) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <StatusPanel
          title="Supabase belum disiapkan"
          message="Isi URL dan anon key Supabase di .env.local, lalu jalankan ulang aplikasi untuk membuat akun."
          actionHref="/"
          actionLabel="Kembali ke katalog"
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="font-heading text-4xl uppercase">Buat akun customer</CardTitle>
        </CardHeader>
        <CardContent>
          <SignUpForm />
        </CardContent>
      </Card>
    </main>
  );
}
