import { Header } from "@/components/shell/Header";
import { getSession } from "@/lib/session";
import { OverviewTab } from "./_tabs/overview";

export const dynamic = "force-dynamic";

export default async function HeadPage() {
  const session = await getSession();
  return (
    <div className="min-h-full">
      <Header role="head" eventId={session.eventId} memberId={session.memberId} />
      <main className="p-6">
        <OverviewTab />
      </main>
    </div>
  );
}
