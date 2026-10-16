"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/validators/auth";

const siteUrlSchema = z.string().url();
function safeNextPath(value: string | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const base = new URL("https://red-sneakers.invalid");
    const destination = new URL(value, base);
    if (destination.origin !== base.origin) return "/";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}

function validationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Periksa kembali data yang dimasukkan.";
}

export async function signInAction(input: unknown) {
  const values = signInSchema.safeParse(input);
  if (!values.success) return { ok: false as const, error: validationMessage(values.error) };

  const supabase = await createSupabaseServerClient({ cookieWrites: true });
  const { error } = await supabase.auth.signInWithPassword({
    email: values.data.email,
    password: values.data.password,
  });
  if (error) {
    console.error("Supabase sign-in failed:", error.message);
    return { ok: false as const, error: "Email atau kata sandi tidak cocok." };
  }

  return { ok: true as const, next: safeNextPath(values.data.next) };
}

export async function signUpAction(input: unknown) {
  const values = signUpSchema.safeParse(input);
  if (!values.success) return { ok: false as const, error: validationMessage(values.error) };

  const siteUrl = siteUrlSchema.safeParse(process.env.NEXT_PUBLIC_SITE_URL);
  if (!siteUrl.success) {
    return { ok: false as const, error: "Atur NEXT_PUBLIC_SITE_URL sebelum membuat akun." };
  }

  const callbackUrl = new URL("/auth/callback?next=%2F", siteUrl.data).toString();
  const supabase = await createSupabaseServerClient({ cookieWrites: true });
  const { data, error } = await supabase.auth.signUp({
    email: values.data.email,
    password: values.data.password,
    options: {
      data: { full_name: values.data.fullName },
      emailRedirectTo: callbackUrl,
    },
  });
  if (error) {
    console.error("Supabase sign-up failed:", error.message);
    return { ok: false as const, error: "Akun belum dapat dibuat. Periksa data atau pengaturan Auth." };
  }

  if (data.session) {
    return { ok: true as const, authenticated: true, message: "Akun dibuat. Anda sudah masuk." };
  }
  return {
    ok: true as const,
    authenticated: false,
    message: "Akun dibuat. Buka tautan verifikasi yang dikirim ke email Anda.",
  };
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient({ cookieWrites: true });
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Supabase sign-out failed:", error.message);
    throw new Error("Sesi tidak dapat diakhiri.");
  }
  redirect("/");
}
