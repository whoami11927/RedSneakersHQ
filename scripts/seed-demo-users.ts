import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const environmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DEMO_ADMIN_EMAIL: z.string().email(),
  DEMO_ADMIN_PASSWORD: z.string().min(12),
  DEMO_CASHIER_EMAIL: z.string().email(),
  DEMO_CASHIER_PASSWORD: z.string().min(12),
  DEMO_CUSTOMER_EMAIL: z.string().email(),
  DEMO_CUSTOMER_PASSWORD: z.string().min(12),
});

const environment = environmentSchema.parse(process.env);
const supabase = createClient(
  environment.NEXT_PUBLIC_SUPABASE_URL,
  environment.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const demoUsers = [
  {
    email: environment.DEMO_ADMIN_EMAIL,
    password: environment.DEMO_ADMIN_PASSWORD,
    fullName: "Demo Admin",
    role: "admin",
  },
  {
    email: environment.DEMO_CASHIER_EMAIL,
    password: environment.DEMO_CASHIER_PASSWORD,
    fullName: "Demo Cashier",
    role: "cashier",
  },
  {
    email: environment.DEMO_CUSTOMER_EMAIL,
    password: environment.DEMO_CUSTOMER_PASSWORD,
    fullName: "Demo Customer",
    role: "customer",
  },
] as const;

async function ensureUser(user: (typeof demoUsers)[number]) {
  const { data: page, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;

  const existing = page.users.find(
    (candidate) => candidate.email?.toLowerCase() === user.email.toLowerCase(),
  );

  const result = existing
    ? await supabase.auth.admin.updateUserById(existing.id, {
        password: user.password,
        email_confirm: true,
        user_metadata: { full_name: user.fullName },
      })
    : await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: { full_name: user.fullName },
      });
  if (result.error) throw result.error;

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: result.data.user.id,
    email: user.email,
    full_name: user.fullName,
    role: user.role,
  });
  if (profileError) throw profileError;
}

async function main() {
  for (const user of demoUsers) await ensureUser(user);
  console.info("Demo admin, cashier, and customer accounts are ready.");
}

main().catch((error: unknown) => {
  console.error("Unable to seed demo users:", error);
  process.exitCode = 1;
});
