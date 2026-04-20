import ChatInterface from '@/components/chat/ChatInterface';

export default function ChatPage({
  searchParams,
}: {
  searchParams: { q?: string; sessionId?: string };
}) {
  return (
    <ChatInterface
      initialQuery={searchParams.q}
      initialSessionId={searchParams.sessionId}
    />
  );
}
