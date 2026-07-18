import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, IconButton, Icon, Icons, Scroll, Switch, Button } from 'folds';
import { useAtomValue } from 'jotai';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { callEmbedAtom } from '../../../state/callEmbed';
import { RangeSlider } from '../../../components/range-slider';
import { NativeSelect } from '../../../components/native-select';

type DeviceLists = {
  mics: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  cams: MediaDeviceInfo[];
  labeled: boolean;
};

type MicTestHandles = {
  stream: MediaStream;
  ctx: AudioContext;
  gain: GainNode;
  analyser: AnalyserNode;
  raf: number;
  audioEl: HTMLAudioElement;
};

export function VoiceVideo({ requestClose }: { requestClose: () => void }) {
  const [micDeviceId, setMicDeviceId] = useSetting(settingsAtom, 'vvMicDeviceId');
  const [speakerDeviceId, setSpeakerDeviceId] = useSetting(settingsAtom, 'vvSpeakerDeviceId');
  const [speakerLabel, setSpeakerLabel] = useSetting(settingsAtom, 'vvSpeakerLabel');
  const [micGain, setMicGain] = useSetting(settingsAtom, 'vvMicGain');
  const [noiseSuppression, setNoiseSuppression] = useSetting(settingsAtom, 'vvNoiseSuppression');
  const [rnnoise, setRnnoise] = useSetting(settingsAtom, 'vvRnnoise');
  const [echoCancellation, setEchoCancellation] = useSetting(settingsAtom, 'vvEchoCancellation');
  const [autoGainControl, setAutoGainControl] = useSetting(settingsAtom, 'vvAutoGainControl');
  const [autoSensitivity, setAutoSensitivity] = useSetting(settingsAtom, 'vvAutoSensitivity');
  const [sensitivity, setSensitivity] = useSetting(settingsAtom, 'vvSensitivity');
  const [pushToTalk, setPushToTalk] = useSetting(settingsAtom, 'vvPushToTalk');
  const [pttKey, setPttKey] = useSetting(settingsAtom, 'vvPttKey');
  const [voiceVolume, setVoiceVolume] = useSetting(settingsAtom, 'voiceVolume');
  const [micChannels, setMicChannels] = useSetting(settingsAtom, 'vvMicChannels');
  const [camDeviceId, setCamDeviceId] = useSetting(settingsAtom, 'vvCamDeviceId');
  const [streamResolution, setStreamResolution] = useSetting(settingsAtom, 'vvStreamResolution');
  const [streamFps, setStreamFps] = useSetting(settingsAtom, 'vvStreamFps');
  const [streamMaxKbps, setStreamMaxKbps] = useSetting(settingsAtom, 'vvStreamMaxKbps');
  const [streamPresets, setStreamPresets] = useSetting(settingsAtom, 'vvStreamPresets');

  const callEmbed = useAtomValue(callEmbedAtom);

  // ---- devices ----
  const [devices, setDevices] = useState<DeviceLists>({ mics: [], speakers: [], cams: [], labeled: false });

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list.filter((d) => d.kind === 'videoinput');
      const mics = list.filter((d) => d.kind === 'audioinput');
      const speakers = list.filter((d) => d.kind === 'audiooutput');
      const labeled = mics.some((d) => d.label !== '');
      setDevices({ mics, speakers, cams, labeled });
    } catch {
      setDevices({ mics: [], speakers: [], cams: [], labeled: false });
    }
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
  }, [refreshDevices]);

  const grantAccess = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      // denied — the description below explains what to do
    }
    refreshDevices();
  }, [refreshDevices]);

  // Firefox & friends return no device names before permission is granted —
  // opening this section implies intent, so ask right away (no-op if granted).
  useEffect(() => {
    grantAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Firefox never lists audiooutput devices; it has a dedicated OS-level picker.
  const speakersListed = devices.speakers.some((d) => d.label !== '');
  const selectAudioOutput = (
    navigator.mediaDevices as MediaDevices & {
      selectAudioOutput?: () => Promise<MediaDeviceInfo>;
    }
  ).selectAudioOutput?.bind(navigator.mediaDevices);

  const chooseSpeaker = async () => {
    if (!selectAudioOutput) return;
    try {
      const d = await selectAudioOutput();
      setSpeakerDeviceId(d.deviceId);
      setSpeakerLabel(d.label || 'Selected device');
    } catch {
      // user dismissed the picker
    }
  };

  const resetSpeaker = () => {
    setSpeakerDeviceId('');
    setSpeakerLabel('');
  };

  // ---- mic test ----
  const [testing, setTesting] = useState(false);
  const [loopback, setLoopback] = useState(true);
  const [level, setLevel] = useState(0); // 0..1 for the meter bar
  const [gateOpen, setGateOpen] = useState(true);
  const testRef = useRef<MicTestHandles | null>(null);
  const audioElRef = useRef<HTMLAudioElement>(null);
  const lastLoudRef = useRef(0);

  const stopTest = useCallback(() => {
    const t = testRef.current;
    if (!t) return;
    cancelAnimationFrame(t.raf);
    t.stream.getTracks().forEach((tr) => tr.stop());
    t.ctx.close().catch(() => {});
    t.audioEl.srcObject = null;
    testRef.current = null;
    setTesting(false);
    setLevel(0);
    setGateOpen(true);
  }, []);

  const startTest = async () => {
    stopTest();
    const audioEl = audioElRef.current;
    if (!audioEl) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: micDeviceId ? { ideal: micDeviceId } : undefined,
          noiseSuppression,
          echoCancellation,
          autoGainControl,
        },
      });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = micGain ?? 1;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const dest = ctx.createMediaStreamDestination();
      src.connect(gain);
      gain.connect(analyser);
      analyser.connect(dest);
      audioEl.srcObject = dest.stream;
      audioEl.muted = !loopback;
      audioEl.volume = voiceVolume ?? 0.5;
      const sinkEl = audioEl as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (speakerDeviceId && sinkEl.setSinkId) sinkEl.setSinkId(speakerDeviceId).catch(() => {});
      audioEl.play().catch(() => {});

      const buf = new Float32Array(analyser.fftSize);
      const handles: MicTestHandles = { stream, ctx, gain, analyser, raf: 0, audioEl };
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const db = rms > 0 ? 20 * Math.log10(rms) : -100;
        setLevel(Math.min(1, Math.max(0, (db + 100) / 100)));
        if (db >= (sensitivity ?? -100)) lastLoudRef.current = Date.now();
        const open =
          (autoSensitivity ?? true) ||
          (sensitivity ?? -100) <= -99 ||
          Date.now() - lastLoudRef.current < 400;
        setGateOpen(open);
        audioEl.muted = !loopback || !open;
        handles.raf = requestAnimationFrame(tick);
      };
      handles.raf = requestAnimationFrame(tick);
      testRef.current = handles;
      setTesting(true);
    } catch {
      setTesting(false);
    }
  };

  // stop the test when leaving the page
  useEffect(() => () => stopTest(), [stopTest]);

  // live-apply slider/toggle changes to a running test
  useEffect(() => {
    const t = testRef.current;
    if (t) t.gain.gain.value = micGain ?? 1;
  }, [micGain]);
  useEffect(() => {
    const t = testRef.current;
    if (t) t.audioEl.volume = voiceVolume ?? 0.5;
    // voice volume also applies live to an ongoing call
    callEmbed?.control.applyVoiceVolume();
  }, [voiceVolume, callEmbed]);
  useEffect(() => {
    const t = testRef.current;
    if (!t) return;
    const sinkEl = t.audioEl as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (speakerDeviceId && sinkEl.setSinkId) sinkEl.setSinkId(speakerDeviceId).catch(() => {});
  }, [speakerDeviceId]);

  // ---- push-to-talk keybind capture ----
  const [capturing, setCapturing] = useState(false);
  useEffect(() => {
    if (!capturing) return undefined;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setCapturing(false);
        return;
      }
      setPttKey(e.code);
      setCapturing(false);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [capturing, setPttKey]);

  const deviceOptions = (list: MediaDeviceInfo[], kind: string) => (
    <>
      <option value="">Default</option>
      {list.map((d, i) => (
        <option key={d.deviceId || i} value={d.deviceId}>
          {d.label || `${kind} ${i + 1}`}
        </option>
      ))}
    </>
  );

  const thresholdPct = Math.min(100, Math.max(0, ((sensitivity ?? -100) + 100)));

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Voice & Video
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              {/* ---- Devices ---- */}
              <Box direction="Column" gap="100">
                <Text size="L400">Devices</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  {!devices.labeled && (
                    <SettingTile
                      title="Microphone Access"
                      description="Allow microphone access to see your device names."
                      after={
                        <Button size="300" radii="300" onClick={grantAccess}>
                          <Text size="B300">Allow</Text>
                        </Button>
                      }
                    />
                  )}
                  <SettingTile
                    title="Microphone"
                    description="Input device used in calls. Applies when you join your next call."
                    after={
                      <select
                        className={NativeSelect}
                        value={micDeviceId ?? ''}
                        onChange={(e) => setMicDeviceId(e.target.value)}
                      >
                        {deviceOptions(devices.mics, 'Microphone')}
                      </select>
                    }
                  />
                  {speakersListed && (
                    <SettingTile
                      title="Speaker"
                      description="Output device for call audio. Applies live."
                      after={
                        <select
                          className={NativeSelect}
                          value={speakerDeviceId ?? ''}
                          onChange={(e) => setSpeakerDeviceId(e.target.value)}
                        >
                          {deviceOptions(devices.speakers, 'Speaker')}
                        </select>
                      }
                    />
                  )}
                  {!speakersListed && selectAudioOutput && (
                    <SettingTile
                      title="Speaker"
                      description={`Current: ${
                        speakerDeviceId ? speakerLabel || 'Selected device' : 'System default'
                      }. Your browser uses a picker for output devices. Applies live.`}
                      after={
                        <Box alignItems="Center" gap="200" shrink="No">
                          {speakerDeviceId && (
                            <Button
                              size="300"
                              radii="300"
                              variant="Secondary"
                              fill="Soft"
                              onClick={resetSpeaker}
                            >
                              <Text size="B300">Reset</Text>
                            </Button>
                          )}
                          <Button size="300" radii="300" onClick={chooseSpeaker}>
                            <Text size="B300">Choose Speaker…</Text>
                          </Button>
                        </Box>
                      }
                    />
                  )}
                  {!speakersListed && !selectAudioOutput && (
                    <SettingTile
                      title="Speaker"
                      description="This browser does not support choosing an output device — call audio uses the system default."
                    />
                  )}
                  <SettingTile
                    title="Microphone Channels"
                    description="Mono (recommended): your voice is heard equally in both ears, even if your mic only captures one channel. Stereo: true 2-channel input for stereo mics/interfaces. Applies when you join your next call."
                    after={
                      <select
                        className={NativeSelect}
                        value={micChannels ?? 'mono'}
                        onChange={(e) => setMicChannels(e.target.value as 'mono' | 'stereo')}
                      >
                        <option value="mono">Mono (both ears)</option>
                        <option value="stereo">Stereo (2 channels)</option>
                      </select>
                    }
                  />
                  <SettingTile
                    title="Camera"
                    description="Camera used when you turn on video in a call. Applies when the camera starts."
                    after={
                      <select
                        className={NativeSelect}
                        value={camDeviceId ?? ''}
                        onChange={(e) => setCamDeviceId(e.target.value)}
                      >
                        {deviceOptions(devices.cams, 'Camera')}
                      </select>
                    }
                  />
                </SequenceCard>
              </Box>

              {/* ---- Volume ---- */}
              <Box direction="Column" gap="100">
                <Text size="L400">Volume</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Input Volume"
                    description={`Your microphone level sent to others — ${Math.round((micGain ?? 1) * 100)}%`}
                    after={
                      <RangeSlider min={0} max={2} step={0.05} value={micGain ?? 1} onChange={setMicGain} />
                    }
                  />
                  <SettingTile
                    title="Output Volume"
                    description={`People speaking in calls — ${Math.round((voiceVolume ?? 0.5) * 100)}%. Applies live.`}
                    after={
                      <RangeSlider min={0} max={1} step={0.05} value={voiceVolume ?? 0.5} onChange={setVoiceVolume} />
                    }
                  />
                </SequenceCard>
              </Box>

              {/* ---- Stream (screen share quality) ---- */}
              <Box direction="Column" gap="100">
                <Text size="L400">Stream</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Stream Resolution"
                    description="Maximum resolution of your screen share. Applies from your next share."
                    after={
                      <select
                        className={NativeSelect}
                        value={streamResolution ?? '1080p'}
                        onChange={(e) =>
                          setStreamResolution(e.target.value as '720p' | '1080p' | '1440p' | 'source')
                        }
                      >
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                        <option value="1440p">1440p</option>
                        <option value="source">Source (no limit)</option>
                      </select>
                    }
                  />
                  <SettingTile
                    title="Stream Framerate"
                    description="Target frames per second for screen sharing. Higher is smoother motion. Applies live."
                    after={
                      <select
                        className={NativeSelect}
                        value={String(streamFps ?? 30)}
                        onChange={(e) => setStreamFps(parseInt(e.target.value, 10))}
                      >
                        <option value="15">15 FPS</option>
                        <option value="30">30 FPS</option>
                        <option value="60">60 FPS</option>
                      </select>
                    }
                  />
                  <SettingTile
                    title="Stream Maximum Bitrate"
                    description={`Overall quality cap of your stream — ${((streamMaxKbps ?? 5000) / 1000).toFixed(1)} Mbps. Higher is better but uses more upload. Applies live.`}
                    after={
                      <RangeSlider
                        min={1000}
                        max={20000}
                        step={500}
                        value={streamMaxKbps ?? 5000}
                        onChange={setStreamMaxKbps}
                      />
                    }
                  />
                  <SettingTile
                    title="Presets"
                    description="Save the current resolution/framerate/bitrate as a named preset, or apply one."
                    after={
                      <Box alignItems="Center" gap="200" shrink="No">
                        <select
                          className={NativeSelect}
                          value=""
                          onChange={(e) => {
                            const pr = (streamPresets ?? []).find((x) => x.name === e.target.value);
                            if (pr) {
                              setStreamResolution(pr.resolution);
                              setStreamFps(pr.fps);
                              setStreamMaxKbps(pr.kbps);
                            }
                          }}
                        >
                          <option value="" disabled>
                            {(streamPresets ?? []).length ? 'Apply preset…' : 'No presets yet'}
                          </option>
                          {(streamPresets ?? []).map((pr) => (
                            <option key={pr.name} value={pr.name}>
                              {pr.name} ({pr.resolution}/{pr.fps}fps/{(pr.kbps / 1000).toFixed(1)}Mbps)
                            </option>
                          ))}
                        </select>
                        <Button
                          size="300"
                          radii="300"
                          variant="Secondary"
                          fill="Soft"
                          onClick={() => {
                            // eslint-disable-next-line no-alert
                            const name = window.prompt('Preset name:');
                            if (!name) return;
                            const next = (streamPresets ?? []).filter((x) => x.name !== name);
                            next.push({
                              name,
                              resolution: streamResolution ?? '1080p',
                              fps: streamFps ?? 30,
                              kbps: streamMaxKbps ?? 5000,
                            });
                            setStreamPresets(next.slice(-20));
                          }}
                        >
                          <Text size="B300">Save as preset</Text>
                        </Button>
                        {(streamPresets ?? []).length > 0 && (
                          <Button
                            size="300"
                            radii="300"
                            variant="Critical"
                            fill="Soft"
                            onClick={() => {
                              // eslint-disable-next-line no-alert
                              const name = window.prompt(
                                `Delete which preset? (${(streamPresets ?? [])
                                  .map((x) => x.name)
                                  .join(', ')})`
                              );
                              if (!name) return;
                              setStreamPresets((streamPresets ?? []).filter((x) => x.name !== name));
                            }}
                          >
                            <Text size="B300">Delete…</Text>
                          </Button>
                        )}
                      </Box>
                    }
                  />
                </SequenceCard>
              </Box>

              {/* ---- Mic test ---- */}
              <Box direction="Column" gap="100">
                <Text size="L400">Mic Test</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Test Your Microphone"
                    description={
                      testing
                        ? 'Speak — the bar shows your level exactly as others would hear you.'
                        : 'Check that your mic works and hear yourself with your current settings.'
                    }
                    after={
                      <Button
                        size="300"
                        radii="300"
                        variant={testing ? 'Critical' : 'Primary'}
                        onClick={() => (testing ? stopTest() : startTest())}
                      >
                        <Text size="B300">{testing ? 'Stop' : 'Test Mic'}</Text>
                      </Button>
                    }
                  />
                  {testing && (
                    <>
                      <div
                        style={{
                          position: 'relative',
                          height: '10px',
                          borderRadius: '5px',
                          background: 'rgba(128,128,128,0.25)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            width: `${Math.round(level * 100)}%`,
                            background: gateOpen ? '#3ba55d' : '#8b90a0',
                            borderRadius: '5px',
                            transition: 'width 60ms linear',
                          }}
                        />
                        {!(autoSensitivity ?? true) && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              bottom: 0,
                              left: `${thresholdPct}%`,
                              width: '2px',
                              background: '#e0a54a',
                            }}
                          />
                        )}
                      </div>
                      <SettingTile
                        title="Hear Yourself"
                        description="Play your own mic back through the selected speaker."
                        after={
                          <Switch
                            value={loopback}
                            onChange={(v) => {
                              setLoopback(v);
                              const t = testRef.current;
                              if (t) t.audioEl.muted = !v;
                            }}
                          />
                        }
                      />
                    </>
                  )}
                </SequenceCard>
              </Box>

              {/* ---- Input sensitivity ---- */}
              <Box direction="Column" gap="100">
                <Text size="L400">Input Sensitivity</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Automatic Sensitivity"
                    description="Let the browser decide what counts as speech (recommended)."
                    after={<Switch value={autoSensitivity ?? true} onChange={setAutoSensitivity} />}
                  />
                  {!(autoSensitivity ?? true) && (
                    <SettingTile
                      title="Sensitivity Threshold"
                      description={`Sound below ${Math.round(sensitivity ?? -100)} dB is muted. Run the mic test above to tune it — the orange marker is this threshold.`}
                      after={
                        <RangeSlider min={-100} max={0} step={1} value={sensitivity ?? -100} onChange={setSensitivity} />
                      }
                    />
                  )}
                </SequenceCard>
              </Box>

              {/* ---- Processing ---- */}
              <Box direction="Column" gap="100">
                <Text size="L400">Audio Processing</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Noise Suppression"
                    description="Filter out background noise (fans, keyboard…). Applies to your next call."
                    after={
                      <Switch value={noiseSuppression ?? true} onChange={setNoiseSuppression} />
                    }
                  />
                  <SettingTile
                    title="Enhanced Noise Suppression (RNNoise)"
                    description="Neural noise removal (open source) — much stronger than the standard suppression, which it replaces while active. Applies to your next call."
                    after={<Switch value={rnnoise ?? false} onChange={setRnnoise} />}
                  />
                  <SettingTile
                    title="Echo Cancellation"
                    description="Stop others from hearing themselves through your mic."
                    after={
                      <Switch value={echoCancellation ?? true} onChange={setEchoCancellation} />
                    }
                  />
                  <SettingTile
                    title="Automatic Gain Control"
                    description="Let the browser keep your mic at a steady level."
                    after={<Switch value={autoGainControl ?? true} onChange={setAutoGainControl} />}
                  />
                </SequenceCard>
              </Box>

              {/* ---- Push to talk ---- */}
              <Box direction="Column" gap="100">
                <Text size="L400">Push to Talk</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Enable Push to Talk"
                    description="Your mic stays muted in calls unless you hold the keybind. Works while the ShuChat window is focused."
                    after={<Switch value={pushToTalk ?? false} onChange={setPushToTalk} />}
                  />
                  {(pushToTalk ?? false) && (
                    <SettingTile
                      title="Keybind"
                      description={
                        capturing
                          ? 'Press any key… (Esc to cancel)'
                          : 'The key you hold to talk. Applies when you join your next call.'
                      }
                      after={
                        <Button
                          size="300"
                          radii="300"
                          variant={capturing ? 'Success' : 'Secondary'}
                          fill="Soft"
                          onClick={() => setCapturing(true)}
                        >
                          <Text size="B300">
                            {capturing ? 'Listening…' : pttKey || 'Set keybind'}
                          </Text>
                        </Button>
                      }
                    />
                  )}
                </SequenceCard>
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioElRef} style={{ display: 'none' }} />
    </Page>
  );
}
