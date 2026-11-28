import type { ReactNode } from "react";
import { ChatWidget } from "@/components/chat/ChatWidget";

export default function CoordinatorLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ChatWidget role="coordinator" />
    </>
  );
}