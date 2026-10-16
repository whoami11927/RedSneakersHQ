import { describe, expect, it } from "vitest";
import { orderFulfillmentSchema, posSaleSchema } from "./pos";

const validSale = {
  requestId: "57f3efb1-7c36-4b71-b525-90154c5535ae",
  storeLocationId: "4f4dbd46-d33d-49a5-9221-5dbbe9bb76fa",
  paymentMethod: "cash",
  items: [{ variantId: "10f6fb48-eedb-4078-bb93-e310f42e9c88", quantity: 2 }],
};

describe("POS sale validation", () => {
  it("accepts a valid sale request", () => {
    expect(posSaleSchema.safeParse(validSale).success).toBe(true);
  });

  it("rejects duplicate variants instead of counting the same line twice", () => {
    const result = posSaleSchema.safeParse({
      ...validSale,
      items: [
        validSale.items[0],
        { ...validSale.items[0], quantity: 1 },
      ],
    });

    expect(result.success).toBe(false);
  });

  it.each([0, 1.5, 10001])("rejects an invalid sale quantity: %s", (quantity) => {
    const result = posSaleSchema.safeParse({
      ...validSale,
      items: [{ ...validSale.items[0], quantity }],
    });

    expect(result.success).toBe(false);
  });
});

describe("order fulfillment validation", () => {
  it("requires a tracking number for shipment", () => {
    const result = orderFulfillmentSchema.safeParse({
      orderId: "57f3efb1-7c36-4b71-b525-90154c5535ae",
      nextStatus: "shipped",
      trackingNumber: "  ",
    });

    expect(result.success).toBe(false);
  });

  it("trims and accepts the shipment tracking number", () => {
    const result = orderFulfillmentSchema.safeParse({
      orderId: "57f3efb1-7c36-4b71-b525-90154c5535ae",
      nextStatus: "shipped",
      trackingNumber: "  JNE-123  ",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.trackingNumber).toBe("JNE-123");
  });
});
