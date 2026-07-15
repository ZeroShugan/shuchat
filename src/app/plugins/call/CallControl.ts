import { ClientWidgetApi } from 'matrix-widget-api';
import EventEmitter from 'events';
import { CallControlState } from './CallControlState';
import { getSettings } from '../../../app/state/settings';
import { ElementMediaStateDetail, ElementMediaStatePayload, ElementWidgetActions } from './types';

export enum CallControlEvent {
  StateUpdate = 'state_update',
}

// Privacy: the camera may only be acquired when the user explicitly turned it
// on via the video button. This flag is stored in localStorage, which the
// media-shim inside the Element Call iframe (same origin) reads to decide
// whether to strip the `video` constraint from getUserMedia. Missing/'0' = the
// camera stays blocked; only an explicit '1' allows it.
const CAM_ALLOW_KEY = 'shuchat-cam-allow';

function setCameraAllowed(allowed: boolean): void {
  try {
    localStorage.setItem(CAM_ALLOW_KEY, allowed ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function cameraAllowed(): boolean {
  try {
    return localStorage.getItem(CAM_ALLOW_KEY) === '1';
  } catch {
    return false;
  }
}

export class CallControl extends EventEmitter implements CallControlState {
  private state: CallControlState;

  private call: ClientWidgetApi;

  private iframe: HTMLIFrameElement;

  private controlMutationObserver: MutationObserver;

  private get document(): Document | undefined {
    return this.iframe.contentDocument ?? this.iframe.contentWindow?.document;
  }

  private get screenshareButton(): HTMLElement | undefined {
    const screenshareBtn = this.document?.querySelector(
      '[data-testid="incall_screenshare"]'
    ) as HTMLElement | null;

    return screenshareBtn ?? undefined;
  }

  private get settingsButton(): HTMLElement | undefined {
    const leaveBtn = this.document?.querySelector('[data-testid="incall_leave"]');

    const settingsButton = leaveBtn?.previousElementSibling as HTMLElement | null;

    return settingsButton ?? undefined;
  }

  private get reactionsButton(): HTMLElement | undefined {
    const reactionsButton = this.settingsButton?.previousElementSibling as HTMLElement | null;

    return reactionsButton ?? undefined;
  }

  private get spotlightButton(): HTMLInputElement | undefined {
    const spotlightButton = this.document?.querySelector(
      'input[value="spotlight"]'
    ) as HTMLInputElement | null;

    return spotlightButton ?? undefined;
  }

  private get gridButton(): HTMLInputElement | undefined {
    const gridButton = this.document?.querySelector(
      'input[value="grid"]'
    ) as HTMLInputElement | null;

    return gridButton ?? undefined;
  }

  constructor(state: CallControlState, call: ClientWidgetApi, iframe: HTMLIFrameElement) {
    super();

    this.state = state;
    this.call = call;
    this.iframe = iframe;

    // Block the camera from the very start of the session (before EC can call
    // getUserMedia on join). Only the video button re-enables it.
    setCameraAllowed(state.video);

    this.controlMutationObserver = new MutationObserver(this.onControlMutation.bind(this));
  }

  public getState(): CallControlState {
    return this.state;
  }

  public get microphone(): boolean {
    return this.state.microphone;
  }

  public get video(): boolean {
    return this.state.video;
  }

  public get sound(): boolean {
    return this.state.sound;
  }

  public get screenshare(): boolean {
    return this.state.screenshare;
  }

  public get spotlight(): boolean {
    return this.state.spotlight;
  }

  public async applyState() {
    // setMediaState sends toWidget:device_mute — if Element Call does not reply in time,
    // the await rejects. Always run setSound/emitStateUpdate regardless.
    await this.setMediaState({
      audio_enabled: this.microphone,
      video_enabled: this.video,
    }).catch(() => {
      // Element Call may not reply to device_mute — ignore timeout
    });
    this.setSound(this.sound);
    this.emitStateUpdate();
  }

  public startObserving() {
    this.controlMutationObserver.disconnect();

    const screenshareBtn = this.screenshareButton;
    if (screenshareBtn) {
      this.controlMutationObserver.observe(screenshareBtn, {
        attributes: true,
        attributeFilter: ['data-kind'],
      });
    }
    const spotlightBtn = this.spotlightButton;
    if (spotlightBtn) {
      this.controlMutationObserver.observe(spotlightBtn, {
        attributes: true,
      });
    }

    this.onControlMutation();
  }

  public applySound() {
    this.setSound(this.sound);
  }

  private setMediaState(state: ElementMediaStatePayload) {
    return this.call.transport.send(ElementWidgetActions.DeviceMute, state);
  }

  /** Per-participant volume factors (1 = 100%). Applied on top of the global
   * voiceVolume; the media-shim's periodic loop respects the per-element
   * `__shuUserVol` marks we set here. */
  private userVolumes = new Map<string, number>();

  public getParticipantVolume(userId: string): number | undefined {
    return this.userVolumes.get(userId);
  }

  public setParticipantVolume(userId: string, factor: number): void {
    this.userVolumes.set(userId, factor);
    this.applyUserVolumes();
    this.applyVoiceVolume();
  }

  /** Best-effort mapping of a participant's audio elements: match <audio>
   * srcObject stream/track ids against the user's tile <video> streams; if
   * nothing matches and there is only ONE remote participant, all played audio
   * is theirs (local audio is never played back). Marks elements with
   * `__shuUserVol` so every volume writer (here + media-shim) can honor it. */
  private applyUserVolumes(): void {
    const doc = this.document;
    if (!doc || this.userVolumes.size === 0) return;
    const tiles = Array.from(doc.querySelectorAll('[data-video-fit]'));
    const audios = Array.from(doc.querySelectorAll('audio')) as (HTMLAudioElement & {
      __shuUserVol?: number;
    })[];
    const distinctUsers = new Set(
      tiles
        .map((t) => t.querySelector('[aria-label]')?.getAttribute('aria-label'))
        .filter((l): l is string => !!l && l.startsWith('@'))
    );

    this.userVolumes.forEach((factor, userId) => {
      const ids = new Set<string>();
      tiles.forEach((tile) => {
        const label = tile.querySelector('[aria-label]')?.getAttribute('aria-label');
        if (label !== userId) return;
        tile.querySelectorAll('video').forEach((v) => {
          const s = (v as HTMLVideoElement).srcObject as MediaStream | null;
          if (!s) return;
          ids.add(s.id);
          s.getTracks().forEach((t) => ids.add(t.id));
        });
      });
      let matched = audios.filter((a) => {
        const s = a.srcObject as MediaStream | null;
        if (!s) return false;
        if (ids.has(s.id)) return true;
        return s.getTracks().some((t) => ids.has(t.id));
      });
      // Sole-remote fallback: 2 distinct users in the grid = me + them, so all
      // locally-played audio belongs to them.
      if (matched.length === 0 && distinctUsers.size <= 2 && distinctUsers.has(userId)) {
        matched = audios;
      }
      matched.forEach((a) => {
        // eslint-disable-next-line no-param-reassign
        a.__shuUserVol = factor;
      });
    });
  }

  private static effectiveVolume(el: HTMLAudioElement & { __shuUserVol?: number }): number {
    const voiceVol = getSettings().voiceVolume ?? 0.5;
    const factor = typeof el.__shuUserVol === 'number' ? el.__shuUserVol : 1;
    return Math.max(0, Math.min(1, voiceVol * factor));
  }

  private setSound(sound: boolean): void {
    const callDocument = this.iframe.contentDocument ?? this.iframe.contentWindow?.document;
    if (callDocument) {
      this.applyUserVolumes();
      callDocument.querySelectorAll('audio').forEach((el) => {
        // eslint-disable-next-line no-param-reassign
        el.muted = !sound;
        // eslint-disable-next-line no-param-reassign
        el.volume = CallControl.effectiveVolume(el);
      });
    }
  }

  public applyVoiceVolume(): void {
    const callDocument = this.iframe.contentDocument ?? this.iframe.contentWindow?.document;
    if (callDocument) {
      this.applyUserVolumes();
      callDocument.querySelectorAll('audio').forEach((el) => {
        // eslint-disable-next-line no-param-reassign
        el.volume = CallControl.effectiveVolume(el);
      });
    }
  }

  public onMediaState(evt: CustomEvent<ElementMediaStateDetail>) {
    const { data } = evt.detail;
    if (!data) return;

    let videoEnabled = data.video_enabled ?? this.video;

    // Privacy guard: Element Call restores its last camera state on join and can
    // report the camera as ON without the user asking. If the user hasn't
    // explicitly enabled video (via the button, which sets the cam-allow flag),
    // force it back off and keep our UI showing the camera as off.
    if (videoEnabled && !cameraAllowed()) {
      videoEnabled = false;
      this.setMediaState({
        audio_enabled: data.audio_enabled ?? this.microphone,
        video_enabled: false,
      }).catch(() => {
        // Element Call may not reply to device_mute — ignore timeout
      });
    }

    const state = new CallControlState(
      data.audio_enabled ?? this.microphone,
      videoEnabled,
      this.sound,
      this.screenshare,
      this.spotlight
    );

    this.state = state;
    this.emitStateUpdate();

    if (this.microphone && !this.sound) {
      this.toggleSound();
    }
  }

  public onControlMutation() {
    const screenshare: boolean = this.screenshareButton?.getAttribute('data-kind') === 'primary';
    const spotlight: boolean = this.spotlightButton?.checked ?? false;

    this.state = new CallControlState(
      this.microphone,
      this.video,
      this.sound,
      screenshare,
      spotlight
    );
    this.emitStateUpdate();
  }

  /** Set the mic to an explicit state (used by push-to-talk). */
  public async setMicrophone(enabled: boolean): Promise<void> {
    if (this.microphone === enabled) return;
    const payload: ElementMediaStatePayload = {
      audio_enabled: enabled,
      video_enabled: this.video,
    };
    // Element Call may not reply to device_mute — ignore timeout
    await this.setMediaState(payload).catch(() => {});
  }

  public toggleMicrophone() {
    const payload: ElementMediaStatePayload = {
      audio_enabled: !this.microphone,
      video_enabled: this.video,
    };
    return this.setMediaState(payload);
  }

  public toggleVideo() {
    const target = !this.video;
    // Explicit user intent: allow the media-shim to acquire the camera only when
    // the user is turning it ON; re-block it when turning OFF.
    setCameraAllowed(target);
    const payload: ElementMediaStatePayload = {
      audio_enabled: this.microphone,
      video_enabled: target,
    };
    return this.setMediaState(payload);
  }

  public toggleSound() {
    const sound = !this.sound;

    this.setSound(sound);

    const state = new CallControlState(
      this.microphone,
      this.video,
      sound,
      this.screenshare,
      this.spotlight
    );
    this.state = state;
    this.emitStateUpdate();

    if (!this.sound && this.microphone) {
      this.toggleMicrophone();
    }
  }

  public toggleScreenshare() {
    // Stopping the primary share also stops any extra multi-streams — the main
    // stop button always ends EVERYTHING (individual stops live in the tile
    // right-click menu).
    if (this.screenshare) {
      try {
        (this.iframe.contentWindow as any)?.__shuStopExtraShares?.();
      } catch (e) {
        /* best-effort */
      }
    }
    this.screenshareButton?.click();
  }

  /**
   * Stop the current share and immediately start a new one (source picker
   * reopens, where the user can tick "Share audio"). The audio choice can only
   * be made at capture start, so "share audio" on a live stream = restart.
   */
  public restartScreenshare() {
    const btn = this.screenshareButton;
    if (!btn) return;
    if (!this.screenshare) {
      btn.click(); // not sharing — just start
      return;
    }
    btn.click(); // stop
    // Re-click once EC reflects the stopped state (data-kind flips off primary).
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const b = this.screenshareButton;
      if (!b || tries > 40) {
        clearInterval(timer);
        return;
      }
      if (b.getAttribute('data-kind') !== 'primary') {
        clearInterval(timer);
        b.click(); // start again → picker opens
      }
    }, 250);
  }

  public toggleSpotlight() {
    if (this.spotlight) {
      this.gridButton?.click();
      return;
    }
    this.spotlightButton?.click();
  }

  public toggleReactions() {
    this.reactionsButton?.click();
  }

  public toggleSettings() {
    this.settingsButton?.click();
  }

  public dispose() {
    this.controlMutationObserver.disconnect();
  }

  private emitStateUpdate() {
    this.emit(CallControlEvent.StateUpdate);
  }
}
