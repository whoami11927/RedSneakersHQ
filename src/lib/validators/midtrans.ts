import { z } from "zod";

/**
 * Skema notifikasi HTTP Midtrans. Semua field yang dipakai untuk keputusan bisnis
 * divalidasi di sini; field lain yang dikirim Midtrans tetap diizinkan lewat catchall
 * supaya payload lengkap bisa disimpan sebagai bukti.
 */
export const midtransNotificationSchema = z.looseObject({
  transaction_status: z.string().trim().min(1).max(40),
  order_id: z.string().trim().min(1).max(50),
  gross_amount: z.string().trim().min(1).max(20),
  status_code: z.string().trim().regex(/^\d{3}$/),
  signature_key: z.string().trim().min(1).max(200),
  transaction_id: z.string().trim().max(100).optional(),
  fraud_status: z.string().trim().max(40).optional(),
  payment_type: z.string().trim().max(60).optional(),
  transaction_time: z.string().trim().max(40).optional(),
  settlement_time: z.string().trim().max(40).optional(),
  currency: z.string().trim().max(8).optional(),
});

export type MidtransNotification = z.infer<typeof midtransNotificationSchema>;

/**
 * Kunci idempotensi. Dua notifikasi yang identik (termasuk retry Midtrans) menghasilkan
 * kunci yang sama, sedangkan perubahan status nyata menghasilkan kunci baru.
 */
export function createNotificationDeduplicationKey(
  notification: Pick<MidtransNotification, "order_id" | "status_code" | "gross_amount" | "transaction_status" | "transaction_id">,
): string {
  return [
    notification.order_id,
    notification.status_code,
    notification.gross_amount,
    notification.transaction_status,
    notification.transaction_id ?? "-",
  ].join(":");
}
