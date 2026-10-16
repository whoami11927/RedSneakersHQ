import { z } from "zod";

const coordinateSchema = z.number().finite();

export const checkoutFieldsSchema = z.object({
  fulfillmentMethod: z.enum(["shipping", "pickup"]),
  pickupStoreLocationId: z.uuid().optional(),
  recipientName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(24).optional(),
  addressLine: z.string().trim().max(240).optional(),
  city: z.string().trim().max(100).optional(),
  province: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(10).optional(),
  latitude: coordinateSchema.optional(),
  longitude: coordinateSchema.optional(),
});

export function validateFulfillment(
  values: z.infer<typeof checkoutFieldsSchema>,
  context: z.RefinementCtx,
) {
  if (values.fulfillmentMethod === "pickup") {
    if (!values.pickupStoreLocationId) {
      context.addIssue({
        code: "custom",
        path: ["pickupStoreLocationId"],
        message: "Pilih lokasi toko untuk ambil pesanan.",
      });
    }
    return;
  }

  const requiredFields = [
    ["recipientName", values.recipientName, "Nama penerima wajib diisi."],
    ["phone", values.phone, "Nomor telepon wajib diisi."],
    ["addressLine", values.addressLine, "Alamat lengkap wajib diisi."],
    ["city", values.city, "Kota wajib diisi."],
    ["province", values.province, "Provinsi wajib diisi."],
    ["postalCode", values.postalCode, "Kode pos wajib diisi."],
  ] as const;

  for (const [field, value, message] of requiredFields) {
    if (!value || value.length < (field === "phone" ? 8 : 2)) {
      context.addIssue({ code: "custom", path: [field], message });
    }
  }

  if (values.phone && !/^[+\d][\d\s()-]{7,23}$/.test(values.phone)) {
    context.addIssue({
      code: "custom",
      path: ["phone"],
      message: "Masukkan nomor telepon yang valid.",
    });
  }
  if (values.postalCode && !/^\d{5}$/.test(values.postalCode)) {
    context.addIssue({
      code: "custom",
      path: ["postalCode"],
      message: "Kode pos harus berisi 5 angka.",
    });
  }
  if (values.latitude === undefined || values.longitude === undefined) {
    context.addIssue({
      code: "custom",
      path: ["latitude"],
      message: "Tentukan titik alamat pada peta.",
    });
  } else if (
    values.latitude < -90
    || values.latitude > 90
    || values.longitude < -180
    || values.longitude > 180
  ) {
    context.addIssue({
      code: "custom",
      path: ["latitude"],
      message: "Koordinat di luar jangkauan yang valid.",
    });
  }
}

export const checkoutFormSchema = checkoutFieldsSchema.superRefine(validateFulfillment);
export type CheckoutFormValues = z.infer<typeof checkoutFormSchema>;

const checkoutLineSchema = z.object({
  variantId: z.uuid(),
  quantity: z.number().int().min(1).max(10000),
});

export const checkoutRequestSchema = checkoutFieldsSchema.extend({
  items: z.array(checkoutLineSchema).min(1).max(30),
}).superRefine((values, context) => {
  validateFulfillment(values, context);
  const variantIds = values.items.map((item) => item.variantId);
  if (new Set(variantIds).size !== variantIds.length) {
    context.addIssue({
      code: "custom",
      path: ["items"],
      message: "Keranjang memuat varian duplikat. Muat ulang halaman keranjang.",
    });
  }
});

export const shippingQuoteSchema = z.object({
  latitude: coordinateSchema.min(-90).max(90),
  longitude: coordinateSchema.min(-180).max(180),
});
