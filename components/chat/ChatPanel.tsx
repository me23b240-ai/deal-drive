"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

type Role = "head" | "coordinator";
type Action = { id: string; kind: string; summary: string; state: "pending" | "working" | "done" | "rejected" | "error"; error?: string };
type Msg = { role: "user" | "assistant"; content: string; actions?: Action[]; tools?: string[]; isError?: boolean };

const SUGGESTIONS: Record<Role, string[]> = {
  head: [
    "Which top deals are idle and what is at risk?",
    "Are we on track against the next gate?",
    "What happens to base cash if pre-fest share drops to 65%?",
    "Which bets should I scale, change or stop?",
  ],
  coordinator: ["Which of my companies need an update?", "Am I on pace for my weekly target?", "What should I work on today?"],
};

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={i} className="rounded bg-slate-900 px-1 py-0.5 text-[12px] text-teal-300">{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i} className="text-slate-300">{part.slice(1, -1)}</em>;
    return <span key={i}>{part}</span>;
  });
}

function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split("\n").map((ln, i) => {
        const t = ln.trim();
        if (!t) return <div key={i} className="h-1" />;
        if (/^-{3,}$/.test(t)) return <hr key={i} className="border-slate-700" />;
        const heading = t.match(/^#{1,6}\s+(.*)$/);
        if (heading) return <p key={i} className="pt-1 font-semibold text-white">{inline(heading[1] ?? "")}</p>;
        const bullet = t.match(/^[-*•]\s*(.*)$/);
        if (bullet) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-teal-400">•</span>
              <span>{inline(bullet[1] ?? "")}</span>
            </div>
          );
        }
        return <p key={i}>{inline(t)}</p>;
      })}
    </div>
  );
}

function friendly(message: string): string {
  try {
    const j = JSON.parse(message) as { error?: { message?: string } };
    if (j.error?.message) return j.error.message;
  } catch {
    /* not JSON */
  }
  return message;
}

export function ChatPanel({ role }: { role: Role }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const scroll = () => setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 60);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    scroll();
    try {
      const history = next.filter((m) => !m.isError).map((m) => ({ role: m.role, content: m.content }));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 70_000);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, messages: history }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      const json = (await res.json()) as { ok: boolean; data?: { reply: string; actions: { id: string; kind: string; summary: string }[]; trace: { tool: string }[] }; error?: string };
      if (!json.ok || !json.data) throw new Error(json.error ?? "Something went wrong");
      setMsgs([
        ...next,
        {
          role: "assistant",
          content: json.data.reply,
          tools: [...new Set(json.data.trace.map((t) => t.tool))],
          actions: json.data.actions.map((a) => ({ ...a, state: "pending" as const })),
        },
      ]);
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      setMsgs([...next, { role: "assistant", content: aborted ? "No answer came back in time. Check the terminal running npm run dev for the reason, then try again." : friendly(e instanceof Error ? e.message : "Something went wrong"), isError: true }]);
    } finally {
      setBusy(false);
      scroll();
    }
  }

  async function resolve(mi: number, id: string, decision: "confirm" | "reject") {
    const set = (patch: Partial<Action>) =>
      setMsgs((cur) => cur.map((m, i) => (i !== mi ? m : { ...m, actions: m.actions?.map((a) => (a.id !== id ? a : { ...a, ...patch })) })));
    set({ state: "working" });
    try {
      const res = await fetch(`/api/actions/${id}/${decision}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Failed");
      set({ state: decision === "confirm" ? "done" : "rejected" });
      if (decision === "confirm") router.refresh();
    } catch (e) {
      set({ state: "error", error: e instanceof Error ? e.message : "Failed" });
    }
  }

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm leading-relaxed">
        {msgs.length === 0 && (
          <div className="space-y-3">
            <p className="text-slate-400">Ask about performance, bottlenecks, what-ifs, or what to do next. Answers come from live app data.</p>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS[role].map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-left text-xs text-slate-200 hover:border-teal-500 hover:bg-slate-800">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, mi) => (
          <div key={mi} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className="max-w-[92%] space-y-2">
              <div
                className={
                  m.role === "user"
                    ? "rounded-2xl rounded-br-sm bg-teal-600 px-3 py-2 text-white"
                    : m.isError
                      ? "rounded-2xl rounded-bl-sm border border-red-500/40 bg-red-950/60 px-3 py-2 text-red-200"
                      : "rounded-2xl rounded-bl-sm bg-slate-800 px-3 py-2 text-slate-100"
                }
              >
                <Rich text={m.content} />
              </div>
              {m.tools && m.tools.length > 0 && <div className="px-1 text-[11px] text-slate-500">Checked: {m.tools.join(", ")}</div>}
              {m.actions?.map((a) => (
                <div key={a.id} className="rounded-xl border border-teal-700/60 bg-slate-900 p-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-teal-400">Proposed action</div>
                  <div className="mt-1 text-sm text-slate-100">{a.summary}</div>
                  {(a.state === "pending" || a.state === "working") && (
                    <div className="mt-3 flex gap-2">
                      <button disabled={a.state === "working"} onClick={() => resolve(mi, a.id, "confirm")} className="rounded-md bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50">
                        {a.state === "working" ? "Working..." : "Confirm"}
                      </button>
                      <button disabled={a.state === "working"} onClick={() => resolve(mi, a.id, "reject")} className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                        Reject
                      </button>
                    </div>
                  )}
                  {a.state === "done" && <div className="mt-2 text-xs text-teal-400">Done. The dashboard has been updated.</div>}
                  {a.state === "rejected" && <div className="mt-2 text-xs text-slate-400">Rejected.</div>}
                  {a.state === "error" && <div className="mt-2 text-xs text-red-400">{a.error ?? "Failed"}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
        {busy && <div className="text-xs text-slate-400">Checking the data...</div>}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2 border-t border-slate-800 bg-slate-950 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Ask the copilot..."
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none"
        />
        <button onClick={() => send(input)} disabled={busy || !input.trim()} aria-label="Send" className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500 text-slate-950 hover:bg-teal-400 disabled:opacity-40">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}