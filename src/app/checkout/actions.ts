"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  checkoutRequestSchema,
  shippingQuoteSchema,
} from "@/lib/validators/checkout";

function getServiceClient() {
  try {
    return createSupabaseServiceClient();
  } catch (error: unknown) {
    console.error(
      "Checkout service client is not configured:",
      error instanceof Error ? error.message : "Unknown configuration error",
    );
    return null;
  }
}

async function getCustomerId() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("Unable to verify checkout user:", error.message);
    return { ok: false as const, error: "Sesi tidak dapat diverifikasi. Masuk kembali." };
  }
  if (!data.user) {
    return { ok: false as const, error: "Masuk ke akun customer untuk melanjutkan." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    console.error("Unable to verify checkout profile:", profileError?.message ?? "Profile missing");
    return { ok: false as const, error: "Profil akun tidak dapat diverifikasi." };
  }
  if (profile.role !== "customer") {
    return { ok: false as const, error: "Checkout hanya tersedia untuk akun customer." };
  }
  return { ok: true as const, customerId: data.user.id };
}

export async function getShippingQuoteAction(input: unknown) {
  const coordinates = shippingQuoteSchema.safeParse(input);
  if (!coordinates.success) {
    return { ok: false as const, error: "Titik alamat tidak valid." };
  }

  const customer = await getCustomerId();
  if (!customer.ok) return customer;

  const supabase = getServiceClient();
  if (!supabase) {
    return { ok: false as const, error: "Checkout belum dikonfigurasi di server." };
  }
  const { data, error } = await supabase.rpc("get_shipping_quote", {
    p_latitude: coordinates.data.latitude,
    p_longitude: coordinates.data.longitude,
  });
  if (error) {
    console.error("Unable to calculate checkout shipping quote:", error.message);
    return { ok: false as const, error: "Ongkir belum dapat dihitung. Coba lagi." };
  }

  const quote = data[0];
  if (!quote) {
    return {
      ok: true as const,
      quote: null,
    };
  }
  return {
    ok: true as const,
    quote: {
      storeName: quote.store_name,
      zoneName: quote.zone_name,
      distanceKm: quote.distance_km,
      shippingFee: quote.shipping_fee,
    },
  };
}

export async function createCheckoutOrderAction(input: unknown) {
  const values = checkoutRequestSchema.safeParse(input);
  if (!values.success) {
    return {
      ok: false as const,
      error: values.error.issues[0]?.message ?? "Periksa kembali data checkout.",
    };
  }

  const customer = await getCustomerId();
  if (!customer.ok) return customer;

  const supabase = getServiceClient();
  if (!supabase) {
    return { ok: false as const, error: "Checkout belum dikonfigurasi di server." };
  }
  const { data: withinLimit, error: rateLimitError } = await supabase.rpc(
    "consume_checkout_rate_limit",
    { p_customer_id: customer.customerId },
  );
  if (rateLimitError) {
    console.error("Unable to enforce checkout rate limit:", rateLimitError.message);
    return { ok: false as const, error: "Checkout sedang tidak tersedia. Coba lagi." };
  }
  if (!withinLimit) {
    return {
      ok: false as const,
      error: "Terlalu banyak percobaan checkout. Tunggu sebentar lalu coba lagi.",
    };
  }

  let shippingAddress = null;
  let pickupStoreLocationId = null;
  if (values.data.fulfillmentMethod === "shipping") {
    const {
      recipientName,
      phone,
      addressLine,
      city,
      province,
      postalCode,
      latitude,
      longitude,
    } = values.data;
    if (
      !recipientName
      || !phone
      || !addressLine
      || !city
      || !province
      || !postalCode
      || latitude === undefined
      || longitude === undefined
    ) {
      return { ok: false as const, error: "Lengkapi alamat dan titik pengiriman." };
    }
    shippingAddress = {
      recipient_name: recipientName,
      phone,
      address_line: addressLine,
      city,
      province,
      postal_code: postalCode,
      latitude,
      longitude,
    };
  } else {
    if (!values.data.pickupStoreLocationId) {
      return { ok: false as const, error: "Pilih lokasi toko untuk ambil pesanan." };
    }
    pickupStoreLocationId = values.data.pickupStoreLocationId;
  }

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc("create_checkout_order", {
    p_customer_id: customer.customerId,
    p_fulfillment_method: values.data.fulfillmentMethod,
    p_pickup_store_location_id: pickupStoreLocationId,
    p_items: values.data.items.map(({ variantId, quantity }) => ({
      variant_id: variantId,
      quantity,
    })),
    p_shipping_address: shippingAddress,
    p_expires_at: expiresAt,
  });
  if (error) {
    console.error("Unable to create checkout order:", error.message);
    const lowerMessage = error.message.toLowerCase();
    if (lowerMessage.includes("insufficient stock")) {
      return { ok: false as const, error: "Stok berubah. Sesuaikan jumlah barang lalu coba lagi." };
    }
    if (lowerMessage.includes("no active shipping zone")) {
      return { ok: false as const, error: "Alamat berada di luar zona pengiriman yang tersedia." };
    }
    if (lowerMessage.includes("variant is unavailable")) {
      return { ok: false as const, error: "Salah satu varian sudah tidak tersedia. Perbarui keranjang." };
    }
    if (lowerMessage.includes("select an active pickup store")) {
      return { ok: false as const, error: "Lokasi ambil tidak tersedia. Pilih lokasi lain." };
    }
    return { ok: false as const, error: "Pesanan belum dapat dibuat. Periksa data dan coba lagi." };
  }

  const order = data[0];
  if (!order) {
    console.error("Checkout RPC completed without returning an order.");
    return { ok: false as const, error: "Pesanan belum dapat dibuat. Coba lagi." };
  }
  return {
    ok: true as const,
    order: {
      orderNumber: order.order_number,
      subtotal: order.subtotal,
      shippingFee: order.shipping_fee,
      total: order.total,
      reservationExpiresAt: order.reservation_expires_at,
    },
  };
}
