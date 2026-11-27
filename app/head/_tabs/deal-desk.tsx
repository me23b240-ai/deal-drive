import { Card, ErrorBox } from "@/components/head/KpiCards";
import { DealDesk } from "@/components/head/DealDesk";
import { PaymentsPanel } from "@/components/head/PaymentsPanel";
import { errorMessage } from "@/lib/db/errors";
import { getDealBoard, type DealBoard } from "@/lib/db/queries/head-b-deals";
import { getPaymentsData, type PaymentsData } from "@/lib/db/queries/head-b-payments";
import type { Ctx } from "@/lib/types";

export default async function DealDeskTab({ ctx }: { ctx: Ctx }) {
  let data: [DealBoard, PaymentsData];
  try {
    data = await Promise.all([getDealBoard(ctx), getPaymentsData(ctx)]);
  } catch (error) {
    return <ErrorBox message={errorMessage(error)} />;
  }
  const [board, payments] = data;
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Deal desk</h1>
      <Card title="Open deals">
        <DealDesk board={board} locked={ctx.isLocked} />
      </Card>
      <Card title="Payments (cash portion only, marked by the head)">
        <PaymentsPanel data={payments} locked={ctx.isLocked} />
      </Card>
    </div>
  );
}