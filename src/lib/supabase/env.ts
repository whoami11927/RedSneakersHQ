import { z } from "zod";

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

const serviceEnvironmentSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export function getPublicSupabaseEnvironment() {
  const result = publicEnvironmentSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  if (!result.success || result.data.NEXT_PUBLIC_SUPABASE_ANON_KEY.startsWith("replace-")) {
    return null;
  }
  return result.data;
}

export function requirePublicSupabaseEnvironment() {
  const environment = getPublicSupabaseEnvironment();
  if (!environment) {
    throw new Error("Supabase public environment variables are not configured.");
  }
  return environment;
}

export function requireServiceRoleKey() {
  const result = serviceEnvironmentSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (!result.success || result.data.SUPABASE_SERVICE_ROLE_KEY.startsWith("replace-")) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured on the server.");
  }
  return result.data.SUPABASE_SERVICE_ROLE_KEY;
}
