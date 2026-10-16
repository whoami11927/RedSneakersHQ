import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const base = new URL("https://red-sneakers.invalid");
    const destination = new URL(value, base);
    if (destination.origin !== base.origin) return "/";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/login?error=verification", request.url));
  }

  const supabase = await createSupabaseServerClient({ cookieWrites: true });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("Supabase auth callback failed:", error.message);
    return NextResponse.redirect(new URL("/login?error=verification", request.url));
  }

  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  return NextResponse.redirect(new URL(next, request.url));
}
