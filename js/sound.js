// Zvuky přes WebAudio ve stylu beeperu (čtvercová vlna).
(function (root) {
    'use strict';

    var FB = root.FB = root.FB || {};
    var ac = null, muted = false, tuneTimer = null, tuneStep = 0;

    try {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (AC) { ac = new AC(); }
    } catch (e) { ac = null; }

    function unlock() {
        if (ac && ac.state === 'suspended') { try { ac.resume(); } catch (e) { /* ignorovat */ } }
    }

    function beep(freq, dur, slideTo, vol, delay) {
        if (!ac || muted) { return; }
        try {
            var t0 = ac.currentTime + (delay || 0);
            var o = ac.createOscillator(), g = ac.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(freq, t0);
            if (slideTo) { o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur); }
            g.gain.setValueAtTime(vol || 0.04, t0);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            o.connect(g); g.connect(ac.destination);
            o.start(t0); o.stop(t0 + dur + 0.02);
        } catch (e) { /* ignorovat */ }
    }

    var TUNE = [
        392, 0, 392, 523, 0, 523, 659, 0, 587, 523, 0, 440, 392, 0, 0, 0,
        330, 0, 330, 440, 0, 440, 523, 0, 494, 440, 0, 392, 330, 0, 0, 0
    ];
    var BASS = [131, 0, 0, 0, 131, 0, 0, 0, 131, 0, 0, 0, 98, 0, 0, 0, 110, 0, 0, 0, 110, 0, 0, 0, 98, 0, 0, 0, 131, 0, 0, 0];

    var EV = {
        kick: function () { beep(180, 0.05, 90, 0.05); },
        shot: function () { beep(260, 0.12, 70, 0.06); },
        head: function () { beep(300, 0.06, 150, 0.05); },
        bounce: function () { beep(120, 0.03, 80, 0.025); },
        post: function () { beep(1500, 0.18, 900, 0.05); },
        save: function () { beep(200, 0.1, 100, 0.05); beep(300, 0.08, 0, 0.04, 0.05); },
        tackle: function () { beep(110, 0.08, 60, 0.05); },
        slide: function () { beep(500, 0.15, 150, 0.025); },
        whistle: function () { beep(2300, 0.14, 0, 0.04); beep(2000, 0.2, 0, 0.04, 0.15); },
        goal: function () { [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { beep(f, 0.12, 0, 0.05, i * 0.11); }); },
        win: function () { [523, 659, 784, 659, 784, 1047, 1047].forEach(function (f, i) { beep(f, 0.14, 0, 0.05, i * 0.13); }); },
        over: function () { [392, 330, 262, 196].forEach(function (f, i) { beep(f, 0.25, 0, 0.05, i * 0.22); }); },
        menu: function () { beep(880, 0.05, 0, 0.04); },
        tick: function () { beep(1800, 0.02, 0, 0.02); }
    };

    FB.sound = {
        unlock: unlock,
        toggleMute: function () { muted = !muted; if (muted) { FB.sound.stopTune(); } return muted; },
        isMuted: function () { return muted; },
        play: function (name) { if (EV[name]) { EV[name](); } },
        startTune: function () {
            if (tuneTimer || !ac) { return; }
            tuneTimer = setInterval(function () {
                var n = TUNE[tuneStep % TUNE.length], b = BASS[tuneStep % BASS.length];
                if (n) { beep(n, 0.12, 0, 0.03); }
                if (b) { beep(b, 0.3, 0, 0.03); }
                tuneStep++;
            }, 140);
        },
        stopTune: function () { if (tuneTimer) { clearInterval(tuneTimer); tuneTimer = null; } tuneStep = 0; }
    };
})(typeof window !== 'undefined' ? window : globalThis);
