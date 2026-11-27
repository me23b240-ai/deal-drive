import { Header } from "@/components/shell/Header";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CoordinatorPage() {
  const session = await getSession();
  return (
    <div className="min-h-full">
      <Header role="coordinator" eventId={session.eventId} memberId={session.memberId} />
      <main className="grid gap-4 p-6 lg:grid-cols-[minmax(0,4fr)_minmax(280px,1fr)]">
        <section className="rounded-[16px] border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">Coordinator CRM</h1>
          <p className="mt-2 text-sm text-muted">Company table, deal desk, drafts, and import land in later phases.</p>
        </section>
        <aside className="rounded-[16px] border border-border bg-card p-6">
          <h2 className="text-sm font-semibold">To-do and assistant</h2>
          <p className="mt-2 text-sm text-muted">Needs-update, tasks, and chat land in later phases.</p>
        </aside>
      </main>
    </div>
  );
}
