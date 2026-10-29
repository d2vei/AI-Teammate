export function pilotTurn(turn, projectId, epoch) {
  if (!/^m\d{1,2}$/.test(turn.id) || !['owner', 'peer'].includes(turn.actorId) || typeof turn.text !== 'string' || turn.text.length > 2000 || !Number.isInteger(turn.offsetMs) || turn.offsetMs < 0 || turn.offsetMs > 600000) throw new Error('Invalid authored turn');
  const event = { id: turn.id, version: '1', platform: 'fake', workspaceId: 'synthetic-workspace', roomId: 'synthetic-room', projectId, actor: { id: turn.actorId, roleIds: turn.actorId === 'owner' ? ['reviewer'] : [] }, invocation: 'ambient', text: turn.text, replyTo: null, replyContext: null };
  const message = { id: event.id, version: event.version, platform: event.platform, workspaceId: event.workspaceId, roomId: event.roomId, projectId, actorId: event.actor.id, text: event.text, at: epoch + turn.offsetMs };
  return { event, message };
}

export function scoreParticipation(results, labels) {
  const positives = Object.entries(labels).filter(([, l]) => l.expected === 'should_speak');
  const negatives = Object.entries(labels).filter(([, l]) => l.expected === 'stay_silent');
  const scored = results.map(r => {
    const label = labels[r.id]; if (!label) throw new Error('Unknown grade identity');
    if (r.state !== 'OBSERVED') return { id: r.id, expected: label, status: 'NOT_RUN_OR_BLOCKED', actionCount: r.decisions.filter(d => d.action !== 'SILENT').length };
    const interventions = r.decisions.filter(d => d.action !== 'SILENT');
    const correct = label.expected === 'should_speak' ? interventions.length === 1 && r.decisions.at(-1)?.eventId === label.targetTurnId && r.decisions.at(-1)?.action === 'HAND_RAISE' : interventions.length === 0;
    return { id: r.id, expected: label, status: correct ? 'PASS_ACTION_ONLY' : 'FAIL', actionCount: interventions.length, invalidModelCalls: r.invalidModelCalls ?? 0 };
  });
  const caught = scored.filter(r => r.expected.expected === 'should_speak' && r.status === 'PASS_ACTION_ONLY').length;
  const falseInterruptions = scored.filter(r => r.expected.expected === 'stay_silent' && r.actionCount > 0).length;
  const moves = Object.fromEntries(['constraint_reminder', 'clarification', 'loop_breaking'].map(move => [move, { caught: scored.filter(r => r.expected.expected === 'should_speak' && r.expected.move === move && r.status === 'PASS_ACTION_ONLY').length, total: positives.filter(([, l]) => l.move === move).length }]));
  const complete = results.length === Object.keys(labels).length && results.every(r => r.state === 'OBSERVED');
  const meets = complete && positives.length === 15 && negatives.length === 25 && caught >= 9 && falseInterruptions <= 3 && Object.values(moves).every(m => m.total === 5 && m.caught >= 3);
  return { status: complete ? (meets ? 'PASS_ACTION_THRESHOLDS_ONLY' : 'FAIL') : 'INCOMPLETE', caught, shouldSpeak: positives.length, falseInterruptions, staySilent: negatives.length, observedSilent: scored.filter(r => r.expected.expected === 'stay_silent' && r.status === 'PASS_ACTION_ONLY').length, selfRepairSilent: scored.filter(r => r.expected.selfRepair && r.status === 'PASS_ACTION_ONLY').length, selfRepairPairs: negatives.filter(([, l]) => l.selfRepair).length, moves, completeCases: results.filter(r => r.state === 'OBSERVED').length, caseGrades: scored, semanticEvidenceSupport: 'NOT_RATED', humanJudgments: 'NOT_RUN', unsolicitedDeliveryEnabled: false, deploymentDecision: meets ? 'shadow_only_pending_semantic_and_human_review' : 'mention_only_required' };
}
