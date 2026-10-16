import { z } from "zod";

export const signInSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1, "Masukkan kata sandi."),
  next: z.string().max(2048).optional(),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Nama minimal 2 karakter.").max(100),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(10, "Kata sandi minimal 10 karakter.").max(128),
});

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
