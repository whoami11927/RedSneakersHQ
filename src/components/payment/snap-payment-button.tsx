"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { syncPaymentStatusAction } from "@/app/orders/actions";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

type SnapWindow = {
  pay: (
    token: string,
    options: {
      onSuccess?: () => void;
      onPending?: () => void;
      onError?: () => void;
      onClose?: () => void;
    },
  ) => void;
};

declare global {
  interface Window {
    snap?: SnapWindow;
  }
}

type SnapLoaderState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "open" }
  | { status: "syncing" };

/**
 * Memuat snap.js sekali per halaman dengan client key publik, lalu membuka popup Snap.
 * Nominal tidak pernah dikirim dari komponen ini; server yang membuat transaksi.
 */
export function SnapPaymentButton({
  orderId,
  amount,
  purpose = "regular",
  label,
}: {
  orderId: string;
  amount: number;
  purpose?: "regular" | "preorder_deposit" | "preorder_balance";
  label?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<SnapLoaderState>({ status: "idle" });
  const [message, setMessage] = useState<string>();
  const loadedScript = useRef<Promise<void> | null>(null);

  useEffect(() => {
    loadedScript.current = new Promise<void>((resolve) => {
      if (typeof window === "undefined") return;
      if (window.snap) {
        resolve();
        return;
      }
      const existing = document.querySelector<HTMLScriptElement>("script[data-midtrans-snap]");
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => resolve(), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = process.env.NEXT_PUBLIC_MIDTRANS_SNAP_URL ?? "https://app.sandbox.midtrans.com/snap/snap.js";
      script.async = true;
      script.dataset.midtransSnap = "true";
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => resolve(), { once: true });
      document.head.append(script);
    });
  }, []);

  async function pay() {
    setMessage(undefined);
    setState({ status: "loading" });

    const result = purpose === "regular"
      ? await import("@/app/orders/actions").then(({ createPaymentTokenAction }) => (
        createPaymentTokenAction(orderId)
      ))
      : await import("@/app/preorders/actions").then(({ createPreorderPaymentTokenAction }) => (
        createPreorderPaymentTokenAction({ orderId, purpose })
      ));
    if (!result.ok) {
      setState({ status: "idle" });
      setMessage(result.error);
      return;
    }

    await loadedScript.current;
    if (!window.snap) {
      setState({ status: "idle" });
      setMessage("Halaman pembayaran Midtrans gagal dimuat. Periksa koneksi lalu coba lagi.");
      return;
    }

    setState({ status: "open" });
    window.snap.pay(result.token, {
      onSuccess: () => void confirmPayment(),
      onPending: () => {
        setState({ status: "idle" });
        setMessage("Pembayaran sedang diproses penyedia. Status pesanan akan diperbarui otomatis.");
        router.refresh();
      },
      onError: () => {
        setState({ status: "idle" });
        setMessage("Pembayaran gagal. Tidak ada dana yang terpotong. Coba lagi.");
      },
      onClose: () => {
        setState({ status: "idle" });
        setMessage("Popup pembayaran ditutup. Pesanan tetap menunggu pembayaran.");
      },
    });
  }

  async function confirmPayment() {
    setState({ status: "syncing" });
    const result = purpose === "regular"
      ? await syncPaymentStatusAction(orderId)
      : await import("@/app/preorders/actions").then(({ syncPreorderPaymentStatusAction }) => (
        syncPreorderPaymentStatusAction({ orderId, purpose })
      ));
    setState({ status: "idle" });
    if (result.ok && result.orderStatus && result.orderStatus !== "pending_payment") {
      router.refresh();
      return;
    }
    setMessage(
      "Pembayaran diterima. Konfirmasi Midtrans sedang diproses, status akan segera berubah.",
    );
    router.refresh();
  }

  const busy = state.status !== "idle";

  return (
    <div className="space-y-2">
      <Button type="button" onClick={() => void pay()} disabled={busy} className="w-full">
        {state.status === "loading" && "Menyiapkan pembayaran..."}
        {state.status === "open" && "Menunggu pembayaran..."}
        {state.status === "syncing" && "Memeriksa pembayaran..."}
        {state.status === "idle" && `${label ?? "Bayar"} ${formatCurrency(amount)}`}
      </Button>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
