"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BTN } from "./styles";

type ToastKind = "error" | "success";
type ToastItem = { id: number; kind: ToastKind; text: string };
const ToastCtx = createContext<{ push: (kind: ToastKind, text: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const push = useCallback((kind: ToastKind, text: string) => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-3), { id, kind, text }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), kind === "error" ? 8000 : 4000);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2 rounded-xl border bg-card px-3 py-2 text-sm ${t.kind === "error" ? "border-danger/50" : "border-success/50"}`}
          >
            <span
              aria-hidden
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.kind === "error" ? "bg-danger" : "bg-success"}`}
            />
            <span>
              <span className="font-medium">{t.kind === "error" ? "Error: " : "Done: "}</span>
              {t.text}
            </span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

export function Modal(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
  }, [props.open]);

  const shape = props.side
    ? "m-0 ml-auto h-dvh max-h-dvh w-[min(100vw,520px)] rounded-none border-y-0 border-r-0"
    : "m-auto max-h-[90dvh] w-[min(92vw,480px)] rounded-[16px]";

  return (
    <dialog
      ref={ref}
      aria-label={props.title}
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) props.onClose();
      }}
      className={`fixed inset-0 border border-border bg-card p-0 text-foreground backdrop:bg-black/60 open:flex open:flex-col ${shape}`}
    >
      {props.open ? (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">{props.title}</h2>
            <button type="button" onClick={props.onClose} className={BTN}>
              Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">{props.children}</div>
        </>
      ) : null}
    </dialog>
  );
}