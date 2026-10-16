# Red Sneakers HQ

- Gunakan TypeScript strict dan Next.js App Router.
- Semua validasi input dan kalkulasi harga/transaksi dilakukan di server.
- Jangan pernah mengekspos Supabase service role key atau Midtrans server key ke klien.
- Perubahan saldo stok harus melalui transaksi database yang juga menulis `stock_movements`.
- Jalankan `npm run lint`, `npm run typecheck`, dan build yang relevan setelah perubahan.

<!-- antislop:start -->
## antislop

Antislop core dan skill berada di instalasi skill pengguna, bukan disalin ke repository. Untuk UI, copy, accessibility, mobile layout, atau komentar kode, baca file skill terkait dari `$HOME/.agents/skills/` sebelum mengubahnya. Untuk UI, minta arahan visual brand sebelum implementasi.
<!-- antislop:end -->

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
