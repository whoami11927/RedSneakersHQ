import "server-only";

import { z } from "zod";
import { createSnapAuthorization } from "@/lib/midtrans/signature";
import { requireMidtransConfig } from "@/lib/midtrans/config";

const snapTransactionResponseSchema = z.looseObject({
  token: z.string().min(1),
  redirect_url: z.string().url(),
});

export type SnapTransactionRequest = {
  orderId: string;
  grossAmount: number;
  itemDetails: { id: string; price: number; quantity: number; name: string }[];
  customerDetails: { first_name: string; email: string | null; phone: string | null };
  expiresAt: Date;
  finishRedirectUrl: string;
};

export type SnapTransactionResult =
  | { ok: true; token: string; redirectUrl: string }
  | { ok: false; error: string };

/**
 * Membuat transaksi Snap dari server. Nilai `gross_amount` selalu berasal dari database
 * (total order), bukan dari payload klien.
 */
export async function createSnapTransaction(
  request: SnapTransactionRequest,
): Promise<SnapTransactionResult> {
  const config = requireMidtransConfig();
  const durationMinutes = Math.max(
    1,
    Math.ceil((request.expiresAt.getTime() - Date.now()) / 60000),
  );

  const response = await fetch(config.snapApiUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: createSnapAuthorization(config.serverKey),
    },
    body: JSON.stringify({
      transaction_details: {
        order_id: request.orderId,
        gross_amount: request.grossAmount,
      },
      item_details: request.itemDetails,
      customer_details: request.customerDetails,
      credit_card: { secure: true },
      expiry: { unit: "minute", duration: durationMinutes },
      callbacks: { finish: request.finishRedirectUrl },
    }),
    cache: "no-store",
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    console.error(
      "Midtrans Snap transaction request failed:",
      response.status,
      JSON.stringify(payload),
    );
    return { ok: false, error: "Pembayaran belum dapat dimulai. Coba lagi sebentar lagi." };
  }

  const parsed = snapTransactionResponseSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("Midtrans Snap transaction response is not usable.");
    return { ok: false, error: "Respons pembayaran tidak dapat diproses. Coba lagi." };
  }

  return { ok: true, token: parsed.data.token, redirectUrl: parsed.data.redirect_url };
}

const statusResponseSchema = z.looseObject({
  transaction_status: z.string().min(1),
  order_id: z.string().min(1),
  gross_amount: z.string().min(1),
  status_code: z.string().regex(/^\d{3}$/),
  signature_key: z.string().min(1),
  fraud_status: z.string().optional(),
  payment_type: z.string().optional(),
  transaction_id: z.string().optional(),
  settlement_time: z.string().optional(),
});

export type TransactionStatusResult =
  | { ok: true; status: z.infer<typeof statusResponseSchema> }
  | { ok: false; error: string; notFound: boolean };

/**
 * Menanyakan status langsung ke Midtrans. Dipakai sebagai jalur pemulihan ketika
 * webhook tidak sempat tiba, dan hasilnya dilewatkan ke fungsi notifikasi yang sama
 * agar aturan bisnis hanya ada di satu tempat.
 */
export async function fetchTransactionStatus(orderId: string): Promise<TransactionStatusResult> {
  const config = requireMidtransConfig();

  const response = await fetch(`${config.statusApiUrl}/${encodeURIComponent(orderId)}/status`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: createSnapAuthorization(config.serverKey),
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    return { ok: false, error: "Transaksi pembayaran belum ada di Midtrans.", notFound: true };
  }
  if (!response.ok) {
    console.error("Midtrans transaction status request failed:", response.status);
    return {
      ok: false,
      error: "Status pembayaran belum dapat diperiksa. Coba lagi.",
      notFound: false,
    };
  }

  const payload: unknown = await response.json().catch(() => null);
  const parsed = statusResponseSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("Midtrans transaction status response is not usable.");
    return {
      ok: false,
      error: "Status pembayaran tidak dapat dibaca. Coba lagi.",
      notFound: false,
    };
  }

  return { ok: true, status: parsed.data };
}
