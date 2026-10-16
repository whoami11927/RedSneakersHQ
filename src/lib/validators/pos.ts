import { z } from "zod";

export const posSaleSchema = z.object({
  requestId: z.uuid(),
  storeLocationId: z.uuid(),
  paymentMethod: z.enum(["cash", "card", "bank_transfer", "qris"]),
  items: z.array(z.object({
    variantId: z.uuid(),
    quantity: z.number().int().min(1).max(10000),
  })).min(1).max(30),
}).superRefine((values, context) => {
  const variantIds = values.items.map((item) => item.variantId);
  if (new Set(variantIds).size !== variantIds.length) {
    context.addIssue({
      code: "custom",
      path: ["items"],
      message: "Varian duplikat pada transaksi. Gabungkan jumlah lalu coba lagi.",
    });
  }
});

export const orderFulfillmentSchema = z.object({
  orderId: z.uuid(),
  nextStatus: z.enum(["processing", "shipped", "ready_for_pickup", "completed"]),
  trackingNumber: z.string().trim().max(100).optional().transform((value) => value || null),
}).superRefine((values, context) => {
  if (values.nextStatus === "shipped" && !values.trackingNumber) {
    context.addIssue({
      code: "custom",
      path: ["trackingNumber"],
      message: "Nomor resi wajib diisi sebelum pesanan ditandai sudah dikirim.",
    });
  }
});

export type PosSaleInput = z.infer<typeof posSaleSchema>;
