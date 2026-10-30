import { Store } from '../../dist/store.js';
import { LiveConversation } from '../../dist/live-conversation.js';
import { runLiveTerminal } from '../../dist/live-terminal.js';
const store = new Store(':memory:'); let modelCalls = 0;
const harness = new LiveConversation(store, { mode: 'meta', model: 'synthetic-native-interface', generate: async () => { modelCalls++; throw new Error('No model call is permitted in this native fixture'); } }, 5);
const e = { id: 'synthetic-native-memory', projectId: harness.projectId, platform: 'fake', workspaceId: 'local-synthetic', roomId: 'conversation-room', actor: { id: 'synthetic-owner', roleIds: ['reviewer'] }, invocation: 'action', text: 'Synthetic fixture seed.', version: '1', replyTo: null, replyContext: null };
let old;
for (let i = 0; i < 26; i++) { const card = store.propose({ ...e, id: `native-${i}` }, { kind: 'decision', statement: i ? `Use synthetic interface color ${i}.` : 'The synthetic hosting ceiling is forty euros monthly.', sourceIds: [] }, [], Date.now()); const d = store.accept(e, card.buttonId, Date.now()); if (!i) old = `decision:${d.id}`; }
console.log(JSON.stringify({ ready: true, ref: old }));
try { await runLiveTerminal(harness, process.stdin, output => console.log(JSON.stringify({ output }))); }
finally { await harness.close(); store.close(); }
console.log(JSON.stringify({ closed: true, modelCalls }));
