import { ChatPanel } from "@/components/chat/ChatPanel";

export default function Page() {
  return (
    <div className="mx-auto h-[80vh] max-w-3xl p-4">
      <ChatPanel role="head" />
    </div>
  );
}