"use client";

import { useState } from "react";
import { fmtDay } from "./format";
import { BTN, BTN_PRIMARY, INPUT } from "./styles";
import type { TaskRow } from "./types";
import { useMutation } from "./use-mutation";

export function TasksList({ tasks, today, locked }: { tasks: TaskRow[]; today: string; locked: boolean }) {
  const { run, busy } = useMutation();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    if (!title.trim()) return setError("A task needs a title.");
    const res = await run("/api/crm/tasks", "POST", { title: title.trim(), dueOn: due || null }, "Task added", { silentError: true });
    if (res.ok) {
      setTitle("");
      setDue("");
    } else setError(res.error);
  }

  return (
    <section aria-label="Tasks">
      <h3 className="mb-2 text-sm font-semibold">Tasks</h3>
      {tasks.length === 0 ? <p className="text-sm text-muted">No open tasks.</p> : null}
      <ul className="flex flex-col gap-2">
        {tasks.map((t) => {
          const overdue = t.dueOn !== null && t.dueOn < today;
          return (
            <li key={t.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                aria-label={`Mark done: ${t.title}`}
                disabled={locked || busy}
                onChange={() => run("/api/crm/tasks", "PATCH", { id: t.id, done: true }, "Task done")}
              />
              <span>
                {t.title}
                <span className={`block text-xs ${overdue ? "text-danger" : "text-muted"}`}>
                  {t.company ? `${t.company} | ` : ""}
                  {t.dueOn ? `${overdue ? "Overdue, " : "Due "}${fmtDay(t.dueOn)}` : "No due date"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {!locked ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          <input className={INPUT} placeholder="Add a task" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New task title" onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
          <div className="flex gap-2">
            <input type="date" className={INPUT} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={add}>
              Add
            </button>
          </div>
          {error ? (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}