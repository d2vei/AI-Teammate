import { Store } from '../../dist/store.js';
import { LiveConversation } from '../../dist/live-conversation.js';
import { runLiveTerminal } from '../../dist/live-terminal.js';
import { MetaProvider } from '../../dist/meta.js';
const store = new Store(':memory:');
const http = async () => { throw new Error('No provider call allowed in this lifecycle fixture'); };
try {
  const harness = new LiveConversation(store, new MetaProvider('SYNTHETIC_NOT_REAL', http), 5);
  console.log('HTTP_MOCK_TERMINAL_READY');
  await runLiveTerminal(harness, process.stdin, line => console.log(line), process);
  console.log('HTTP_MOCK_TERMINAL_CLOSED');
} finally { store.close(); }
