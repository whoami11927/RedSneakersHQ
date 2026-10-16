import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewerState } from "@/lib/supabase/viewer";
import type { Database } from "@/lib/supabase/database.types";
import { csvCell } from "@/lib/reports/csv";

const PAGE_SIZE = 1000;
const MAX_EXPORT_ROWS = 10000;
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

function csvResponse(body: string, status: number) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const viewer = await getViewerState();
  if (viewer.status === "signed_out") return csvResponse("Masuk sebagai admin untuk mengunduh laporan.", 401);
  if (viewer.status !== "signed_in") return csvResponse("Sesi admin tidak dapat diverifikasi.", 503);
  if (viewer.profile.role !== "admin") return csvResponse("Akses laporan admin ditolak.", 403);

  const url = new URL(request.url);
  const rawDays = url.searchParams.get("days") ?? "30";
  if (!["7", "30", "90"].includes(rawDays)) {
    return csvResponse("Rentang laporan harus 7, 30, atau 90 hari.", 400);
  }
  const days = Number(rawDays);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const supabase = await createSupabaseServerClient();

  const payments: Pick<
    PaymentRow,
    "id" | "order_id" | "provider" | "amount" | "status" | "purpose" | "payment_type" | "paid_at"
  >[] = [];
  for (let offset = 0; offset <= MAX_EXPORT_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("payments")
      .select("id, order_id, provider, amount, status, purpose, payment_type, paid_at")
      .eq("status", "settlement")
      .gte("paid_at", since)
      .lte("paid_at", new Date().toISOString())
      .order("paid_at", { ascending: true })
      .order("order_id", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error("Admin CSV payment query failed:", error.message);
      return csvResponse("Pembayaran tidak dapat diekspor saat ini.", 500);
    }
    payments.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  if (payments.length > MAX_EXPORT_ROWS) {
    return csvResponse("Laporan melebihi batas 10000 baris. Pilih rentang yang lebih pendek.", 413);
  }

  const orderNumbers = new Map<string, string>();
  const orderIds = [...new Set(payments.map((payment) => payment.order_id))];
  for (let offset = 0; offset < orderIds.length; offset += 500) {
    const ids = orderIds.slice(offset, offset + 500);
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number")
      .in("id", ids);
    if (error) {
      console.error("Admin CSV order query failed:", error.message);
      return csvResponse("Nomor pesanan tidak dapat dimuat untuk laporan.", 500);
    }
    for (const order of data) orderNumbers.set(order.id, order.order_number);
  }

  const rows = [
    ["Dibayar pada", "Nomor pesanan", "Kanal", "Tahap", "Metode", "Status", "Nominal (IDR)"],
    ...payments.map((payment) => [
      payment.paid_at ?? "",
      orderNumbers.get(payment.order_id) ?? "",
      payment.provider === "offline" ? "Toko fisik" : "Online",
      payment.purpose,
      payment.payment_type,
      payment.status,
      Number(payment.amount).toFixed(2),
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="red-sneakers-hq-pembayaran-${days}hari.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
