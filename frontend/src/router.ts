import { useEffect, useState } from "react";

export type AppRoute = "/" | "/analytics";

function parseHash(): AppRoute {
  const h = window.location.hash.replace(/^#/, "") || "/";
  if (h === "/analytics") return "/analytics";
  return "/";
}

export function navigateTo(route: AppRoute): void {
  window.location.hash = route;
}

export function useRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(parseHash);

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return route;
}
