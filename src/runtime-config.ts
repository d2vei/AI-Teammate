import { z } from 'zod';
import type { ProjectConfig } from './domain.js';
const snowflake = z.string().regex(/^\d{17,20}$/);
const list = (value: string | undefined): string[] => (value ?? '').split(',').map(s => s.trim()).filter(Boolean);
export function projectFromEnv(env: NodeJS.ProcessEnv): ProjectConfig {
  const memberIds = z.array(snowflake).min(1).parse(list(env.DISCORD_MEMBER_IDS));
  const approverIds = z.array(snowflake).min(1).parse(list(env.DISCORD_APPROVER_IDS));
  if (approverIds.some(id => !memberIds.includes(id))) throw new Error('Approvers must be listed members');
  return { projectId: env.APP_PROJECT_ID || 'demo', platform: 'discord', workspaceId: snowflake.parse(env.DISCORD_GUILD_ID), roomId: snowflake.parse(env.DISCORD_CHANNEL_ID), memberIds, approverIds, approverRoleIds: z.array(snowflake).parse(list(env.DISCORD_APPROVER_ROLE_IDS)), paused: false, selectedSnapshot: null, revision: 1 };
}
export function spendCap(env: NodeJS.ProcessEnv): number {
  const cap = Number(env.APP_MAX_SPEND_USD || '0'); const allowance = Number(env.APP_AUTHORIZED_ALLOWANCE_USD || '0');
  if (![cap, allowance].every(n => Number.isFinite(n) && n >= 0)) throw new Error('Invalid budget configuration');
  return Math.min(cap, allowance, 120);
}
