import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { CatalogFilters } from "@/lib/validators/catalog";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type VariantRow = Database["public"]["Tables"]["product_variants"]["Row"];
type StockRow = Database["public"]["Tables"]["stock_levels"]["Row"];
type BrandRow = Database["public"]["Tables"]["brands"]["Row"];

export type CatalogVariant = Pick<
  VariantRow,
  "id" | "product_id" | "sku" | "size" | "color" | "price" | "low_stock_threshold" | "image_path"
> & { image_url: string | null };

export type CatalogProduct = Pick<
  ProductRow,
  "id" | "brand_id" | "name" | "slug" | "description"
> & {
  brand_name: string | null;
  variants: CatalogVariant[];
};

export type CatalogStock = Pick<StockRow, "variant_id" | "location_code" | "available_qty">;

export type CatalogResult =
  | { status: "ready"; products: CatalogProduct[]; brands: Pick<BrandRow, "id" | "name">[]; stock: CatalogStock[] }
  | { status: "error"; message: string };

export async function getCatalog(filters: CatalogFilters): Promise<CatalogResult> {
  const supabase = await createSupabaseServerClient();
  let productQuery = supabase
    .from("products")
    .select("id, brand_id, name, slug, description")
    .eq("is_active", true)
    .order("name");

  if (filters.q) productQuery = productQuery.ilike("name", `%${filters.q}%`);
  if (filters.brand) productQuery = productQuery.eq("brand_id", filters.brand);

  const [productResult, brandResult] = await Promise.all([
    productQuery,
    supabase.from("brands").select("id, name").order("name"),
  ]);
  if (productResult.error || brandResult.error) {
    const cause = productResult.error ?? brandResult.error;
    console.error("Catalog query failed:", cause?.message);
    return { status: "error", message: "Katalog belum dapat dimuat. Silakan coba lagi." };
  }

  const products = productResult.data;
  const productIds = products.map((product) => product.id);
  if (productIds.length === 0) {
    return { status: "ready", products: [], brands: brandResult.data, stock: [] };
  }

  const variantResult = await supabase
    .from("product_variants")
    .select("id, product_id, sku, size, color, price, low_stock_threshold, image_path")
    .in("product_id", productIds)
    .eq("is_active", true)
    .order("size");
  if (variantResult.error) {
    console.error("Catalog variants query failed:", variantResult.error.message);
    return { status: "error", message: "Varian produk belum dapat dimuat. Silakan coba lagi." };
  }

  const variantIds = variantResult.data.map((variant) => variant.id);
  const stockResult = variantIds.length
    ? await supabase
      .from("stock_levels")
      .select("variant_id, location_code, available_qty")
      .in("variant_id", variantIds)
    : { data: [], error: null };
  if (stockResult.error) {
    console.error("Catalog stock query failed:", stockResult.error.message);
    return { status: "error", message: "Ketersediaan stok belum dapat dimuat. Silakan coba lagi." };
  }

  const brandNames = new Map(brandResult.data.map((brand) => [brand.id, brand.name]));
  const imageUrls = new Map<string, string>();
  for (const variant of variantResult.data) {
    if (variant.image_path) {
      imageUrls.set(
        variant.id,
        supabase.storage.from("product-images").getPublicUrl(variant.image_path).data.publicUrl,
      );
    }
  }
  const variantsByProduct = new Map<string, CatalogVariant[]>();
  for (const variant of variantResult.data) {
    const current = variantsByProduct.get(variant.product_id) ?? [];
    current.push({ ...variant, image_url: imageUrls.get(variant.id) ?? null });
    variantsByProduct.set(variant.product_id, current);
  }

  return {
    status: "ready",
    brands: brandResult.data,
    stock: stockResult.data,
    products: products.map((product) => ({
      ...product,
      brand_name: product.brand_id ? brandNames.get(product.brand_id) ?? null : null,
      variants: variantsByProduct.get(product.id) ?? [],
    })),
  };
}

export type ProductDetailResult =
  | { status: "ready"; product: CatalogProduct; stock: CatalogStock[] }
  | { status: "not_found" }
  | { status: "error"; message: string };

export async function getProductBySlug(slug: string): Promise<ProductDetailResult> {
  const supabase = await createSupabaseServerClient();
  const productResult = await supabase
    .from("products")
    .select("id, brand_id, name, slug, description")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (productResult.error) {
    console.error("Product query failed:", productResult.error.message);
    return { status: "error", message: "Detail produk belum dapat dimuat. Silakan coba lagi." };
  }
  if (!productResult.data) return { status: "not_found" };

  const [brandResult, variantResult] = await Promise.all([
    productResult.data.brand_id
      ? supabase.from("brands").select("id, name").eq("id", productResult.data.brand_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("product_variants")
      .select("id, product_id, sku, size, color, price, low_stock_threshold, image_path")
      .eq("product_id", productResult.data.id)
      .eq("is_active", true)
      .order("size"),
  ]);
  if (brandResult.error || variantResult.error) {
    const cause = brandResult.error ?? variantResult.error;
    console.error("Product detail related query failed:", cause?.message);
    return { status: "error", message: "Informasi produk belum dapat dimuat. Silakan coba lagi." };
  }

  const variants = variantResult.data.map((variant) => ({
    ...variant,
    image_url: variant.image_path
      ? supabase.storage.from("product-images").getPublicUrl(variant.image_path).data.publicUrl
      : null,
  }));
  const stockResult = variants.length
    ? await supabase
      .from("stock_levels")
      .select("variant_id, location_code, available_qty")
      .in("variant_id", variants.map((variant) => variant.id))
    : { data: [], error: null };
  if (stockResult.error) {
    console.error("Product detail stock query failed:", stockResult.error.message);
    return { status: "error", message: "Ketersediaan stok belum dapat dimuat. Silakan coba lagi." };
  }

  return {
    status: "ready",
    product: {
      ...productResult.data,
      brand_name: brandResult.data?.name ?? null,
      variants,
    },
    stock: stockResult.data,
  };
}
