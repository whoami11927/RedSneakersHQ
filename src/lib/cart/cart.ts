export type CartLine = {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  unitPrice: number;
  imageUrl: string | null;
  quantity: number;
};

export const CART_STORAGE_KEY = "red-sneakers-cart";

export function parseCart(value: string | null): CartLine[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartLine);
  } catch {
    return [];
  }
}

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  return typeof line.variantId === "string"
    && typeof line.productId === "string"
    && typeof line.productName === "string"
    && typeof line.variantLabel === "string"
    && typeof line.sku === "string"
    && typeof line.unitPrice === "number"
    && Number.isFinite(line.unitPrice)
    && (line.imageUrl === null || typeof line.imageUrl === "string")
    && typeof line.quantity === "number"
    && Number.isInteger(line.quantity)
    && line.quantity >= 1
    && line.quantity <= 10000;
}
