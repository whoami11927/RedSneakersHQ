"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/supabase/viewer";
import {
  createPreorderBatchSchema,
  preorderBatchStatusSchema,
  preorderReceiptSchema,
} from "@/lib/validators/preorder";

export type PreorderAdminActionState = { error?: string; success?: string };

function parseForm<T>(schema: z.ZodType<T>, formData: FormData) {
  const result = schema.safeParse(Object.fromEntries(formData));
  if (result.success) return { data: result.data, error: undefined };
  return {
    data: undefined,
    error: result.error.issues[0]?.message ?? "Periksa kembali data yang dimasukkan.",
  };
}

function jakartaDateTimeToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const localTime = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  ));
  if (
    localTime.getUTCFullYear() !== Number(year)
    || localTime.getUTCMonth() !== Number(month) - 1
    || localTime.getUTCDate() !== Number(day)
    || localTime.getUTCHours() !== Number(hour)
    || localTime.getUTCMinutes() !== Number(minute)
  ) return null;
  const date = new Date(localTime.getTime() - 7 * 60 * 60 * 1000);
  return date.toISOString();
}

function refreshPreorderPaths() {
  revalidatePath("/admin/preorders");
  revalidatePath("/preorders");
  revalidatePath("/orders");
}

export async function createPreorderBatchAction(
  _previousState: PreorderAdminActionState,
  formData: FormData,
): Promise<PreorderAdminActionState> {
  const actor = await requireAdmin();
  const parsed = parseForm(createPreorderBatchSchema, formData);
  if (parsed.error || !parsed.data) return { error: parsed.error };

  const opensAt = jakartaDateTimeToIso(parsed.data.opensAt);
  const closesAt = jakartaDateTimeToIso(parsed.data.closesAt);
  if (!opensAt || !closesAt || new Date(closesAt) <= new Date(opensAt)) {
    return { error: "Periode buka dan tutup batch tidak valid." };
  }

  let supabase: ReturnType<typeof createSupabaseServiceClient>;
  try {
    supabase = createSupabaseServiceClient();
  } catch (error: unknown) {
    console.error(
      "Preorder admin service client is not configured:",
      error instanceof Error ? error.message : "Unknown configuration error",
    );
    return { error: "Pre-order belum dikonfigurasi di server." };
  }

  const { error } = await supabase.rpc("create_preorder_batch", {
    p_actor_id: actor.userId,
    p_variant_id: parsed.data.variantId,
    p_name: parsed.data.name,
    p_quota: parsed.data.quota,
    p_opens_at: opensAt,
    p_closes_at: closesAt,
    p_estimated_arrival: parsed.data.estimatedArrival,
    p_price: parsed.data.price,
    p_payment_plan: parsed.data.paymentPlan,
    p_deposit_percent: parsed.data.depositPercent,
    p_initial_status: parsed.data.status,
  });
  if (error) {
    console.error("Preorder batch creation failed:", error.message);
    return { error: "Batch tidak dapat dibuat. Pastikan varian aktif dan data periode benar." };
  }

  refreshPreorderPaths();
  return { success: "Batch pre-order berhasil dibuat." };
}

export async function setPreorderBatchStatusAction(
  _previousState: PreorderAdminActionState,
  formData: FormData,
): Promise<PreorderAdminActionState> {
  const actor = await requireAdmin();
  const parsed = parseForm(preorderBatchStatusSchema, formData);
  if (parsed.error || !parsed.data) return { error: parsed.error };

  let supabase: ReturnType<typeof createSupabaseServiceClient>;
  try {
    supabase = createSupabaseServiceClient();
  } catch (error: unknown) {
    console.error(
      "Preorder admin service client is not configured:",
      error instanceof Error ? error.message : "Unknown configuration error",
    );
    return { error: "Pre-order belum dikonfigurasi di server." };
  }

  const { error } = await supabase.rpc("set_preorder_batch_status", {
    p_actor_id: actor.userId,
    p_batch_id: parsed.data.batchId,
    p_status: parsed.data.status,
  });
  if (error) {
    console.error("Preorder batch status update failed:", error.message);
    return { error: "Status batch tidak dapat diperbarui. Periksa kuota dan status penerimaan." };
  }

  refreshPreorderPaths();
  return { success: "Status batch diperbarui." };
}

export async function receivePreorderBatchAction(
  _previousState: PreorderAdminActionState,
  formData: FormData,
): Promise<PreorderAdminActionState> {
  const actor = await requireAdmin();
  const parsed = parseForm(preorderReceiptSchema, formData);
  if (parsed.error || !parsed.data) return { error: parsed.error };

  let supabase: ReturnType<typeof createSupabaseServiceClient>;
  try {
    supabase = createSupabaseServiceClient();
  } catch (error: unknown) {
    console.error(
      "Preorder admin service client is not configured:",
      error instanceof Error ? error.message : "Unknown configuration error",
    );
    return { error: "Pre-order belum dikonfigurasi di server." };
  }

  const { data, error } = await supabase.rpc("receive_preorder_batch", {
    p_actor_id: actor.userId,
    p_batch_id: parsed.data.batchId,
    p_received_quantity: parsed.data.receivedQuantity,
    p_note: parsed.data.note,
  });
  if (error) {
    console.error("Preorder batch receipt failed:", error.message);
    if (error.message.toLowerCase().includes("unpaid reservations")) {
      return { error: "Tunggu sampai reservasi pembayaran aktif selesai atau kedaluwarsa." };
    }
    if (error.message.toLowerCase().includes("below paid")) {
      return { error: "Jumlah diterima tidak boleh lebih kecil dari jumlah pre-order yang sudah dibayar." };
    }
    return { error: "Penerimaan tidak dapat dicatat. Periksa jumlah dan status batch." };
  }

  refreshPreorderPaths();
  return {
    success: `Penerimaan tercatat. ${data ?? 0} pesanan bergerak ke tahap berikutnya.`,
  };
}
