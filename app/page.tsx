import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function HomePage() {
  const session = await getSession();
  if (session.role === "coordinator") {
    redirect("/coordinator");
  }
  redirect("/head");
}
