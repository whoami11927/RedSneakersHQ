import { z } from "zod";
import { checkoutFieldsSchema, validateFulfillment } from "@/lib/validators/checkout";

const jakartaLocalDateTimeSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
  "Masukkan tanggal dan waktu yang valid.",
);

export const preorderOrderFormSchema = checkoutFieldsSchema
  .extend({
    batchId: z.uuid(),
    quantity: z.number().int().min(1).max(10000),
  })
  .superRefine(validateFulfillment);

export const preorderOrderRequestSchema = checkoutFieldsSchema
  .extend({
    batchId: z.uuid(),
    quantity: z.coerce.number().int().min(1).max(10000),
  })
  .superRefine(validateFulfillment);

export const createPreorderBatchSchema = z.object({
  variantId: z.uuid(),
  name: z.string().trim().min(3).max(120),
  quota: z.coerce.number().int().min(1).max(100000),
  opensAt: jakartaLocalDateTimeSchema,
  closesAt: jakartaLocalDateTimeSchema,
  estimatedArrival: z.iso.date(),
  price: z.coerce.number().finite().positive().max(100000000),
  paymentPlan: z.enum(["full", "deposit"]),
  depositPercent: z.string().optional().transform((value) => (
    value === undefined || value.trim() === "" ? null : Number(value)
  )).pipe(z.number().finite().min(1).max(99).nullable()),
  status: z.enum(["draft", "open"]),
}).superRefine((values, context) => {
  if (values.paymentPlan === "deposit") {
    if (values.price < 2) {
      context.addIssue({
        code: "custom",
        path: ["price"],
        message: "Harga skema DP minimal Rp2.",
      });
    }
    if (values.depositPercent === null) {
      context.addIssue({
        code: "custom",
        path: ["depositPercent"],
        message: "Isi persentase DP antara 1 sampai 99.",
      });
    }
  } else if (values.depositPercent !== null) {
    context.addIssue({
      code: "custom",
      path: ["depositPercent"],
      message: "Kosongkan persentase DP untuk pembayaran penuh.",
    });
  }
});

export const preorderBatchStatusSchema = z.object({
  batchId: z.uuid(),
  status: z.enum(["draft", "open", "closed", "cancelled"]),
});

export const preorderReceiptSchema = z.object({
  batchId: z.uuid(),
  receivedQuantity: z.coerce.number().int().min(1).max(100000),
  note: z.string().trim().max(500).optional().transform((value) => value || null),
});

export const preorderPaymentRequestSchema = z.object({
  orderId: z.uuid(),
  purpose: z.enum(["preorder_deposit", "preorder_balance"]),
});

export type PreorderOrderFormValues = z.infer<typeof preorderOrderFormSchema>;
