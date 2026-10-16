# Panduan Pengembangan

Dokumen ini memberikan panduan praktis untuk pengembang yang ingin bekerja pada Red Sneakers HQ.

## 1. Persyaratan

- Node.js 20.9+
- npm
- Docker Desktop (untuk Supabase lokal)
- Supabase CLI

## 2. Instalasi Awal

```powershell
# Clone repositori
git clone https://github.com/whoami11927/RedSneakersHQ.git
cd RedSneakersHQ

# Salin contoh variabel lingkungan
Copy-Item .env.example .env.local

# Isi .env.local dengan nilai lokal (lihat README.md bagian "Variabel Lingkungan")

# Pasang dependensi
npm install

# Jalankan Supabase lokal
npm run db:start

## 3. Variabel Lingkungan

Berkas `.env.example` berisi daftar lengkap variabel yang diperlukan. Salin ke `.env.local` dan isi nilai yang sesuai. Jangan pernah melakukan komit `.env.local`.

Variabel kunci:

| Variabel | Sumber | Catatan |
|----------|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard > Project Settings > API | URL proyek |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard > Project Settings > API | Kunci anonim (publik) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard > Project Settings > API | Hanya server, tidak boleh `NEXT_PUBLIC_` |
| `MIDTRANS_SERVER_KEY` | Midtrans Dashboard > Settings > Access Keys | Hanya server, sandbox untuk pengembangan |
| `MIDTRANS_IS_PRODUCTION` | — | `false` untuk sandbox |
| `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` | Midtrans Dashboard > Settings > Access Keys | Publik, untuk Snap.js |
| `NEXT_PUBLIC_SITE_URL` | — | `http://localhost:3000` untuk lokal |
| `DEMO_*_EMAIL` / `DEMO_*_PASSWORD` | — | Dibuat oleh `npm run seed:users` |

## 4. Skrip Tersedia

| Perintah | Keterangan |
|----------|------------|
| `npm run dev` | Server pengembangan Next.js |
| `npm run build` | Build produksi |
| `npm run start` | Server produksi |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript `tsc --noEmit` |
| `npm test` | Vitest (unit test) |
| `npm run test:watch` | Vitest mode pengawasan |
| `npm run test:stock-concurrency` | Uji konkurensi stok (butuh Supabase lokal) |
| `npm run db:start` | Mulai Supabase lokal |
| `npm run db:stop` | Hentikan Supabase lokal |
| `npm run db:reset` | Reset basis data lokal |
| `npm run db:types` | Generate tipe TypeScript dari schema |
| `npm run seed:users` | Buat akun demo |

# Terapkan migrasi dan seed basis data
npm run db:reset

# Buat akun demo
npm run seed:users

# Jalankan server pengembangan
npm run dev

## 5. Struktur Folder Sumber

```
src/
├── app/                 # Next.js App Router
│   ├── (auth)/          # Autentikasi (masuk, daftar, keluar, callback)
│   ├── admin/           # Halaman admin dan kasir
│   ├── api/             # Route handler (webhook Midtrans)
│   ├── checkout/        # Checkout dan aksi pesanan
│   ├── orders/          # Daftar dan detail pesanan
│   ├── preorders/       # Halaman pre-order
│   ├── products/        # Detail produk
│   ├── page.tsx         # Beranda (katalog)
│   ├── layout.tsx       # Tata letak root
│   ├── globals.css      # Gaya global
│   └── proxy.ts         # Middleware sesi Supabase
├── components/          # Komponen React
│   ├── admin/           # Komponen admin dan kasir
│   ├── cart/            # Keranjang belanja
│   ├── catalog/         # Katalog produk
│   ├── checkout/        # Form dan peta checkout
│   ├── forms/           # Form autentikasi
│   ├── payment/         # Tombol pembayaran Snap
│   ├── preorders/       # Form pre-order
│   └── ui/              # Komponen dasar shadcn/ui
├── lib/                 # Logika bisnis
│   ├── catalog/         # Query katalog
│   ├── cart/            # Logika keranjang
│   ├── midtrans/        # Konfigurasi dan tanda tangan Midtrans
│   ├── orders/          # Query pesanan
│   ├── payments/        # Token dan notifikasi pembayaran
│   ├── reports/         # Ekspor CSV
│   ├── stock/           # Hook stok realtime
│   ├── supabase/        # Klien Supabase dan validasi env
│   ├── validators/      # Skema Zod
│   ├── format.ts        # Format mata uang IDR
│   └── utils.ts         # Utilitas (cn)
├── test/                # Stub pengujian
├── globals.css          # Gaya global
├── layout.tsx           # Tata letak root
├── page.tsx             # Halaman beranda
└── proxy.ts             # Middleware sesi
```

## 6. Panduan Kode

### 6.1 Server vs Client

- Gunakan `"use server"` untuk server action yang menangani mutasi data dan transaksi.
- Gunakan `"use client"` hanya untuk komponen yang memerlukan interaktivitas browser (state, event, efek).
- Semua perhitungan harga, validasi transaksi, dan akses kunci rahasia dilakukan di sisi server.

### 6.2 Validasi Input

- Semua input dari klien divalidasi dengan Zod di batas server.
- Jangan pernah mempercayai nominal, harga, atau ketersediaan dari payload klien.
- Semua nilai ditampilkan kembali dari basis data.

### 6.3 Stok

## 7. Uji Coba

```powershell
# Jalankan semua unit test
npm test

# Uji konkurensi stok (butuh Supabase lokal dan akun demo)
npm run test:stock-concurrency
```

Unit test mencakup tanda tangan/status pembayaran, webhook, validasi POS, validasi pre-order, dan pelarasan CSV. Uji transaksi SQL dan RLS memerlukan instance Supabase PostgreSQL.

## 8. Kualitas Kode

```powershell
npm run lint
npm run typecheck
npm run build
```

Semua pemeriksaan harus lulus sebelum mengajukan pull request.

## 9. Pengembangan Basis Data

```powershell
# Lihat status migrasi
npx supabase status

# Buat migrasi baru
npx supabase migration new nama_migrasi

# Terapkan migrasi ke hosted
npx supabase db push

# Generate tipe TypeScript
npm run db:types
```

Berkas tipe dihasilkan disimpan di `src/lib/supabase/database.types.ts`.

## 10. Konvensi Commit

Gunakan format Conventional Commits:

- `feat:` — Fitur baru
- `fix:` — Perbaikan bug
- `docs:` — Dokumentasi
- `refactor:` — Refaktor kode tanpa perubahan perilaku
- `style:` — Format kode (tidak mengubah fungsionalitas)
- `test:` — Tambahan atau perubahan uji
- `chore:` — Konfigurasi atau pemeliharaan

Contoh: `feat: menambahkan halaman katalog produk`

## 11. Kontribusi

Lihat [`CONTRIBUTING.md`](CONTRIBUTING.md) untuk panduan berkontribusi secara detail.

## 12. Lisensi

Lihat [`LICENSE`](LICENSE).

- Perubahan stok hanya melalui RPC transaksional yang juga mencatat `stock_movements`.
- Klien tidak bisa menulis langsung ke `stock_levels` (diblokir RLS).
- Gunakan `FOR UPDATE` untuk mengunci baris stok saat reservasi.

### 6.4 Autentikasi dan Otorisasi

- `getViewerState()` memeriksa sesi dan profil pengguna.
- `requireAdmin()` untuk akses admin.
- `requireStaff()` untuk akses admin atau kasir.
- Peran disimpan di tabel `profiles` dan hanya dapat diubah oleh admin melalui backend tepercaya.

### 6.5 Pembayaran

- Kunci server Midtrans tidak boleh memiliki awalan `NEXT_PUBLIC_`.
- Tanda tangan webhook harus diverifikasi sebelum memproses notifikasi.
- Webhook duplikat ditolak melalui `deduplication_key`.
- Gross amount selalu berasal dari database, tidak dari klien.
```

Buka `http://localhost:3000` di browser.