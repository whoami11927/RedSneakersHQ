import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createNotificationDeduplicationKey,
  midtransNotificationSchema,
} from "@/lib/validators/midtrans";

const serverKey = "SB-Mid-server-EXAMPLEKEY1234567890";

function signature(orderId: string, statusCode: string, grossAmount: string) {
  return createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex");
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    transaction_status: "settlement",
    order_id: "RSH-20261015-000003",
    gross_amount: "1250000.00",
    status_code: "200",
    signature_key: signature("RSH-20261015-000003", "200", "1250000.00"),
    transaction_id: "txn-0001",
    fraud_status: "accept",
    payment_type: "bank_transfer",
    ...overrides,
  };
}

describe("midtransNotificationSchema", () => {
  it("accepts a complete notification payload", () => {
    const parsed = midtransNotificationSchema.safeParse(payload());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.transaction_status).toBe("settlement");
      expect(parsed.data.gross_amount).toBe("1250000.00");
    }
  });

  it("keeps extra Midtrans fields so the full payload can be stored as evidence", () => {
    const parsed = midtransNotificationSchema.safeParse(payload({ merchant_id: "G123456789" }));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.merchant_id).toBe("G123456789");
    }
  });

  it("rejects a payload without a signature", () => {
    const unsigned = { ...payload() };
    delete (unsigned as Record<string, unknown>).signature_key;
    expect(midtransNotificationSchema.safeParse(unsigned).success).toBe(false);
  });

  it("rejects a payload with a non-numeric status code", () => {
    expect(midtransNotificationSchema.safeParse(payload({ status_code: "OK" })).success).toBe(
      false,
    );
  });

  it("rejects an empty transaction status", () => {
    expect(
      midtransNotificationSchema.safeParse(payload({ transaction_status: "   " })).success,
    ).toBe(false);
  });
});

describe("createNotificationDeduplicationKey", () => {
  it("produces the same key for a retried identical notification", () => {
    const first = createNotificationDeduplicationKey(payload());
    const retried = createNotificationDeduplicationKey(payload());
    expect(first).toBe(retried);
  });

  it("ignores fields that are not part of the identity, such as payment_type", () => {
    const withoutPaymentType = { ...payload() };
    delete (withoutPaymentType as Record<string, unknown>).payment_type;
    expect(createNotificationDeduplicationKey(withoutPaymentType)).toBe(
      createNotificationDeduplicationKey(payload()),
    );
  });

  it("produces a different key when the status changes", () => {
    const pending = createNotificationDeduplicationKey(
      payload({ transaction_status: "pending", status_code: "201" }),
    );
    const settled = createNotificationDeduplicationKey(payload());
    expect(pending).not.toBe(settled);
  });

  it("produces a different key for a different transaction id", () => {
    expect(createNotificationDeduplicationKey(payload({ transaction_id: "txn-0002" }))).not.toBe(
      createNotificationDeduplicationKey(payload({ transaction_id: "txn-0001" })),
    );
  });

  it("falls back to a placeholder when the transaction id is missing", () => {
    const withoutTransactionId = { ...payload() };
    delete (withoutTransactionId as Record<string, unknown>).transaction_id;
    const key = createNotificationDeduplicationKey(withoutTransactionId);

    expect(key.endsWith(":-")).toBe(true);
    expect(key).not.toBe(createNotificationDeduplicationKey(payload()));
  });
});
