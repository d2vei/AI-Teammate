import { randomUUID } from 'node:crypto';
export function modelInput(caseRecord, context) {
  // Deliberately project only the actual input, never case ID, graders, targets or scores.
  return { event: { id: randomUUID(), version: 'synthetic-eval-v1', actor: { id: 'synthetic-evaluator', roleIds: ['reviewer'] }, replyTo: caseRecord.input.reply ? 'synthetic-reply' : null }, question: caseRecord.input.question, reply: caseRecord.input.reply ? { id: 'synthetic-reply', text: caseRecord.input.reply, version: 'synthetic-v1' } : null, context: structuredClone(context) };
}
export function quietGate(caseRecord) { return caseRecord.input.invocation === 'ambient' ? 'SILENT_BY_CONFIGURATION' : 'DIRECT_REQUIRES_MODEL'; }
