"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer, useMapEvents } from "react-leaflet";

type StoreLocation = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

type Coordinates = { latitude: number; longitude: number };

function MapSelection({ onSelect }: { onSelect: (coordinates: Coordinates) => void }) {
  useMapEvents({
    click(event) {
      onSelect({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

export function CheckoutMapView({
  stores,
  coordinates,
  onCoordinatesChange,
}: {
  stores: StoreLocation[];
  coordinates: Coordinates | null;
  onCoordinatesChange: (coordinates: Coordinates) => void;
}) {
  const center: [number, number] = [stores[0].latitude, stores[0].longitude];

  return (
    <div className="overflow-hidden border border-border bg-card">
      <MapContainer
        center={center}
        zoom={12}
        scrollWheelZoom={false}
        keyboard
        className="h-72 w-full sm:h-96"
        aria-label="Peta untuk memilih titik alamat pengiriman"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapSelection onSelect={onCoordinatesChange} />
        {stores.map((store) => (
          <CircleMarker
            key={store.id}
            center={[store.latitude, store.longitude]}
            radius={8}
            pathOptions={{ color: "#7f1d1d", fillColor: "#b42318", fillOpacity: 0.9 }}
          >
            <Popup>
              <strong>{store.name}</strong>
              <br />
              {store.address}
            </Popup>
          </CircleMarker>
        ))}
        {coordinates && (
          <CircleMarker
            center={[coordinates.latitude, coordinates.longitude]}
            radius={8}
            pathOptions={{ color: "#171717", fillColor: "#f3f0ea", fillOpacity: 1 }}
          >
            <Popup>Titik alamat pengiriman</Popup>
          </CircleMarker>
        )}
      </MapContainer>
      <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
        Lingkaran merah menandai toko. Pilih lokasi alamat dengan menekan peta.
      </p>
    </div>
  );
}
