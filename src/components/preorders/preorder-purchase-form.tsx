"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { createPreorderOrderAction } from "@/app/preorders/actions";
import { getShippingQuoteAction } from "@/app/checkout/actions";
import { CheckoutMap } from "@/components/checkout/checkout-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import {
  preorderOrderFormSchema,
  type PreorderOrderFormValues,
} from "@/lib/validators/preorder";

type StoreLocation = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

type PreorderBatchOption = {
  id: string;
  price: number;
  payment_plan: "full" | "deposit";
  deposit_percent: number | null;
  remaining: number;
};

type ShippingQuote = {
  storeName: string;
  zoneName: string;
  distanceKm: number;
  shippingFee: number;
};

type QuoteState =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; quote: ShippingQuote }
  | { status: "uncovered"; key: string }
  | { status: "error"; key: string; message: string };

function FormError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="text-sm font-medium text-destructive">{message}</p>;
}

export function PreorderPurchaseForm({
  batch,
  stores,
}: {
  batch: PreorderBatchOption;
  stores: StoreLocation[];
}) {
  const router = useRouter();
  const [quoteState, setQuoteState] = useState<QuoteState>({ status: "idle" });
  const [requestError, setRequestError] = useState<string>();
  const [createdOrder, setCreatedOrder] = useState<{
    orderNumber: string;
    initialPaymentAmount: number;
    reservationExpiresAt: string;
  }>();
  const requestCounter = useRef(0);
  const form = useForm<PreorderOrderFormValues>({
    resolver: zodResolver(preorderOrderFormSchema),
    defaultValues: {
      batchId: batch.id,
      quantity: 1,
      fulfillmentMethod: "pickup",
      pickupStoreLocationId: stores[0]?.id,
    },
  });
  const fulfillmentMethod = useWatch({ control: form.control, name: "fulfillmentMethod" });
  const latitude = useWatch({ control: form.control, name: "latitude" });
  const longitude = useWatch({ control: form.control, name: "longitude" });
  const coordinates = useMemo(() => (
    typeof latitude === "number" && Number.isFinite(latitude)
    && typeof longitude === "number" && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null
  ), [latitude, longitude]);
  const coordinatesKey = coordinates ? `${coordinates.latitude}:${coordinates.longitude}` : null;
  const quote = coordinatesKey && quoteState.status !== "idle" && quoteState.key === coordinatesKey
    ? quoteState
    : { status: "idle" as const };
  const fieldErrors = form.formState.errors;

  useEffect(() => {
    const requestId = ++requestCounter.current;
    if (fulfillmentMethod !== "shipping" || !coordinates || !coordinatesKey) return;
    const timeout = window.setTimeout(() => {
      setQuoteState({ status: "loading", key: coordinatesKey });
      void getShippingQuoteAction(coordinates).then((result) => {
        if (requestId !== requestCounter.current) return;
        if (!result.ok) {
          setQuoteState({ status: "error", key: coordinatesKey, message: result.error });
        } else if (!result.quote) {
          setQuoteState({ status: "uncovered", key: coordinatesKey });
        } else {
          setQuoteState({ status: "ready", key: coordinatesKey, quote: result.quote });
        }
      }).catch((error: unknown) => {
        if (requestId !== requestCounter.current) return;
        console.error("Preorder shipping quote request failed:", error);
        setQuoteState({
          status: "error",
          key: coordinatesKey,
          message: "Ongkir belum dapat dihitung. Periksa koneksi lalu coba lagi.",
        });
      });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [coordinates, coordinatesKey, fulfillmentMethod]);

  async function submit(values: PreorderOrderFormValues) {
    setRequestError(undefined);
    try {
      const result = await createPreorderOrderAction(values);
      if (!result.ok) {
        setRequestError(result.error);
        return;
      }
      setCreatedOrder({
        orderNumber: result.order.orderNumber,
        initialPaymentAmount: result.order.initialPaymentAmount,
        reservationExpiresAt: result.order.reservationExpiresAt,
      });
    } catch (error: unknown) {
      console.error("Preorder submission failed:", error);
      setRequestError("Pesanan belum dapat dibuat. Coba lagi.");
    }
  }

  if (createdOrder) {
    return (
      <section className="space-y-3 border-t border-border pt-4" aria-live="polite">
        <h3 className="font-heading text-xl font-bold uppercase">Kuota dicadangkan</h3>
        <p className="text-sm leading-6">
          Pesanan <strong className="font-mono">{createdOrder.orderNumber}</strong> tercatat.
          Pembayaran awal {formatCurrency(createdOrder.initialPaymentAmount)} harus selesai sebelum{" "}
          <time dateTime={createdOrder.reservationExpiresAt}>
            {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" })
              .format(new Date(createdOrder.reservationExpiresAt))}
          </time>.
        </p>
        <Button type="button" onClick={() => router.push(`/orders/${createdOrder.orderNumber}`)}>
          Buka pesanan dan bayar
        </Button>
      </section>
    );
  }

  const busy = form.formState.isSubmitting;
  const canSubmit = fulfillmentMethod !== "shipping" || quote.status === "ready";

  return (
    <form noValidate className="space-y-5 border-t border-border pt-4" onSubmit={form.handleSubmit(submit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`preorder-quantity-${batch.id}`}>Jumlah</Label>
          <Input
            id={`preorder-quantity-${batch.id}`}
            type="number"
            min={1}
            max={Math.min(batch.remaining, 10000)}
            aria-invalid={Boolean(fieldErrors.quantity)}
            aria-describedby={`preorder-quantity-error-${batch.id}`}
            {...form.register("quantity", { valueAsNumber: true })}
          />
          <FormError id={`preorder-quantity-error-${batch.id}`} message={fieldErrors.quantity?.message} />
        </div>
        <div className="space-y-2">
          <span className="block text-sm font-medium">Harga batch</span>
          <p className="flex min-h-11 items-center text-sm">{formatCurrency(batch.price)} per pasang</p>
        </div>
      </div>
      {batch.payment_plan === "deposit" ? (
        <p className="text-sm leading-6 text-muted-foreground">
          DP {batch.deposit_percent}% dibayar saat pemesanan. Sisa dibayar setelah barang tiba.
        </p>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          Pembayaran penuh dilakukan saat pemesanan.
        </p>
      )}

      <fieldset className="space-y-3">
        <legend className="font-heading text-xl font-bold uppercase">Cara menerima</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 border border-border bg-card px-3 py-2">
            <input type="radio" value="pickup" className="size-4 accent-primary" {...form.register("fulfillmentMethod")} />
            <span className="text-sm font-semibold">Ambil di toko</span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 border border-border bg-card px-3 py-2">
            <input type="radio" value="shipping" className="size-4 accent-primary" {...form.register("fulfillmentMethod")} />
            <span className="text-sm font-semibold">Kirim ke alamat</span>
          </label>
        </div>
      </fieldset>

      {fulfillmentMethod === "pickup" ? (
        <div className="space-y-2">
          <Label htmlFor={`preorder-pickup-${batch.id}`}>Lokasi toko</Label>
          <select
            id={`preorder-pickup-${batch.id}`}
            className="min-h-11 w-full border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            {...form.register("pickupStoreLocationId")}
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name} · {store.address}</option>
            ))}
          </select>
          <FormError message={fieldErrors.pickupStoreLocationId?.message} id={`preorder-pickup-error-${batch.id}`} />
        </div>
      ) : (
        <section className="space-y-4" aria-labelledby={`preorder-address-heading-${batch.id}`}>
          <div>
            <h4 id={`preorder-address-heading-${batch.id}`} className="font-heading text-xl font-bold uppercase">
              Alamat pengiriman
            </h4>
            <p className="text-sm text-muted-foreground">Tarif dihitung server berdasarkan zona toko aktif.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`preorder-recipient-${batch.id}`}>Nama penerima</Label>
              <Input id={`preorder-recipient-${batch.id}`} autoComplete="name" {...form.register("recipientName")} />
              <FormError id={`preorder-recipient-error-${batch.id}`} message={fieldErrors.recipientName?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`preorder-phone-${batch.id}`}>Nomor telepon</Label>
              <Input id={`preorder-phone-${batch.id}`} type="tel" autoComplete="tel" {...form.register("phone")} />
              <FormError id={`preorder-phone-error-${batch.id}`} message={fieldErrors.phone?.message} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`preorder-address-${batch.id}`}>Alamat lengkap</Label>
              <Input id={`preorder-address-${batch.id}`} autoComplete="street-address" {...form.register("addressLine")} />
              <FormError id={`preorder-address-error-${batch.id}`} message={fieldErrors.addressLine?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`preorder-city-${batch.id}`}>Kota atau kabupaten</Label>
              <Input id={`preorder-city-${batch.id}`} autoComplete="address-level2" {...form.register("city")} />
              <FormError id={`preorder-city-error-${batch.id}`} message={fieldErrors.city?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`preorder-province-${batch.id}`}>Provinsi</Label>
              <Input id={`preorder-province-${batch.id}`} autoComplete="address-level1" {...form.register("province")} />
              <FormError id={`preorder-province-error-${batch.id}`} message={fieldErrors.province?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`preorder-postal-${batch.id}`}>Kode pos</Label>
              <Input id={`preorder-postal-${batch.id}`} inputMode="numeric" autoComplete="postal-code" {...form.register("postalCode")} />
              <FormError id={`preorder-postal-error-${batch.id}`} message={fieldErrors.postalCode?.message} />
            </div>
          </div>
          <CheckoutMap
            stores={stores}
            coordinates={coordinates}
            onCoordinatesChange={(point) => {
              form.setValue("latitude", point.latitude, { shouldDirty: true, shouldValidate: true });
              form.setValue("longitude", point.longitude, { shouldDirty: true, shouldValidate: true });
            }}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`preorder-latitude-${batch.id}`}>Latitude titik alamat</Label>
              <Input
                id={`preorder-latitude-${batch.id}`}
                inputMode="decimal"
                {...form.register("latitude", { setValueAs: (value: string) => value === "" ? undefined : Number(value) })}
              />
              <FormError id={`preorder-latitude-error-${batch.id}`} message={fieldErrors.latitude?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`preorder-longitude-${batch.id}`}>Longitude titik alamat</Label>
              <Input
                id={`preorder-longitude-${batch.id}`}
                inputMode="decimal"
                {...form.register("longitude", { setValueAs: (value: string) => value === "" ? undefined : Number(value) })}
              />
              <FormError id={`preorder-longitude-error-${batch.id}`} message={fieldErrors.longitude?.message} />
            </div>
          </div>
          <div role="status" aria-live="polite" className="min-h-11 border-y border-border py-3 text-sm">
            {quote.status === "idle" && (coordinates ? "Menyiapkan perhitungan ongkir..." : "Pilih titik alamat pada peta untuk menghitung ongkir.")}
            {quote.status === "loading" && "Menghitung ongkir dari toko..."}
            {quote.status === "uncovered" && "Alamat berada di luar zona pengiriman aktif. Pilih ambil di toko atau titik lain."}
            {quote.status === "error" && quote.message}
            {quote.status === "ready" && (
              <>Ongkir {formatCurrency(quote.quote.shippingFee)} dari {quote.quote.storeName}, {quote.quote.distanceKm} km.</>
            )}
          </div>
        </section>
      )}

      {requestError && <p role="alert" className="text-sm font-medium text-destructive">{requestError}</p>}
      <Button type="submit" disabled={busy || !canSubmit || batch.remaining < 1}>
        {busy ? "Mencadangkan kuota..." : "Pesan pre-order"}
      </Button>
      {batch.remaining < 1 && <p role="status" className="text-sm text-muted-foreground">Kuota batch telah habis.</p>}
    </form>
  );
}
