"use client";

import { useActionState } from "react";
import {
  updateOrderFulfillmentAction,
  type FulfillmentActionState,
} from "@/app/admin/pos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Database } from "@/lib/supabase/database.types";

type OrderStatus = Database["public"]["Enums"]["order_status"];
type FulfillmentMethod = Database["public"]["Enums"]["fulfillment_method"];

function ActionFeedback({ state }: { state: FulfillmentActionState }) {
  if (state.error) return <p role="alert" className="text-sm font-medium text-destructive">{state.error}</p>;
  if (state.success) return <p role="status" className="text-sm">{state.success}</p>;
  return null;
}

export function OrderFulfillmentForm({
  orderId,
  status,
  fulfillmentMethod,
  trackingNumber,
}: {
  orderId: string;
  status: OrderStatus;
  fulfillmentMethod: FulfillmentMethod;
  trackingNumber: string | null;
}) {
  const [state, action, pending] = useActionState(updateOrderFulfillmentAction, {});
  let nextStatus: "processing" | "shipped" | "ready_for_pickup" | "completed" | null = null;
  let buttonLabel = "";

  if (status === "paid" && fulfillmentMethod === "shipping") {
    nextStatus = "processing";
    buttonLabel = "Mulai siapkan pesanan";
  } else if (
    (status === "paid" || status === "processing")
    && fulfillmentMethod === "pickup"
  ) {
    nextStatus = "ready_for_pickup";
    buttonLabel = "Siapkan untuk diambil";
  } else if (status === "processing" && fulfillmentMethod === "shipping") {
    nextStatus = "shipped";
    buttonLabel = "Tandai sudah dikirim";
  } else if (status === "ready_for_pickup") {
    nextStatus = "completed";
    buttonLabel = "Konfirmasi pick-up";
  }

  if (!nextStatus) {
    return trackingNumber
      ? <p className="text-xs text-muted-foreground">Resi: {trackingNumber}</p>
      : null;
  }

  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="nextStatus" value={nextStatus} />
      {nextStatus === "shipped" && (
        <div className="space-y-1">
          <Label htmlFor={`tracking-${orderId}`} className="text-xs">Nomor resi</Label>
          <Input
            id={`tracking-${orderId}`}
            name="trackingNumber"
            defaultValue={trackingNumber ?? ""}
            maxLength={100}
            required
          />
        </div>
      )}
      <ActionFeedback state={state} />
      <Button type="submit" size="sm" variant={nextStatus === "completed" ? "default" : "outline"} disabled={pending}>
        {pending ? "Menyimpan..." : buttonLabel}
      </Button>
    </form>
  );
}
