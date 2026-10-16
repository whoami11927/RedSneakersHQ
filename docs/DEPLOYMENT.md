# Panduan Deployment

Dokumen ini menjelaskan cara menyebarkan Red Sneakers HQ ke environment produksi.

## 1. Prasyarat

- Akun Supabase (project produksi)
- Akun Midtrans (production atau sandbox)
- Platform hosting yang mendukung Next.js (contoh: Vercel)
- Domain yang telah dikonfigurasi

## 2. Persiapan Basis Data Supabase

1. Buat project Supabase baru melalui [Supabase Dashboard](https://app.supabase.com).
2. Masuk ke Supabase CLI dan link project:

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
```

3. Terapkan skema basis data ke project hosted:

```powershell
npx supabase db push
```

4. Bucket `product-images` dan kebijakan admin untuk unggah/hapus gambar dibuat oleh migrasi.

## 3. Konfigurasi Autentikasi Supabase

1. Di Supabase Dashboard, buka **Authentication > URL Configuration**.
2. Isi **Site URL** dengan URL aplikasi produksi (contoh: `https://red-sneakers-hq.vercel.app`).
3. Tambahkan **Redirect URLs**:
   - `https://<domain-anda>/auth/callback`

## 4. Variabel Lingkungan Produksi

Tambahkan variabel berikut ke platform hosting (contoh: Vercel > Settings > Environment Variables):

| Variabel | Nilai | Keterangan |
|----------|-------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase produksi | Publik |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Kunci anonim Supabase produksi | Publik |
| `NEXT_PUBLIC_SITE_URL` | `https://<domain-anda>` | Publik |
| `SUPABASE_SERVICE_ROLE_KEY` | Kunci peran layanan Supabase | **Hanya server** |
| `MIDTRANS_SERVER_KEY` | Kunci server Midtrans produksi | **Hanya server** |
| `MIDTRANS_IS_PRODUCTION` | `true` atau `false` | Hanya server |
| `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` | Kunci klien Midtrans | Publik |
| `NEXT_PUBLIC_MIDTRANS_SNAP_URL` | `https://app.midtrans.com/snap/snap.js` (produksi) | Publik |
| `DEMO_*_EMAIL` / `DEMO_*_PASSWORD` | — | Opsional, untuk akun demo |

**Peringatan:** `SUPABASE_SERVICE_ROLE_KEY` dan `MIDTRANS_SERVER_KEY` tidak boleh diberikan awalan `NEXT_PUBLIC_` dan tidak boleh pernah muncul di sisi klien.

## 5. Konfigurasi Webhook Midtrans

1. Di Midtrans Dashboard, buka **Settings > Configuration**.
2. Isi **Payment Notification URL** dengan:

```
https://<domain-anda>/api/payments/midtrans/notification
```

3. Pastikan endpoint dapat diakses dari internet publik (tidak boleh di belakang firewall atau localhost).

## 6. Build dan Deploy

### Menggunakan Vercel (direkomendasikan)

1. Import repositori GitHub ke Vercel.
2. Tetapkan variabel lingkungan sesuai tabel di bagian 4.
3. Deploy otomatis akan terpicu pada setiap push ke branch `main`.

### Build Manual

```powershell
npm install
npm run build
npm run start
```

## 7. Verifikasi Setelah Deploy

1. Buka aplikasi di domain produksi.
2. Verifikasi katalog tampil dengan benar (koneksi Supabase aktif).
3. Coba masuk sebagai pelanggan, kasir, dan admin.
4. Uji pembayaran dengan kredensial Midtrans sandbox atau produksi.
5. Verifikasi webhook menerima notifikasi (periksa log function di Vercel atau Supabase).

## 8. Pemeliharaan

- Putar kunci rahasia secara berkala sesuai kebijakan keamanan organisasi.
- Pantau log Supabase dan Midtrans untuk aktivitas tidak biasa.
- Lakukan cadangan basis data secara teratur melalui Supabase.
- Perbarui dependensi dan perbaiki kerentanan yang terdeteksi.

## 9. Catatan

- `NEXT_PUBLIC_*` dibundel selama build Next.js. Setelah mengubahnya, lakukan build ulang atau deploy ulang.
- Migrasi memerlukan PostgreSQL Supabase karena menggunakan schema `auth`, `storage`, role `service_role`, dan publikasi `supabase_realtime`.
- Untuk pengujian lokal sebelum deploy, gunakan tunnel (contoh: `ngrok http 3000`) sebagai URL notifikasi webhook Midtrans.