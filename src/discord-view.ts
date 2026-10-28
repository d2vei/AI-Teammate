import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown } from 'discord.js';
import type { Delivery, ProjectConfig } from './domain.js';
export function audienceAllowed(config: ProjectConfig, botId: string, members: { id: string; canView: boolean }[]): boolean {
  return members.every(m => !m.canView || m.id === botId || config.memberIds.includes(m.id));
}
const safe = (text: string) => escapeMarkdown(text).replace(/@/g, '@\u200b');
export function renderDiscord(delivery: Delivery) {
  const base = { content: delivery.text.length <= 1950 ? delivery.text : 'Answer exceeds the safe Discord message size. Narrow the request; no answer was posted.', allowedMentions: { parse: [] as never[], repliedUser: false }, embeds: [] as EmbedBuilder[], components: [] as ActionRowBuilder<ButtonBuilder>[] };
  if (!delivery.proposal) return base;
  const p = delivery.proposal.proposal; const body = p.body;
  const description = body.kind === 'decision' ? `${safe(body.statement)}\n\nSources: ${body.sourceIds.map(safe).join(', ') || 'conversation proposal; no attached evidence'}` : [
    `Objective: ${safe(body.objective)}`, `Hypothesis: ${safe(body.hypothesis)}`, `Next check: ${safe(body.nextCheck)}`,
    `Decisions: ${body.decisionIds.map(safe).join(', ') || 'none'}`, `Evidence: ${body.sourceIds.map(safe).join(', ') || 'none'}`,
    `Exclusions: ${body.exclusions.map(safe).join('; ')}`,
  ].join('\n\n');
  if (description.length > 4000) throw new Error('Proposal card exceeds display bounds; narrow it');
  base.embeds = [new EmbedBuilder().setTitle(body.kind === 'decision' ? 'Proposed decision - awaiting approval' : 'Proposed work brief - saves only').setDescription(description).setFooter({ text: `v${p.version} · ${p.id} · proposed by ${p.proposerId} · snapshot ${p.targetSnapshot ?? 'none'} · expires ${new Date(p.expiresAt).toISOString()}` })];
  base.components = [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(delivery.proposal.buttonId).setLabel(body.kind === 'decision' ? 'Approve decision' : 'Confirm and save brief').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(delivery.proposal.buttonId.replace(/^accept:/, 'cancel:')).setLabel('Cancel proposal').setStyle(ButtonStyle.Secondary),
  )];
  return base;
}
