import { useCallback, useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { useCallEmbed } from './useCallEmbed';
import { CallControlEvent } from '../plugins/call/CallControl';
import { CallControlState } from '../plugins/call/CallControlState';
import { useCallPreferencesAtom } from '../state/hooks/callPreferences';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';
import {
  playMuteSound,
  playUnmuteSound,
  playDeafenSound,
  playUndeafenSound,
} from '../utils/voiceFeedback';

/**
 * SINGLE source of truth for the mute (mic) / deafen (sound) buttons — used by
 * the user panel, the in-room control bar and the bottom call-status strip so
 * they can never go out of sync again.
 *
 * - In a call: state comes from the live CallControl; toggles drive the call
 *   AND mirror into the persisted call preferences (so the next join matches
 *   what you left with).
 * - Outside a call: state/toggles are the persisted preferences (as before).
 * - Every toggle plays the mute/unmute/deafen/undeafen tone (scaled by the
 *   notification volume) — previously only the user panel did.
 */
export const useVoiceControls = () => {
  const callEmbed = useCallEmbed();
  const prefAtom = useCallPreferencesAtom();
  const [pref, setPref] = useAtom(prefAtom);
  const [notificationVolume] = useSetting(settingsAtom, 'notificationVolume');

  const [ctl, setCtl] = useState<CallControlState | undefined>(() =>
    callEmbed ? callEmbed.control.getState() : undefined
  );
  useEffect(() => {
    if (!callEmbed) {
      setCtl(undefined);
      return undefined;
    }
    const update = () => setCtl(callEmbed.control.getState());
    update();
    callEmbed.control.on(CallControlEvent.StateUpdate, update);
    return () => {
      callEmbed.control.off(CallControlEvent.StateUpdate, update);
    };
  }, [callEmbed]);

  const microphone = callEmbed ? ctl?.microphone ?? true : pref.microphone;
  const sound = callEmbed ? ctl?.sound ?? true : pref.sound;

  const toggleMicrophone = useCallback(() => {
    const next = !microphone;
    if (next) playUnmuteSound(notificationVolume);
    else playMuteSound(notificationVolume);
    if (callEmbed) callEmbed.control.toggleMicrophone();
    // Mirror into preferences (also the whole story outside a call). Keep the
    // pref-level coupling: unmuting implies you want to hear people.
    setPref({
      microphone: next,
      video: pref.video,
      sound: next && !pref.sound ? true : pref.sound,
    });
  }, [microphone, callEmbed, notificationVolume, pref, setPref]);

  const toggleSound = useCallback(() => {
    const next = !sound;
    if (next) playUndeafenSound(notificationVolume);
    else playDeafenSound(notificationVolume);
    if (callEmbed) callEmbed.control.toggleSound();
    // Deafening also mutes the mic (Discord semantics), matching CallControl.
    setPref({
      microphone: !next ? false : pref.microphone,
      video: pref.video,
      sound: next,
    });
  }, [sound, callEmbed, notificationVolume, pref, setPref]);

  return { microphone, sound, toggleMicrophone, toggleSound, inCall: !!callEmbed };
};
