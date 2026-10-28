import { createHash } from 'node:crypto';
import { z } from 'zod';

export const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id = z.string().min(1).max(200);
export const ProjectConfigSchema = z.object({
  projectId: id, platform: z.enum(['discord', 'fake', 'fake-second']), workspaceId: id, roomId: id,
  memberIds: z.array(id).min(1).max(50), approverIds: z.array(id).min(1).max(10),
  approverRoleIds: z.array(id).max(10), paused: z.boolean(), selectedSnapshot: id.nullable(), revision: z.number().int().positive(),
}).strict();
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type Actor = { id: string; roleIds: string[] };
export type RequestEvent = {
  id: string; platform: ProjectConfig['platform']; workspaceId: string; projectId: string; roomId: string;
  actor: Actor; invocation: 'mention' | 'reply' | 'action' | 'ambient' | 'bot'; text: string; version: string;
  replyTo: string | null; replyContext: { id: string; text: string; version: string } | null;
  sourceMessageId?: string;
};
export type ContextItem = { id: string; kind: string; label: string; text: string; identity: string };
export type ModelInput = { event: Pick<RequestEvent, 'id' | 'version' | 'actor' | 'replyTo'>; question: string; reply: RequestEvent['replyContext']; context: ContextItem[] };
export const DecisionBodySchema = z.object({ kind: z.literal('decision'), statement: z.string().min(3).max(800), sourceIds: z.array(id).max(12) }).strict();
export const BriefBodySchema = z.object({ kind: z.literal('brief'), objective: z.string().min(3).max(300), decisionIds: z.array(id).max(6), sourceIds: z.array(id).max(12), hypothesis: z.string().min(1).max(400), nextCheck: z.string().min(3).max(500), exclusions: z.array(z.string().min(1).max(200)).min(1).max(4) }).strict();
export const ProposalBodySchema = z.discriminatedUnion('kind', [DecisionBodySchema, BriefBodySchema]);
export type ProposalBody = z.infer<typeof ProposalBodySchema>;
export type Proposal = {
  id: string; projectId: string; platform: ProjectConfig['platform']; workspaceId: string; roomId: string;
  proposerId: string; approverIds: string[]; origin: { id: string; version: string; messageId: string | null };
  body: ProposalBody; version: number; expiresAt: number; createdAt: number; state: 'awaiting_approval' | 'accepted' | 'cancelled';
  configIdentity: string; targetSnapshot: string | null; sourceBindings: Record<string, string>;
};
type SavedMetadata = { id: string; projectId: string; proposerId: string; approverId: string; origin: Proposal['origin']; version: number; savedAt: number; snapshot: string | null; sourceBindings: Record<string, string> };
export type SavedDecision = z.infer<typeof DecisionBodySchema> & SavedMetadata & { status: 'approved' };
export type SavedBrief = z.infer<typeof BriefBodySchema> & SavedMetadata & { status: 'saved' };
export type SavedRecord = SavedDecision | SavedBrief;
export type ProposalCard = { proposal: Proposal; buttonId: string };
export const ReplySchema = z.object({ answer: z.string().min(1).max(1100), citations: z.array(id).max(12), proposal: ProposalBodySchema.optional() }).strict();
export type Reply = z.infer<typeof ReplySchema>;
export type Usage = { inputTokens: number; outputTokens: number };
export type ProviderResult = { output: unknown; usage: Usage | null; requestId: string | null };
export interface Provider { readonly mode: 'mock' | 'meta'; readonly model: string; generate(input: ModelInput): Promise<ProviderResult> }
export type Delivery = { text: string; proposal?: ProposalCard };
export interface Adapter {
  canDeliver(event: RequestEvent): Promise<boolean>;
  send(event: RequestEvent, delivery: Delivery): Promise<void>;
}
export function eligible(c: ProjectConfig | undefined, e: RequestEvent): c is ProjectConfig {
  return !!c && !c.paused && c.platform === e.platform && c.workspaceId === e.workspaceId && c.roomId === e.roomId &&
    c.projectId === e.projectId && c.memberIds.includes(e.actor.id) && ['mention', 'reply', 'action'].includes(e.invocation);
}
export function approver(c: ProjectConfig, actor: Actor): boolean {
  return c.memberIds.includes(actor.id) && c.approverIds.includes(actor.id) &&
    (c.approverRoleIds.length === 0 || c.approverRoleIds.some(r => actor.roleIds.includes(r)));
}
