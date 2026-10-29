import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { z } from 'zod';
export const JudgeSchema = z.object({ correctness: z.enum(['correct', 'incorrect', 'uncertain']), helpfulness: z.enum(['helpful', 'unhelpful', 'uncertain']), reason: z.string().min(3).max(400), evidenceIds: z.array(z.string().min(1).max(200)).max(12) }).strict();
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function judgeInput(c, observed) {
  assert.equal(observed.state, 'OBSERVED'); assert.ok(Array.isArray(c.turns) && c.turns.length > 0 && c.turns.length <= 12);
  assert.equal(observed.decisions.length, c.turns.length);
  const context = c.turns.map(t => {
    assert.ok(/^[\w-]{1,80}$/.test(t.id)); assert.ok(['owner', 'peer'].includes(t.actorId)); assert.equal(typeof t.text, 'string'); assert.ok(t.text.length > 0 && t.text.length <= 2000);
    return { id: `message:${t.id}`, kind: 'conversation_message', label: `Synthetic participant ${t.actorId}`, text: t.text, identity: digest([t.id, t.actorId, t.text]) };
  });
  if (c.approvedDecision !== null && c.approvedDecision !== undefined) {
    assert.equal(typeof c.approvedDecision, 'string'); assert.ok(c.approvedDecision.length <= 300);
    context.unshift({ id: 'seeded-approved-rule', kind: 'approved_decision', label: 'Explicitly seeded synthetic rule; not live human approval', text: c.approvedDecision, identity: digest(c.approvedDecision) });
  }
  const action = observed.decisions.at(-1).action; assert.ok(['SILENT', 'HAND_RAISE', 'POST'].includes(action));
  const generated = observed.privateInvitedShadowResult?.action === 'POST' ? observed.privateInvitedShadowResult.text : null;
  assert.ok(generated === null || (typeof generated === 'string' && generated.length <= 1000));
  const behavior = { finalAction: action, invitedShadowText: generated, externalDelivery: false };
  const input = { event: { id: 'synthetic-evaluation', version: 'judge-v1', actor: { id: 'synthetic-evaluator', roleIds: [] }, replyTo: null }, question: `Judge the final observed behavior after the supplied exchange: ${JSON.stringify(behavior)}`, reply: null, context };
  assert.ok(Buffer.byteLength(JSON.stringify(input)) <= 24000); return input;
}
