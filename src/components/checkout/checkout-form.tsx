"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { createCheckoutOrderAction, getShippingQuoteAction } from "@/app/checkout/actions";
import { CheckoutMap } from "@/components/checkout/checkout-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCart } from "@/components/cart/cart-provider";
import { formatCurrency } from "@/lib/format";
import { checkoutFormSchema, type CheckoutFormValues } from "@/lib/validators/checkout";

type StoreLocation = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

type CreatedOrder = {
  orderNumber: string;
  subtotal: number;
  shippingFee: number;
  total: number;
  reservationExpiresAt: string;
};

type ShippingQuote = {
  storeName: string;
  zoneName: string;
  distanceKm: number;
  shippingFee: number;
};

type QuoteState =
  | { status: "idle" }
  | { status: "loading"; coordinatesKey: string }
  | { status: "ready"; coordinatesKey: string; quote: ShippingQuote }
  | { status: "uncovered"; coordinatesKey: string }
  | { status: "error"; coordinatesKey: string; message: string };

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="text-sm font-medium text-destructive">{message}</p>;
}

function fieldError(form: ReturnType<typeof useForm<CheckoutFormValues>>, name: keyof CheckoutFormValues) {
  const error = form.formState.errors[name];
  return typeof error?.message === "string" ? error.message : undefined;
}

export function CheckoutForm({ stores }: { stores: StoreLocation[] }) {
  const router = useRouter();
  const { lines, ready, setQuantity, removeLine, clear } = useCart();
  const [submissionError, setSubmissionError] = useState<string>();
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder>();
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [quoteState, setQuoteState] = useState<QuoteState>({ status: "idle" });
  const quoteRequest = useRef(0);

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: {
      fulfillmentMethod: "shipping",
      pickupStoreLocationId: stores[0]?.id,
    },
  });
  const fulfillmentMethod = useWatch({ control: form.control, name: "fulfillmentMethod" });
  const latitude = useWatch({ control: form.control, name: "latitude" });
  const longitude = useWatch({ control: form.control, name: "longitude" });
  const coordinates = useMemo(() => (
    typeof latitude === "number"
    && typeof longitude === "number"
    && Number.isFinite(latitude)
    && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null
  ), [latitude, longitude]);
  const coordinatesKey = coordinates ? `${coordinates.latitude}:${coordinates.longitude}` : null;
  const currentQuoteState: QuoteState = fulfillmentMethod !== "shipping" || !coordinatesKey
    ? { status: "idle" }
    : quoteState.status !== "idle" && quoteState.coordinatesKey === coordinatesKey
      ? quoteState
      : { status: "idle" };
  const errors = form.formState.errors;

  useEffect(() => {
    const requestId = ++quoteRequest.current;
    if (fulfillmentMethod !== "shipping" || !coordinates || !coordinatesKey) return;
    const timeout = window.setTimeout(() => {
      setQuoteState({ status: "loading", coordinatesKey });
      void getShippingQuoteAction(coordinates).then((result) => {
        if (requestId !== quoteRequest.current) return;
        if (!result.ok) {
          setQuoteState({ status: "error", coordinatesKey, message: result.error });
        } else if (!result.quote) {
          setQuoteState({ status: "uncovered", coordinatesKey });
        } else {
          setQuoteState({ status: "ready", coordinatesKey, quote: result.quote });
        }
      }).catch((error: unknown) => {
        if (requestId !== quoteRequest.current) return;
        console.error("Shipping quote request failed:", error);
        setQuoteState({ status: "error", coordinatesKey, message: "Ongkir belum dapat dihitung. Coba lagi." });
      });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [coordinates, coordinatesKey, fulfillmentMethod, quoteRevision]);

  async function submit(values: CheckoutFormValues) {
    setSubmissionError(undefined);
    const result = await createCheckoutOrderAction({
      ...values,
      items: lines.map(({ variantId, quantity }) => ({ variantId, quantity })),
    });
    if (!result.ok) {
      setSubmissionError(result.error);
      return;
    }
    clear();
    setCreatedOrder(result.order);
  }

  if (!ready) {
    return (
      <p role="status" aria-live="polite" className="border-y border-border py-8 text-sm">
        Memuat isi keranjang...
      </p>
    );
  }

  if (createdOrder) {
    return (
      <section aria-labelledby="checkout-success" className="max-w-2xl border border-border bg-card p-5 sm:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Stok sudah direservasi</p>
        <h2 id="checkout-success" className="mt-2 font-heading text-4xl font-bold uppercase">Pesanan tercatat</h2>
        <p className="mt-3 text-sm leading-6">
          Nomor pesanan <strong className="font-mono">{createdOrder.orderNumber}</strong>. Reservasi berakhir{" "}
          <time dateTime={createdOrder.reservationExpiresAt}>
            {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(createdOrder.reservationExpiresAt))}
        </time>.
        </p>
        <dl className="mt-6 divide-y divide-border border-y border-border text-sm">
          <div className="flex justify-between gap-4 py-3"><dt>Subtotal</dt><dd>{formatCurrency(createdOrder.subtotal)}</dd></div>
          <div className="flex justify-between gap-4 py-3"><dt>Ongkir</dt><dd>{formatCurrency(createdOrder.shippingFee)}</dd></div>
          <div className="flex justify-between gap-4 py-3 font-semibold"><dt>Total</dt><dd>{formatCurrency(createdOrder.total)}</dd></div>
        </dl>
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Lanjutkan pembayaran Midtrans sebelum reservasi stok berakhir. Pesanan dibatalkan
          otomatis dan stok dikembalikan bila pembayaran tidak selesai.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" onClick={() => router.push(`/orders/${createdOrder.orderNumber}`)}>
            Lanjut ke pembayaran
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/")}>
            Kembali ke katalog
          </Button>
        </div>
      </section>
    );
  }

  if (lines.length === 0) {
    return (
      <section className="border-y border-border py-8" aria-labelledby="empty-cart">
        <h2 id="empty-cart" className="font-heading text-3xl font-bold uppercase">Keranjang masih kosong</h2>
        <p className="mt-2 text-sm text-muted-foreground">Pilih sneaker dan ukuran dari katalog sebelum checkout.</p>
        <Link href="/" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          Pilih sneaker
        </Link>
      </section>
    );
  }

  return (
    <form noValidate className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]" onSubmit={form.handleSubmit(submit)}>
      <div className="space-y-8">
        <section aria-labelledby="cart-heading">
          <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
            <h2 id="cart-heading" className="font-heading text-3xl font-bold uppercase">Isi keranjang</h2>
            <span className="font-mono text-xs text-muted-foreground">{lines.length} varian</span>
          </div>
          <ul className="divide-y divide-border">
            {lines.map((line) => (
              <li key={line.variantId} className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="wrap-break-word font-semibold">{line.productName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{line.variantLabel} · {line.sku}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Harga akan dikonfirmasi dari katalog saat pesanan dibuat.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={line.quantity <= 1}
                    aria-label={`Kurangi jumlah ${line.productName}`}
                    onClick={() => setQuantity(line.variantId, line.quantity - 1)}
                  >
                    Kurangi
                  </Button>
                  <output aria-label={`Jumlah ${line.productName}`} className="min-w-8 text-center font-mono text-sm">
                    {line.quantity}
                  </output>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={line.quantity >= 10000}
                    aria-label={`Tambah jumlah ${line.productName}`}
                    onClick={() => setQuantity(line.variantId, line.quantity + 1)}
                  >
                    Tambah
                  </Button>
                  <Button type="button" variant="outline" onClick={() => removeLine(line.variantId)}>
                    Hapus
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <fieldset className="space-y-3">
          <legend className="font-heading text-3xl font-bold uppercase">Cara menerima</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-h-14 cursor-pointer items-center gap-3 border border-border bg-card px-4 py-3">
              <input className="size-4 accent-primary" type="radio" value="shipping" {...form.register("fulfillmentMethod")} />
              <span className="text-sm font-semibold">Kirim ke alamat</span>
            </label>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 border border-border bg-card px-4 py-3">
              <input className="size-4 accent-primary" type="radio" value="pickup" {...form.register("fulfillmentMethod")} />
              <span className="text-sm font-semibold">Ambil di toko</span>
            </label>
          </div>
        </fieldset>

        {fulfillmentMethod === "shipping" ? (
          <section aria-labelledby="delivery-heading" className="space-y-5">
            <div>
              <h2 id="delivery-heading" className="font-heading text-3xl font-bold uppercase">Alamat pengiriman</h2>
              <p className="mt-1 text-sm text-muted-foreground">Pilih titik alamat di peta. Tarif dihitung server dari zona aktif toko.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="recipientName">Nama penerima</Label>
                <Input id="recipientName" autoComplete="name" aria-invalid={Boolean(errors.recipientName)} aria-describedby="recipientName-error" {...form.register("recipientName")} />
                <FieldError id="recipientName-error" message={fieldError(form, "recipientName")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Nomor telepon</Label>
                <Input id="phone" type="tel" autoComplete="tel" aria-invalid={Boolean(errors.phone)} aria-describedby="phone-error" {...form.register("phone")} />
                <FieldError id="phone-error" message={fieldError(form, "phone")} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="addressLine">Alamat lengkap</Label>
                <Input id="addressLine" autoComplete="street-address" aria-invalid={Boolean(errors.addressLine)} aria-describedby="addressLine-error" {...form.register("addressLine")} />
                <FieldError id="addressLine-error" message={fieldError(form, "addressLine")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Kota atau kabupaten</Label>
                <Input id="city" autoComplete="address-level2" aria-invalid={Boolean(errors.city)} aria-describedby="city-error" {...form.register("city")} />
                <FieldError id="city-error" message={fieldError(form, "city")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="province">Provinsi</Label>
                <Input id="province" autoComplete="address-level1" aria-invalid={Boolean(errors.province)} aria-describedby="province-error" {...form.register("province")} />
                <FieldError id="province-error" message={fieldError(form, "province")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postalCode">Kode pos</Label>
                <Input id="postalCode" inputMode="numeric" autoComplete="postal-code" aria-invalid={Boolean(errors.postalCode)} aria-describedby="postalCode-error" {...form.register("postalCode")} />
                <FieldError id="postalCode-error" message={fieldError(form, "postalCode")} />
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="latitude">Latitude titik alamat</Label>
                <Input
                  id="latitude"
                  inputMode="decimal"
                  aria-invalid={Boolean(errors.latitude)}
                  aria-describedby="latitude-error"
                  {...form.register("latitude", { setValueAs: (value: string) => value === "" ? undefined : Number(value) })}
                />
                <FieldError id="latitude-error" message={fieldError(form, "latitude")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude">Longitude titik alamat</Label>
                <Input
                  id="longitude"
                  inputMode="decimal"
                  aria-invalid={Boolean(errors.longitude)}
                  aria-describedby="longitude-error"
                  {...form.register("longitude", { setValueAs: (value: string) => value === "" ? undefined : Number(value) })}
                />
                <FieldError id="longitude-error" message={fieldError(form, "longitude")} />
              </div>
            </div>
            <div aria-live="polite" role="status" className="min-h-12 border-y border-border py-3 text-sm">
              {currentQuoteState.status === "idle" && (coordinates ? "Titik dipilih. Menyiapkan perhitungan ongkir..." : "Pilih titik alamat untuk melihat jangkauan dan ongkir.")}
              {currentQuoteState.status === "loading" && "Menghitung jarak dan ongkir..."}
              {currentQuoteState.status === "uncovered" && "Alamat ini belum tercakup zona pengiriman aktif. Pilih titik lain atau ambil di toko."}
              {currentQuoteState.status === "error" && currentQuoteState.message}
              {currentQuoteState.status === "error" && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2"
                  onClick={() => setQuoteRevision((revision) => revision + 1)}
                >
                  Coba hitung ongkir lagi
                </Button>
              )}
              {currentQuoteState.status === "ready" && (
                <span>
                  Zona {currentQuoteState.quote.zoneName}, {currentQuoteState.quote.distanceKm} km dari {currentQuoteState.quote.storeName}. Ongkir{" "}
                  <strong>{formatCurrency(currentQuoteState.quote.shippingFee)}</strong>.
                </span>
              )}
            </div>
          </section>
        ) : (
          <section aria-labelledby="pickup-heading" className="space-y-3">
            <h2 id="pickup-heading" className="font-heading text-3xl font-bold uppercase">Pilih toko</h2>
            <Label htmlFor="pickupStoreLocationId">Lokasi pengambilan</Label>
            <select
              id="pickupStoreLocationId"
              className="min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-invalid={Boolean(errors.pickupStoreLocationId)}
              aria-describedby="pickupStoreLocationId-error"
              {...form.register("pickupStoreLocationId")}
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>{store.name} · {store.address}</option>
              ))}
            </select>
            <FieldError id="pickupStoreLocationId-error" message={fieldError(form, "pickupStoreLocationId")} />
            <p className="text-sm text-muted-foreground">Pesanan memakai stok lokasi toko yang dipilih.</p>
          </section>
        )}
      </div>

      <aside className="space-y-4 border border-border bg-card p-4 sm:p-5 lg:sticky lg:top-6" aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="font-heading text-3xl font-bold uppercase">Ringkasan</h2>
        <p className="text-sm text-muted-foreground">
          {lines.length} varian, {lines.reduce((total, line) => total + line.quantity, 0)} pasang. Harga dan stok akhir diperiksa kembali di server.
        </p>
        <p className="border-t border-border pt-4 text-sm leading-6">
          Setelah pesanan dibuat, stok ditahan selama 15 menit. Pembayaran Midtrans akan diaktifkan pada fase berikutnya.
        </p>
        {submissionError && <p role="alert" className="text-sm font-medium text-destructive">{submissionError}</p>}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={
            form.formState.isSubmitting
            || (fulfillmentMethod === "shipping" && currentQuoteState.status !== "ready")
          }
        >
          {form.formState.isSubmitting ? "Membuat pesanan..." : "Buat pesanan"}
        </Button>
      </aside>
    </form>
  );
}
