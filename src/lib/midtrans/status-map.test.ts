import { describe, expect, it } from "vitest";
import { mapMidtransPaymentStatus } from "@/lib/midtrans/status-map";

describe("mapMidtransPaymentStatus", () => {
  it("maps settlement to settlement", () => {
    expect(mapMidtransPaymentStatus({ transactionStatus: "settlement" })).toBe("settlement");
  });

  it("maps capture with fraud accept to settlement", () => {
    expect(
      mapMidtransPaymentStatus({ transactionStatus: "capture", fraudStatus: "accept" }),
    ).toBe("settlement");
  });

  it("keeps capture with fraud challenge as pending", () => {
    expect(
      mapMidtransPaymentStatus({ transactionStatus: "capture", fraudStatus: "challenge" }),
    ).toBe("pending");
  });

  it("maps capture with fraud deny to deny", () => {
    expect(
      mapMidtransPaymentStatus({ transactionStatus: "capture", fraudStatus: "deny" }),
    ).toBe("deny");
  });

  it("maps every terminal failure status", () => {
    expect(mapMidtransPaymentStatus({ transactionStatus: "deny" })).toBe("deny");
    expect(mapMidtransPaymentStatus({ transactionStatus: "failure" })).toBe("deny");
    expect(mapMidtransPaymentStatus({ transactionStatus: "cancel" })).toBe("cancel");
    expect(mapMidtransPaymentStatus({ transactionStatus: "expire" })).toBe("expire");
  });

  it("maps refund statuses", () => {
    expect(mapMidtransPaymentStatus({ transactionStatus: "refund" })).toBe("refund");
    expect(mapMidtransPaymentStatus({ transactionStatus: "partial_refund" })).toBe(
      "partial_refund",
    );
  });

  it("is case and whitespace insensitive", () => {
    expect(mapMidtransPaymentStatus({ transactionStatus: "  SETTLEMENT " })).toBe("settlement");
    expect(mapMidtransPaymentStatus({ transactionStatus: "Capture", fraudStatus: " Accept " })).toBe(
      "settlement",
    );
  });

  it("treats an unknown status as pending so no order is cancelled by mistake", () => {
    expect(mapMidtransPaymentStatus({ transactionStatus: "authorize" })).toBe("pending");
    expect(mapMidtransPaymentStatus({ transactionStatus: "something-new" })).toBe("pending");
  });
});
