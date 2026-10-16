"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { requirePublicSupabaseEnvironment } from "@/lib/supabase/env";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createSupabaseBrowserClient() {
  if (!browserClient) {
    const environment = requirePublicSupabaseEnvironment();
    browserClient = createBrowserClient<Database>(
      environment.NEXT_PUBLIC_SUPABASE_URL,
      environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }
  return browserClient;
}
