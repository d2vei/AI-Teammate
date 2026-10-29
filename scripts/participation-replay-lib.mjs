// These projections are also the future model boundary. Case IDs, labels, mock
// signals and grading instructions never enter ParticipationInput.
export function replayEvent(turn) {
  return { id: turn.id, platform: 'fake', workspaceId: 'synthetic-workspace', projectId: 'synthetic-project', roomId: 'synthetic-room', actor: { id: turn.actorId, roleIds: turn.actorId === 'owner' ? ['reviewer'] : [] }, invocation: 'ambient', text: turn.text, version: '1', replyTo: null, replyContext: null };
}
export function recentMessage(turn) { const e = replayEvent(turn); return { id: e.id, platform: e.platform, workspaceId: e.workspaceId, projectId: e.projectId, roomId: e.roomId, version: e.version, text: e.text, actorId: e.actor.id, at: turn.at }; }
export class ScriptedParticipationReasoner {
  mode = 'mock'; model = 'scripted-signals-v1-not-ai'; calls = { monitor: 0, repair: 0, generate: 0 };
  constructor(signals) { this.signals = signals; }
  async monitor(input) {
    this.calls.monitor++; const active = this.signals.triggerIds.includes(input.messages.at(-1)?.id);
    return { status: active || !this.signals.triggerIds.length ? this.signals.status : 'on_track', claim: active ? this.signals.claim : '', evidenceIds: active ? [this.signals.evidenceId] : [], confidence: active ? 0.95 : 1 };
  }
  async selfRepair(input) {
    this.calls.repair++; const last = input.messages.at(-1);
    return { resolved: this.signals.repairFinalQuote && last?.text === this.signals.repairFinalQuote ? input.openClaims.map(c => ({ claimKey: c.key, messageId: last.id, quote: last.text })) : [] };
  }
  async generate() { this.calls.generate++; return { text: this.signals.generated, evidenceIds: [this.signals.evidenceId] }; }
}
