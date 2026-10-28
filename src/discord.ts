import { ApplicationCommandType, ChannelType, Client, Events, GatewayIntentBits, MessageFlags, Options, Partials, PermissionFlagsBits, SlashCommandBuilder, type Message, type RepliableInteraction, type TextChannel } from 'discord.js';
import { approver, digest, eligible, type Adapter, type Actor, type Delivery, type ProjectConfig, type Provider, type RequestEvent } from './domain.js';
import { Store } from './store.js';
import { Teammate } from './core.js';
import { audienceAllowed, renderDiscord } from './discord-view.js';

export const discordCommands = [
  new SlashCommandBuilder().setName('teammate').setDescription('Ask the project AI teammate').addStringOption(o => o.setName('request').setDescription('Question or requested decision/brief draft').setRequired(true).setMaxLength(3000)),
  new SlashCommandBuilder().setName('teammate-pause').setDescription('Pause replies in this project'),
  new SlashCommandBuilder().setName('teammate-resume').setDescription('Resume replies (configured approvers only)'),
  new SlashCommandBuilder().setName('teammate-withdraw').setDescription('Withdraw a decision and erase its saved statement').addStringOption(o => o.setName('decision-id').setDescription('Saved decision UUID').setRequired(true)),
  { name: 'Ask AI Teammate', type: ApplicationCommandType.Message },
];
export async function registerCommands(token: string, applicationId: string, guildId: string) {
  const { REST, Routes } = await import('discord.js');
  const rest = new REST({ version: '10', retries: 0, timeout: 15000 }).setToken(token);
  // Create/update only these command names; never replace unrelated application commands.
  for (const command of discordCommands) await rest.post(Routes.applicationGuildCommands(applicationId, guildId), { body: 'toJSON' in command ? command.toJSON() : command });
}
const messageVersion = (m: Pick<Message, 'content' | 'editedTimestamp'>) => digest([m.content, m.editedTimestamp]);
export class DiscordAdapter implements Adapter {
  readonly client: Client; readonly core: Teammate;
  private interactions = new Map<string, RepliableInteraction>();
  constructor(readonly store: Store, provider: Provider, capUsd: number, readonly projectId: string) {
    this.core = new Teammate(store, provider, capUsd);
    this.client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], partials: [Partials.Message], makeCache: Options.cacheWithLimits({ MessageManager: 0 }), allowedMentions: { parse: [], repliedUser: false }, rest: { retries: 0, timeout: 15000 } });
    this.client.on(Events.MessageCreate, m => { void this.onMessage(m).catch(() => this.notice('message_handler_failed')); });
    this.client.on(Events.InteractionCreate, i => { if (i.isRepliable()) void this.onInteraction(i).catch(() => this.notice('interaction_handler_failed')); });
    this.client.on(Events.MessageDelete, m => { if (m.guildId && m.channelId) this.store.invalidateOrigin(this.projectId, m.channelId, m.id); });
    this.client.on(Events.MessageUpdate, (_old, m) => { if (m.guildId && m.channelId) this.store.invalidateOrigin(this.projectId, m.channelId, m.id); });
    this.client.on(Events.Error, () => this.notice('gateway_error'));
  }
  private notice(status: string) { console.error(JSON.stringify({ adapter: 'discord', status, at: new Date().toISOString() })); }
  private async actor(id: string): Promise<Actor> {
    const c = this.store.config(this.projectId); if (!c) throw new Error('Project unavailable');
    const guild = await this.client.guilds.fetch(c.workspaceId); const m = await guild.members.fetch({ user: id, force: true });
    return { id: m.id, roleIds: [...m.roles.cache.keys()] };
  }
  private async room(): Promise<{ channel: TextChannel; config: ProjectConfig }> {
    const config = this.store.config(this.projectId); if (!config || !this.client.user) throw new Error('Project unavailable');
    const guild = await this.client.guilds.fetch({ guild: config.workspaceId, force: true });
    if (guild.memberCount > 100) throw new Error('MVP audience verification supports test guilds up to 100 members');
    await guild.roles.fetch(); const channel = await guild.channels.fetch(config.roomId, { force: true });
    if (!channel || channel.type !== ChannelType.GuildText) throw new Error('Select one guild text room; threads/DMs are unsupported');
    const members = await guild.members.fetch({ time: 10000 });
    if (members.size < guild.memberCount || !audienceAllowed(config, this.client.user.id, [...members.values()].map(m => ({ id: m.id, canView: !!channel.permissionsFor(m)?.has(PermissionFlagsBits.ViewChannel) })))) throw new Error('Room audience exceeds opted-in project');
    const self = await guild.members.fetchMe({ force: true });
    if (!channel.permissionsFor(self)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks])) throw new Error('Bot room permissions missing');
    return { channel, config };
  }
  async canDeliver(e: RequestEvent): Promise<boolean> {
    try {
      const { channel, config } = await this.room();
      if (!eligible(config, e)) return false;
      const member = await this.actor(e.actor.id); if (!config.memberIds.includes(member.id)) return false;
      if (e.sourceMessageId) { const source = await channel.messages.fetch({ message: e.sourceMessageId, force: true }); if (messageVersion(source) !== e.version) return false; }
      if (e.replyContext) { const reply = await channel.messages.fetch({ message: e.replyContext.id, force: true }); if (messageVersion(reply) !== e.replyContext.version) return false; }
      return true;
    } catch { this.notice('scope_or_audience_unverified'); return false; }
  }
  async send(e: RequestEvent, delivery: Delivery) {
    const payload = renderDiscord(delivery); const interaction = this.interactions.get(e.id);
    if (interaction) { await interaction.editReply(payload); return; }
    const channel = await this.client.channels.fetch(e.roomId);
    if (!channel || channel.type !== ChannelType.GuildText) throw new Error('Destination unavailable');
    await channel.send({ ...payload, reply: { messageReference: e.id, failIfNotExists: true } });
  }
  private event(id: string, actor: Actor, text: string, invocation: RequestEvent['invocation'], version: string): RequestEvent {
    const c = this.store.config(this.projectId)!;
    return { id, platform: 'discord', projectId: c.projectId, workspaceId: c.workspaceId, roomId: c.roomId, actor, text, invocation, version, replyTo: null, replyContext: null };
  }
  private async control(e: RequestEvent, action: 'pause' | 'resume'): Promise<string> {
    const c = this.store.config(e.projectId);
    if (!c || !c.memberIds.includes(e.actor.id) || c.roomId !== e.roomId || c.workspaceId !== e.workspaceId || (action === 'resume' && !approver(c, e.actor))) throw new Error('Not authorized');
    this.store.putConfig({ ...c, paused: action === 'pause' }); return action === 'pause' ? 'Paused. Pending inference replies will be suppressed.' : 'Resumed in explicit-invocation mode.';
  }
  private async onMessage(m: Message) {
    const c = this.store.config(this.projectId);
    if (!c || m.guildId !== c.workspaceId || m.channelId !== c.roomId || m.author.bot || m.webhookId || !c.memberIds.includes(m.author.id) || !this.client.user) return;
    const mentioned = m.mentions.users.has(this.client.user.id);
    let reply: Message | null = null;
    if (m.reference?.messageId && m.reference.channelId === c.roomId) { try { reply = await m.fetchReference(); } catch { /* Explicit mentions still work without an unavailable reply target. */ } }
    if (!mentioned && reply?.author.id !== this.client.user.id) return;
    const text = m.content.replace(new RegExp(`<@!?${this.client.user.id}>`, 'g'), '').trim();
    const e = this.event(m.id, await this.actor(m.author.id), text, mentioned ? 'mention' : 'reply', messageVersion(m)); e.sourceMessageId = m.id;
    if (reply) { e.replyTo = reply.id; e.replyContext = { id: reply.id, text: reply.content.slice(0, 1600), version: messageVersion(reply) }; }
    if (/^(?:stop|pause|stopp|ruhe)[.!\s]*$/i.test(text)) { await this.control(e, 'pause'); return; }
    await this.core.handle(e, this);
  }
  private async onInteraction(i: RepliableInteraction) {
    const c = this.store.config(this.projectId);
    if (!c || i.guildId !== c.workspaceId || i.channelId !== c.roomId || !c.memberIds.includes(i.user.id)) { await i.reply({ content: 'This interaction is outside the configured project.', flags: MessageFlags.Ephemeral }); return; }
    // Acknowledge within Discord's initial deadline, before member/audience/model requests.
    await i.deferReply(i.isButton() || (i.isChatInputCommand() && i.commandName !== 'teammate') ? { flags: MessageFlags.Ephemeral } : {});
    this.interactions.set(i.id, i);
    let attemptedDelivery = false;
    const respond = async (content: string) => { attemptedDelivery = true; await i.editReply({ content, allowedMentions: { parse: [] } }); };
    try {
      const e = this.event(i.id, await this.actor(i.user.id), '', 'action', 'immutable-interaction');
      if (i.isChatInputCommand() && ['teammate-pause', 'teammate-resume'].includes(i.commandName)) {
        await respond(await this.control(e, i.commandName === 'teammate-pause' ? 'pause' : 'resume')); return;
      }
      if (!await this.canDeliver(e)) { await respond('Project paused or current room/member access cannot be verified.'); return; }
      if (i.isButton()) {
        const p = this.store.proposal(i.customId.split(':')[1] ?? '');
        if (!p) throw new Error('Proposal unavailable; request a new card');
        if (p.origin.messageId) {
          const { channel } = await this.room(); const source = await channel.messages.fetch({ message: p.origin.messageId, force: true });
          if (messageVersion(source) !== p.origin.version) { this.store.invalidateOrigin(c.projectId, c.roomId, source.id); throw new Error('Origin message changed; request a new card'); }
        }
        // Fresh role membership is resolved again immediately before the local transaction.
        e.actor = await this.actor(i.user.id);
        if (i.customId.startsWith('cancel:')) {
          if (i.customId.replace(/^cancel:/, 'accept:') !== this.store.card(p).buttonId) throw new Error('Proposal changed; request a new card');
          this.store.cancel(e, p.id); await respond('Proposal cancelled.'); return;
        }
        if (!i.customId.startsWith('accept:')) throw new Error('Unknown action');
        const saved = this.store.accept(e, i.customId, Date.now());
        await respond(`${saved.kind === 'decision' ? 'Decision approved' : 'Brief saved, not executed'}: ${saved.id}. Approved by ${saved.approverId}. Repeated clicks return the same saved record.`); return;
      }
      if (i.isChatInputCommand()) {
        if (i.commandName === 'teammate-withdraw') { this.store.withdraw(e, i.options.getString('decision-id', true)); await respond('Decision withdrawn; statement removed. Propose a fresh correction for approval.'); return; }
        if (i.commandName !== 'teammate') throw new Error('Unknown command'); e.text = i.options.getString('request', true);
      } else if (i.isMessageContextMenuCommand()) {
        const m = i.targetMessage; if (m.channelId !== c.roomId) throw new Error('Target outside project');
        e.text = `Respond to this selected message: ${m.content.slice(0, 3000)}`; e.version = messageVersion(m); e.sourceMessageId = m.id; e.replyTo = m.id;
      } else return;
      await this.core.handle(e, this);
      const trace = this.store.traces().findLast(t => t.eventKey === this.store.eventKey(e));
      if (!trace || trace.result === 'suppressed') await respond('Reply suppressed because the project or source changed, paused, or became inaccessible. Ask again after it is resolved.');
      // Uncertain external sends are never automatically retried or edited here.
    } catch (error) {
      // Only local, allowlisted errors are displayed; raw SDK/provider errors may contain credentials/content.
      const text = error instanceof Error && /^(Not authorized|Proposal |Configuration |A proposal source|Record withdrawn|Decision unavailable|Origin message|Unknown action)/.test(error.message) ? error.message : 'Request could not be completed. No external send is retried automatically; check local status.';
      if (!attemptedDelivery) { try { await respond(text); } catch { this.notice('delivery_uncertain'); } }
      else this.notice('delivery_uncertain');
    } finally { this.interactions.delete(i.id); }
  }
  async start(token: string) { await this.client.login(token); }
  async stop() { await this.client.destroy(); }
}
