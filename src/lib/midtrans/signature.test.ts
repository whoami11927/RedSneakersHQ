import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createNotificationSignature,
  createSnapAuthorization,
  verifyNotificationSignature,
} from "@/lib/midtrans/signature";

const serverKey = "SB-Mid-server-EXAMPLEKEY1234567890";

function signature(orderId: string, statusCode: string, grossAmount: string) {
  return createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex");
}

describe("createNotificationSignature", () => {
  it("matches SHA512(order_id + status_code + gross_amount + serverKey)", () => {
    const orderId = "RSH-20261015-000001";
    const statusCode = "200";
    const grossAmount = "1250000.00";

    expect(
      createNotificationSignature({ orderId, statusCode, grossAmount, serverKey }),
    ).toBe(signature(orderId, statusCode, grossAmount));
  });

  it("treats gross_amount as the raw payload string, not a rounded number", () => {
    const withDecimals = createNotificationSignature({
      orderId: "A",
      statusCode: "200",
      grossAmount: "1000.00",
      serverKey,
    });
    const withoutDecimals = createNotificationSignature({
      orderId: "A",
      statusCode: "200",
      grossAmount: "1000",
      serverKey,
    });

    expect(withDecimals).not.toBe(withoutDecimals);
  });
});

describe("verifyNotificationSignature", () => {
  const base = {
    orderId: "RSH-20261015-000002",
    statusCode: "200",
    grossAmount: "899000.00",
    serverKey,
  };

  it("accepts a signature produced with the same server key", () => {
    expect(
      verifyNotificationSignature({
        ...base,
        signatureKey: signature(base.orderId, base.statusCode, base.grossAmount),
      }),
    ).toBe(true);
  });

  it("accepts an uppercase signature", () => {
    expect(
      verifyNotificationSignature({
        ...base,
        signatureKey: signature(base.orderId, base.statusCode, base.grossAmount).toUpperCase(),
      }),
    ).toBe(true);
  });

  it("rejects a signature built with a different server key", () => {
    expect(
      verifyNotificationSignature({
        ...base,
        signatureKey: createHash("sha512")
          .update(`${base.orderId}${base.statusCode}${base.grossAmount}WRONG-KEY`)
          .digest("hex"),
      }),
    ).toBe(false);
  });

  it("rejects a tampered gross_amount", () => {
    expect(
      verifyNotificationSignature({
        ...base,
        grossAmount: "1000.00",
        signatureKey: signature(base.orderId, base.statusCode, base.grossAmount),
      }),
    ).toBe(false);
  });

  it("rejects a malformed signature", () => {
    for (const signatureKey of ["", "not-a-hash", "a".repeat(127), "z".repeat(128)]) {
      expect(verifyNotificationSignature({ ...base, signatureKey })).toBe(false);
    }
  });
});

describe("createSnapAuthorization", () => {
  it("encodes the server key as Basic auth with an empty password", () => {
    expect(createSnapAuthorization(serverKey)).toBe(
      `Basic ${Buffer.from(`${serverKey}:`, "utf8").toString("base64")}`,
    );
  });
});
