type AppEventMap = {
  "refresh": void;
  "rename": { id: string; title: string };
  "star": string;          // sessionId
  "archive": string;       // sessionId
  "session-mutated": string; // sessionId
};

const PFX = "clau-decode:";

export function emit<K extends keyof AppEventMap>(name: K, detail: AppEventMap[K]): void {
  window.dispatchEvent(new CustomEvent(`${PFX}${name}`, { detail }));
}

export function on<K extends keyof AppEventMap>(
  name: K,
  handler: (detail: AppEventMap[K]) => void,
): () => void {
  const wrapped = (e: Event) => handler((e as CustomEvent<AppEventMap[K]>).detail);
  window.addEventListener(`${PFX}${name}`, wrapped);
  return () => window.removeEventListener(`${PFX}${name}`, wrapped);
}
