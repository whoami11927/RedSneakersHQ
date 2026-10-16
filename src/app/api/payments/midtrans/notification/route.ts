import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { applyPaymentNotification } from "@/lib/payments/apply-notification";
import { requireMidtransConfig } from "@/lib/midtrans/config";
import { verifyNotificationSignature } from "@/lib/midtrans/signature";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  createNotificationDeduplicationKey,
  midtransNotificationSchema,
} from "@/lib/validators/midtrans";

/**
 * Midtrans mengulang kiriman webhook sampai menerima 2xx, jadi respons selalu 200 untuk
 * payload yang valid walaupun tidak ada perubahan. Hanya tanda tangan atau rate limit
 * yang menghasilkan kode non-2xx.
 *
 * Node crypto dipakai di handler ini, dan route handler memakai runtime Node secara
 * default pada proyek ini, jadi tidak ada route segment config tambahan.
 */
function sourceKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const address = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(address).digest("hex").slice(0, 32);
}

async function withinRateLimit(key: string): Promise<boolean> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("consume_webhook_rate_limit", {
    p_source_key: key,
  });
  if (error) {
    // Kegagalan pengecekan limit tidak boleh membatalkan notifikasi pembayaran asli.
    console.error("Unable to enforce the webhook rate limit:", error.message);
    return true;
  }
  return data === true;
}

export async function POST(request: NextRequest) {
  let config;
  try {
    config = requireMidtransConfig();
  } catch (error: unknown) {
    console.error("Midtrans webhook is not configured:", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Payment provider is not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("Midtrans webhook sent a body that is not JSON.");
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = midtransNotificationSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("Midtrans webhook payload failed validation:", parsed.error.issues);
    return Response.json({ error: "Invalid notification payload." }, { status: 400 });
  }

  const notification = parsed.data;
  const signatureValid = verifyNotificationSignature({
    orderId: notification.order_id,
    statusCode: notification.status_code,
    grossAmount: notification.gross_amount,
    serverKey: config.serverKey,
    signatureKey: notification.signature_key,
  });
  if (!signatureValid) {
    console.error("Midtrans webhook signature verification failed for order:", notification.order_id);
    return Response.json({ error: "Invalid signature." }, { status: 403 });
  }

  const key = sourceKey(request);
  if (!(await withinRateLimit(key))) {
    console.error("Midtrans webhook rate limit reached for source key:", key);
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  const result = await applyPaymentNotification(notification);
  if (result.outcome === "failed") {
    // 500 membuat Midtrans mencoba ulang; RPC bersifat idempoten sehingga aman.
    return Response.json({ error: "Notification could not be applied." }, { status: 500 });
  }

  return Response.json({
    received: true,
    deduplicationKey: createNotificationDeduplicationKey(notification),
    outcome: result.outcome,
    orderStatus: result.orderStatus,
    paymentStatus: result.paymentStatus,
  });
}
