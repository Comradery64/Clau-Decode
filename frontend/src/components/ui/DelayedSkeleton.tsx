import { useEffect, useState } from "react";
import { LoadingAnimation } from "./LoadingAnimation";

interface DelayedSkeletonProps {
  /** Delay in ms before the skeleton appears. Defaults to 200 ms. */
  delay?: number;
}

/**
 * Render nothing for the first `delay` ms, then show a small inline loading
 * indicator. Used as a Suspense `fallback` so that fast lazy-chunk loads (the
 * common case once chunks are warm) don't flash a skeleton, while slow loads
 * still surface a visible hint that something is happening.
 */
export function DelayedSkeleton({ delay = 200 }: DelayedSkeletonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(id);
  }, [delay]);

  if (!visible) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <LoadingAnimation width="20px" label="Loading" />
    </div>
  );
}
