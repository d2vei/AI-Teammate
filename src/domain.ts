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
};
export type ContextItem = { id: string; kind: string; label: string; text: string; identity: string };
export type ModelInput = { event: Pick<RequestEvent, 'id' | 'version' | 'actor' | 'replyTo'>; question: string; reply: RequestEvent['replyContext']; context: ContextItem[] };
export const ReplySchema = z.object({ answer: z.string().min(1).max(1100), citations: z.array(id).max(12) }).strict();
export type Reply = z.infer<typeof ReplySchema>;
export type Usage = { inputTokens: number; outputTokens: number };
export type ProviderResult = { output: unknown; usage: Usage | null; requestId: string | null };
export interface Provider { readonly mode: 'mock' | 'meta'; readonly model: string; generate(input: ModelInput): Promise<ProviderResult> }
export type Delivery = { text: string };
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
