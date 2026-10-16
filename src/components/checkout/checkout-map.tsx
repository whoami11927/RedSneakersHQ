"use client";

import dynamic from "next/dynamic";

type StoreLocation = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

type Coordinates = { latitude: number; longitude: number };

const CheckoutMapView = dynamic(
  () => import("@/components/checkout/checkout-map-view").then((module) => module.CheckoutMapView),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-72 items-center justify-center border border-border bg-secondary text-sm text-foreground">
        Memuat peta alamat...
      </div>
    ),
  },
);

export function CheckoutMap({
  stores,
  coordinates,
  onCoordinatesChange,
}: {
  stores: StoreLocation[];
  coordinates: Coordinates | null;
  onCoordinatesChange: (coordinates: Coordinates) => void;
}) {
  return (
    <CheckoutMapView
      stores={stores}
      coordinates={coordinates}
      onCoordinatesChange={onCoordinatesChange}
    />
  );
}
