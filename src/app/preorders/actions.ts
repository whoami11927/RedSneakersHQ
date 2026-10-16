"use server";

import { revalidatePath } from "next/cache";
import { applyPaymentNotification } from "@/lib/payments/apply-notification";
import {
  createPreorderPaymentToken,
  type PreorderPaymentPurpose,
} from "@/lib/payments/create-preorder-payment-token";
import { getMidtransConfig } from "@/lib/midtrans/config";
import { fetchTransactionStatus } from "@/lib/midtrans/snap";
import { verifyNotificationSignature } from "@/lib/midtrans/signature";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { preorderOrderRequestSchema, preorderPaymentRequestSchema } from "@/lib/validators/preorder";

async function getCustomerId() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("Unable to verify preorder customer:", error.message);
    return { ok: false as const, error: "Sesi tidak dapat diverifikasi. Masuk kembali." };
  }
  if (!data.user) return { ok: false as const, error: "Masuk ke akun customer untuk memesan." };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    console.error("Unable to verify preorder customer profile:", profileError?.message ?? "Profile missing");
    return { ok: false as const, error: "Profil akun tidak dapat diverifikasi." };
  }
  if (profile.role !== "customer") {
    return { ok: false as const, error: "Pre-order online hanya tersedia untuk akun customer." };
  }
  return { ok: true as const, customerId: data.user.id };
}

export async function createPreorderOrderAction(input: unknown) {
  const values = preorderOrderRequestSchema.safeParse(input);
  if (!values.success) {
    return {
      ok: false as const,
      error: values.error.issues[0]?.message ?? "Periksa kembali data pre-order.",
    };
  }

  const customer = await getCustomerId();
  if (!customer.ok) return customer;

  let supabase: ReturnType<typeof createSupabaseServiceClient>;
  try {
    supabase = createSupabaseServiceClient();
  } catch (error: unknown) {
    console.error(
      "Preorder service client is not configured:",
      error instanceof Error ? error.message : "Unknown configuration error",
    );
    return { ok: false as const, error: "Pre-order belum dikonfigurasi di server." };
  }

  const { data: withinLimit, error: rateLimitError } = await supabase.rpc(
    "consume_checkout_rate_limit",
    { p_customer_id: customer.customerId },
  );
  if (rateLimitError) {
    console.error("Unable to enforce preorder rate limit:", rateLimitError.message);
    return { ok: false as const, error: "Pemesanan sedang tidak tersedia. Coba lagi." };
  }
  if (!withinLimit) {
    return { ok: false as const, error: "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi." };
  }

  const valuesData = values.data;
  let shippingAddress = null;
  let pickupStoreLocationId = null;
  if (valuesData.fulfillmentMethod === "shipping") {
    const {
      recipientName,
      phone,
      addressLine,
      city,
      province,
      postalCode,
      latitude,
      longitude,
    } = valuesData;
    if (
      !recipientName || !phone || !addressLine || !city || !province || !postalCode
      || latitude === undefined || longitude === undefined
    ) {
      return { ok: false as const, error: "Lengkapi alamat dan titik pengiriman." };
    }
    shippingAddress = {
      recipient_name: recipientName,
      phone,
      address_line: addressLine,
      city,
      province,
      postal_code: postalCode,
      latitude,
      longitude,
    };
  } else {
    if (!valuesData.pickupStoreLocationId) {
      return { ok: false as const, error: "Pilih lokasi toko untuk mengambil pesanan." };
    }
    pickupStoreLocationId = valuesData.pickupStoreLocationId;
  }

  const { data, error } = await supabase.rpc("create_preorder_order", {
    p_customer_id: customer.customerId,
    p_batch_id: valuesData.batchId,
    p_quantity: valuesData.quantity,
    p_fulfillment_method: valuesData.fulfillmentMethod,
    p_pickup_store_location_id: pickupStoreLocationId,
    p_shipping_address: shippingAddress,
    p_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  if (error) {
    console.error("Unable to create preorder order:", error.message);
    const message = error.message.toLowerCase();
    if (message.includes("insufficient quota") || message.includes("not open")) {
      return { ok: false as const, error: "Batch sudah ditutup atau kuotanya berubah. Muat ulang halaman." };
    }
    if (message.includes("shipping zone")) {
      return { ok: false as const, error: "Alamat berada di luar zona pengiriman aktif." };
    }
    if (message.includes("pickup store")) {
      return { ok: false as const, error: "Lokasi ambil tidak tersedia. Pilih toko lain." };
    }
    if (message.includes("variant is unavailable") || message.includes("product is unavailable")) {
      return { ok: false as const, error: "Produk ini tidak lagi tersedia untuk pre-order." };
    }
    return { ok: false as const, error: "Pesanan pre-order belum dapat dibuat. Periksa data lalu coba lagi." };
  }

  const order = data?.[0];
  if (!order) {
    console.error("Preorder order RPC completed without returning an order.");
    return { ok: false as const, error: "Pesanan pre-order belum dapat dibuat. Coba lagi." };
  }
  revalidatePath("/preorders");
  return {
    ok: true as const,
    order: {
      id: order.order_id,
      orderNumber: order.order_number,
      subtotal: Number(order.subtotal),
      shippingFee: Number(order.shipping_fee),
      total: Number(order.total),
      initialPaymentAmount: Number(order.initial_payment_amount),
      reservationExpiresAt: order.reservation_expires_at,
    },
  };
}

export async function createPreorderPaymentTokenAction(input: unknown) {
  const parsed = preorderPaymentRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Pesanan atau tahap pembayaran tidak valid." };

  if (!getMidtransConfig()) {
    return { ok: false as const, error: "Pembayaran Midtrans belum dikonfigurasi di server." };
  }
  const customer = await getCustomerId();
  if (!customer.ok) return customer;

  const result = await createPreorderPaymentToken({
    customerId: customer.customerId,
    orderId: parsed.data.orderId,
    purpose: parsed.data.purpose,
  });
  if (!result.ok) return result;

  return {
    ok: true as const,
    orderNumber: result.orderNumber,
    providerOrderId: result.providerOrderId,
    amount: result.amount,
    token: result.token,
    redirectUrl: result.redirectUrl,
  };
}

export async function syncPreorderPaymentStatusAction(input: unknown) {
  const parsed = preorderPaymentRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Pesanan atau tahap pembayaran tidak valid." };
  const customer = await getCustomerId();
  if (!customer.ok) return customer;

  const supabase = await createSupabaseServerClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", parsed.data.orderId)
    .eq("customer_id", customer.customerId)
    .maybeSingle();
  if (orderError) {
    console.error("Unable to load preorder payment order:", orderError.message);
    return { ok: false as const, error: "Pesanan belum dapat diperiksa. Coba lagi." };
  }
  if (!order) return { ok: false as const, error: "Pesanan tidak ditemukan pada akun ini." };

  const paymentPurpose: PreorderPaymentPurpose = parsed.data.purpose;
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("provider_order_id")
    .eq("order_id", order.id)
    .eq("purpose", paymentPurpose)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentError) {
    console.error("Unable to load preorder payment:", paymentError.message);
    return { ok: false as const, error: "Pembayaran belum dapat diperiksa. Coba lagi." };
  }
  if (!payment) return { ok: false as const, error: "Transaksi pembayaran belum dibuat." };

  const config = getMidtransConfig();
  if (!config) {
    return { ok: false as const, error: "Pembayaran Midtrans belum dikonfigurasi di server." };
  }
  const status = await fetchTransactionStatus(payment.provider_order_id);
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

  if (status.status.order_id !== payment.provider_order_id || !verifyNotificationSignature({
    orderId: status.status.order_id,
    statusCode: status.status.status_code,
    grossAmount: status.status.gross_amount,
    serverKey: config.serverKey,
    signatureKey: status.status.signature_key,
  })) {
    console.error("Preorder Midtrans status response failed verification.");
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
