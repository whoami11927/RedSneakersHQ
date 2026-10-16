import "server-only";

import { createSnapTransaction } from "@/lib/midtrans/snap";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getPublicSupabaseEnvironment } from "@/lib/supabase/env";

export type PaymentTokenResult =
  | { ok: true; orderNumber: string; token: string; redirectUrl: string }
  | { ok: false; error: string };

/**
 * Menyiapkan transaksi Snap untuk order milik customer. Total diambil dari database lewat
 * RPC `create_order_payment`; nilai dari klien tidak ikut menentukan nominal.
 */
export async function createOrderPaymentToken(input: {
  customerId: string;
  orderId: string;
}): Promise<PaymentTokenResult> {
  const supabase = createSupabaseServiceClient();

  const { data: ownership, error: ownershipError } = await supabase
    .from("orders")
    .select("order_number")
    .eq("id", input.orderId)
    .eq("customer_id", input.customerId)
    .maybeSingle();
  if (ownershipError) {
    console.error("Unable to verify order ownership for payment:", ownershipError.message);
    return { ok: false, error: "Pesanan tidak dapat diverifikasi. Coba lagi." };
  }
  if (!ownership) {
    return { ok: false, error: "Pesanan tidak ditemukan pada akun ini." };
  }

  const { data, error } = await supabase.rpc("create_order_payment", {
    p_order_id: input.orderId,
  });
  if (error) {
    console.error("Unable to prepare the payment row:", error.message);
    const message = error.message.toLowerCase();
    if (message.includes("already paid")) {
      return { ok: false, error: "Pesanan ini sudah dibayar." };
    }
    if (message.includes("reservation has expired")) {
      return { ok: false, error: "Waktu reservasi stok habis. Buat pesanan kembali." };
    }
    if (message.includes("not awaiting payment")) {
      return { ok: false, error: "Pesanan ini tidak lagi menunggu pembayaran." };
    }
    return { ok: false, error: "Pembayaran belum dapat disiapkan. Coba lagi." };
  }

  const payment = data?.[0];
  if (!payment) {
    console.error("Payment RPC completed without returning a payment row.");
    return { ok: false, error: "Pembayaran belum dapat disiapkan. Coba lagi." };
  }

  const environment = getPublicSupabaseEnvironment();
  const siteUrl = environment?.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const snap = await createSnapTransaction({
    orderId: payment.provider_order_id,
    grossAmount: Number(payment.amount),
    itemDetails: payment.item_details as { id: string; price: number; quantity: number; name: string }[],
    customerDetails: payment.customer_details as {
      first_name: string;
      email: string | null;
      phone: string | null;
    },
    expiresAt: new Date(payment.reservation_expires_at),
    finishRedirectUrl: `${siteUrl}/orders/${encodeURIComponent(ownership.order_number)}`,
  });
  if (!snap.ok) return snap;

  return {
    ok: true,
    orderNumber: ownership.order_number,
    token: snap.token,
    redirectUrl: snap.redirectUrl,
  };
}
