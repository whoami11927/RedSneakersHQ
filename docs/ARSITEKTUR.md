# Arsitektur Sistem

Dokumen ini menjelaskan arsitektur Red Sneakers HQ secara teknis dan akurat sesuai implementasi saat ini.

## 1. Gambaran Umum Arsitektur

Red Sneakers HQ adalah aplikasi e-commerce B2C berbasis Next.js App Router yang berintegrasi dengan Supabase (PostgreSQL, Auth, Realtime, Storage) dan Midtrans Snap untuk pembayaran. Semua validasi input dan perhitungan transaksi dilakukan di sisi server.

```
Browser (Next.js App Router)
     |
     v
+---------------------------+
|  Server Actions / Route   |
|  Handlers (Next.js)       |
+---------------------------+
     |
     v
+---------------------------+
|  Supabase Server Client   |  <-- Anon key, RLS diterapkan
|  Supabase Service Client  |  <-- Service role key (hanya server)
+---------------------------+
     |
     v
+---------------------------+
|  PostgreSQL (Supabase)    |  <-- RPC transaksional, RLS, trigger
+---------------------------+
     |
     v
+---------------------------+
|  Midtrans Snap API        |  <-- Pembayaran (hanya server)
+---------------------------+
```

## 2. Lapisan Aplikasi

### 2.1 Presentasi (Next.js App Router)

- `src/app/` — Halaman, layout, metadata, server actions, dan route handler.
- `src/components/` — Komponen React dibagi menjadi:
  - `admin/` — Konsol admin dan kasir (POS, produk, pre-order, laporan).
  - `cart/` — Provider dan konteks keranjang belanja.
  - `catalog/` — Filter dan grid produk.
  - `checkout/` — Form checkout dan peta pengiriman.
  - `forms/` — Form masuk dan daftar.
  - `payment/` — Tombol pembayaran Midtrans Snap.
  - `preorders/` — Form pembelian pre-order.
  - `ui/` — Komponen dasar shadcn/ui.
- `src/app/layout.tsx` — Tata letak root dengan font, tema, header, dan keranjang.
- `src/app/globals.css` — Gaya global (Tailwind CSS v4, shadcn, Leaflet).
- `src/app/proxy.ts` — Middleware pengalihan sesi Supabase.

### 2.2 Logika Bisnis (`src/lib/`)

| Folder | Tanggung Jawab |
|--------|---------------|
| `catalog/` | Query katalog produk, varian, dan stok |
| `cart/` | Logika keranjang belanja |
| `midtrans/` | Konfigurasi, Snap, tanda tangan SHA-512, peta status |
| `orders/` | Query pesanan, label status, pembaca snapshot pengiriman |
| `payments/` | Pembuatan token pembayaran, penerapan notifikasi webhook |
| `reports/` | Ekspor CSV dan pelarasan sel formula spreadsheet |
| `stock/` | Hook stok realtime melalui Supabase Realtime |
| `supabase/` | Klien server, browser, service role, viewer, validasi env |
| `validators/` | Skema Zod untuk auth, katalog, checkout, admin, Midtrans, POS, pre-order |

### 2.3 Basis Data (Supabase PostgreSQL)

- **Tabel inti:** `profiles`, `brands`, `products`, `product_variants`, `stock_levels`, `stock_movements`, `store_locations`, `shipping_zones`, `orders`, `order_items`, `stock_reservations`, `payments`, `payment_notifications`, `order_status_history`, `preorder_batches`, `preorder_reservations`.
- **Enum:** `payment_status`, `order_status`, dan lainnya.
- **RLS (Row Level Security):** Kebijakan di semua tabel memastikan klien tidak dapat menulis langsung ke `stock_levels` atau mengubah `profiles.role`.
- **RPC transaksional:** `create_checkout_order`, `adjust_stock`, `create_order_payment`, `apply_payment_notification`, `release_expired_checkout_reservations`, dan lainnya.
- **Trigger:** Mencatat riwayat status pesanan dan pergerakan stok.
- **`pg_cron`:** Menjadwalkan pelisiran reservasi checkout kedaluwarsa setiap menit.

## 3. Alur Data Utama

### 3.1 Katalog dan Stok

1. Klien meminta katalog melalui server component (`getCatalog`).
2. Data dibaca dari Supabase dengan RLS; hanya produk aktif yang ditampilkan.
3. Perubahan stok dipancarkan ke klien melalui Supabase Realtime (`useLiveStock`).
4. Klien tidak bisa menulis langsung ke `stock_levels` (diblokir RLS).

### 3.2 Checkout dan Reservasi

1. Pelanggan mengirim form checkout (varian, jumlah, metode pengambilan/pengiriman).
2. Server memverifikasi sesi, peran `customer`, dan rate limit.
3. RPC `create_checkout_order` mengunci baris stok (`FOR UPDATE`), memvalidasi ketersediaan, dan membuat reservasi 15 menit.
4. Harga dan total dihitung dari database, tidak dari payload klien.
5. Order berstatus `pending_payment`.

### 3.3 Pembayaran Midtrans

1. Pelanggan memicu `createPaymentTokenAction` dari halaman pesanan.
2. Server memanggil `create_order_payment` (RPC) dan API Snap Midtrans.
3. Token Snap dikembalikan ke klien; popup Snap dimuat dengan client key publik.
4. Midtrans mengirim webhook ke `/api/payments/midtrans/notification`.
5. Route handler memvalidasi payload Zod, memverifikasi tanda tangan SHA-512, memeriksa rate limit, dan memanggil `apply_payment_notification`.
6. Status pembayaran, pesanan, dan stok diperbarui dalam satu transaksi PostgreSQL.
7. Webhook duplikat ditolak melalui `deduplication_key`.

### 3.4 POS Toko

1. Kasir membuat transaksi offline melalui `recordOfflineSaleAction`.
2. RPC mengunci baris stok `STORE`, memvalidasi ketersediaan, dan mencatat `sale_offline` ke `stock_movements`.
3. Idempotensi dijaga melalui `request_id`.

### 3.5 Pre-Order

1. Batch pre-order memiliki kuota yang dikunci pada baris batch.
2. Pemesanan bersamaan tidak dapat melewati kuota karena row lock.
3. Pembayaran DP atau pelunasan diproses melalui alur pembayaran yang sama.

## 4. Keamanan

- Kunci service role Supabase dan kunci server Midtrans disimpan di file dengan markah `server-only`; tidak pernah dikirim ke browser.
- Semua variabel rahasia divalidasi dengan Zod saat startup; nilai placeholder ditolak.
- Validasi input dengan Zod di semua batas server (server actions dan route handler).
- Tanda tangan notifikasi Midtrans diverifikasi dengan `timingSafeEqual` untuk mencegah serangan timing.
- RLS mencegah klien menulis langsung ke saldo stok atau mengubah peran pengguna.
- Perubahan stok hanya melalui RPC transaksional yang juga mencatat `stock_movements`.

## 5. Teknologi

| Teknologi | Versi | Penggunaan |
|-----------|-------|------------|
| Next.js | 16.4.0 | App Router, server actions, route handler |
| React | 19.3.0 | Antarmuka pengguna |
| TypeScript | 5.x | Strict mode, tipe statis |
| Tailwind CSS | 4.x | Styling |
| shadcn/ui | base-nova | Komponen UI |
| Supabase | 2.x | Basis data, Auth, Realtime, Storage |
| Midtrans Snap | — | Pembayaran |
| Leaflet | 1.9.4 | Peta pengiriman |
| Zod | 4.x | Validasi skema |
| React Hook Form | 7.x | Manajemen form |
| Vitest | 3.x | Pengujian unit |