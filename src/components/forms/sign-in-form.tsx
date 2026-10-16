"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { signInAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInSchema, type SignInValues } from "@/lib/validators/auth";

export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "", next },
  });

  async function onSubmit(values: SignInValues) {
    setFormError(undefined);
    const result = await signInAction(values);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    router.replace(result.next);
    router.refresh();
  }

  return (
    <form className="space-y-5" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <Label htmlFor="signin-email">Email</Label>
        <Input
          id="signin-email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(form.formState.errors.email)}
          aria-describedby={form.formState.errors.email ? "signin-email-error" : undefined}
          {...form.register("email")}
        />
        {form.formState.errors.email && (
          <p id="signin-email-error" className="text-sm text-destructive">
            {form.formState.errors.email.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="signin-password">Kata sandi</Label>
        <Input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(form.formState.errors.password)}
          aria-describedby={form.formState.errors.password ? "signin-password-error" : undefined}
          {...form.register("password")}
        />
        {form.formState.errors.password && (
          <p id="signin-password-error" className="text-sm text-destructive">
            {form.formState.errors.password.message}
          </p>
        )}
      </div>
      {formError && <p role="alert" className="text-sm font-medium text-destructive">{formError}</p>}
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Memeriksa akun..." : "Masuk"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Belum punya akun? <Link className="font-semibold text-primary underline underline-offset-4" href="/signup">Buat akun customer</Link>
      </p>
    </form>
  );
}
