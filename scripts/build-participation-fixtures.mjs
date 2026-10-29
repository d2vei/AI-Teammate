// Authoring recipe for v1 SELF-MADE synthetic development data. Not a model or
// a hidden held-out benchmark. Never regenerate v1 after a live run has started.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
const directory = 'evals/participation/v1';
if (existsSync(`${directory}/cases.jsonl`)) throw new Error('Preserve v1; create a new version instead of overwriting a corpus');
mkdirSync(directory, { recursive: true });
const scenarios = [
  ['constraint_reminder', 'forgotten_constraint', 'weekend availability', 'I cannot attend on Saturday. Sunday works for me.', 'Shall we schedule Saturday?', 'Saturday would fit my calendar.', 'Let us reserve Saturday then.', 'We will schedule Sunday so everyone can attend.', 'Saturday conflicts with the earlier availability. Could we choose Sunday?'],
  ['constraint_reminder', 'forgotten_constraint', 'hosting ceiling', 'Our hosting ceiling is twenty euros per month.', 'This plan costs forty euros monthly.', 'The forty euro option looks convenient.', 'I will select the forty euro tier.', 'We will choose the eighteen euro plan within the ceiling.', 'The proposed tier exceeds the recorded hosting ceiling. Could we compare plans under twenty euros?'],
  ['constraint_reminder', 'forgotten_constraint', 'private diagnostic data', 'Diagnostics must stay on the local machine.', 'We could upload the raw logs to a public paste.', 'The public paste would be easier to share.', 'I will put the logs on the public paste.', 'We will keep diagnostics local and share only synthetic examples.', 'The earlier constraint keeps diagnostics local. Could we share a synthetic example instead?'],
  ['constraint_reminder', 'forgotten_constraint', 'mobile review access', 'Mira can review using a phone only.', 'We can make desktop software mandatory for review.', 'The desktop review tool is familiar.', 'Let us require the desktop tool for every reviewer.', 'We will provide a browser review that also works on a phone.', 'A mandatory desktop tool excludes the phone-only reviewer. Could we provide a browser option?'],
  ['constraint_reminder', 'forgotten_constraint', 'Freitag Verfuegbarkeit', 'Am Freitag kann ich nicht, Montag passt.', 'Nehmen wir Freitag fuer die Besprechung?', 'Freitag passt mir eigentlich gut.', 'Dann tragen wir Freitag ein.', 'Wir nehmen Montag, damit alle teilnehmen koennen.', 'Freitag widerspricht der vorher genannten Verfuegbarkeit. Passt Montag fuer alle?'],
  ['clarification', 'uncertainty', 'latency acceptance criterion', 'We have not agreed on an acceptable response time.', 'Let us approve the latency work.', 'The response time seems fine to me.', 'I will call the latency requirement complete.', 'We agree on a ninety-fifth percentile below two seconds.', 'What response-time threshold should decide whether this work is accepted?'],
  ['clarification', 'underspecified_plan', 'review handoff owner', 'Nobody has been assigned to review the handoff.', 'The handoff is ready for the next stage.', 'Someone will probably review it.', 'We can move the handoff to approved.', 'Mira will review the handoff before it can be approved.', 'Who will review the handoff before it moves to approved?'],
  ['clarification', 'uncertainty', 'rollout decision criterion', 'The choice between speed and rollback safety is still open.', 'Let us choose a rollout approach now.', 'Either approach could work.', 'I will pick one without another criterion.', 'Rollback safety is the agreed priority for this rollout.', 'Should rollback safety or deployment speed decide this rollout choice?'],
  ['clarification', 'underspecified_plan', 'translation release scope', 'We have not chosen which languages belong in this release.', 'The translation task is ready to start.', 'We can translate whatever seems useful.', 'I will mark the translation scope as agreed.', 'This release includes German and English only.', 'Which languages should be included in this release before translation starts?'],
  ['clarification', 'uncertainty', 'definition of reproduced', 'We still need a shared definition of a reproduced failure.', 'The investigation can be called reproduced now.', 'The report sounds convincing.', 'I will mark the reproduction check complete.', 'We require the same failure in a fresh local run with a recorded trace.', 'What observed result should count as a reproduced failure?'],
  ['loop_breaking', 'discussion_loop', 'cache complexity tradeoff', 'Caching is faster but adds invalidation complexity.', 'Caching would make the response faster.', 'Avoiding a cache would keep the design simpler.', 'Caching is faster, but simpler is easier to maintain.', 'We will measure uncached latency once before choosing.', 'Could one uncached latency measurement give us a criterion for this trade-off?'],
  ['loop_breaking', 'discussion_loop', 'storage simplicity tradeoff', 'Local files are simple; a database makes queries easier.', 'Files would be simpler to set up.', 'The database would make queries easier.', 'Files are simple but querying them is less convenient.', 'We will list the three required queries and compare both options against them.', 'Could we compare both options against the queries the project actually needs?'],
  ['loop_breaking', 'discussion_loop', 'review length tradeoff', 'A longer review gives context; a shorter one is easier to read.', 'A long review can explain the context.', 'A short review is easier to skim.', 'More context helps, though shorter is quicker to read.', 'We will try a short review with linked evidence and ask the reviewer.', 'Could we try a short review with evidence links and use reviewer feedback to decide?'],
  ['loop_breaking', 'discussion_loop', 'release cadence tradeoff', 'Frequent releases are quick; infrequent releases need less coordination.', 'Frequent releases would get changes out quickly.', 'Less frequent releases need less coordination.', 'Fast delivery is good but coordination takes time.', 'We will choose a weekly cadence for the pilot and review the actual effort.', 'Could we try one weekly release cadence and review the coordination effort?'],
  ['loop_breaking', 'discussion_loop', 'Benachrichtigung Abwaegung', 'Viele Meldungen informieren schnell, wenige Meldungen stoeren weniger.', 'Mehr Meldungen waeren schneller sichtbar.', 'Weniger Meldungen wuerden weniger stoeren.', 'Schnelle Information hilft, aber weniger Stoerungen auch.', 'Wir testen nur neue Fehler und vergleichen die Zahl hilfreicher Meldungen.', 'Koennen wir nur neue Fehler melden und danach den Nutzen der Meldungen pruefen?'],
];
const cases = []; const labels = {}; const signals = {};
function add(id, texts, label, signal, pairId = null) {
  const turns = texts.map((text, i) => ({ id: `m${i}`, actorId: i % 2 ? 'peer' : 'owner', text, at: 1_000_000 + i * 1000 }));
  cases.push({ id, pairId, provenance: 'self-made synthetic development conversation', turns }); labels[id] = label; signals[id] = signal;
}
for (let i = 0; i < scenarios.length; i++) {
  const [move, status, claim, source, a, b, unresolved, repaired, generated] = scenarios[i]; const pairId = `pair-${i + 1}`;
  const signal = { status, claim, evidenceId: 'message:m0', triggerIds: ['m1', 'm2', 'm3'], generated };
  add(`${pairId}-open`, [source, a, b, unresolved], { expected: 'should_speak', move, selfRepair: false }, signal, pairId);
  add(`${pairId}-repair`, [source, a, b, repaired], { expected: 'stay_silent', move, selfRepair: true }, { ...signal, repairFinalQuote: repaired }, pairId);
}
const quiet = [
  ['I am making tea.', 'I have coffee today.', 'Nice weather here.', 'Mine is cloudy.', 'Back in five minutes.', 'See you shortly.'],
  ['The test passed locally.', 'Thanks for the trace.', 'I will review it tomorrow.', 'Tomorrow is within the agreed window.', 'The review is assigned.', 'I have the evidence link.'],
  ['The budget ceiling is twenty euros.', 'This tier costs eighteen euros.', 'That fits the ceiling.', 'We can compare its features next.', 'I will list the features.', 'Thanks.'],
  ['Should we test files or a database?', 'Let us compare the actual queries first.', 'I will list the queries.', 'There are three required lookups.', 'That gives us a comparison criterion.', 'Agreed.'],
  ['I cannot attend Friday.', 'Monday works for everyone.', 'Let us choose Monday.', 'I will send the agenda for Monday.', 'The agenda is ready.', 'I can review it.'],
  ['We need an owner for review.', 'I will review it on Tuesday.', 'Tuesday meets our deadline.', 'I will attach the evidence.', 'The evidence is attached.', 'Thanks.'],
  ['The next release includes German and English.', 'I will prepare the German text.', 'I will prepare the English text.', 'We can compare them tomorrow.', 'Both drafts are linked.', 'Ready for review.'],
  ['Do we know the outage cause?', 'We have no current logs or reproduction.', 'Let us collect evidence before guessing.', 'I will request a sanitized trace.', 'We should keep uncertainty visible.', 'Agreed.'],
  ['Guten Morgen.', 'Morgen, ich bin gleich da.', 'Ich lese erst die Notizen.', 'Nimm dir Zeit.', 'Danach koennen wir anfangen.', 'Passt.'],
  ['The experiment is complete.', 'We have the measured result and trace.', 'The result meets the agreed threshold.', 'I will prepare a summary for review.', 'The reviewer can check the trace.', 'We can discuss the next experiment later.'],
];
quiet.forEach((texts, i) => add(`quiet-${i + 1}`, texts, { expected: 'stay_silent', move: null, selfRepair: false }, { status: i === 0 || i === 8 ? 'off_topic_social' : i === 7 ? 'unanswerable' : 'on_track', claim: '', evidenceId: 'message:m0', triggerIds: [], generated: '' }));
writeFileSync(`${directory}/cases.jsonl`, cases.map(c => JSON.stringify(c)).join('\n') + '\n');
writeFileSync(`${directory}/labels.json`, JSON.stringify(labels, null, 2) + '\n');
writeFileSync(`${directory}/mock-signals.json`, JSON.stringify(signals, null, 2) + '\n');
console.log(JSON.stringify({ cases: cases.length, shouldSpeak: 15, staySilent: 25, matchedPairs: 15, kind: 'self-made development corpus, not held out' }));
