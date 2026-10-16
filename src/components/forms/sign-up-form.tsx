"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { signUpAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpSchema, type SignUpValues } from "@/lib/validators/auth";

export function SignUpForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const [formMessage, setFormMessage] = useState<string>();
  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "" },
  });

  async function onSubmit(values: SignUpValues) {
    setFormError(undefined);
    setFormMessage(undefined);
    const result = await signUpAction(values);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    if (result.authenticated) {
      router.replace("/");
      router.refresh();
      return;
    }
    setFormMessage(result.message);
    form.reset();
  }

  return (
    <form className="space-y-5" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <Label htmlFor="signup-name">Nama</Label>
        <Input
          id="signup-name"
          autoComplete="name"
          aria-invalid={Boolean(form.formState.errors.fullName)}
          aria-describedby={form.formState.errors.fullName ? "signup-name-error" : undefined}
          {...form.register("fullName")}
        />
        {form.formState.errors.fullName && (
          <p id="signup-name-error" className="text-sm text-destructive">
            {form.formState.errors.fullName.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(form.formState.errors.email)}
          aria-describedby={form.formState.errors.email ? "signup-email-error" : undefined}
          {...form.register("email")}
        />
        {form.formState.errors.email && (
          <p id="signup-email-error" className="text-sm text-destructive">
            {form.formState.errors.email.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password">Kata sandi</Label>
        <Input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
          aria-invalid={Boolean(form.formState.errors.password)}
          aria-describedby={form.formState.errors.password ? "signup-password-error" : undefined}
          {...form.register("password")}
        />
        {form.formState.errors.password && (
          <p id="signup-password-error" className="text-sm text-destructive">
            {form.formState.errors.password.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Gunakan minimal 10 karakter.</p>
      </div>
      {formError && <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>}
      {formMessage && <p role="status" className="text-sm font-medium text-foreground">{formMessage}</p>}
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Membuat akun..." : "Buat akun"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Sudah memiliki akun? <Link className="font-semibold text-primary underline underline-offset-4" href="/login">Masuk</Link>
      </p>
    </form>
  );
}
