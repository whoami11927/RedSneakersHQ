"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/supabase/viewer";
import {
  adjustStockSchema,
  createBrandSchema,
  createProductSchema,
  createVariantSchema,
  toggleProductSchema,
  variantImageSchema,
} from "@/lib/validators/admin";

export type AdminActionState = { error?: string; success?: string };

function parseForm<T>(schema: z.ZodType<T>, formData: FormData) {
  const result = schema.safeParse(Object.fromEntries(formData));
  if (result.success) return { data: result.data, error: undefined };
  return { data: undefined, error: result.error.issues[0]?.message ?? "Periksa kembali data yang dimasukkan." };
}

export async function createBrandAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  const parsed = parseForm(createBrandSchema, formData);
  if (parsed.error || !parsed.data) return { error: parsed.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("brands").insert({
    name: parsed.data.name,
    slug: parsed.data.slug,
  });
  if (error) {
    console.error("Brand creation failed:", error.message);
    return { error: "Merek tidak dapat dibuat. Periksa apakah nama atau slug sudah digunakan." };
  }

  revalidatePath("/admin/products");
  revalidatePath("/");
  return { success: "Merek berhasil ditambahkan." };
}

export async function createProductAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  const parsed = parseForm(createProductSchema, formData);
  if (parsed.error || !parsed.data) return { error: parsed.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("products").insert({
    brand_id: parsed.data.brandId,
    name: parsed.data.name,
    slug: parsed.data.slug,
    description: parsed.data.description,
    is_active: parsed.data.isActive,
  });
  if (error) {
    console.error("Product creation failed:", error.message);
    return { error: "Produk tidak dapat dibuat. Periksa apakah slug sudah digunakan." };
  }

  revalidatePath("/");
  revalidatePath("/admin/products");
  return { success: "Produk berhasil ditambahkan." };
}

export async function createVariantAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  const parsed = parseForm(createVariantSchema, formData);
  if (parsed.error || !parsed.data) return { error: parsed.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("product_variants").insert({
    product_id: parsed.data.productId,
    sku: parsed.data.sku,
    size: parsed.data.size,
    color: parsed.data.color,
    price: parsed.data.price,
    low_stock_threshold: parsed.data.lowStockThreshold,
  });
  if (error) {
    console.error("Variant creation failed:", error.message);
    return { error: "Varian tidak dapat dibuat. Periksa SKU dan kombinasi ukuran-warna." };
  }

  revalidatePath("/");
  revalidatePath("/admin/products");
  return { success: "Varian berhasil ditambahkan. Atur saldo awal lewat penyesuaian stok." };
}

export async function adjustStockAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const actor = await requireAdmin();
  const parsed = parseForm(adjustStockSchema, formData);
  if (parsed.error || !parsed.data) return { error: parsed.error };

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.rpc("adjust_stock", {
    p_variant_id: parsed.data.variantId,
    p_location_code: parsed.data.locationCode,
    p_delta: parsed.data.delta,
    p_note: parsed.data.note,
    p_created_by: actor.userId,
  });
  if (error) {
    console.error("Stock adjustment failed:", error.message);
    return { error: "Penyesuaian ditolak. Pastikan stok tidak dikurangi di bawah jumlah yang sudah dipesan." };
  }

  revalidatePath("/");
  revalidatePath("/admin/products");
  return { success: "Saldo stok diperbarui dan dicatat di ledger." };
}

export async function toggleProductActiveAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin();
  const parsed = parseForm(toggleProductSchema, formData);
  if (parsed.error || !parsed.data) return { error: parsed.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.productId);
  if (error) {
    console.error("Product visibility update failed:", error.message);
    return { error: "Status produk tidak dapat diperbarui." };
  }
  revalidatePath("/");
  revalidatePath("/admin/products");
  return { success: parsed.data.isActive ? "Produk ditampilkan di katalog." : "Produk disembunyikan dari katalog." };
}

export async function setVariantImage(input: unknown): Promise<AdminActionState> {
  await requireAdmin();
  const parsed = variantImageSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Lokasi gambar tidak valid." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("product_variants")
    .update({ image_path: parsed.data.imagePath })
    .eq("id", parsed.data.variantId);
  if (error) {
    console.error("Variant image update failed:", error.message);
    return { error: "Gambar tersimpan, tetapi belum dapat dipasang pada varian." };
  }
  revalidatePath("/");
  revalidatePath("/admin/products");
  return { success: "Gambar produk berhasil diperbarui." };
}
