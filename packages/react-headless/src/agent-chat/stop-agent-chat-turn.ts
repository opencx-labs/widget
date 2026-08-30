/**
 * Stop a live streamed turn. With resumable streams, a client abort is only a
 * disconnect, so the server generation must also be cancelled.
 */
export async function stopAgentChatTurn({
  api,
  sessionId,
  chatStop,
}: {
  api: { stopStream: (sessionId: string) => Promise<void> };
  sessionId: string | null;
  chatStop: () => void | Promise<void>;
}): Promise<void> {
  try {
    await chatStop();
  } finally {
    if (sessionId) await api.stopStream(sessionId);
  }
}
