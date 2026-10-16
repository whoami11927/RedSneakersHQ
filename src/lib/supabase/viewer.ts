import "server-only";

import { notFound, redirect } from "next/navigation";
import { getPublicSupabaseEnvironment } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type ViewerState =
  | { status: "unconfigured" }
  | { status: "signed_out" }
  | { status: "signed_in"; userId: string; profile: Profile }
  | { status: "error" };

export async function getViewerState(): Promise<ViewerState> {
  if (!getPublicSupabaseEnvironment()) return { status: "unconfigured" };

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) {
    console.error("Unable to verify the current Supabase user:", authError.message);
    return { status: "error" };
  }
  if (!authData.user) return { status: "signed_out" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    console.error("Unable to load the current user profile:", profileError?.message ?? "Profile missing");
    return { status: "error" };
  }

  return { status: "signed_in", userId: authData.user.id, profile };
}

export async function requireAdmin() {
  const viewer = await getViewerState();
  if (viewer.status === "signed_out") redirect("/login?next=%2Fadmin%2Fproducts");
  if (viewer.status !== "signed_in") throw new Error("Admin session cannot be verified.");
  if (viewer.profile.role !== "admin") notFound();
  return viewer;
}

export async function requireStaff() {
  const viewer = await getViewerState();
  if (viewer.status === "signed_out") redirect("/login?next=%2Fadmin%2Fpos");
  if (viewer.status !== "signed_in") throw new Error("Staff session cannot be verified.");
  if (viewer.profile.role !== "admin" && viewer.profile.role !== "cashier") notFound();
  return viewer;
}
