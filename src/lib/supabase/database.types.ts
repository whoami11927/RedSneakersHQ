export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type InsertShape<Row, Required extends keyof Row> = Omit<Partial<Row>, Required> &
  Pick<Row, Required>;

type Table<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: InsertShape<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

type TimestampFields = {
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        TimestampFields & {
          id: string;
          email: string;
          full_name: string | null;
          role: Database["public"]["Enums"]["app_role"];
        },
        "id" | "email"
      >;
      brands: Table<
        TimestampFields & { id: string; name: string; slug: string },
        "name" | "slug"
      >;
      products: Table<
        TimestampFields & {
          id: string;
          brand_id: string | null;
          name: string;
          slug: string;
          description: string | null;
          is_active: boolean;
        },
        "name" | "slug"
      >;
      product_variants: Table<
        TimestampFields & {
          id: string;
          product_id: string;
          sku: string;
          size: string;
          color: string;
          price: number;
          low_stock_threshold: number;
          image_path: string | null;
          is_active: boolean;
        },
        "product_id" | "sku" | "size" | "color" | "price"
      >;
      stock_levels: Table<
        {
          variant_id: string;
          location_code: Database["public"]["Enums"]["inventory_location"];
          on_hand: number;
          reserved_qty: number;
          available_qty: number;
          updated_at: string;
        },
        "variant_id" | "location_code"
      >;
      shipping_addresses: Table<
        TimestampFields & {
          id: string;
          user_id: string;
          recipient_name: string;
          phone: string;
          address_line: string;
          city: string;
          province: string;
          postal_code: string;
          latitude: number;
          longitude: number;
        },
        | "user_id"
        | "recipient_name"
        | "phone"
        | "address_line"
        | "city"
        | "province"
        | "postal_code"
        | "latitude"
        | "longitude"
      >;
      store_locations: Table<
        TimestampFields & {
          id: string;
          name: string;
          address: string;
          latitude: number;
          longitude: number;
          is_active: boolean;
        },
        "name" | "address" | "latitude" | "longitude"
      >;
      shipping_zones: Table<
        TimestampFields & {
          id: string;
          store_location_id: string;
          name: string;
          min_distance_km: number;
          max_distance_km: number | null;
          base_fee: number;
          fee_per_km: number;
          is_active: boolean;
        },
        "store_location_id" | "name"
      >;
      preorder_batches: Table<
        TimestampFields & {
          id: string;
          variant_id: string;
          name: string;
          quota: number;
          reserved_quantity: number;
          ordered_quantity: number;
          opens_at: string;
          closes_at: string;
          estimated_arrival: string;
          price: number;
          payment_plan: Database["public"]["Enums"]["preorder_payment_plan"];
          deposit_percent: number | null;
          status: Database["public"]["Enums"]["preorder_batch_status"];
          received_quantity: number;
          received_at: string | null;
          received_by: string | null;
          received_note: string | null;
        },
        | "variant_id"
        | "name"
        | "quota"
        | "opens_at"
        | "closes_at"
        | "estimated_arrival"
        | "price"
        | "payment_plan"
      >;
      orders: Table<
        TimestampFields & {
          id: string;
          order_number: string;
          customer_id: string | null;
          created_by: string | null;
          status: Database["public"]["Enums"]["order_status"];
          fulfillment_method: Database["public"]["Enums"]["fulfillment_method"];
          pickup_store_location_id: string | null;
          shipping_address_id: string | null;
          shipping_address_snapshot: Json | null;
          subtotal: number;
          shipping_fee: number;
          total: number;
          tracking_number: string | null;
          reservation_expires_at: string | null;
        },
        "order_number" | "customer_id" | "fulfillment_method" | "subtotal" | "total"
      >;
      order_items: Table<
        {
          id: string;
          order_id: string;
          variant_id: string;
          preorder_batch_id: string | null;
          preorder_status: Database["public"]["Enums"]["preorder_status"] | null;
          product_name_snapshot: string;
          variant_label_snapshot: string;
          sku_snapshot: string;
          quantity: number;
          unit_price: number;
          line_total: number;
          deposit_amount: number | null;
          balance_amount: number | null;
        },
        | "order_id"
        | "variant_id"
        | "product_name_snapshot"
        | "variant_label_snapshot"
        | "sku_snapshot"
        | "quantity"
        | "unit_price"
      >;
      stock_movements: Table<
        {
          id: string;
          variant_id: string;
          location_code: Database["public"]["Enums"]["inventory_location"];
          movement_type: Database["public"]["Enums"]["stock_movement_type"];
          quantity_delta: number;
          reserved_delta: number;
          order_id: string | null;
          reference_id: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
        },
        "variant_id" | "location_code" | "movement_type"
      >;
      stock_reservations: Table<
        {
          id: string;
          order_id: string;
          order_item_id: string;
          variant_id: string;
          location_code: Database["public"]["Enums"]["inventory_location"];
          quantity: number;
          status: Database["public"]["Enums"]["reservation_status"];
          expires_at: string;
          released_at: string | null;
          created_at: string;
        },
        | "order_id"
        | "order_item_id"
        | "variant_id"
        | "location_code"
        | "quantity"
        | "expires_at"
      >;
      preorder_reservations: Table<
        {
          id: string;
          order_id: string;
          order_item_id: string;
          batch_id: string;
          quantity: number;
          status: Database["public"]["Enums"]["preorder_reservation_status"];
          expires_at: string;
          created_at: string;
        },
        "order_id" | "order_item_id" | "batch_id" | "quantity" | "expires_at"
      >;
      payments: Table<
        TimestampFields & {
          id: string;
          order_id: string;
          provider: "midtrans" | "offline";
          provider_order_id: string;
          provider_transaction_id: string | null;
          amount: number;
          status: Database["public"]["Enums"]["payment_status"];
          purpose: Database["public"]["Enums"]["payment_purpose"];
          payment_type: string | null;
          paid_at: string | null;
        },
        "order_id" | "provider_order_id" | "amount"
      >;
      payment_notifications: Table<
        { id: string; payment_id: string | null; deduplication_key: string; payload: Json; received_at: string },
        "deduplication_key" | "payload"
      >;
      pos_sale_requests: Table<
        {
          request_id: string;
          created_by: string;
          request_hash: string;
          order_id: string | null;
          created_at: string;
        },
        "request_id" | "created_by" | "request_hash"
      >;
      order_status_history: Table<
        {
          id: string;
          order_id: string;
          old_status: Database["public"]["Enums"]["order_status"] | null;
          new_status: Database["public"]["Enums"]["order_status"];
          changed_by: string | null;
          note: string | null;
          changed_at: string;
        },
        "order_id" | "new_status"
      >;
      preorder_item_status_history: Table<
        {
          id: string;
          order_item_id: string;
          old_status: Database["public"]["Enums"]["preorder_status"] | null;
          new_status: Database["public"]["Enums"]["preorder_status"];
          note: string | null;
          changed_at: string;
        },
        "order_item_id" | "new_status"
      >;
    };
    Views: Record<string, never>;
    Functions: {
      reserve_stock: { Args: { p_order_id: string; p_expires_at: string }; Returns: undefined };
      get_shipping_quote: {
        Args: { p_latitude: number; p_longitude: number };
        Returns: {
          store_location_id: string;
          store_name: string;
          store_address: string;
          zone_name: string;
          distance_km: number;
          shipping_fee: number;
        }[];
      };
      consume_checkout_rate_limit: { Args: { p_customer_id: string }; Returns: boolean };
      create_checkout_order: {
        Args: {
          p_customer_id: string;
          p_fulfillment_method: Database["public"]["Enums"]["fulfillment_method"];
          p_pickup_store_location_id: string | null;
          p_items: Json;
          p_shipping_address: Json | null;
          p_expires_at: string;
        };
        Returns: {
          order_id: string;
          order_number: string;
          subtotal: number;
          shipping_fee: number;
          total: number;
          reservation_expires_at: string;
        }[];
      };
      adjust_stock: {
        Args: {
          p_variant_id: string;
          p_location_code: Database["public"]["Enums"]["inventory_location"];
          p_delta: number;
          p_note: string;
          p_created_by: string;
        };
        Returns: number;
      };
      release_stock_reservation: {
        Args: { p_order_id: string; p_note?: string | null };
        Returns: number;
      };
      confirm_stock_reservation: { Args: { p_order_id: string }; Returns: number };
      release_expired_checkout_reservations: { Args: Record<PropertyKey, never>; Returns: number };
      reserve_preorder_quota: {
        Args: {
          p_order_id: string;
          p_order_item_id: string;
          p_batch_id: string;
          p_quantity: number;
          p_expires_at: string;
        };
        Returns: undefined;
      };
      release_preorder_reservation: { Args: { p_order_id: string }; Returns: number };
      confirm_preorder_reservation: { Args: { p_order_id: string }; Returns: number };
      create_preorder_order: {
        Args: {
          p_customer_id: string;
          p_batch_id: string;
          p_quantity: number;
          p_fulfillment_method: Database["public"]["Enums"]["fulfillment_method"];
          p_pickup_store_location_id: string | null;
          p_shipping_address: Json | null;
          p_expires_at: string;
        };
        Returns: {
          order_id: string;
          order_number: string;
          subtotal: number;
          shipping_fee: number;
          total: number;
          initial_payment_amount: number;
          reservation_expires_at: string;
        }[];
      };
      create_preorder_batch: {
        Args: {
          p_actor_id: string;
          p_variant_id: string;
          p_name: string;
          p_quota: number;
          p_opens_at: string;
          p_closes_at: string;
          p_estimated_arrival: string;
          p_price: number;
          p_payment_plan: Database["public"]["Enums"]["preorder_payment_plan"];
          p_deposit_percent: number | null;
          p_initial_status: Database["public"]["Enums"]["preorder_batch_status"];
        };
        Returns: string;
      };
      set_preorder_batch_status: {
        Args: {
          p_actor_id: string;
          p_batch_id: string;
          p_status: Database["public"]["Enums"]["preorder_batch_status"];
        };
        Returns: undefined;
      };
      receive_preorder_batch: {
        Args: {
          p_actor_id: string;
          p_batch_id: string;
          p_received_quantity: number;
          p_note: string | null;
        };
        Returns: number;
      };
      create_preorder_deposit_payment: {
        Args: { p_order_id: string };
        Returns: {
          payment_id: string;
          provider_order_id: string;
          amount: number;
          purpose: Database["public"]["Enums"]["payment_purpose"];
          item_details: Json;
          customer_details: Json;
          reservation_expires_at: string;
        }[];
      };
      create_preorder_balance_payment: {
        Args: { p_order_id: string };
        Returns: {
          payment_id: string;
          provider_order_id: string;
          amount: number;
          purpose: Database["public"]["Enums"]["payment_purpose"];
          item_details: Json;
          customer_details: Json;
        }[];
      };
      record_offline_sale: {
        Args: {
          p_actor_id: string;
          p_request_id: string;
          p_store_location_id: string;
          p_payment_method: string;
          p_items: Json;
        };
        Returns: {
          order_id: string;
          order_number: string;
          total: number;
          item_count: number;
        }[];
      };
      get_admin_sales_summary: {
        Args: { p_days: number };
        Returns: {
          provider: string;
          payment_count: number;
          total_amount: number;
        }[];
      };
      get_admin_active_preorder_batches: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          variant_id: string;
          name: string;
          quota: number;
          reserved_quantity: number;
          ordered_quantity: number;
          closes_at: string;
          estimated_arrival: string;
        }[];
      };
      update_order_fulfillment: {
        Args: {
          p_actor_id: string;
          p_order_id: string;
          p_next_status: Database["public"]["Enums"]["order_status"];
          p_tracking_number?: string | null;
        };
        Returns: {
          order_number: string;
          status: Database["public"]["Enums"]["order_status"];
        }[];
      };
      create_order_payment: {
        Args: { p_order_id: string };
        Returns: {
          payment_id: string;
          provider_order_id: string;
          amount: number;
          reservation_expires_at: string;
          item_details: Json;
          customer_details: Json;
        }[];
      };
      apply_payment_notification: {
        Args: {
          p_provider_order_id: string;
          p_provider_transaction_id: string;
          p_transaction_status: string;
          p_fraud_status: string;
          p_payment_type: string;
          p_payment_status: Database["public"]["Enums"]["payment_status"];
          p_gross_amount: number;
          p_paid_at: string | null;
          p_deduplication_key: string;
          p_payload: Json;
        };
        Returns: {
          outcome: string;
          order_status: Database["public"]["Enums"]["order_status"] | null;
          payment_status: Database["public"]["Enums"]["payment_status"] | null;
        }[];
      };
      consume_webhook_rate_limit: { Args: { p_source_key: string }; Returns: boolean };
      current_user_role: { Args: Record<PropertyKey, never>; Returns: Database["public"]["Enums"]["app_role"] | null };
      has_role: {
        Args: { required_role: Database["public"]["Enums"]["app_role"] };
        Returns: boolean;
      };
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: {
      app_role: "customer" | "cashier" | "admin";
      inventory_location: "STORE" | "ONLINE";
      stock_movement_type:
        | "sale_online"
        | "sale_offline"
        | "reservation"
        | "release"
        | "return"
        | "adjustment"
        | "preorder_received";
      reservation_status: "active" | "released" | "consumed";
      order_status:
        | "pending_payment"
        | "paid"
        | "processing"
        | "shipped"
        | "ready_for_pickup"
        | "completed"
        | "cancelled"
        | "refunded";
      fulfillment_method: "shipping" | "pickup";
      payment_status:
        | "pending"
        | "settlement"
        | "expire"
        | "cancel"
        | "deny"
        | "refund"
        | "partial_refund";
      payment_purpose: "regular" | "preorder_deposit" | "preorder_balance";
      preorder_payment_plan: "full" | "deposit";
      preorder_batch_status: "draft" | "open" | "closed" | "received" | "cancelled";
      preorder_reservation_status: "active" | "released" | "confirmed";
      preorder_status:
        | "awaiting_deposit"
        | "deposit_paid"
        | "awaiting_arrival"
        | "awaiting_balance"
        | "ready"
        | "completed"
        | "cancelled";
    };
    CompositeTypes: Record<string, never>;
  };
};
