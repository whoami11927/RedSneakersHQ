import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Midtrans menandatangani setiap notifikasi dengan:
 *   SHA512(order_id + status_code + gross_amount + serverKey)
 *
 * `gross_amount` yang dipakai adalah nilai mentah dari payload (mis. "25000.00"),
 * bukan angka yang sudah dibulatkan/diparsing ulang, agar hasil hash identik.
 */
export function createNotificationSignature(input: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  serverKey: string;
}): string {
  return createHash("sha512")
    .update(`${input.orderId}${input.statusCode}${input.grossAmount}${input.serverKey}`)
    .digest("hex");
}

/**
 * Perbandingan waktu-tetap agar tidak bisa diserang lewat pengukuran waktu respons.
 */
export function verifyNotificationSignature(input: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  serverKey: string;
  signatureKey: string;
}): boolean {
  const expected = createNotificationSignature(input);
  const provided = input.signatureKey.trim().toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(provided)) return false;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export function createSnapAuthorization(serverKey: string): string {
  // Midtrans memakai Basic auth dengan server key sebagai username dan password kosong.
  return `Basic ${Buffer.from(`${serverKey}:`, "utf8").toString("base64")}`;
}
