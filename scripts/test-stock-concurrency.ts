import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../src/lib/supabase/database.types";

const environmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DEMO_ADMIN_EMAIL: z.string().email(),
  DEMO_CUSTOMER_EMAIL: z.string().email(),
  CONCURRENCY_TEST_REQUESTS: z.coerce.number().int().min(2).max(50).default(10),
});

const environment = environmentSchema.parse(process.env);
const projectUrl = new URL(environment.NEXT_PUBLIC_SUPABASE_URL);
if (!["localhost", "127.0.0.1", "::1"].includes(projectUrl.hostname)) {
  throw new Error("Stock concurrency test is restricted to a local Supabase URL.");
}

const supabase = createClient<Database>(
  environment.NEXT_PUBLIC_SUPABASE_URL,
  environment.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function requireRecord<T>(
  result: { data: T; error: { message: string } | null },
  description: string,
): Promise<NonNullable<T>> {
  if (result.error) throw new Error(`${description}: ${result.error.message}`);
  if (result.data === null || result.data === undefined) {
    throw new Error(`${description}: no matching record.`);
  }
  return result.data;
}

async function runConcurrencyTest() {
  const admin = await requireRecord(
    await supabase.from("profiles").select("id").eq("email", environment.DEMO_ADMIN_EMAIL).eq("role", "admin").maybeSingle(),
    "Find the local demo admin",
  );
  const customer = await requireRecord(
    await supabase.from("profiles").select("id").eq("email", environment.DEMO_CUSTOMER_EMAIL).eq("role", "customer").maybeSingle(),
    "Find the local demo customer",
  );
  const store = await requireRecord(
    await supabase.from("store_locations").select("id").eq("is_active", true).order("name").limit(1).maybeSingle(),
    "Find an active store location",
  );
  const activeVariants = await requireRecord(
    await supabase.from("product_variants").select("id, product_id").eq("is_active", true),
    "Load active product variants",
  );
  if (activeVariants.length === 0) throw new Error("No active product variants are available.");

  const activeProducts = await requireRecord(
    await supabase.from("products").select("id").in("id", activeVariants.map((variant) => variant.product_id)).eq("is_active", true),
    "Load active products",
  );
  const activeProductIds = new Set(activeProducts.map((product) => product.id));
  const stocks = await requireRecord(
    await supabase.from("stock_levels")
      .select("variant_id, on_hand, reserved_qty")
      .eq("location_code", "STORE")
      .eq("reserved_qty", 0)
      .gte("on_hand", 1)
      .order("on_hand", { ascending: false }),
    "Find an unreserved store stock row",
  );
  const candidate = stocks.find((stock) =>
    activeVariants.some((variant) => variant.id === stock.variant_id && activeProductIds.has(variant.product_id)),
  );
  if (!candidate) {
    throw new Error("No active variant has at least one unreserved STORE unit; seed or adjust local inventory first.");
  }

  const variantId = candidate.variant_id;
  const initialOnHand = candidate.on_hand;
  const ordersToClean: string[] = [];
  let inventoryWasPrepared = false;
  let testFailure: unknown;
  const cleanupErrors: string[] = [];

  try {
    inventoryWasPrepared = true;
    if (initialOnHand !== 1) {
      await requireRecord(
        await supabase.rpc("adjust_stock", {
          p_variant_id: variantId,
          p_location_code: "STORE",
          p_delta: 1 - initialOnHand,
          p_note: "Temporary stock concurrency test setup",
          p_created_by: admin.id,
        }).then((result) => ({ data: result.data, error: result.error })),
        "Prepare one STORE unit for the concurrency test",
      );
    }

    const results = await Promise.all(
      Array.from({ length: environment.CONCURRENCY_TEST_REQUESTS }, async () => {
        const { data, error } = await supabase.rpc("create_checkout_order", {
          p_customer_id: customer.id,
          p_fulfillment_method: "pickup",
          p_pickup_store_location_id: store.id,
          p_items: [{ variant_id: variantId, quantity: 1 }],
          p_shipping_address: null,
          p_expires_at: new Date(Date.now() + 14 * 60 * 1000).toISOString(),
        });
        return { data, error };
      }),
    );

    const successful = results.filter((result) => !result.error && result.data?.length === 1);
    const rejected = results.filter((result) => result.error);
    for (const result of successful) {
      const orderId = result.data?.[0]?.order_id;
      if (orderId) ordersToClean.push(orderId);
    }

    const unexpectedFailures = rejected.filter(
      (result) => !result.error?.message.toLowerCase().includes("insufficient stock"),
    );
    if (successful.length !== 1 || rejected.length !== environment.CONCURRENCY_TEST_REQUESTS - 1 || unexpectedFailures.length > 0) {
      const messages = unexpectedFailures.map((result) => result.error?.message).join("; ");
      throw new Error(
        `Expected one success and ${environment.CONCURRENCY_TEST_REQUESTS - 1} insufficient-stock rejections; ` +
        `received ${successful.length} success(es), ${rejected.length} rejection(s). ${messages}`,
      );
    }

    const finalStock = await requireRecord(
      await supabase.from("stock_levels")
        .select("on_hand, reserved_qty, available_qty")
        .eq("variant_id", variantId)
        .eq("location_code", "STORE")
        .maybeSingle(),
      "Verify stock after simultaneous checkout requests",
    );
    if (finalStock.on_hand !== 1 || finalStock.reserved_qty !== 1 || finalStock.available_qty !== 0) {
      throw new Error(
        `Oversell invariant failed: on_hand=${finalStock.on_hand}, ` +
        `reserved=${finalStock.reserved_qty}, available=${finalStock.available_qty}.`,
      );
    }

    console.info(
      `PASS: ${successful.length} of ${environment.CONCURRENCY_TEST_REQUESTS} simultaneous checkouts reserved the single STORE unit.`,
    );
  } catch (error: unknown) {
    testFailure = error;
  }

  for (const orderId of ordersToClean) {
    const { error: releaseError } = await supabase.rpc("release_stock_reservation", {
      p_order_id: orderId,
      p_note: "Concurrency test cleanup",
    });
    if (releaseError) {
      cleanupErrors.push(`Could not release test order ${orderId}: ${releaseError.message}`);
      const { error: expiryError } = await supabase
        .from("orders")
        .update({ reservation_expires_at: new Date().toISOString() })
        .eq("id", orderId)
        .eq("status", "pending_payment");
      if (expiryError) cleanupErrors.push(`Could not expire test order ${orderId}: ${expiryError.message}`);
      continue;
    }

    const { data, error } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", orderId)
      .eq("status", "pending_payment")
      .select("id")
      .maybeSingle();
    if (error || !data) {
      cleanupErrors.push(`Could not cancel test order ${orderId}: ${error?.message ?? "order not updated"}`);
    }
  }

  if (inventoryWasPrepared) {
    const currentStock = await supabase.from("stock_levels")
      .select("on_hand")
      .eq("variant_id", variantId)
      .eq("location_code", "STORE")
      .maybeSingle();
    if (currentStock.error || !currentStock.data) {
      cleanupErrors.push(`Could not read STORE stock for restoration: ${currentStock.error?.message ?? "row missing"}`);
    } else {
      const delta = initialOnHand - currentStock.data.on_hand;
      if (delta !== 0) {
        const { error } = await supabase.rpc("adjust_stock", {
          p_variant_id: variantId,
          p_location_code: "STORE",
          p_delta: delta,
          p_note: "Restore stock after concurrency test",
          p_created_by: admin.id,
        });
        if (error) cleanupErrors.push(`Could not restore original STORE stock: ${error.message}`);
      }
    }
  }

  if (cleanupErrors.length > 0) {
    throw new Error(`Concurrency test cleanup failed:\n${cleanupErrors.join("\n")}`);
  }
  if (testFailure) throw testFailure;
}

runConcurrencyTest().catch((error: unknown) => {
  console.error("Stock concurrency test failed:", error);
  process.exitCode = 1;
});
