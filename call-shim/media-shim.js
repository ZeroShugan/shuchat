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
