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
      vvMicChannels: 'mono',
      vvRnnoise: false,
      vvCamDeviceId: '',
      vvStreamResolution: '1080p',
      vvStreamFps: 30,
      vvStreamMaxKbps: 5000,
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
        // ShuChat marks per-participant volume factors on the elements
        // (CallControl.applyUserVolumes) — honor them here too.
        var f = typeof el.__shuUserVol === 'number' ? el.__shuUserVol : 1;
        el.volume = Math.max(0, Math.min(1, S.voiceVolume * f));
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

  /* ---- privacy: the camera is allowed ONLY when the user explicitly enabled it
     Element Call restores its last camera state on join and will turn the webcam
     on by itself even though ShuChat joins muted. ShuChat's call control writes a
     shared localStorage flag ('shuchat-cam-allow') — '1' only after the user
     presses the video button, '0'/missing otherwise. We strip the `video`
     constraint from getUserMedia unless that flag says the user asked for it, so
     the camera can never self-activate but the video button still works. */
  function shouldBlockCamera() {
    try {
      return localStorage.getItem('shuchat-cam-allow') !== '1';
    } catch (e) {
      return true; // fail safe: block
    }
  }

  /* ---- screenshare capture hook -----------------------------------------
     Expose the local screen-share MediaStream to the parent app (same origin)
     so ShuChat can render a floating preview / pop-out of the user's own
     stream. window.__shuScreenShare holds the live stream; a 'shu-screenshare'
     CustomEvent fires on start ({active:true}) and end ({active:false}). */
  /* Stream quality (Commet-style): apply the user's resolution/FPS constraints
     to the captured track, and cap the encoder bitrate/framerate on the
     RTCRtpSender that publishes it (found via the __rtcPCs the EC bundle
     exposes). Bitrate/FPS re-apply live on settings changes. */
  var STREAM_RES = { '720p': 720, '1080p': 1080, '1440p': 1440 };

  function applyStreamQuality(stream) {
    S = readSettings();
    var track = stream.getVideoTracks()[0];
    if (!track) return;
    try {
      var c = { frameRate: S.vvStreamFps };
      var h = STREAM_RES[S.vvStreamResolution];
      if (h) {
        c.height = { max: h };
        c.width = { max: Math.round((h * 16) / 9) };
      }
      track.applyConstraints(c).catch(function () {});
    } catch (e) {
      /* ignore */
    }
    applySenderCaps(track, 40); // retry while EC attaches the sender
  }

  function applySenderCaps(track, tries) {
    var applied = false;
    try {
      var pcs = window.__rtcPCs || [];
      for (var i = 0; i < pcs.length; i += 1) {
        var senders = pcs[i].getSenders ? pcs[i].getSenders() : [];
        for (var j = 0; j < senders.length; j += 1) {
          var sender = senders[j];
          if (sender.track === track) {
            var params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            for (var k = 0; k < params.encodings.length; k += 1) {
              params.encodings[k].maxBitrate = S.vvStreamMaxKbps * 1000;
              params.encodings[k].maxFramerate = S.vvStreamFps;
            }
            sender.setParameters(params).catch(function () {});
            applied = true;
          }
        }
      }
    } catch (e) {
      /* ignore */
    }
    if (!applied && tries > 0 && track.readyState === 'live') {
      setTimeout(function () {
        applySenderCaps(track, tries - 1);
      }, 500);
    }
  }

  // Live-update the encoder caps when the sliders change in ShuChat settings.
  window.addEventListener('storage', function (ev) {
    if (ev.key !== 'settings') return;
    S = readSettings();
    var share = window.__shuScreenShare;
    if (share) {
      var t = share.getVideoTracks()[0];
      if (t) {
        try {
          t.applyConstraints({ frameRate: S.vvStreamFps }).catch(function () {});
        } catch (e) {
          /* ignore */
        }
        applySenderCaps(t, 1);
      }
    }
  });

  var capturingExtra = false; // true while __shuShareAnother owns the capture

  if (navigator.mediaDevices.getDisplayMedia) {
    var realGDM = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = function (constraints) {
      return realGDM(constraints).then(function (stream) {
        try {
          applyStreamQuality(stream);
          if (!capturingExtra) {
            window.__shuScreenShare = stream;
            window.dispatchEvent(new CustomEvent('shu-screenshare', { detail: { active: true } }));
            var clear = function () {
              if (window.__shuScreenShare === stream) {
                window.__shuScreenShare = null;
                window.dispatchEvent(
                  new CustomEvent('shu-screenshare', { detail: { active: false } })
                );
              }
            };
            stream.getTracks().forEach(function (t) {
              t.addEventListener('ended', clear);
            });
            stream.addEventListener('inactive', clear);
          }
        } catch (e) {
          /* never break the share because of the preview hook */
        }
        return stream;
      });
    };
  }

  /* ---- multi-stream: publish EXTRA screen shares via the LiveKit room ------
     The vite build tags the LiveKit Room instance as window.__shuLKRoom (Room
     constructor patch). Each extra share is its own capture published as an
     additional LiveKit track (Commet's technique) — the protocol carries any
     number of tracks per participant. Diagnostics go to the shared
     localStorage['shuchat-call-log'] ring. */
  function shimLog(msg) {
    try {
      var line = '[' + new Date().toISOString() + '] [shim] ' + msg;
      // eslint-disable-next-line no-console
      console.info('[shuchat-call]', line);
      var prev = localStorage.getItem('shuchat-call-log') || '';
      var lines = (prev + '\n' + line).split('\n').filter(Boolean);
      localStorage.setItem('shuchat-call-log', lines.slice(-80).join('\n'));
    } catch (e) {
      /* ignore */
    }
  }

  var extraShares = []; // [{ stream, tracks }]
  window.__shuExtraShareCount = 0;

  function announceExtraShares() {
    window.__shuExtraShareCount = extraShares.length;
    window.dispatchEvent(
      new CustomEvent('shu-extra-shares', { detail: { count: extraShares.length } })
    );
  }

  function stopExtraShare(entry) {
    var idx = extraShares.indexOf(entry);
    if (idx < 0) return;
    extraShares.splice(idx, 1);
    var room = window.__shuLKRoom;
    entry.tracks.forEach(function (t) {
      try {
        if (room && room.localParticipant) room.localParticipant.unpublishTrack(t, true);
      } catch (e) {
        /* best-effort */
      }
      try {
        t.stop();
      } catch (e) {
        /* ignore */
      }
    });
    try {
      entry.stream.getTracks().forEach(function (t) {
        t.stop();
      });
    } catch (e) {
      /* ignore */
    }
    announceExtraShares();
    shimLog('extra share stopped; remaining=' + extraShares.length);
  }

  window.__shuShareAnother = function () {
    var room = window.__shuLKRoom;
    if (!room || !room.localParticipant) {
      shimLog('shareAnother: LiveKit room not exposed — cannot publish extra stream');
      return Promise.reject(new Error('room not available'));
    }
    capturingExtra = true;
    return navigator.mediaDevices
      .getDisplayMedia({ video: true, audio: true })
      .then(function (stream) {
        capturingExtra = false;
        var vt = stream.getVideoTracks()[0];
        var at = stream.getAudioTracks()[0];
        var entry = { stream: stream, tracks: [] };
        var pubs = [];
        if (vt) {
          entry.tracks.push(vt);
          pubs.push(
            room.localParticipant.publishTrack(vt, { source: 'screen_share', simulcast: false })
          );
        }
        if (at) {
          entry.tracks.push(at);
          pubs.push(room.localParticipant.publishTrack(at, { source: 'screen_share_audio' }));
        }
        return Promise.all(pubs).then(function () {
          extraShares.push(entry);
          announceExtraShares();
          if (vt) {
            applySenderCaps(vt, 40);
            vt.addEventListener('ended', function () {
              stopExtraShare(entry);
            });
          }
          shimLog(
            'extra share published (video=' + !!vt + ' audio=' + !!at + ') total=' +
              extraShares.length
          );
          return true;
        });
      })
      .catch(function (e) {
        capturingExtra = false;
        shimLog('shareAnother failed: ' + (e && e.message ? e.message : e));
        throw e;
      });
  };

  window.__shuStopExtraShares = function () {
    extraShares.slice().forEach(stopExtraShare);
  };

  /* ---- ShuChat Stream Grid state ------------------------------------------
     The parent app renders its OWN Discord-style grid (Element Call's grid
     ignores extra published tracks). This is the data source: a snapshot of
     every participant and every video publication (camera + all screen
     shares), with live MediaStreams the parent can attach directly.
     'shu-grid-update' fires on any roster/track change. */
  // Cache one MediaStream object per track sid so repeated grid snapshots hand
  // back the SAME object — otherwise the parent's <video> re-attaches every
  // poll and the stream flickers (~every 2s locally; not sent to viewers).
  var streamCache = {};
  function streamFor(sid, track) {
    var c = streamCache[sid];
    if (c && c.track === track) return c.stream;
    var s = new MediaStream([track]);
    streamCache[sid] = { track: track, stream: s };
    return s;
  }

  function pubEntries(participant) {
    var vids = [];
    try {
      participant.trackPublications.forEach(function (pub) {
        if (pub.kind !== 'video') return;
        var t = pub.track && pub.track.mediaStreamTrack;
        if (!t || t.readyState !== 'live') return;
        // Cropped own stream: the grid shows what viewers see (canvas track).
        var crop = crops[pub.trackSid];
        if (crop && crop.canvasTrack && crop.canvasTrack.readyState === 'live') {
          t = crop.canvasTrack;
        }
        vids.push({
          sid: pub.trackSid,
          source: pub.source, // 'camera' | 'screen_share'
          stream: streamFor(pub.trackSid, t),
        });
      });
    } catch (e) {
      /* ignore */
    }
    return vids;
  }

  window.__shuGetGrid = function () {
    var room = window.__shuLKRoom;
    if (!room || !room.localParticipant) return null;
    var out = [];
    try {
      out.push({
        identity: room.localParticipant.identity,
        isLocal: true,
        isSpeaking: !!room.localParticipant.isSpeaking,
        videos: pubEntries(room.localParticipant),
      });
      room.remoteParticipants.forEach(function (p) {
        out.push({
          identity: p.identity,
          isLocal: false,
          isSpeaking: !!p.isSpeaking,
          videos: pubEntries(p),
        });
      });
    } catch (e) {
      shimLog('__shuGetGrid failed: ' + (e && e.message ? e.message : e));
      return null;
    }
    return out;
  };

  /** Stop ONE of our own streams by track sid (grid tile right-click). */
  window.__shuStopStreamBySid = function (sid) {
    var room = window.__shuLKRoom;
    if (!room || !room.localParticipant) return;
    // Extra share? Stop just that entry.
    for (var i = 0; i < extraShares.length; i += 1) {
      var tracks = extraShares[i].tracks;
      var match = false;
      try {
        room.localParticipant.trackPublications.forEach(function (pub) {
          if (pub.trackSid === sid && pub.track && tracks.indexOf(pub.track.mediaStreamTrack) >= 0)
            match = true;
        });
      } catch (e) {
        /* ignore */
      }
      if (match) {
        stopExtraShare(extraShares[i]);
        return;
      }
    }
    // Otherwise it's the primary EC-managed share → toggle it off via the
    // parent (EC owns its lifecycle); signal with an event the parent handles.
    window.dispatchEvent(new CustomEvent('shu-stop-primary-share'));
  };

  function gridChanged() {
    window.dispatchEvent(new CustomEvent('shu-grid-update'));
  }

  /* ---- Crop (region) engine -----------------------------------------------
     Crops one of OUR outgoing video streams to a sub-rectangle: the original
     track plays into a hidden <video>, a canvas draws only the chosen region,
     and canvas.captureStream()'s track replaces the outgoing track on every
     RTCRtpSender (via __rtcPCs). Live-adjustable, reversible, per-stream.
     Rect is in SOURCE pixels: {x, y, w, h}. */
  var crops = {}; // sid -> {origTrack, canvasTrack, video, canvas, ctx, timer, rect}

  function findLocalVideoPub(sid) {
    var room = window.__shuLKRoom;
    if (!room || !room.localParticipant) return null;
    var found = null;
    try {
      room.localParticipant.trackPublications.forEach(function (pub) {
        if (pub.trackSid === sid && pub.kind === 'video') found = pub;
      });
    } catch (e) {
      /* ignore */
    }
    return found;
  }

  function replaceOutgoingTrack(fromTrack, toTrack) {
    var pcs = window.__rtcPCs || [];
    var done = 0;
    for (var i = 0; i < pcs.length; i += 1) {
      try {
        var senders = pcs[i].getSenders();
        for (var j = 0; j < senders.length; j += 1) {
          if (senders[j].track === fromTrack) {
            senders[j].replaceTrack(toTrack);
            done += 1;
          }
        }
      } catch (e) {
        /* pc may be closed */
      }
    }
    return done;
  }

  function clampCropRect(rect, vw, vh) {
    var x = Math.max(0, Math.min(vw - 16, Math.round(rect.x)));
    var y = Math.max(0, Math.min(vh - 16, Math.round(rect.y)));
    var w = Math.max(16, Math.min(vw - x, Math.round(rect.w)));
    var h = Math.max(16, Math.min(vh - y, Math.round(rect.h)));
    // even dimensions keep encoders happy
    return { x: x, y: y, w: w - (w % 2), h: h - (h % 2) };
  }

  function drawCropFrame(c) {
    var vw = c.video.videoWidth;
    var vh = c.video.videoHeight;
    if (!vw || !vh) return;
    var r = clampCropRect(c.rect, vw, vh);
    if (c.canvas.width !== r.w) c.canvas.width = r.w;
    if (c.canvas.height !== r.h) c.canvas.height = r.h;
    try {
      c.ctx.drawImage(c.video, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    } catch (e) {
      /* video not ready */
    }
  }

  /** Full ORIGINAL stream for a local sid (for the crop editor preview). */
  window.__shuGetOriginal = function (sid) {
    var c = crops[sid];
    if (c && c.origTrack.readyState === 'live') return new MediaStream([c.origTrack]);
    var pub = findLocalVideoPub(sid);
    var t = pub && pub.track && pub.track.mediaStreamTrack;
    return t && t.readyState === 'live' ? new MediaStream([t]) : null;
  };

  /** Current crop rect (source px) or null. */
  window.__shuGetCrop = function (sid) {
    var c = crops[sid];
    return c ? { x: c.rect.x, y: c.rect.y, w: c.rect.w, h: c.rect.h } : null;
  };

  window.__shuSetCrop = function (sid, rect) {
    try {
      var existing = crops[sid];
      if (existing) {
        existing.rect = rect; // draw loop picks it up next frame
        shimLog('crop updated on ' + sid + ': ' + JSON.stringify(rect));
        return true;
      }
      var pub = findLocalVideoPub(sid);
      var origTrack = pub && pub.track && pub.track.mediaStreamTrack;
      if (!origTrack || origTrack.readyState !== 'live') {
        shimLog('crop: no live local track for sid ' + sid);
        return false;
      }
      var video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = new MediaStream([origTrack]);
      video.play().catch(function () {});
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(16, Math.round(rect.w));
      canvas.height = Math.max(16, Math.round(rect.h));
      var ctx = canvas.getContext('2d');
      var fps = 30;
      try {
        fps = Math.round(origTrack.getSettings().frameRate) || 30;
      } catch (e) {
        /* default */
      }
      var c = { origTrack: origTrack, video: video, canvas: canvas, ctx: ctx, rect: rect, fps: fps };
      var cs = canvas.captureStream(fps);
      c.canvasTrack = cs.getVideoTracks()[0];
      c.timer = setInterval(function () {
        drawCropFrame(c);
      }, Math.max(Math.floor(1000 / fps), 16));
      var n = replaceOutgoingTrack(origTrack, c.canvasTrack);
      crops[sid] = c;
      origTrack.addEventListener('ended', function () {
        window.__shuClearCrop(sid);
      });
      shimLog('crop set on ' + sid + ' ' + JSON.stringify(rect) + ' (senders replaced: ' + n + ')');
      gridChanged();
      return true;
    } catch (e) {
      shimLog('crop failed: ' + (e && e.message ? e.message : e));
      return false;
    }
  };

  window.__shuClearCrop = function (sid) {
    var c = crops[sid];
    if (!c) return;
    delete crops[sid];
    try {
      clearInterval(c.timer);
    } catch (e) {
      /* ignore */
    }
    try {
      if (c.origTrack.readyState === 'live') replaceOutgoingTrack(c.canvasTrack, c.origTrack);
    } catch (e) {
      /* ignore */
    }
    try {
      c.canvasTrack.stop();
    } catch (e) {
      /* ignore */
    }
    try {
      c.video.srcObject = null;
    } catch (e) {
      /* ignore */
    }
    shimLog('crop cleared on ' + sid);
    gridChanged();
  };

  function wireGridEvents(room) {
    var evs = [
      'participantConnected',
      'participantDisconnected',
      'trackSubscribed',
      'trackUnsubscribed',
      'trackPublished',
      'trackUnpublished',
      'localTrackPublished',
      'localTrackUnpublished',
      'activeSpeakersChanged',
    ];
    evs.forEach(function (ev) {
      try {
        room.on(ev, gridChanged);
      } catch (e) {
        /* ignore */
      }
    });
    // Make sure we SUBSCRIBE to every remote video (extra multi-streams may
    // not be auto-subscribed by EC's selective subscription).
    var ensureSubs = function () {
      try {
        room.remoteParticipants.forEach(function (p) {
          p.trackPublications.forEach(function (pub) {
            if (pub.kind === 'video' && !pub.isSubscribed && pub.setSubscribed) {
              pub.setSubscribed(true);
            }
          });
        });
      } catch (e) {
        /* ignore */
      }
    };
    room.on('trackPublished', ensureSubs);
    setInterval(ensureSubs, 3000);
    ensureSubs();
  }

  // Join diagnostic: report whether the Room-expose bundle patch worked.
  var roomCheck = setInterval(function () {
    if (window.__shuLKRoom) {
      shimLog('LiveKit room exposed OK (multi-stream available)');
      wireGridEvents(window.__shuLKRoom);
      gridChanged();
      clearInterval(roomCheck);
      roomCheck = null;
    }
  }, 1000);
  setTimeout(function () {
    if (roomCheck) {
      clearInterval(roomCheck);
      if (!window.__shuLKRoom) {
        shimLog('LiveKit room NOT exposed after 30s — bundle anchor missed (EC update?)');
      }
    }
  }, 30000);

  /* ---- RNNoise (neural noise suppression, SOC-scanned @jitsi/rnnoise-wasm) --
     Vendored single-file sync build (wasm inlined) served next to this shim.
     Loaded lazily only when the setting is on. Denoiser sits between gain and
     analyser so the noise gate thresholds see the CLEANED signal. RNNoise
     needs 48 kHz / 480-sample frames — on any other context rate it becomes a
     transparent passthrough (logged once). */
  var rnnoiseModPromise = null;
  function loadRnnoise() {
    if (rnnoiseModPromise) return rnnoiseModPromise;
    rnnoiseModPromise = new Promise(function (resolve) {
      try {
        var s = document.createElement('script');
        s.src = 'rnnoise-sync.js'; // same dir as media-shim.js in the EC dist
        s.onload = function () {
          try {
            window.createRNNWasmModuleSync().then(
              function (m) { shimLog('RNNoise wasm ready'); resolve(m); },
              function (e) { shimLog('rnnoise init rejected: ' + e); resolve(null); }
            );
          } catch (e) {
            shimLog('rnnoise factory failed: ' + (e && e.message ? e.message : e));
            resolve(null);
          }
        };
        s.onerror = function () { shimLog('rnnoise-sync.js failed to load'); resolve(null); };
        document.head.appendChild(s);
      } catch (e) {
        resolve(null);
      }
    });
    return rnnoiseModPromise;
  }

  var FRAME = 480; // RNNoise frame size @48kHz
  function makeDenoiser(ctx) {
    // ScriptProcessor(512) on the iframe main thread: universally supported in
    // our Electron/Chromium target, ~10ms added latency from frame re-blocking.
    var node = ctx.createScriptProcessor(512, 1, 1);
    var st = {
      mod: null, state: 0, pIn: 0, pOut: 0,
      inBuf: new Float32Array(8192), inLen: 0,
      outBuf: new Float32Array(8192), outLen: 0,
      warnedRate: false,
    };
    loadRnnoise().then(function (m) {
      if (!m) return;
      try {
        st.state = m._rnnoise_create();
        st.pIn = m._malloc(FRAME * 4);
        st.pOut = m._malloc(FRAME * 4);
        st.mod = m;
        shimLog('RNNoise denoiser active (ctx ' + ctx.sampleRate + 'Hz)');
      } catch (e) {
        shimLog('rnnoise state init failed: ' + (e && e.message ? e.message : e));
        st.mod = null;
      }
    });
    node.onaudioprocess = function (ev) {
      var input = ev.inputBuffer.getChannelData(0);
      var output = ev.outputBuffer.getChannelData(0);
      var m = st.mod;
      if (!m || ctx.sampleRate !== 48000) {
        if (!st.warnedRate && m && ctx.sampleRate !== 48000) {
          st.warnedRate = true;
          shimLog('RNNoise passthrough: context rate ' + ctx.sampleRate + ' != 48000');
        }
        output.set(input);
        return;
      }
      // enqueue input
      if (st.inLen + input.length <= st.inBuf.length) {
        st.inBuf.set(input, st.inLen);
        st.inLen += input.length;
      }
      // process whole 480-sample frames (RNNoise expects int16-range floats)
      while (st.inLen >= FRAME) {
        var H = m.HEAPF32; // re-read: heap can be replaced on memory growth
        var bIn = st.pIn >> 2;
        for (var i = 0; i < FRAME; i += 1) H[bIn + i] = st.inBuf[i] * 32768;
        try {
          m._rnnoise_process_frame(st.state, st.pOut, st.pIn);
        } catch (e) {
          st.mod = null; // hard failure → permanent passthrough
          shimLog('rnnoise frame error, disabling: ' + (e && e.message ? e.message : e));
          break;
        }
        H = m.HEAPF32;
        var bOut = st.pOut >> 2;
        if (st.outLen + FRAME <= st.outBuf.length) {
          for (var j = 0; j < FRAME; j += 1) st.outBuf[st.outLen + j] = H[bOut + j] / 32768;
          st.outLen += FRAME;
        }
        st.inBuf.copyWithin(0, FRAME, st.inLen);
        st.inLen -= FRAME;
      }
      // dequeue to output; zero-fill during the initial ~10ms priming
      var n = Math.min(output.length, st.outLen);
      for (var k = 0; k < n; k += 1) output[k] = st.outBuf[k];
      for (var z = n; z < output.length; z += 1) output[z] = 0;
      if (n > 0) {
        st.outBuf.copyWithin(0, n, st.outLen);
        st.outLen -= n;
      }
    };
    node.__shuCleanup = function () {
      try {
        if (st.mod) {
          st.mod._free(st.pIn);
          st.mod._free(st.pOut);
          st.mod._rnnoise_destroy(st.state);
        }
      } catch (e) {
        /* ignore */
      }
      st.mod = null;
    };
    return node;
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
    var denoise = null;
    if (S.vvRnnoise) {
      try {
        denoise = makeDenoiser(ctx);
      } catch (e) {
        shimLog('denoiser create failed: ' + (e && e.message ? e.message : e));
        denoise = null;
      }
    }
    src.connect(gain);
    if (denoise) {
      gain.connect(denoise);
      denoise.connect(analyser);
    } else {
      gain.connect(analyser);
    }
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
      if (denoise && denoise.__shuCleanup) denoise.__shuCleanup();
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
      } else if (constraints && constraints.video && S.vvCamDeviceId) {
        // Camera allowed → prefer the ShuChat-selected camera device.
        var vc = constraints.video === true ? {} : Object.assign({}, constraints.video);
        if (!vc.deviceId) vc.deviceId = { ideal: S.vvCamDeviceId };
        constraints = Object.assign({}, constraints, { video: vc });
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
        // RNNoise replaces the browser's built-in NS (both at once = artifacts)
        a.noiseSuppression = S.vvRnnoise ? false : S.vvNoiseSuppression;
        a.echoCancellation = S.vvEchoCancellation;
        a.autoGainControl = S.vvAutoGainControl;
        // Mic channels: 'mono' (default) downmixes multi-channel devices to a
        // single channel so listeners hear you equally in BOTH ears — Element
        // Call auto-publishes STEREO whenever the track has 2 channels, which
        // is the "voice only in one ear" bug for mics that expose 2 channels
        // with signal on one. 'stereo' opts back into true 2-channel publish.
        a.channelCount = S.vvMicChannels === 'stereo' ? { ideal: 2 } : { ideal: 1 };
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
