import "server-only";

import { z } from "zod";

/**
 * Konfigurasi Midtrans hanya dipakai di server. Client key dibundel ke browser lewat
 * variabel NEXT_PUBLIC karena Snap.js memang membutuhkannya di sisi klien; server key
 * tidak boleh pernah keluar dari proses server.
 */
const midtransEnvironmentSchema = z.object({
  MIDTRANS_SERVER_KEY: z.string().min(1),
  MIDTRANS_IS_PRODUCTION: z
    .union([z.literal("true"), z.literal("false")])
    .default("false"),
});

export type MidtransConfig = {
  serverKey: string;
  isProduction: boolean;
  snapApiUrl: string;
  statusApiUrl: string;
  snapJsUrl: string;
};

export function getMidtransConfig(): MidtransConfig | null {
  const result = midtransEnvironmentSchema.safeParse({
    MIDTRANS_SERVER_KEY: process.env.MIDTRANS_SERVER_KEY,
    MIDTRANS_IS_PRODUCTION: process.env.MIDTRANS_IS_PRODUCTION,
  });
  if (!result.success || result.data.MIDTRANS_SERVER_KEY.startsWith("replace-")) {
    return null;
  }

  const { MIDTRANS_SERVER_KEY, MIDTRANS_IS_PRODUCTION } = result.data;
  const isProduction = MIDTRANS_IS_PRODUCTION === "true";
  const host = isProduction ? "midtrans.com" : "sandbox.midtrans.com";

  return {
    serverKey: MIDTRANS_SERVER_KEY,
    isProduction,
    snapApiUrl: `https://app.${host}/snap/v1/transactions`,
    statusApiUrl: `https://api.${host}/v2`,
    snapJsUrl: `https://app.${host}/snap/snap.js`,
  };
}

export function requireMidtransConfig(): MidtransConfig {
  const config = getMidtransConfig();
  if (!config) {
    throw new Error("MIDTRANS_SERVER_KEY is not configured on the server.");
  }
  return config;
}

export function getMidtransClientKey(): string | null {
  const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
  if (!clientKey || clientKey.startsWith("replace-")) return null;
  return clientKey;
}
