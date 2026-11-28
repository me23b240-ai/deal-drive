"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, Minus } from "lucide-react";
import { ChatPanel } from "@/components/chat/ChatPanel";

/** Floating launcher at the bottom right. The role comes from the page address, so a wrong prop in a layout cannot give the wrong tools. */
export function ChatWidget({ role: _role }: { role?: "head" | "coordinator" }) {
  const pathname = usePathname();
  const role: "head" | "coordinator" = pathname?.startsWith("/coordinator") ? "coordinator" : "head";
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        className={`fixed bottom-24 right-6 z-[9999] w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black/60 ${open ? "flex" : "hidden"}`}
        style={{ height: 620, maxHeight: "calc(100vh - 8rem)" }}
      >
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-white">Growth copilot</div>
            <div className="text-[11px] text-slate-400">Answers from live app data</div>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Minimise" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <Minus className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <ChatPanel role={role} />
        </div>
      </div>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Minimise copilot" : "Open copilot"}
        className="fixed bottom-6 right-6 z-[9999] flex items-center gap-2 rounded-full bg-teal-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-xl shadow-black/50 ring-2 ring-teal-300/40 hover:bg-teal-400"
      >
        <MessageCircle className="h-5 w-5" />
        {open ? "Close" : "Ask copilot"}
      </button>
    </>
  );
}