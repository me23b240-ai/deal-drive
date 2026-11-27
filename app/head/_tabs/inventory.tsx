import { ErrorBox } from "@/components/head/KpiCards";
import { InventoryTable } from "@/components/head/InventoryTable";
import { errorMessage } from "@/lib/db/errors";
import { getInventory, type InventoryData } from "@/lib/db/queries/head-b-inventory";
import type { Ctx } from "@/lib/types";

export default async function InventoryTab({ ctx }: { ctx: Ctx }) {
  let data: InventoryData;
  try {
    data = await getInventory(ctx);
  } catch (error) {
    return <ErrorBox message={errorMessage(error)} />;
  }
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Inventory</h1>
      <InventoryTable data={data} />
    </div>
  );
}