"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CART_STORAGE_KEY, parseCart, type CartLine } from "@/lib/cart/cart";

type CartContextValue = {
  lines: CartLine[];
  ready: boolean;
  addLine: (line: Omit<CartLine, "quantity">, maxAvailable: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  removeLine: (variantId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setLines(parseCart(window.localStorage.getItem(CART_STORAGE_KEY)));
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  }, [lines, ready]);

  const addLine = useCallback((line: Omit<CartLine, "quantity">, maxAvailable: number) => {
    setLines((current) => {
      const existing = current.find((item) => item.variantId === line.variantId);
      if (existing) {
        return current.map((item) => item.variantId === line.variantId
          ? { ...item, quantity: Math.min(maxAvailable, item.quantity + 1) }
          : item);
      }
      return [...current, { ...line, quantity: 1 }];
    });
  }, []);
  const setQuantity = useCallback((variantId: string, quantity: number) => {
    setLines((current) => current.flatMap((line) => {
      if (line.variantId !== variantId) return [line];
      if (!Number.isInteger(quantity) || quantity < 1) return [];
      return [{ ...line, quantity: Math.min(quantity, 10000) }];
    }));
  }, []);
  const removeLine = useCallback((variantId: string) => {
    setLines((current) => current.filter((line) => line.variantId !== variantId));
  }, []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(() => ({ lines, ready, addLine, setQuantity, removeLine, clear }), [
    lines, ready, addLine, setQuantity, removeLine, clear,
  ]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("useCart must be used within CartProvider");
  return cart;
}
