import { createContext } from "react";

type ScrollRef = { readonly current: HTMLElement | null };

export const MessageListContainerCtx = createContext<ScrollRef | null>(null);
