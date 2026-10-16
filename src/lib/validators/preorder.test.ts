import { describe, expect, it } from "vitest";
import {
  createPreorderBatchSchema,
  preorderOrderRequestSchema,
  preorderPaymentRequestSchema,
} from "@/lib/validators/preorder";

const batchId = "11111111-1111-4111-8111-111111111111";
const variantId = "22222222-2222-4222-8222-222222222222";
const orderId = "33333333-3333-4333-8333-333333333333";

describe("preorder request validation", () => {
  it("accepts a valid pickup order and coerces its quantity", () => {
    const result = preorderOrderRequestSchema.safeParse({
      batchId,
      quantity: "2",
      fulfillmentMethod: "pickup",
      pickupStoreLocationId: variantId,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.quantity).toBe(2);
  });

  it("rejects orders without a pickup location or with an invalid quantity", () => {
    const result = preorderOrderRequestSchema.safeParse({
      batchId,
      quantity: "0",
      fulfillmentMethod: "pickup",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual(["quantity"]);
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual(["pickupStoreLocationId"]);
    }
  });

  it("requires a valid DP percentage only for deposit batches", () => {
    const common = {
      variantId,
      name: "Drop musim baru",
      quota: "25",
      opensAt: "2026-06-01T10:00",
      closesAt: "2026-06-15T22:00",
      estimatedArrival: "2026-08-01",
      price: "1200000",
      status: "draft",
    };

    expect(createPreorderBatchSchema.safeParse({
      ...common,
      paymentPlan: "deposit",
      depositPercent: "30",
    }).success).toBe(true);
    expect(createPreorderBatchSchema.safeParse({
      ...common,
      paymentPlan: "deposit",
      depositPercent: "",
    }).success).toBe(false);
    expect(createPreorderBatchSchema.safeParse({
      ...common,
      paymentPlan: "full",
      depositPercent: "30",
    }).success).toBe(false);
  });

  it("restricts payment retries to preorder payment purposes", () => {
    expect(preorderPaymentRequestSchema.safeParse({
      orderId,
      purpose: "preorder_balance",
    }).success).toBe(true);
    expect(preorderPaymentRequestSchema.safeParse({
      orderId,
      purpose: "regular",
    }).success).toBe(false);
  });
});
