// Penaltový rozstřel (pohled zepředu, jednoduše): míření šipkami, síla podle držení, brankář skáčou vlevo/střed/vpravo.
(function (root) {
    'use strict';

    var FB = root.FB = root.FB || {};

    var GX0 = 64, GX1 = 192, GY0 = 64, GY1 = 120;
    var INK = [2, 5], GKINK = [6, 3];

    function create(o) {
        var P = {
            mode: o.mode || 1, sk: o.sk || { gkErr: 20, aimErr: 12 }, names: o.names, rng: o.rng || Math.random,
            human: [true, (o.mode || 1) === 2], turn: 0, res: [[], []], score: [0, 0],
            phase: 'aim', t: 0, cx: 128, cy: 92, charge: 0, prevKick: false, aiWait: 80, ev: [],
            tx: 0, ty: 0, zone: 0, gkZone: 0, outcome: '', done: false, winner: -1, kz: 0, hold: 0, sd: false
        };
        P.aiWait = 70 + Math.floor(P.rng() * 50);
        return P;
    }

    function zoneOf(x) { return x < GX0 + (GX1 - GX0) / 3 ? -1 : (x > GX0 + 2 * (GX1 - GX0) / 3 ? 1 : 0); }

    function shoot(P, power, gkDir) {
        var rng = P.rng, err = 2 + power * 9;
        if (!P.human[P.turn]) { err = P.sk.aimErr * 0.6 + 2; }
        var a = rng() * 6.283, r = rng() * err;
        P.tx = P.cx + Math.cos(a) * r; P.ty = P.cy + Math.sin(a) * r * 0.8;
        if (power > 0.95) { P.ty -= 10; }
        P.power = power;
        P.zone = zoneOf(P.tx);
        var keeper = 1 - P.turn;
        if (P.human[keeper]) { P.gkZone = gkDir; }
        else {
            var skill = clampv(0.30 + (30 - P.sk.gkErr) * 0.012, 0.2, 0.6);
            P.gkZone = rng() < skill ? P.zone : Math.floor(rng() * 3) - 1;
        }
        var inside = P.tx > GX0 + 2 && P.tx < GX1 - 2 && P.ty > GY0 + 2 && P.ty < GY1;
        var post = !inside && P.tx > GX0 - 4 && P.tx < GX1 + 4 && P.ty > GY0 - 4 && P.ty < GY1 && (P.tx < GX0 + 3 || P.tx > GX1 - 3 || P.ty < GY0 + 3);
        if (post) { P.outcome = 'TYČ!'; }
        else if (!inside) { P.outcome = 'MIMO!'; }
        else {
            var saveP = 0;
            if (P.gkZone === P.zone) {
                saveP = 0.85;
                if (Math.abs(P.tx - 128) > 50 && P.ty < 84) { saveP = 0.45; }
                if (power < 0.3) { saveP = 0.97; }
            } else if (P.gkZone === 0 && power < 0.25) { saveP = 0.8; }
            P.outcome = rng() < saveP ? 'CHYTIL!' : 'GÓL!';
        }
        P.phase = 'fly'; P.t = 0; P.ev.push('shot');
    }

    function clampv(v, a, b) { return v < a ? a : (v > b ? b : v); }

    function nextKick(P) {
        var s = P.outcome === 'GÓL!';
        P.res[P.turn].push(s ? 1 : 0);
        if (s) { P.score[P.turn]++; }
        var n0 = P.res[0].length, n1 = P.res[1].length;
        var done = false;
        if (n0 <= 5 && n1 <= 5 && !(n0 === 5 && n1 === 5)) {
            var r0 = 5 - n0, r1 = 5 - n1;
            if (P.score[0] > P.score[1] + r1 || P.score[1] > P.score[0] + r0) { done = true; }
        }
        if (n0 === n1 && n0 >= 5 && P.score[0] !== P.score[1]) { done = true; }
        if (done) {
            P.done = true; P.winner = P.score[0] > P.score[1] ? 0 : 1; P.phase = 'end'; P.t = 0;
        } else {
            P.turn = 1 - P.turn; P.phase = 'aim'; P.t = 0; P.cx = 128; P.cy = 92; P.charge = 0; P.prevKick = false;
            P.aiWait = 70 + Math.floor(P.rng() * 50); P.kz = 0;
        }
    }

    function step(P, inp) {
        P.ev.length = 0;
        P.t++;
        inp = inp || [{}, {}];
        var kt = P.turn, ke = 1 - kt;
        if (P.phase === 'aim') {
            var K = inp[kt] || {}, E = inp[ke] || {};
            if (P.human[ke]) { P.hold = E.dx ? (E.dx > 0 ? 1 : -1) : 0; }
            if (P.human[kt]) {
                P.cx = clampv(P.cx + (K.dx || 0) * 1.6, 50, 206);
                P.cy = clampv(P.cy + (K.dy || 0) * 1.6, 48, 126);
                if (K.kick) { P.charge = Math.min(60, P.charge + 1); }
                else if (P.prevKick) { shoot(P, P.charge / 60, P.hold); }
                P.prevKick = !!K.kick;
                if (P.phase === 'aim' && P.t > 900) { shoot(P, 0.5, P.hold); }
            } else {
                // AI střelec: pomalu míří, po chvíli vystřelí
                if (P.t === 1) { P.aiZone = Math.floor(P.rng() * 3) - 1; P.aiY = 74 + P.rng() * 36; }
                P.cx += ((128 + P.aiZone * 38) - P.cx) * 0.05; P.cy += (P.aiY - P.cy) * 0.05;
                P.charge = Math.min(60, P.t * 0.6);
                if (P.t > P.aiWait) { shoot(P, 0.45 + P.rng() * 0.4, P.hold); }
            }
        } else if (P.phase === 'fly') {
            if (P.t >= 34) { P.phase = 'res'; P.t = 0; P.ev.push(P.outcome === 'GÓL!' ? 'goal' : (P.outcome === 'TYČ!' ? 'post' : 'save')); }
        } else if (P.phase === 'res') {
            if (P.t >= 80) { nextKick(P); }
        } else if (P.phase === 'end') {
            // čeká na hlavní program
        }
    }

    function blk(scr, x, y, w, h, ink) { scr.block(Math.round(x), Math.round(y), w, h, 1, ink, true); }

    function sprS(scr, x, y, rows, ink, s, flip) {
        var w = rows[0].length;
        for (var r = 0; r < rows.length; r++) {
            for (var c = 0; c < w; c++) {
                if (rows[r].charAt(flip ? w - 1 - c : c) === 'X') { blk(scr, x + c * s, y + r * s, s, s, ink); }
            }
        }
    }

    function draw(P, scr) {
        scr.clear(0, 7);
        scr.fillCells(0, 2, 32, 6, 5, 1, 0);                 // tribuna
        for (var i = 0; i < 90; i++) {
            var cx = (i * 37) % 250, cy = 20 + ((i * 53) % 40);
            scr.block(cx + 2, cy, 2, 2, 1, [2, 6, 7, 3, 4][i % 5], true);
        }
        scr.fillCells(0, 8, 32, 16, 7, 4, 0);                // tráva
        scr.fillCells(8, 8, 16, 7, 7, 0, 0);                 // síť
        for (var y = GY0; y < GY1; y += 4) { for (var x = GX0; x < GX1; x += 4) { scr.block(x + ((y >> 2) & 1) * 2, y, 1, 1, 1, 7, true); } }
        // branka
        blk(scr, GX0 - 2, GY0 - 2, 3, GY1 - GY0 + 2, 15);
        blk(scr, GX1 - 1, GY0 - 2, 3, GY1 - GY0 + 2, 15);
        blk(scr, GX0 - 2, GY0 - 2, GX1 - GX0 + 4, 3, 15);
        scr.block(0, GY1, 256, 1, 1, 7, false);
        scr.block(126, 150, 4, 2, 1, 7, false);
        var kt = P.turn, ke = 1 - kt;
        // brankář
        var gx = 128, gy = GY1 - 22, dive = 0;
        if (P.phase === 'fly' || P.phase === 'res') { dive = P.gkZone; }
        var prog = P.phase === 'fly' ? Math.min(1, P.t / 16) : (P.phase === 'res' ? 1 : 0);
        if (dive !== 0) {
            sprS(scr, gx + dive * 40 * prog - 12, gy + 10 - 4 * prog, FB.SPR.GKDIVE, GKINK[ke], 2, dive < 0);
        } else {
            sprS(scr, gx - 8 + (P.phase === 'aim' ? Math.sin(P.t / 12) * 6 : 0), gy, FB.SPR.GK, GKINK[ke], 2, false);
        }
        // míč
        var bx = 128, by = 150, bs = 4;
        if (P.phase === 'fly' || P.phase === 'res') {
            var f = P.phase === 'fly' ? P.t / 34 : 1;
            bx = 128 + (P.tx - 128) * f; by = 150 + (P.ty - 150) * f - Math.sin(f * 3.1416) * 8; bs = f > 0.6 ? 3 : 4;
        }
        if (bs === 4) { scr.sprite(Math.round(bx) - 2, Math.round(by) - 2, FB.SPR.BALLBIG, 7, false); }
        else { scr.sprite(Math.round(bx) - 1, Math.round(by) - 1, FB.SPR.BALL, 7, false); }
        // střelec (zezadu)
        sprS(scr, 120, 156, FB.SPR.PLAYER[P.phase === 'fly' && P.t < 8 ? 3 : 0], INK[kt], 2, false);
        // zaměřovač
        if (P.phase === 'aim' && P.human[kt]) {
            var ccx = Math.round(P.cx), ccy = Math.round(P.cy);
            scr.block(ccx - 5, ccy, 11, 1, 1, 14, true);
            scr.block(ccx, ccy - 5, 1, 11, 1, 14, true);
        }
        // síla
        if (P.phase === 'aim') {
            var pw = Math.round(P.charge / 60 * 80);
            scr.block(88, 182, 80, 5, 0, 7, false);
            scr.block(88, 182, 80, 1, 1, 7, false); scr.block(88, 186, 80, 1, 1, 7, false);
            scr.block(88, 182, 1, 5, 1, 7, false); scr.block(167, 182, 1, 5, 1, 7, false);
            if (pw > 0) { scr.block(89, 183, Math.min(78, pw), 3, 1, 10, true); }
        }
    }

    FB.Pens = { create: create, step: step, draw: draw, INK: INK };
})(typeof window !== 'undefined' ? window : globalThis);
