"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CatalogStock } from "@/lib/catalog/queries";
import type { Database } from "@/lib/supabase/database.types";

const stockPayloadSchema = z.object({
  variant_id: z.uuid(),
  location_code: z.enum(["STORE", "ONLINE"]),
  available_qty: z.number().int().nonnegative(),
});

const stockKeySchema = z.object({
  variant_id: z.uuid(),
  location_code: z.enum(["STORE", "ONLINE"]),
});

export function useLiveStock(initialStock: CatalogStock[]) {
  const [stock, setStock] = useState(initialStock);
  const [liveStatus, setLiveStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    function applyStockRow(row: CatalogStock) {
      setStock((current) => {
        const index = current.findIndex(
          (item) =>
            item.variant_id === row.variant_id &&
            item.location_code === row.location_code,
        );
        if (index === -1) return [...current, row];
        return current.map((item, itemIndex) => (itemIndex === index ? row : item));
      });
    }

    function removeStockRow(variantId: string, locationCode: CatalogStock["location_code"]) {
      setStock((current) =>
        current.filter(
          (row) => row.variant_id !== variantId || row.location_code !== locationCode,
        ),
      );
    }

    const channel = supabase
      .channel("public-product-stock")
      .on<Database["public"]["Tables"]["stock_levels"]["Row"]>(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_levels" },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            const key = stockKeySchema.safeParse(payload.old);
            if (!key.success) {
              console.error("Received an invalid stock deletion payload.");
              return;
            }
            removeStockRow(key.data.variant_id, key.data.location_code);
            return;
          }

          const row = stockPayloadSchema.safeParse(payload.new);
          const key = stockKeySchema.safeParse(payload.new);
          if (row.success) {
            applyStockRow(row.data);
            return;
          }
          if (!key.success) {
            console.error("Received an invalid stock realtime payload.");
            return;
          }

          const refreshed = await supabase
            .from("stock_levels")
            .select("variant_id, location_code, available_qty")
            .eq("variant_id", key.data.variant_id)
            .eq("location_code", key.data.location_code)
            .maybeSingle();
          if (refreshed.error) {
            console.error("Unable to refresh a stock realtime update:", refreshed.error.message);
            return;
          }
          if (refreshed.data) applyStockRow(refreshed.data);
        },
      )
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          setLiveStatus("connected");
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (error) console.error("Stock realtime subscription failed:", error.message);
          setLiveStatus("disconnected");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return { stock, liveStatus };
}
