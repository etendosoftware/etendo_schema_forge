const JSON_RPC_VERSION = '2.0';

function parseServerEvents(text) {
  const messages = [];
  for (const event of text.split(/\n\n+/)) {
    const data = event
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trim())
      .join('\n');
    if (data) messages.push(JSON.parse(data));
  }
  return messages;
}

export class StreamableHTTPTransport {
  constructor({ url, headers = {}, timeoutMs = 10_000 }) {
    this.url = url;
    this.headers = headers;
    this.timeoutMs = timeoutMs;
    this.sessionId = undefined;
    this.abortController = new AbortController();
  }

  async start() {}

  async send(message) {
    const timeout = setTimeout(() => this.abortController.abort(), this.timeoutMs);
    try {
      const headers = new Headers({
        ...this.headers,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
      });
      const response = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
        signal: this.abortController.signal,
      });
      const sessionId = response.headers.get('Mcp-Session-Id');
      if (sessionId) this.sessionId = sessionId;
      if (!response.ok) {
        throw new Error(`MCP Streamable HTTP error ${response.status}: ${await response.text()}`);
      }
      if (response.status === 202 || !response.body) return;

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();
      const messages = contentType.includes('text/event-stream')
        ? parseServerEvents(text)
        : text ? [JSON.parse(text)] : [];
      for (const incoming of messages) {
        if (incoming?.jsonrpc === JSON_RPC_VERSION) this.onmessage?.(incoming);
      }
    } catch (error) {
      this.onerror?.(error);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async close() {
    this.abortController.abort();
    this.onclose?.();
  }
}
