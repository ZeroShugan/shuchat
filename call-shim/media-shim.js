/* ShuChat Voice & Video shim — loaded inside the Element Call embed (same origin
   as ShuChat, so it shares localStorage). Applies the user's Voice & Video
   settings to the call's media pipeline:
   - microphone device + noise suppression / echo cancellation / auto gain
     (getUserMedia constraint rewrite)
   - input gain + manual noise-gate (WebAudio chain, only built when needed)
   - speaker device (setSinkId) + voice volume on the call's <audio> elements
   Live-updates via the `storage` event, which fires here whenever ShuChat
   saves its settings. Every step is failure-safe: any error falls back to the
   untouched browser behaviour so calls can never break because of the shim. */
(function () {
  'use strict';

  function readSettings() {
    var d = {
      vvMicDeviceId: '',
      vvSpeakerDeviceId: '',
      vvMicGain: 1,
      vvNoiseSuppression: true,
      vvEchoCancellation: true,
      vvAutoGainControl: true,
      vvAutoSensitivity: true,
      vvSensitivity: -100,
      voiceVolume: 0.5,
    };
    try {
      var raw = localStorage.getItem('settings');
      if (!raw) return d;
      var s = JSON.parse(raw);
      for (var k in d) {
        if (s[k] !== undefined && s[k] !== null) d[k] = s[k];
      }
    } catch (e) {
      /* keep defaults */
    }
    return d;
  }

  var S = readSettings();
  var chains = []; // live processing chains, for live gain updates

  window.addEventListener('storage', function (ev) {
    if (ev.key !== 'settings') return;
    S = readSettings();
    chains.forEach(function (c) {
      try {
        c.gain.gain.value = S.vvMicGain;
      } catch (e) {
        /* ignore */
      }
    });
    applyOutput();
  });

  /* ---- output: speaker device + voice volume on the call's audio elements ---- */
  function applyOutput() {
    try {
      var els = document.querySelectorAll('audio');
      for (var i = 0; i < els.length; i += 1) {
        var el = els[i];
        el.volume = S.voiceVolume;
        if (S.vvSpeakerDeviceId && el.setSinkId && el.__shuSinkId !== S.vvSpeakerDeviceId) {
          el.__shuSinkId = S.vvSpeakerDeviceId;
          el.setSinkId(S.vvSpeakerDeviceId).catch(function () {});
        }
      }
    } catch (e) {
      /* ignore */
    }
  }
  try {
    var mo = new MutationObserver(applyOutput);
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {
    /* ignore */
  }
  setInterval(applyOutput, 2000);

  /* ---- privacy: block the camera ONLY during the initial auto-join probe -----
     Element Call turns the camera on when it first loads (the webcam light comes
     on / video gets published) even though ShuChat joins muted. But we must NOT
     block the camera forever, or the user could never enable video. So: strip
     the `video` constraint from getUserMedia for a short window right after the
     shim loads (the join probe), then allow it — a later getUserMedia({video})
     is a deliberate click on the camera button. */
  var SHIM_LOADED_AT = Date.now();
  var JOIN_CAMERA_BLOCK_MS = 8000; // block auto-camera for the first 8s after load
  var userEnabledVideo = false; // once the user clicks the camera button, always allow

  // Any real user interaction after the join window = intent; a video request
  // after that is the user enabling their camera, so stop blocking.
  function markInteraction() {
    if (Date.now() - SHIM_LOADED_AT > 1500) userEnabledVideo = true;
  }
  document.addEventListener('click', markInteraction, true);
  document.addEventListener('keydown', markInteraction, true);

  function shouldBlockCamera() {
    if (userEnabledVideo) return false;
    return Date.now() - SHIM_LOADED_AT < JOIN_CAMERA_BLOCK_MS;
  }

  /* ---- input: device + constraints + optional gain/gate processing ---- */
  var realGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  function processStream(stream) {
    var audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return stream;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    var ctx = new Ctx();
    var src = ctx.createMediaStreamSource(new MediaStream([audioTracks[0]]));
    var gain = ctx.createGain();
    gain.gain.value = S.vvMicGain;
    var analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    var gate = ctx.createGain();
    gate.gain.value = 1;
    var dest = ctx.createMediaStreamDestination();
    src.connect(gain);
    gain.connect(analyser);
    analyser.connect(gate);
    gate.connect(dest);

    var buf = new Float32Array(analyser.fftSize);
    var lastLoud = Date.now();
    var timer = setInterval(function () {
      try {
        if (S.vvAutoSensitivity || S.vvSensitivity <= -99) {
          gate.gain.setTargetAtTime(1, ctx.currentTime, 0.02);
          return;
        }
        analyser.getFloatTimeDomainData(buf);
        var sum = 0;
        for (var i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i];
        var rms = Math.sqrt(sum / buf.length);
        var db = rms > 0 ? 20 * Math.log10(rms) : -100;
        if (db >= S.vvSensitivity) lastLoud = Date.now();
        var open = Date.now() - lastLoud < 400; // 400ms hang-over so words aren't clipped
        gate.gain.setTargetAtTime(open ? 1 : 0, ctx.currentTime, 0.02);
      } catch (e) {
        /* ignore */
      }
    }, 50);

    if (ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
      var resume = function () {
        ctx.resume().catch(function () {});
        document.removeEventListener('click', resume);
        document.removeEventListener('keydown', resume);
      };
      document.addEventListener('click', resume);
      document.addEventListener('keydown', resume);
    }

    var out = dest.stream.getAudioTracks()[0];
    var chain = { gain: gain, gate: gate };
    chains.push(chain);

    // tie the raw track's lifecycle to the processed one
    var realStop = out.stop.bind(out);
    out.stop = function () {
      try {
        audioTracks[0].stop();
      } catch (e) {
        /* ignore */
      }
      clearInterval(timer);
      var idx = chains.indexOf(chain);
      if (idx >= 0) chains.splice(idx, 1);
      try {
        ctx.close();
      } catch (e) {
        /* ignore */
      }
      realStop();
    };
    audioTracks[0].addEventListener('ended', function () {
      try {
        out.stop();
      } catch (e) {
        /* ignore */
      }
    });

    return new MediaStream(stream.getVideoTracks().concat([out]));
  }

  navigator.mediaDevices.getUserMedia = function (constraints) {
    var wantAudio = false;
    try {
      // Strip the camera during the initial auto-join probe only (privacy).
      if (constraints && constraints.video && shouldBlockCamera()) {
        constraints = Object.assign({}, constraints, { video: false });
      }
      if (constraints && constraints.audio) {
        wantAudio = true;
        S = readSettings();
        var a = constraints.audio === true ? {} : Object.assign({}, constraints.audio);
        var cur = a.deviceId;
        if (cur && typeof cur === 'object') cur = cur.ideal || cur.exact;
        // Prefer the ShuChat-selected mic unless Element Call asks for a
        // specific device (in-call device switch) other than 'default'.
        if (S.vvMicDeviceId && (!cur || cur === 'default')) {
          a.deviceId = { ideal: S.vvMicDeviceId };
        }
        a.noiseSuppression = S.vvNoiseSuppression;
        a.echoCancellation = S.vvEchoCancellation;
        a.autoGainControl = S.vvAutoGainControl;
        constraints = Object.assign({}, constraints, { audio: a });
      }
    } catch (e) {
      /* fall through with original constraints */
    }
    var p = realGUM(constraints);
    if (!wantAudio) return p;
    return p.then(function (stream) {
      // Only insert a WebAudio chain when it actually does something —
      // the default path stays 100% untouched browser audio.
      var needChain = S.vvMicGain !== 1 || (!S.vvAutoSensitivity && S.vvSensitivity > -99);
      if (!needChain) return stream;
      try {
        return processStream(stream);
      } catch (e) {
        return stream;
      }
    });
  };
})();
