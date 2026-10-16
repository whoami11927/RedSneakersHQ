import type { Database } from "@/lib/supabase/database.types";

type PaymentStatus = Database["public"]["Enums"]["payment_status"];

/**
 * Peta status Midtrans ke enum `public.payment_status`.
 *
 * Satu-satunya tempat penerjemahan status agar bisa diuji unit test; SQL menerima hasil
 * pemetaan ini sehingga database tidak perlu tahu detail status Midtrans.
 *
 * Catatan `capture`: status transaksi bergantung pada `fraud_status` hasil Midtrans FDS.
 * `accept` berarti dana sudah ditangkap sehingga setara `settlement`, `challenge` berarti
 * menunggu keputusan manual sehingga tetap `pending`, selain itu berarti ditolak.
 */
export function mapMidtransPaymentStatus(input: {
  transactionStatus: string;
  fraudStatus?: string | null;
}): PaymentStatus {
  const status = input.transactionStatus.trim().toLowerCase();
  const fraud = (input.fraudStatus ?? "").trim().toLowerCase();

  switch (status) {
    case "settlement":
    case "capture":
      if (status === "capture" && fraud !== "accept") {
        return fraud === "challenge" ? "pending" : "deny";
      }
      return "settlement";
    case "pending":
      return "pending";
    case "deny":
    case "failure":
      return "deny";
    case "cancel":
      return "cancel";
    case "expire":
      return "expire";
    case "refund":
      return "refund";
    case "partial_refund":
      return "partial_refund";
    default:
      // Status yang tidak dikenal diperlakukan sebagai belum selesai, bukan sebagai gagal,
      // agar tidak ada pesanan yang dibatalkan karena status baru yang belum dikenal.
      return "pending";
  }
}
