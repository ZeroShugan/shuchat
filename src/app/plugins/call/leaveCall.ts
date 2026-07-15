import { CallEmbed } from './CallEmbed';

const CALL_MEMBER = 'org.matrix.msc3401.call.member';

/* Diagnostic trail for leave issues. Kept in a localStorage ring so the owner
   can paste it after a manual test (console is often closed): read it with
   localStorage.getItem('shuchat-call-log'). Also mirrored to console. */
function logCall(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  // eslint-disable-next-line no-console
  console.info('[shuchat-call]', line);
  try {
    const prev = localStorage.getItem('shuchat-call-log') ?? '';
    const lines = `${prev}\n${line}`.split('\n').filter(Boolean);
    localStorage.setItem('shuchat-call-log', lines.slice(-80).join('\n'));
  } catch {
    /* ignore */
  }
}

/**
 * Blank our OWN MatrixRTC membership state event(s) for this room. This is what
 * removes our name/avatar from the voice room immediately. Element Call's own
 * "End" does this from inside its iframe; when we leave from ShuChat's UI we do
 * it directly against the SDK client so it happens at once instead of waiting
 * for the ~30s membership expiry. We only ever blank events we sent ourselves.
 */
export function blankOwnCallMemberships(callEmbed: CallEmbed): void {
  try {
    const mx = callEmbed.room.client;
    const { room } = callEmbed;
    const myId = mx.getUserId();
    const events = room.currentState.getStateEvents(CALL_MEMBER);
    let mine = 0;
    events.forEach((ev) => {
      if (ev.getSender() !== myId) return; // never touch anyone else's membership
      if (Object.keys(ev.getContent()).length === 0) return; // already empty
      mine += 1;
      const key = ev.getStateKey() ?? '';
      mx.sendStateEvent(room.roomId, CALL_MEMBER as any, {}, key)
        .then(() => logCall(`blanked membership key=${key} OK`))
        .catch((e) => logCall(`blank FAILED key=${key}: ${e?.message ?? e}`));
    });
    logCall(`blankOwnCallMemberships: ${events.length} member events, ${mine} mine non-empty`);
  } catch (e) {
    logCall(`blankOwnCallMemberships threw: ${(e as Error)?.message ?? e}`);
  }
}

/**
 * Leave a call the same way the "End" button does — reliably and instantly.
 *
 * The bug this fixes: the space-panel "Leave" control used to just dispose the
 * embed (setCallEmbed(undefined)) whenever the widget hadn't reported "joined"
 * yet (which happens when you join from the Home panel — the JoinCall event can
 * fire before that component's listener attaches). Disposing the iframe kills
 * Element Call's session WITHOUT telling it to leave, so our call.member state
 * lingers until it expires (~30s) and we keep showing as present.
 *
 * Now we always: (1) tell Element Call to hang up (clean leave, same as "End"),
 * (2) blank our own membership directly with retries to beat any in-flight EC
 * keep-alive, and (3) tear the embed down slightly later so EC can finish first.
 */
export function hardLeaveCall(callEmbed: CallEmbed, teardown: () => void): void {
  logCall(`hardLeaveCall: room=${callEmbed.roomId} joined=${callEmbed.joined}`);
  // (1) Ask Element Call to hang up cleanly — exactly what "End" does.
  callEmbed
    .hangup()
    .then(() => logCall('hangup sent to Element Call OK'))
    .catch((e) => logCall(`hangup send failed (covered by direct blank): ${e?.message ?? e}`));

  // (2) Blank our membership now and again shortly after. The retries catch an
  // EC keep-alive that could land after the first blank and revive us.
  blankOwnCallMemberships(callEmbed);
  setTimeout(() => blankOwnCallMemberships(callEmbed), 1000);
  setTimeout(() => blankOwnCallMemberships(callEmbed), 3000);

  // (3) Tear the embed down. A short delay lets EC process the hangup and blank
  // its own membership; teardown is idempotent (the HangupCall echo may also
  // trigger it). The blank retries above use the SDK client, which stays valid
  // after the iframe is gone.
  setTimeout(teardown, 400);
}
