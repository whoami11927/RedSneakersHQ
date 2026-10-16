# Panduan Kontribusi

Terima kasih telah berminat berkontribusi pada Red Sneakers HQ. Dokumen ini menjelaskan proses berkontribusi agar kolaborasi tetap terstruktur dan berkelanjutan.

## 1. Perihal Proyek

Red Sneakers HQ adalah aplikasi e-commerce B2C sepatu berbasis Next.js, Supabase, dan Midtrans Snap. Fokus utamanya adalah kualitas kode, keamanan transaksi, dan kemudahan pemeliharaan. Semua kontribusi harus selaras dengan tujuan tersebut.

## 2. Cara Kontribusi

### 2.1 Laporkan Masalah (Issue)

- Buat issue melalui template yang tersedia di repositori.
- Jelaskan langkah reproduksi, perilaku yang diharapkan, dan perilaku yang sebenarnya.
- Sertakan lingkungan (browser, OS, versi Node.js) jika relevan.

### 2.1 Usulkan Fitur

- Buat issue dengan template "Feature request".
- Jelaskan masalah yang ingin diatasi dan solusi yang diusulkan.
- Jangan mengirimkan pull request untuk fitur besar sebelum mendiskusikannya terlebih dahulu melalui issue.

### 2.2 Pull Request

1. Fork repositori ini.
2. Buat branch baru dari `main`:

```powershell
git checkout -b fitur/nama-fitur
```

3. Lakukan perubahan sesuai standar kode (lihat bagian 4).
4. Jalankan pemeriksaan kualitas:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

5. Commit dengan pesan yang jelas menggunakan format Conventional Commits:

```
feat: menambahkan fitur contoh
fix: memperbaiki validasi checkout
docs: memperbarui panduan instalasi
```

6. Push branch dan buat pull request ke branch `main`.

## 3. Daftar Periksa Sebelum Pull Request

- [ ] Kode telah melalui `npm run lint` tanpa error
- [ ] Kode telah melalui `npm run typecheck` tanpa error
- [ ] Semua uji lulus (`npm test`)
- [ ] Build produksi lulus (`npm run build`)
- [ ] Uji telah ditambahkan atau diperbarui jika relevan
- [ ] Dokumentasi telah diperbarui jika relevan
- [ ] Tidak ada rahasia (API key, password, token) yang terkomit
- [ ] Deskripsi pull request telah diisi dengan lengkap

## 4. Standar Kode

- Gunakan TypeScript strict.
- Ikuti gaya penulisan yang ada (Prettier/ESLint konfigurasi proyek).
- Semua variabel dan fungsi menggunakan bahasa Inggris dalam kode.
- Komentar dan dokumentasi pengguna dapat menggunakan Bahasa Indonesia.
- Gunakan `"use server"` untuk aksi server dan `"use client"` untuk komponen interaktif.
- Jangan mengekspos kunci rahasia ke sisi klien.

## 5. Keamanan

- Jangan pernah melakukan komit `.env.local` atau berkas yang mengandung kredensial.
- Jika menemukan rahasia yang telah terkomit, segera putar kredensial tersebut dan laporkan kepada pemelihara repositori.
- Semua perubahan terkait autentikasi atau otorisasi harus ditinjau dengan seksama.

## 6. Lisensi

Dengan berkontriburi, Anda setuju bahwa kontribusi Anda akan dilisensikan di bawah lisensi yang sama dengan proyek ini (MIT License).

## 7. Kontak

Pertanyaan terkait kontribusi dapat diajukan melalui issue di repositori GitHub.