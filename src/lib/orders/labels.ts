import type { Database } from "@/lib/supabase/database.types";

type OrderStatus = Database["public"]["Enums"]["order_status"];
type PaymentStatus = Database["public"]["Enums"]["payment_status"];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Menunggu pembayaran",
  paid: "Sudah dibayar",
  processing: "Sedang diproses",
  shipped: "Dikirim",
  ready_for_pickup: "Siap diambil",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  refunded: "Dana dikembalikan",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Menunggu",
  settlement: "Lunas",
  expire: "Kedaluwarsa",
  cancel: "Dibatalkan",
  deny: "Ditolak",
  refund: "Refund",
  partial_refund: "Refund sebagian",
};

export function orderStatusLabel(status: OrderStatus | null | undefined) {
  return status ? ORDER_STATUS_LABELS[status] : "Tidak diketahui";
}

export function paymentStatusLabel(status: PaymentStatus | null | undefined) {
  return status ? PAYMENT_STATUS_LABELS[status] : "Belum ada pembayaran";
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(date);
}
