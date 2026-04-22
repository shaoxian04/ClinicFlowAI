export type AgentSseEvent =
  | { type: 'turn.start'; visit_id: string; agent_type: string; turn_index: number }
  | { type: 'reasoning.delta'; text: string }
  | { type: 'tool.call'; name: string; args: Record<string, unknown> }
  | { type: 'tool.result'; name: string; result: Record<string, unknown> }
  | { type: 'message.delta'; text: string }
  | { type: 'clarification.needed'; field: string; prompt: string; context: string }
  | { type: 'turn.complete'; turn_index: number }
  | { type: 'agent.error'; message: string };

export async function* parseAgentSse(
  response: Response,
): AsyncGenerator<AgentSseEvent, void, unknown> {
  if (!response.body) throw new Error('no body on SSE response');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      let eventName = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) eventName = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        yield { type: eventName as AgentSseEvent['type'], ...parsed } as AgentSseEvent;
      } catch {
        // Ignore malformed events; keep consuming.
      }
    }
  }
}
