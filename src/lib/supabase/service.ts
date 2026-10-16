import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { requirePublicSupabaseEnvironment, requireServiceRoleKey } from "@/lib/supabase/env";

export function createSupabaseServiceClient() {
  const environment = requirePublicSupabaseEnvironment();
  const serviceRoleKey = requireServiceRoleKey();

  return createClient<Database>(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
