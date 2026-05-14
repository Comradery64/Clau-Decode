import { useState, useEffect } from "react";

export function useCycle(values: readonly string[], intervalMs: number): string {
  const [i, setI] = useState(() => Math.floor(Math.random() * values.length));
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % values.length), intervalMs);
    return () => clearInterval(id);
  }, [values.length, intervalMs]);
  return values[i];
}
