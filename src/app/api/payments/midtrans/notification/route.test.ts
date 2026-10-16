import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({ rpc: rpcMock }),
}));

vi.mock("@/lib/midtrans/config", () => ({
  requireMidtransConfig: () => ({
    serverKey: "SB-Mid-server-EXAMPLEKEY1234567890",
    isProduction: false,
    snapApiUrl: "https://app.sandbox.midtrans.com/snap/v1/transactions",
    statusApiUrl: "https://api.sandbox.midtrans.com/v2",
    snapJsUrl: "https://app.sandbox.midtrans.com/snap/snap.js",
  }),
}));

const serverKey = "SB-Mid-server-EXAMPLEKEY1234567890";

function signature(orderId: string, statusCode: string, grossAmount: string) {
  return createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex");
}

function notification(overrides: Record<string, unknown> = {}) {
  const orderId = "RSH-20261015-000004";
  const statusCode = "200";
  const grossAmount = "1250000.00";
  return {
    transaction_status: "settlement",
    order_id: orderId,
    gross_amount: grossAmount,
    status_code: statusCode,
    signature_key: signature(orderId, statusCode, grossAmount),
    transaction_id: "txn-0004",
    fraud_status: "accept",
    payment_type: "bank_transfer",
    ...overrides,
  };
}

const appliedRow = [
  { outcome: "applied", order_status: "paid", payment_status: "settlement" },
];

function stubRpc(handler?: (name: string) => Promise<unknown>) {
  rpcMock.mockImplementation((name: string) => {
    if (handler) return handler(name);
    if (name === "consume_webhook_rate_limit") {
      return Promise.resolve({ data: true, error: null });
    }
    return Promise.resolve({ data: appliedRow, error: null });
  });
}

async function callRoute(body: string) {
  const { POST } = await import("@/app/api/payments/midtrans/notification/route");
  return POST(
    new Request("https://shop.test/api/payments/midtrans/notification", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    }) as never,
  );
}

function lastApplyArguments() {
  const call = rpcMock.mock.calls.find(([name]) => name === "apply_payment_notification");
  return call?.[1] as Record<string, unknown> | undefined;
}

describe("Midtrans webhook route", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    stubRpc();
  });
  it("accepts a validly signed settlement notification and applies it once", async () => {
    const response = await callRoute(JSON.stringify(notification()));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcome).toBe("applied");
    expect(body.orderStatus).toBe("paid");

    const arguments_ = lastApplyArguments();
    expect(arguments_?.p_payment_status).toBe("settlement");
    expect(arguments_?.p_gross_amount).toBe(1250000);
    expect(String(arguments_?.p_deduplication_key)).toContain("RSH-20261015-000004");
  });

  it("rejects a notification with an invalid signature and never touches the database", async () => {
    const response = await callRoute(
      JSON.stringify(notification({ signature_key: "a".repeat(128) })),
    );

    expect(response.status).toBe(403);
    expect(lastApplyArguments()).toBeUndefined();
  });

  it("rejects a notification whose gross_amount was tampered with", async () => {
    const response = await callRoute(JSON.stringify(notification({ gross_amount: "1.00" })));

    expect(response.status).toBe(403);
    expect(lastApplyArguments()).toBeUndefined();
  });

  it("rejects a payload with missing required fields", async () => {
    const response = await callRoute(
      JSON.stringify({ order_id: "RSH-20261015-000004", gross_amount: "10.00" }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects a body that is not JSON", async () => {
    const response = await callRoute("not json at all");
    expect(response.status).toBe(400);
  });

  it("answers 200 for a duplicate notification without repeating effects", async () => {
    stubRpc((name) =>
      name === "consume_webhook_rate_limit"
        ? Promise.resolve({ data: true, error: null })
        : Promise.resolve({
            data: [{ outcome: "duplicate", order_status: "paid", payment_status: "settlement" }],
            error: null,
          }),
    );

    const response = await callRoute(JSON.stringify(notification()));
    expect(response.status).toBe(200);
    expect((await response.json()).outcome).toBe("duplicate");
  });

  it("handles expire, cancel, and deny notifications", async () => {
    for (const [transactionStatus, statusCode] of [
      ["expire", "407"],
      ["cancel", "202"],
      ["deny", "202"],
    ]) {
      rpcMock.mockReset();
      stubRpc((name) =>
        name === "consume_webhook_rate_limit"
          ? Promise.resolve({ data: true, error: null })
          : Promise.resolve({
              data: [
                {
                  outcome: "applied",
                  order_status: "cancelled",
                  payment_status: transactionStatus,
                },
              ],
              error: null,
            }),
      );

      const response = await callRoute(
        JSON.stringify(
          notification({
            transaction_status: transactionStatus,
            fraud_status: undefined,
            status_code: statusCode,
            signature_key: signature("RSH-20261015-000004", statusCode, "1250000.00"),
          }),
        ),
      );

      expect(response.status).toBe(200);
      expect(lastApplyArguments()?.p_payment_status).toBe(transactionStatus);
    }
  });

  it("handles refund notifications", async () => {
    stubRpc((name) =>
      name === "consume_webhook_rate_limit"
        ? Promise.resolve({ data: true, error: null })
        : Promise.resolve({
            data: [{ outcome: "applied", order_status: "refunded", payment_status: "refund" }],
            error: null,
          }),
    );

    const response = await callRoute(JSON.stringify(notification({ transaction_status: "refund" })));
    expect(response.status).toBe(200);
    expect(lastApplyArguments()?.p_payment_status).toBe("refund");
  });

  it("returns 429 when the rate limit is exhausted", async () => {
    stubRpc((name) =>
      name === "consume_webhook_rate_limit"
        ? Promise.resolve({ data: false, error: null })
        : Promise.resolve({ data: appliedRow, error: null }),
    );

    expect((await callRoute(JSON.stringify(notification()))).status).toBe(429);
  });

  it("returns 500 when the notification cannot be applied so Midtrans retries", async () => {
    stubRpc((name) =>
      name === "consume_webhook_rate_limit"
        ? Promise.resolve({ data: true, error: null })
        : Promise.resolve({ data: null, error: { message: "db offline" } }),
    );

    expect((await callRoute(JSON.stringify(notification()))).status).toBe(500);
  });
});
