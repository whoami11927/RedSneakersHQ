import "server-only";

import { z } from "zod";
import { createSnapTransaction } from "@/lib/midtrans/snap";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const snapItemsSchema = z.array(z.object({
  id: z.string(),
  price: z.number(),
  quantity: z.number().int().positive(),
  name: z.string(),
}));

const snapCustomerSchema = z.object({
  first_name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});

export type PreorderPaymentPurpose = "preorder_deposit" | "preorder_balance";

export type PreorderPaymentTokenResult =
  | {
      ok: true;
      orderNumber: string;
      providerOrderId: string;
      amount: number;
      token: string;
      redirectUrl: string;
    }
  | { ok: false; error: string };

export async function createPreorderPaymentToken(input: {
  customerId: string;
  orderId: string;
  purpose: PreorderPaymentPurpose;
}): Promise<PreorderPaymentTokenResult> {
  const supabase = createSupabaseServiceClient();
  const { data: ownership, error: ownershipError } = await supabase
    .from("orders")
    .select("order_number")
    .eq("id", input.orderId)
    .eq("customer_id", input.customerId)
    .maybeSingle();

  if (ownershipError) {
    console.error("Unable to verify preorder payment ownership:", ownershipError.message);
    return { ok: false, error: "Pesanan tidak dapat diverifikasi. Coba lagi." };
  }
  if (!ownership) return { ok: false, error: "Pesanan tidak ditemukan pada akun ini." };

  const rpc = input.purpose === "preorder_deposit"
    ? "create_preorder_deposit_payment"
    : "create_preorder_balance_payment";
  const { data, error } = await supabase.rpc(rpc, { p_order_id: input.orderId });
  if (error) {
    console.error("Unable to prepare preorder payment:", error.message);
    const detail = error.message.toLowerCase();
    if (detail.includes("already paid")) {
      return { ok: false, error: "Pembayaran ini sudah diterima." };
    }
    if (detail.includes("reservation has expired")) {
      return { ok: false, error: "Waktu reservasi kuota habis. Buat pesanan kembali." };
    }
    if (detail.includes("not ready") || detail.includes("not settled")) {
      return { ok: false, error: "Tahap pembayaran ini belum tersedia." };
    }
    return { ok: false, error: "Pembayaran belum dapat disiapkan. Coba lagi." };
  }

  const payment = data?.[0];
  if (!payment) {
    console.error("Preorder payment RPC completed without returning a payment row.");
    return { ok: false, error: "Pembayaran belum dapat disiapkan. Coba lagi." };
  }
  const parsedItems = snapItemsSchema.safeParse(payment.item_details);
  const parsedCustomer = snapCustomerSchema.safeParse(payment.customer_details);
  if (!parsedItems.success || !parsedCustomer.success) {
    console.error("Preorder payment details returned by the database are invalid.");
    return { ok: false, error: "Rincian pembayaran tidak dapat diproses." };
  }

  const snap = await createSnapTransaction({
    orderId: payment.provider_order_id,
    grossAmount: Number(payment.amount),
    itemDetails: parsedItems.data,
    customerDetails: parsedCustomer.data,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    finishRedirectUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/orders/${encodeURIComponent(ownership.order_number)}`,
  });
  if (!snap.ok) return snap;

  return {
    ok: true,
    orderNumber: ownership.order_number,
    providerOrderId: payment.provider_order_id,
    amount: Number(payment.amount),
    token: snap.token,
    redirectUrl: snap.redirectUrl,
  };
}
