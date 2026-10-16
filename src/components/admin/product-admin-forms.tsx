"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { createProductAction, createBrandAction, createVariantAction, adjustStockAction, setVariantImage, toggleProductActiveAction, type AdminActionState } from "@/app/admin/products/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ProductOption = { id: string; name: string; slug: string; is_active: boolean };
type BrandOption = { id: string; name: string };
type VariantOption = { id: string; product_name: string; size: string; color: string; sku: string };

function ActionFeedback({ state }: { state: AdminActionState }) {
  if (state.error) return <p role="alert" className="text-sm font-medium text-destructive">{state.error}</p>;
  if (state.success) return <p role="status" className="text-sm font-medium text-foreground">{state.success}</p>;
  return null;
}

export function CreateBrandForm() {
  const [state, action, pending] = useActionState(createBrandAction, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="brand-name">Nama merek</Label><Input id="brand-name" name="name" required minLength={2} maxLength={100} /></div>
        <div className="space-y-2"><Label htmlFor="brand-slug">Slug</Label><Input id="brand-slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} placeholder="contoh-brand" /></div>
      </div>
      <ActionFeedback state={state} />
      <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Tambah merek"}</Button>
    </form>
  );
}

export function CreateProductForm({ brands }: { brands: BrandOption[] }) {
  const [state, action, pending] = useActionState(createProductAction, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="product-name">Nama produk</Label><Input id="product-name" name="name" required maxLength={160} /></div>
        <div className="space-y-2"><Label htmlFor="product-slug">Slug URL</Label><Input id="product-slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={160} placeholder="contoh-runner-01" /></div>
        <div className="space-y-2">
          <Label htmlFor="product-brand">Merek (opsional)</Label>
          <select id="product-brand" name="brandId" className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Tanpa merek</option>
            {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
        </div>
        <div className="space-y-2"><Label htmlFor="product-description">Deskripsi</Label><Input id="product-description" name="description" maxLength={2000} /></div>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="isActive" defaultChecked className="size-4 accent-primary" />Tampilkan produk di katalog</label>
      <ActionFeedback state={state} />
      <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Tambah produk"}</Button>
    </form>
  );
}

export function CreateVariantForm({ products }: { products: ProductOption[] }) {
  const [state, action, pending] = useActionState(createVariantAction, {});
  if (products.length === 0) return <p className="text-sm text-muted-foreground">Tambahkan produk sebelum membuat varian.</p>;
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="variant-product">Produk</Label>
          <select id="variant-product" name="productId" required className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </div>
        <div className="space-y-2"><Label htmlFor="variant-sku">SKU</Label><Input id="variant-sku" name="sku" required maxLength={80} /></div>
        <div className="space-y-2"><Label htmlFor="variant-size">Ukuran</Label><Input id="variant-size" name="size" required maxLength={20} placeholder="42" /></div>
        <div className="space-y-2"><Label htmlFor="variant-color">Warna</Label><Input id="variant-color" name="color" required maxLength={60} /></div>
        <div className="space-y-2"><Label htmlFor="variant-price">Harga (Rp)</Label><Input id="variant-price" name="price" type="number" min="1" max="100000000" step="1" required /></div>
        <div className="space-y-2"><Label htmlFor="variant-threshold">Ambang stok menipis</Label><Input id="variant-threshold" name="lowStockThreshold" type="number" min="0" max="100000" defaultValue="3" required /></div>
      </div>
      <ActionFeedback state={state} />
      <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Tambah varian"}</Button>
    </form>
  );
}

export function AdjustStockForm({ variants }: { variants: VariantOption[] }) {
  const [state, action, pending] = useActionState(adjustStockAction, {});
  if (variants.length === 0) return <p className="text-sm text-muted-foreground">Tambahkan varian sebelum menyesuaikan stok.</p>;
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="stock-variant">Varian</Label>
          <select id="stock-variant" name="variantId" required className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
            {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.product_name} · {variant.size} / {variant.color} · {variant.sku}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="stock-location">Lokasi stok</Label>
          <select id="stock-location" name="locationCode" className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="ONLINE">Online</option><option value="STORE">Toko fisik</option>
          </select>
        </div>
        <div className="space-y-2"><Label htmlFor="stock-delta">Perubahan jumlah</Label><Input id="stock-delta" name="delta" type="number" step="1" required placeholder="Contoh: 5 atau -2" /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="stock-note">Alasan perubahan</Label><Input id="stock-note" name="note" required minLength={3} maxLength={500} placeholder="Contoh: hasil stock opname" /></div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">Penambahan positif dan pengurangan negatif dicatat sebagai movement. Stok tidak dapat dikurangi di bawah jumlah yang sudah direservasi.</p>
      <ActionFeedback state={state} />
      <Button type="submit" disabled={pending}>{pending ? "Mencatat..." : "Catat penyesuaian stok"}</Button>
    </form>
  );
}

export function ProductVisibilityForm({ product }: { product: ProductOption }) {
  const [state, action, pending] = useActionState(toggleProductActiveAction, {});
  const nextActive = !product.is_active;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="isActive" value={String(nextActive)} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Menyimpan..." : product.is_active ? "Sembunyikan" : "Tampilkan"}
      </Button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function ProductImageUpload({ variants }: { variants: VariantOption[] }) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [pending, startTransition] = useTransition();

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(undefined);
    setSuccess(undefined);
    const formData = new FormData(event.currentTarget);
    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) {
      setError("Pilih berkas gambar terlebih dahulu.");
      return;
    }
    const allowedTypes = new Map([
      ["image/jpeg", "jpg"],
      ["image/png", "png"],
      ["image/webp", "webp"],
      ["image/avif", "avif"],
    ]);
    const extension = allowedTypes.get(file.type);
    if (!extension) {
      setError("Gunakan gambar JPEG, PNG, WebP, atau AVIF.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Ukuran gambar maksimal 5 MB.");
      return;
    }
    if (!variantId) {
      setError("Pilih varian produk terlebih dahulu.");
      return;
    }

    startTransition(async () => {
      const imagePath = `${variantId}/${crypto.randomUUID()}.${extension}`;
      const supabase = createSupabaseBrowserClient();
      const uploaded = await supabase.storage.from("product-images").upload(imagePath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (uploaded.error) {
        console.error("Product image upload failed:", uploaded.error.message);
        setError("Gambar tidak dapat diunggah. Pastikan akun Anda memiliki akses admin.");
        return;
      }
      const saved = await setVariantImage({ variantId, imagePath });
      if (saved.error) {
        setError(`${saved.error} Berkas sudah terunggah dan dapat dipasang kembali.`);
        return;
      }
      setSuccess(saved.success);
      form.reset();
    });
  }

  if (variants.length === 0) return <p className="text-sm text-muted-foreground">Tambahkan varian sebelum mengunggah gambar.</p>;
  return (
    <form className="space-y-4" onSubmit={upload}>
      <div className="space-y-2">
        <Label htmlFor="image-variant">Varian</Label>
        <select id="image-variant" value={variantId} onChange={(event) => setVariantId(event.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
          {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.product_name} · {variant.size} / {variant.color} · {variant.sku}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="product-image">Gambar produk (maks. 5 MB)</Label>
        <Input id="product-image" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" required />
      </div>
      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      {success && <p role="status" className="text-sm font-medium">{success}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Mengunggah..." : "Unggah gambar"}</Button>
    </form>
  );
}
