// Headless test v Node: načte skutečné skripty s atrapou DOM, bot hraje turnaj, kontroluje NaN a přechody stavů.
'use strict';
var fs = require('fs');
var path = require('path');
var png = require('./png.js');
var root = path.join(__dirname, '..');
var outDir = process.argv[2] || null;

var ctxStub = {
    createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData: function (img) { ctxStub.last = img; }
};
var listeners = {};
var canvasStub = { getContext: function () { return ctxStub; }, addEventListener: function () { }, style: {} };
global.window = global;
global.innerWidth = 1024; global.innerHeight = 768;
global.matchMedia = function () { return { matches: false }; };
global.addEventListener = function () { };
global.document = {
    getElementById: function () { return canvasStub; },
    querySelectorAll: function () { return []; },
    addEventListener: function (t, f) { (listeners[t] = listeners[t] || []).push(f); },
    body: { style: {} }, hidden: false
};
global.localStorage = { _d: {}, getItem: function (k) { return this._d[k] || null; }, setItem: function (k, v) { this._d[k] = v; } };
global.requestAnimationFrame = function () { };
global.setInterval = function () { return 0; };
global.clearInterval = function () { };

['font', 'gfx', 'sprites', 'sound', 'sim', 'pens', 'main'].forEach(function (f) {
    require(path.join(root, 'js', f + '.js'));
});
var FB = global.FB, G = FB.game, S = FB.Sim;
var fails = 0;
function check(c, msg) { if (!c) { console.log('  CHYBA: ' + msg); fails++; } }
function key(code, type) { (listeners[type || 'keydown'] || []).forEach(function (f) { f({ code: code, repeat: false, preventDefault: function () { } }); }); }

function snap(name) {
    if (!outDir) { return; }
    G._draw();
    png.write(path.join(outDir, name + '.png'), ctxStub.last.data, 256, 192, 3);
}

function finite(m) {
    var b = m.ball;
    if (![b.x, b.y, b.z, b.vx, b.vy, b.vz, m.cam].every(isFinite)) { return false; }
    return m.pl.every(function (p) { return [p.x, p.y, p.vx, p.vy, p.fx, p.fy].every(isFinite); });
}

// ---- bot ----
var botS = { charge: 0, target: 0 };
function bot(m) {
    var t = 0, tm = m.team[0], inp = { dx: 0, dy: 0, kick: false, slide: false }, b = m.ball;
    if (tm.ctl < 0) { return inp; }
    var p = m.pl[tm.ctl], dir = tm.dir, gx = dir > 0 ? S.PL : 0;
    if (m.phase === 'sp') {
        if (m.sp.team === 0 && m.sp.t > 14 && m.sp.t % 2 === 0) { inp.kick = false; botS.charge = 0; return (m.sp.t % 4 === 0) ? inp : inp; }
        if (m.sp.team === 0 && m.sp.t > 12) { inp.kick = (m.sp.t % 4) === 1; }
        if (m.sp.team === 0) { inp.dx = dir; }
        return inp;
    }
    if (b.owner === p.id) {
        var dgx = Math.abs(gx - p.x);
        var ty = 55;
        if (dgx < 150 && Math.abs(p.y - 55) < 22) {
            // zamířit na branku a vystřelit
            inp.dx = dir; inp.dy = 0;
            if (botS.charge < 22) { inp.kick = true; botS.charge++; } else { botS.charge = 0; inp.kick = false; }
            return inp;
        }
        botS.charge = 0;
        inp.dx = dir; inp.dy = p.y < ty - 4 ? 1 : (p.y > ty + 4 ? -1 : 0);
        if (dgx > 150) { inp.dy = p.y < 55 ? 0.6 : -0.6; inp.dy = 0; }
        return inp;
    }
    botS.charge = 0;
    var tx = b.x + b.vx * 6, tyy = b.y + b.vy * 6;
    var ddx = tx - p.x, ddy = tyy - p.y;
    inp.dx = Math.abs(ddx) > 2 ? Math.sign(ddx) : 0; inp.dy = Math.abs(ddy) > 2 ? Math.sign(ddy) : 0;
    if (b.owner >= 0 && m.pl[b.owner].team === 1 && Math.hypot(b.x - p.x, b.y - p.y) < 13 && m.frame % 40 === 0) { inp.slide = true; }
    return inp;
}

function botPens(P) {
    var kt = P.turn, inp = { dx: 0, dy: 0, kick: false };
    if (P.phase !== 'aim') { return inp; }
    if (P.human[kt]) {
        inp.dx = P.cx < 100 ? 1 : (P.cx > 156 ? -1 : (P.t % 60 < 30 ? 1 : -1));
        inp.dy = P.cy > 90 ? -1 : 1;
        inp.kick = P.t > 40 && P.t < 70;
    }
    return inp;
}

var minut = 0;
var snapDone = {};
function snapOnce(name, cond) { if (outDir && cond && !snapDone[name]) { snapDone[name] = 1; snap(name); } }
function runTournament(seedBase, log) {
    snapOnce('01-title', true);
    // title -> intro
    check(G._get().state === 'title', 'start v titulní obrazovce');
    G._setMode(1);
    var matches = [];
    G._press();
    var guard = 0;
    for (guard = 0; guard < 4000000; guard++) {
        var g = G._get();
        snapOnce('02-intro', g.state === 'intro' && guard % 7 === 0);
        if (g.state === 'intro') { G._press(); g = G._get(); }
        if (g.state === 'play') {
            if (!g.m.__seeded) { g.m.__seeded = 1; }
            var mm = g.m;
            snapOnce('03-kickoff', mm.phase === 'sp' && mm.sp.type === 'kickoff' && mm.sp.t > 20);
            snapOnce('04-live', mm.phase === 'live' && mm.t === 700);
            snapOnce('05-live2', mm.phase === 'live' && mm.t === 1500 && mm.ball.z > 3);
            snapOnce('06-goal', mm.phase === 'goal' && mm.pt === 100);
            snapOnce('07-throw', mm.phase === 'sp' && mm.sp.type === 'throw' && mm.sp.t === 30);
            snapOnce('08-corner', mm.phase === 'sp' && mm.sp.type === 'corner' && mm.sp.t === 30);
            snapOnce('09-half', mm.phase === 'half' && G._get().state === 'play');
            snapOnce('10-goalkick', mm.phase === 'sp' && mm.sp.type === 'goalkick' && mm.sp.t === 30);
            var inp0 = bot(g.m);
            G._setInput([inp0, {}]);
            if (!finite(g.m)) { check(false, 'NaN/Inf v zápase'); return matches; }
        } else if (g.state === 'pens') {
            snapOnce('11-pens', g.pens.phase === 'aim' && g.pens.t === 30);
            snapOnce('12-pens-fly', g.pens.phase === 'fly' && g.pens.t === 20);
            G._setInput([botPens(g.pens), {}]);
        } else if (g.state === 'result') {
            snapOnce('13-result', true);
            matches.push({ stage: g.stage, a: g.result.a, b: g.result.b, shots: g.result.shots.slice() });
            G._press();
        } else if (g.state === 'over' || g.state === 'win') {
            snapOnce('14-end', true);
            matches.push({ end: g.state, stage: g.stage });
            break;
        } else { G._setInput(null); }
        G._tick();
        if (guard % 50 === 0) { G._draw(); }
    }
    return matches;
}

// 1) stavy: title -> intro -> play -> result -> ... -> dying -> over
console.log('Turnaj s botem:');
var res = runTournament(1);
res.forEach(function (r) { console.log('  ', JSON.stringify(r)); });
var st = G._get();
console.log('  konec stavu:', st.state, 'bilance', JSON.stringify(st.rec));
check(res.filter(function (r) { return r.a !== undefined; }).length >= 2, 'odehráno alespoň 2 zápasy');
check(res.length && (res[res.length - 1].end === 'over' || res[res.length - 1].end === 'win'), 'turnaj skončil over/win');
var wins = res.filter(function (r) { return r.a !== undefined && r.a > r.b; }).length;
console.log('  výher v regulérní době:', wins);


// 2) penalty: 1P i 2P, bot zvládne dokončit rozstřel
function penTest(md) {
    G._setMode(md);
    G._get().stage; G._startPens();
    var n = 0, P = G._get().pens;
    while (G._get().state === 'pens' && n++ < 200000) {
        var g = G._get();
        snapOnce('11-pens', g.pens.phase === 'aim' && g.pens.t === 30 && md === 1);
        snapOnce('12-pens-fly', g.pens.phase === 'fly' && g.pens.t === 20 && md === 1);
        var ip = botPens(g.pens), rd = Math.floor(Math.random() * 3) - 1;
        var kt = g.pens.turn;
        var inps = [ip, {}];
        if (md === 2) {
            if (kt === 1) { inps = [{ dx: rd, dy: 0 }, { dx: g.pens.t % 50 < 25 ? -1 : 1, dy: (g.pens.t % 70 < 35) ? 1 : -1, kick: g.pens.t > 30 && g.pens.t < 55 }]; }
            else { inps = [ip, { dx: rd, dy: 0 }]; }
        } else if (kt === 1) { inps = [{ dx: rd, dy: 0 }, {}]; }
        G._setInput(inps);
        G._tick();
        if (n % 40 === 0) { G._draw(); }
    }
    check(n < 200000, 'penalty md=' + md + ' skončily');
    console.log('  penalty md=' + md + ': skóre', JSON.stringify(P.score), 'kopů', P.res[0].length + '/' + P.res[1].length, 'stav', G._get().state);
    check(P.done && P.score[0] !== P.score[1], 'penalty mají vítěze');
    G._setInput(null);
    snapOnce('14-end', true);
}
console.log('Penalty:');
G._setStage(0); G._setMode(1);
penTest(1);
G._setMode(2); G._get().state === 'title' || G._press();
penTest(2);

// 3) dva hráči: zápas dohraný náhodným vstupem obou stran, bez NaN, přechody half/end
console.log('2P zápas:');
G._setMode(2);
G._startMatch(12345);
var seen = {}, n2 = 0, bad = false;
while (G._get().state === 'play' && n2++ < 100000) {
    var gm = G._get().m;
    seen[gm.phase] = 1;
    G._setInput([{ dx: Math.round(Math.sin(n2 / 37)), dy: Math.round(Math.cos(n2 / 53)), kick: (n2 % 90) < 20, slide: (n2 % 200) === 0 }, { dx: Math.round(Math.cos(n2 / 41)), dy: Math.round(Math.sin(n2 / 29)), kick: (n2 % 110) < 25, slide: (n2 % 230) === 0 }]);
    G._tick();
    if (!finite(gm)) { bad = true; break; }
    if (n2 === 4000) { G._togglePause(); check(G._get().state === 'paused', 'pauza'); G._draw(); G._togglePause(); check(G._get().state === 'play', 'konec pauzy'); }
}
check(!bad, '2P bez NaN');
console.log('  fáze:', Object.keys(seen).join(','), 'stav', G._get().state, 'skóre', G._get().result && JSON.stringify(G._get().result));
check(seen.half && seen.end && seen.sp && seen.live, 'projity fáze half/end/sp/live');
check(G._get().state === 'result', '2P zápas skončil v result');
G._setInput(null);
G._press();                        // v result -> remíza pens nebo titulní obrazovka
var s2 = G._get().state;
console.log('  po result:', s2);
check(s2 === 'title' || s2 === 'pens', 'po 2P zápase title/pens');

// 4) tlačítka: pauza + zvuk
G._setMode(1);

if (fails) { console.log('SELHÁNÍ:', fails); process.exit(1); } else { console.log('OK'); }
