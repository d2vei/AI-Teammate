import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import type { LiveConversation } from './live-conversation.js';

export async function runLiveTerminal(harness: LiveConversation, input: Readable, write: (text: string) => void, signals: NodeJS.EventEmitter | null = null) {
  const reader = createInterface({ input, crlfDelay: Infinity }); let pending: Promise<void> | null = null; let closing = false;
  const output = async (line: string) => { const result = await harness.line(line); if (!closing) write(`[${result.kind}] ${result.text}`); };
  const stop = () => { if (closing) return; closing = true; void harness.line('/pause'); reader.close(); };
  signals?.on('SIGINT', stop); signals?.on('SIGTERM', stop);
  try {
    await new Promise<void>((resolveClosed, reject) => {
      reader.on('line', line => {
        if (closing) return;
        if (line.trim() === '/quit') { stop(); return; }
        // Pause/status must be handled while inference is pending. Other
        // input is refused instead of queued for later paid dispatch.
        if (pending) {
          if (harness.immediateControl(line)) void output(line).catch(reject);
          else write('[status] A request is active. Use /pause, /status, /watch stop, /watch auto off, /media remove ORIGIN or /quit; other input was not queued.');
          return;
        }
        pending = output(line).catch(reject).finally(() => { pending = null; });
      });
      reader.once('close', () => { stop(); resolveClosed(); }); reader.once('error', reject);
    });
    await pending;
  } finally {
    stop(); await pending; signals?.off('SIGINT', stop); signals?.off('SIGTERM', stop);
    // This runner owns its input. readline.close() pauses a native stdin pipe
    // but leaves the pipe handle open; close it after the paid work drains.
    input.destroy();
  }
}
