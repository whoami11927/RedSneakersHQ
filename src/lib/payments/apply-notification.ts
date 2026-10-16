import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { mapMidtransPaymentStatus } from "@/lib/midtrans/status-map";
import {
  createNotificationDeduplicationKey,
  type MidtransNotification,
} from "@/lib/validators/midtrans";
import type { Json } from "@/lib/supabase/database.types";

export type NotificationOutcome =
  | "applied"
  | "applied_without_order_change"
  | "recovered"
  | "duplicate"
  | "amount_mismatch"
  | "unknown_payment"
  | "order_missing"
  | "ignored_order_status"
  | "failed";

export type ApplyNotificationResult = {
  outcome: NotificationOutcome;
  orderStatus: string | null;
  paymentStatus: string | null;
};

/**
 * Satu pintu masuk untuk semua notifikasi pembayaran (webhook Midtrans maupun
 * pengecekan status manual). Verifikasi signature tetap dilakukan pemanggil,
 * sedangkan efek terhadap pembayaran, pesanan, dan stok ditangani oleh satu RPC.
 */
export async function applyPaymentNotification(
  notification: MidtransNotification,
): Promise<ApplyNotificationResult> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("apply_payment_notification", {
    p_provider_order_id: notification.order_id,
    p_provider_transaction_id: notification.transaction_id ?? "",
    p_transaction_status: notification.transaction_status,
    p_fraud_status: notification.fraud_status ?? "",
    p_payment_type: notification.payment_type ?? "",
    p_payment_status: mapMidtransPaymentStatus({
      transactionStatus: notification.transaction_status,
      fraudStatus: notification.fraud_status,
    }),
    p_gross_amount: Number(notification.gross_amount),
    p_paid_at: notification.settlement_time
      ? new Date(`${notification.settlement_time.replace(" ", "T")}+07:00`).toISOString()
      : null,
    p_deduplication_key: createNotificationDeduplicationKey(notification),
    p_payload: notification as unknown as Json,
  });

  if (error) {
    console.error("Unable to apply the Midtrans payment notification:", error.message);
    return { outcome: "failed", orderStatus: null, paymentStatus: null };
  }

  const row = data?.[0];
  if (!row) {
    console.error("Payment notification RPC completed without returning a row.");
    return { outcome: "failed", orderStatus: null, paymentStatus: null };
  }

  return {
    outcome: row.outcome as NotificationOutcome,
    orderStatus: row.order_status,
    paymentStatus: row.payment_status,
  };
}
