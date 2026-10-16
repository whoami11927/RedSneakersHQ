# Changelog

Semua perubahan yang tercatat pada berkas ini akan dimulai dari versi proyek saat ini.

## [0.1.0] — 2026-10-17

### Ditambahkan

- Aplikasi e-commerce B2C sepatu berbasis Next.js 16 dan React 19
- Katalog produk dengan filter merek dan pencarian
- Manajemen stok per varian dan lokasi (`STORE` / `ONLINE`)
- Reservasi stok dengan kunci baris (`FOR UPDATE`) dan ledger `stock_movements`
- Checkout dengan pengiriman atau pengambilan di toko
- Perhitungan ongkir berdasarkan zona dan koordinasi (Haversine)
- Pembayaran Midtrans Snap dengan verifikasi tanda tangan SHA-512
- Webhook idempotensi dengan `deduplication_key`
- Pre-order batch dengan kuota dan pembayaran DP/pelunasan
- POS kasir untuk penjualan offline toko fisik
- Konsol admin untuk manajemen produk, varian, dan stok
- Autentikasi Supabase dengan peran pelanggan, kasir, dan admin
- RLS (Row Level Security) pada semua tabel basis data
- Ekspor CSV terbatas untuk laporan admin
- Uji unit dengan Vitest (pembayaran, webhook, POS, pre-order, CSV)
- Dokumentasi arsitektur, pengembangan, dan deployment

### Diubah

- README ditulis ulang dalam Bahasa Indonesia formal

### Dihapus

- Tidak ada

## [0.0.1] — 2026-10-13

### Ditambahkan

- Commit awal repositori (hanya README)