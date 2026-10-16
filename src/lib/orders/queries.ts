import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
type HistoryRow = Database["public"]["Tables"]["order_status_history"]["Row"];

export type OrderSummary = OrderRow & {
  items: OrderItemRow[];
  payment: PaymentRow | null;
  payments: PaymentRow[];
  history: HistoryRow[];
};

/**
 * Dibaca lewat RLS sehingga customer hanya menerima pesanannya sendiri; admin dan kasir
 * menerima semua pesanan. Tidak ada pemeriksaan kepemilikan tambahan di kode klien.
 */
export async function listOrdersForViewer(): Promise<
  | { status: "ready"; orders: OrderSummary[] }
  | { status: "unauthenticated" }
  | { status: "error"; message: string }
> {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return { status: "unauthenticated" };

  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("Unable to load orders:", error.message);
    return { status: "error", message: "Daftar pesanan belum dapat dimuat. Coba lagi." };
  }
  if (!orders.length) return { status: "ready", orders: [] };

  const orderIds = orders.map((order) => order.id);
  const [itemsResult, paymentsResult, historyResult] = await Promise.all([
    supabase.from("order_items").select("*").in("order_id", orderIds),
    supabase.from("payments").select("*").in("order_id", orderIds).order("created_at"),
    supabase.from("order_status_history").select("*").in("order_id", orderIds).order("changed_at"),
  ]);
  if (itemsResult.error || paymentsResult.error || historyResult.error) {
    const cause = itemsResult.error ?? paymentsResult.error ?? historyResult.error;
    console.error("Unable to load order details:", cause?.message);
    return { status: "error", message: "Rincian pesanan belum dapat dimuat. Coba lagi." };
  }

  return {
    status: "ready",
    orders: orders.map((order) => ({
      ...order,
      items: itemsResult.data.filter((item) => item.order_id === order.id),
      payment: paymentsResult.data.filter((payment) => payment.order_id === order.id).at(-1) ?? null,
      payments: paymentsResult.data.filter((payment) => payment.order_id === order.id),
      history: historyResult.data.filter((entry) => entry.order_id === order.id),
    })),
  };
}

export async function getOrderByNumber(orderNumber: string): Promise<
  | { status: "ready"; order: OrderSummary }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string }
> {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return { status: "unauthenticated" };

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) {
    console.error("Unable to load the order:", error.message);
    return { status: "error", message: "Pesanan belum dapat dimuat. Coba lagi." };
  }
  if (!order) return { status: "not_found" };

  const [itemsResult, paymentsResult, historyResult] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", order.id),
    supabase.from("payments").select("*").eq("order_id", order.id).order("created_at"),
    supabase.from("order_status_history").select("*").eq("order_id", order.id).order("changed_at"),
  ]);
  if (itemsResult.error || paymentsResult.error || historyResult.error) {
    const cause = itemsResult.error ?? paymentsResult.error ?? historyResult.error;
    console.error("Unable to load the order details:", cause?.message);
    return { status: "error", message: "Rincian pesanan belum dapat dimuat. Coba lagi." };
  }

  return {
    status: "ready",
    order: {
      ...order,
      items: itemsResult.data,
      payment: paymentsResult.data.at(-1) ?? null,
      payments: paymentsResult.data,
      history: historyResult.data,
    },
  };
}
