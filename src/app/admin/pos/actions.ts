"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireStaff } from "@/lib/supabase/viewer";
import { orderFulfillmentSchema, posSaleSchema } from "@/lib/validators/pos";

export type PosSaleResult =
  | { ok: true; orderNumber: string; total: number; itemCount: number }
  | { ok: false; error: string };
export type FulfillmentActionState = { error?: string; success?: string };

export async function recordOfflineSaleAction(input: unknown): Promise<PosSaleResult> {
  const staff = await requireStaff();
  const parsed = posSaleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Periksa kembali rincian penjualan.",
    };
  }

  let supabase: ReturnType<typeof createSupabaseServiceClient>;
  try {
    supabase = createSupabaseServiceClient();
  } catch (error: unknown) {
    console.error(
      "POS service client is not configured:",
      error instanceof Error ? error.message : "Unknown configuration error",
    );
    return { ok: false, error: "POS belum dikonfigurasi di server." };
  }

  const { data, error } = await supabase.rpc("record_offline_sale", {
    p_actor_id: staff.userId,
    p_request_id: parsed.data.requestId,
    p_store_location_id: parsed.data.storeLocationId,
    p_payment_method: parsed.data.paymentMethod,
    p_items: parsed.data.items.map((item) => ({
      variant_id: item.variantId,
      quantity: item.quantity,
    })),
  });
  if (error) {
    console.error("Offline POS sale failed:", error.message);
    const detail = error.message.toLowerCase();
    if (detail.includes("insufficient store stock") || detail.includes("stock changed")) {
      return { ok: false, error: "Stok toko berubah atau tidak mencukupi. Perbarui jumlah lalu coba lagi." };
    }
    if (detail.includes("store is unavailable")) {
      return { ok: false, error: "Lokasi toko tidak aktif. Muat ulang halaman dan pilih toko lain." };
    }
    if (detail.includes("request key was already used")) {
      return { ok: false, error: "Kunci transaksi tidak cocok. Segarkan POS sebelum mencoba lagi." };
    }
    return { ok: false, error: "Penjualan belum dapat dicatat. Periksa stok dan coba lagi." };
  }

  const sale = data?.[0];
  if (!sale) {
    console.error("Offline sale RPC completed without returning a receipt.");
    return { ok: false, error: "Transaksi tidak memberikan bukti penjualan. Hubungi admin sebelum mengulang." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/pos");
  revalidatePath("/admin/products");
  revalidatePath("/");
  return {
    ok: true,
    orderNumber: sale.order_number,
    total: Number(sale.total),
    itemCount: sale.item_count,
  };
}

export async function updateOrderFulfillmentAction(
  _previousState: FulfillmentActionState,
  formData: FormData,
): Promise<FulfillmentActionState> {
  const staff = await requireStaff();
  const parsed = orderFulfillmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Periksa kembali pembaruan pesanan." };
  }

  let supabase: ReturnType<typeof createSupabaseServiceClient>;
  try {
    supabase = createSupabaseServiceClient();
  } catch (error: unknown) {
    console.error(
      "Order fulfillment service client is not configured:",
      error instanceof Error ? error.message : "Unknown configuration error",
    );
    return { error: "Pengelolaan pesanan belum dikonfigurasi di server." };
  }

  const { data, error } = await supabase.rpc("update_order_fulfillment", {
    p_actor_id: staff.userId,
    p_order_id: parsed.data.orderId,
    p_next_status: parsed.data.nextStatus,
    p_tracking_number: parsed.data.trackingNumber,
  });
  if (error) {
    console.error("Order fulfillment update failed:", error.message);
    return { error: "Status pesanan tidak dapat diperbarui. Muat ulang untuk melihat status terbaru." };
  }
  const order = data?.[0];
  if (!order) {
    console.error("Order fulfillment RPC completed without returning an order.");
    return { error: "Pembaruan tidak memberikan konfirmasi. Muat ulang sebelum mencoba lagi." };
  }

  revalidatePath("/admin/orders");
  revalidatePath("/orders");
  revalidatePath(`/orders/${encodeURIComponent(order.order_number)}`);
  return { success: "Status pesanan diperbarui." };
}
