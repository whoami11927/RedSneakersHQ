"use server";

import { z } from "zod";
import { applyPaymentNotification } from "@/lib/payments/apply-notification";
import { createOrderPaymentToken } from "@/lib/payments/create-payment-token";
import { fetchTransactionStatus } from "@/lib/midtrans/snap";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMidtransConfig } from "@/lib/midtrans/config";
import { verifyNotificationSignature } from "@/lib/midtrans/signature";

const orderIdSchema = z.uuid();

async function getCustomerId() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("Unable to verify the payment user:", error.message);
    return { ok: false as const, error: "Sesi tidak dapat diverifikasi. Masuk kembali." };
  }
  if (!data.user) {
    return { ok: false as const, error: "Masuk ke akun customer untuk membayar." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    console.error("Unable to verify the payment profile:", profileError?.message ?? "Profile missing");
    return { ok: false as const, error: "Profil akun tidak dapat diverifikasi." };
  }
  if (profile.role !== "customer") {
    return { ok: false as const, error: "Pembayaran online hanya untuk akun customer." };
  }
  return { ok: true as const, customerId: data.user.id };
}

export async function createPaymentTokenAction(input: unknown) {
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Pesanan tidak valid." };
  }
  if (!getMidtransConfig()) {
    return {
      ok: false as const,
      error: "Pembayaran Midtrans belum dikonfigurasi di server.",
    };
  }

  const customer = await getCustomerId();
  if (!customer.ok) return customer;

  const result = await createOrderPaymentToken({
    customerId: customer.customerId,
    orderId: parsed.data,
  });
  if (!result.ok) return result;

  return {
    ok: true as const,
    orderNumber: result.orderNumber,
    token: result.token,
    redirectUrl: result.redirectUrl,
  };
}

/**
 * Jalur pemulihan bila webhook belum tiba. Status diminta langsung ke Midtrans, lalu
 * ditolak bila signature-nya tidak cocok sebelum masuk ke RPC yang sama dengan webhook.
 */
export async function syncPaymentStatusAction(input: unknown) {
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Pesanan tidak valid." };
  }

  const customer = await getCustomerId();
  if (!customer.ok) return customer;

  const config = getMidtransConfig();
  if (!config) {
    return { ok: false as const, error: "Pembayaran Midtrans belum dikonfigurasi di server." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: order } = await supabase
    .from("orders")
    .select("order_number, status")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!order) {
    return { ok: false as const, error: "Pesanan tidak ditemukan pada akun ini." };
  }

  const status = await fetchTransactionStatus(order.order_number);
  if (!status.ok) {
    if (status.notFound) {
      return {
        ok: true as const,
        orderStatus: order.status,
        paymentStatus: null,
        message: "Midtrans belum mencatat transaksi untuk pesanan ini.",
      };
    }
    return { ok: false as const, error: status.error };
  }

  const signatureValid = verifyNotificationSignature({
    orderId: status.status.order_id,
    statusCode: status.status.status_code,
    grossAmount: status.status.gross_amount,
    serverKey: config.serverKey,
    signatureKey: status.status.signature_key,
  });
  if (!signatureValid) {
    console.error("Midtrans status response failed signature verification.");
    return { ok: false as const, error: "Status pembayaran tidak dapat diverifikasi." };
  }

  const applied = await applyPaymentNotification({
    order_id: status.status.order_id,
    status_code: status.status.status_code,
    gross_amount: status.status.gross_amount,
    signature_key: status.status.signature_key,
    transaction_status: status.status.transaction_status,
    transaction_id: status.status.transaction_id,
    fraud_status: status.status.fraud_status,
    payment_type: status.status.payment_type,
    settlement_time: status.status.settlement_time,
  });
  if (applied.outcome === "failed") {
    return { ok: false as const, error: "Status pembayaran belum dapat disimpan. Coba lagi." };
  }

  return {
    ok: true as const,
    orderStatus: applied.orderStatus,
    paymentStatus: applied.paymentStatus,
  };
}
