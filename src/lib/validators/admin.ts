import { z } from "zod";

export const createBrandSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Gunakan slug huruf kecil, angka, dan tanda hubung."),
});

export const createProductSchema = z.object({
  brandId: z.union([z.uuid(), z.literal("")]).transform((value) => value || null),
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(2).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Gunakan slug huruf kecil, angka, dan tanda hubung."),
  description: z.string().trim().max(2000).optional().transform((value) => value || null),
  isActive: z.enum(["on"]).optional().transform((value) => value === "on"),
});

export const createVariantSchema = z.object({
  productId: z.uuid(),
  sku: z.string().trim().min(3).max(80),
  size: z.string().trim().min(1).max(20),
  color: z.string().trim().min(1).max(60),
  price: z.coerce.number().finite().positive().max(100_000_000),
  lowStockThreshold: z.coerce.number().int().min(0).max(100_000),
});

export const adjustStockSchema = z.object({
  variantId: z.uuid(),
  locationCode: z.enum(["STORE", "ONLINE"]),
  delta: z.coerce.number().int().min(-100_000).max(100_000).refine((value) => value !== 0, "Jumlah penyesuaian tidak boleh nol."),
  note: z.string().trim().min(3).max(500),
});

export const toggleProductSchema = z.object({
  productId: z.uuid(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const variantImageSchema = z.object({
  variantId: z.uuid(),
  imagePath: z.string().min(1).max(300),
}).refine(
  ({ variantId, imagePath }) =>
    imagePath.startsWith(`${variantId}/`) && /\.(?:jpe?g|png|webp|avif)$/i.test(imagePath),
  "Lokasi gambar tidak sesuai dengan varian.",
);
