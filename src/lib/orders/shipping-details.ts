import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";

export type ShippingDetails = {
  storeName: string;
  zoneName: string;
  distanceKm: number;
};

const shippingSnapshotSchema = z.object({
  shipping_store_name: z.string().optional(),
  shipping_zone_name: z.string().optional(),
  distance_km: z.union([z.number(), z.string()]).optional(),
});

/**
 * Detail zona dan jarak disimpan di dalam snapshot alamat agar riwayat pesanan tetap utuh
 * walau toko atau zona pengiriman diubah kemudian. Snapshot bersifat jsonb sehingga
 * dibaca dengan skema Zod, bukan dengan cast langsung.
 */
export function readShippingDetails(snapshot: Json | null): ShippingDetails | null {
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;

  const parsed = shippingSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return null;

  const distance = Number(parsed.data.distance_km);
  if (!parsed.data.shipping_store_name || !parsed.data.shipping_zone_name) return null;
  if (!Number.isFinite(distance)) return null;

  return {
    storeName: parsed.data.shipping_store_name,
    zoneName: parsed.data.shipping_zone_name,
    distanceKm: distance,
  };
}
