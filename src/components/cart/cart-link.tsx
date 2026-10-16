"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart/cart-provider";

export function CartLink() {
  const { lines, ready } = useCart();
  const [mounted, setMounted] = useState(false);
  const count = lines.reduce((total, line) => total + line.quantity, 0);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const showCount = mounted && ready;
  return (
    <Link
      href="/checkout"
      className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-semibold hover:text-primary"
      aria-label={showCount ? `Keranjang, ${count} item` : "Keranjang"}
    >
      Keranjang
      {showCount && <span className="font-mono text-xs text-primary">{count}</span>}
    </Link>
  );
}
