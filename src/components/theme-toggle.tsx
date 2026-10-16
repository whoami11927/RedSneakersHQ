"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const subscribeToMount = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeToMount, getClientSnapshot, getServerSnapshot);

  if (!mounted || !resolvedTheme) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Memuat pilihan tema"
        disabled
      >
        Tema
      </Button>
    );
  }

  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={`Ganti ke tema ${nextTheme === "dark" ? "gelap" : "terang"}`}
      onClick={() => setTheme(nextTheme)}
    >
      {resolvedTheme === "dark" ? "Gelap" : "Terang"}
    </Button>
  );
}
