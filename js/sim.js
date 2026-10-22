// Simulace zápasu 5 vs 5 (bez DOM): hráči, míč s výškou, AI, brankáři, standardní situace.
// Souřadnice: x = délka hřiště 0..PL (branky na x=0 a x=PL), y = šířka 0..PW, z = výška míče.
(function (root) {
    'use strict';

    var FB = root.FB = root.FB || {};

    var PL = 640, PW = 110, GY0 = 40, GY1 = 70, GH = 14, NET = 14;
    var GRAV = 0.06, HALF = 4500;
    var ROLES = ['GK', 'DF', 'DF', 'MF', 'FW'];
    var HOME = [[0.0, 55], [0.20, 28], [0.20, 82], [0.42, 45], [0.68, 65]];

    // soupeři s rostoucí obtížností (turnaj)
    var OPPS = [
        { name: 'ŽABÁCI', spd: 0.80, tackle: 0.02, aimErr: 22, gkErr: 16, decide: 26, press: 0.3, slide: 0.0005, shoot: 0.35 },
        { name: 'SRŠNI', spd: 0.88, tackle: 0.03, aimErr: 17, gkErr: 15, decide: 20, press: 0.5, slide: 0.001, shoot: 0.42 },
        { name: 'VLCI', spd: 0.95, tackle: 0.04, aimErr: 13, gkErr: 20, decide: 16, press: 0.7, slide: 0.0015, shoot: 0.5 },
        { name: 'BÝCI', spd: 1.02, tackle: 0.05, aimErr: 10, gkErr: 15, decide: 13, press: 0.9, slide: 0.002, shoot: 0.55 },
        { name: 'DRACI', spd: 1.08, tackle: 0.06, aimErr: 7, gkErr: 11, decide: 10, press: 1.0, slide: 0.0025, shoot: 0.6 }
    ];
    var SK_MATE = { name: 'CHLAPCI', spd: 0.96, tackle: 0.026, aimErr: 9, gkErr: 18, decide: 14, press: 0.8, slide: 0.001, shoot: 0.5 };

    function mulberry32(a) {
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            var t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

    function mkPlayer(t, i) {
        return {
            id: t * 5 + i, team: t, i: i, role: ROLES[i], x: 0, y: 55, vx: 0, vy: 0, fx: t === 0 ? 1 : -1, fy: 0, sx: t === 0 ? 1 : -1,
            st: 'run', t: 0, tcd: 0, hcd: 0, kick: 0, dec: 0, tx: 0, ty: 0, step: 0, rank: 0, seen: -1, err: 0
        };
    }

    function goalX(dir) { return dir > 0 ? PL : 0; }

    function homePos(m, p) {
        var dir = m.team[p.team].dir;
        if (p.i === 0) { return [dir > 0 ? 10 : PL - 10, 55]; }
        var f = HOME[p.i][0];
        return [dir > 0 ? f * PL : PL - f * PL, HOME[p.i][1]];
    }

    function newMatch(o) {
        var m = {
            rng: mulberry32(o.seed || 1), mode: o.mode || 1, frame: 0, t: 0, half: 1, halfLen: o.halfLen || HALF,
            phase: 'sp', pt: 0, sp: null, score: [0, 0], shots: [0, 0], ev: [], names: o.names || ['DOMÁCÍ', o.opp ? o.opp.name : 'HOSTÉ'],
            pl: [], team: [], cam: PL / 2 - 128, concede: 0, lastGoal: -1, goalSeq: 0
        };
        m.ball = { x: PL / 2, y: 55, z: 0, vx: 0, vy: 0, vz: 0, owner: -1, last: -1, lastTeam: 0, cd: 0, cdP: -1, seq: 0 };
        for (var t = 0; t < 2; t++) {
            m.team.push({
                dir: t === 0 ? 1 : -1, human: t === 0 || m.mode === 2,
                sk: (t === 0 || m.mode === 2) ? SK_MATE : o.opp, ctl: -1, charge: 0, prevKick: false, prevSlide: false, input: {}
            });
            for (var i = 0; i < 5; i++) { m.pl.push(mkPlayer(t, i)); }
        }
        setupKickoff(m, 0);
        return m;
    }

    function setupKickoff(m, kt) {
        var b = m.ball, taker = null;
        for (var n = 0; n < m.pl.length; n++) {
            var p = m.pl[n], tm = m.team[p.team], h = homePos(m, p);
            var lim = (p.team === kt) ? 6 : 28;
            var x = h[0];
            if (p.i > 0) {
                if (tm.dir > 0) { x = Math.min(x, PL / 2 - lim); } else { x = Math.max(x, PL / 2 + lim); }
            }
            p.x = x; p.y = h[1]; p.vx = p.vy = 0; p.st = 'run'; p.t = 0; p.tcd = 0; p.hcd = 0; p.kick = 0; p.dec = 0;
            p.fx = tm.dir; p.fy = 0; p.sx = tm.dir;
            if (p.team === kt && p.i === 4) { taker = p; }
        }
        taker.x = PL / 2 - m.team[kt].dir * 3; taker.y = 55;
        b.x = taker.x; b.y = taker.y; b.z = 0; b.vx = b.vy = b.vz = 0; b.owner = taker.id; b.cd = 0; b.cdP = -1;
        m.phase = 'sp';
        m.sp = { type: 'kickoff', team: kt, taker: taker.id, t: 0, wait: 40 + Math.floor(m.rng() * 30) };
        m.team[0].ctl = m.team[1].ctl = -1;
        m.team[0].charge = m.team[1].charge = 0;
        m.ev.push('whistle');
    }

    function startSecondHalf(m) {
        m.half = 2; m.t = 0;
        m.team[0].dir = -1; m.team[1].dir = 1;
        setupKickoff(m, 1);
    }

    // ---------- pomocné ----------
    function speedOf(m, p) {
        var tm = m.team[p.team];
        var s = 0.85 * (tm.human && p === m.pl[p.team * 5 + tm.ctl] ? 1.0 : tm.sk.spd);
        if (m.ball.owner === p.id) { s *= 0.93; }
        return s;
    }

    function cone(p, tx, ty, cosMin) {
        var dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
        return (dx * p.fx + dy * p.fy) / d >= cosMin;
    }

    function nearestOpp(m, p) {
        var best = 999;
        for (var i = 0; i < 10; i++) {
            var q = m.pl[i];
            if (q.team === p.team || q.i === 0) { continue; }
            var d = dist(p, q);
            if (d < best) { best = d; }
        }
        return best;
    }

    function openness(m, q) { return Math.min(30, nearestOpp(m, q)); }

    // nejlepší spoluhráč pro přihrávku v kuželu (cosMin) a vzdálenosti
    function pickMate(m, p, cosMin, dmin, dmax, fwdMin) {
        var dir = m.team[p.team].dir, best = null, bs = -1e9;
        for (var i = 0; i < 5; i++) {
            var q = m.pl[p.team * 5 + i];
            if (q === p || (q.i === 0 && dist(p, q) > 60)) { continue; }
            var d = dist(p, q);
            if (d < dmin || d > dmax) { continue; }
            if (fwdMin !== undefined && (q.x - p.x) * dir < fwdMin) { continue; }
            if (cosMin > -1 && !cone(p, q.x, q.y, cosMin)) { continue; }
            var sc = -d * 0.2 + openness(m, q) * 0.8 + (q.x - p.x) * dir * 0.3;
            if (cosMin > -1) { sc += ((q.x - p.x) * p.fx + (q.y - p.y) * p.fy) / d * 40; }
            if (sc > bs) { bs = sc; best = q; }
        }
        return best;
    }

    // vystřelí / přihraje míč na cíl; kind: pass | lob | shot
    function launch(m, p, tx, ty, kind, pw, err) {
        var b = m.ball;
        if (err) {
            var ex = tx - b.x, ey = ty - b.y, dd = Math.hypot(ex, ey) || 1;
            var off = (m.rng() - 0.5) * 2 * err;
            tx += -ey / dd * off; ty += ex / dd * off;
        }
        var dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
        if (d < 1) { dx = p.fx; dy = p.fy; d = 1; }
        var ux = dx / d, uy = dy / d, s, vz;
        if (kind === 'pass') { s = clamp(d * 0.03 + 1.2, 1.8, 4.0); vz = 0; }
        else if (kind === 'lob') { s = clamp(d / 42, 1.5, 3.6); vz = GRAV * (d / s) / 2 * 0.92; }
        else { s = 3.0 + pw * 1.8; vz = 0.1 + pw * pw * 1.1; }
        if (b.owner >= 0 && b.owner !== p.id) { return; }
        b.owner = -1;
        b.vx = ux * s; b.vy = uy * s; b.vz = vz; if (b.z < 0.01) { b.z = 0.01; }
        b.cd = 10; b.cdP = p.id; b.last = p.id; b.lastTeam = p.team; b.seq++;
        p.fx = ux; p.fy = uy; if (Math.abs(ux) > 0.1) { p.sx = ux > 0 ? 1 : -1; }
        p.kick = 10;
        if (kind === 'shot') { m.shots[p.team]++; }
        m.ev.push(kind === 'shot' ? 'shot' : 'kick');
    }

    function goalTarget(m, p, rawY, err) {
        var gx = goalX(m.team[p.team].dir);
        return [gx, clamp(rawY, GY0 + 3, GY1 - 3)];
    }

    // ---------- lidský kop ----------
    function humanKick(m, tm, p, pw, volley) {
        var b = m.ball, dir = tm.dir, gx = goalX(dir);
        if (pw < 0.35) {
            var mate = pickMate(m, p, 0.62, 18, 230);
            if (mate) {
                var d = dist(p, mate), lead = Math.min(d * 0.35, 30);
                launch(m, p, mate.x + mate.vx * lead, mate.y + mate.vy * lead, d > 130 ? 'lob' : 'pass', 0, 1);
            } else {
                launch(m, p, p.x + p.fx * 70, p.y + p.fy * 70, 'pass', 0, 0);
            }
        } else {
            if (cone(p, gx, 55, 0.74) && Math.abs(gx - p.x) < 280) {
                var ty = 55 + p.fy * 12 + (m.rng() - 0.5) * pw * 8;
                var g = goalTarget(m, p, ty);
                launch(m, p, g[0], g[1], 'shot', volley ? Math.min(1, pw * 1.1) : pw, 0);
            } else {
                var mate2 = pickMate(m, p, 0.8, 90, 300);
                if (mate2 && pw < 0.8) {
                    var d2 = dist(p, mate2);
                    launch(m, p, mate2.x + mate2.vx * 20, mate2.y + mate2.vy * 20, 'lob', 0, 2);
                } else {
                    launch(m, p, p.x + p.fx * 200, p.y + p.fy * 200, 'shot', pw, 0);
                }
            }
        }
        if (volley) { var bb = m.ball; bb.vx *= 1.1; bb.vy *= 1.1; }
    }

    function header(m, p, pw, human) {
        var b = m.ball, tm = m.team[p.team], gx = goalX(tm.dir);
        var tx, ty, s, vz;
        if (human) {
            if (cone(p, gx, 55, 0.74) && Math.abs(gx - p.x) < 200) { tx = gx; ty = 55 + p.fy * 10; s = 2.4 + pw * 1.8; vz = 0.25 + pw * 0.4; }
            else { tx = p.x + p.fx * 100; ty = p.y + p.fy * 100; s = 1.8 + pw * 1.6; vz = 0.4 + pw * 0.5; }
        } else {
            if (Math.abs(gx - p.x) < 170) { tx = gx; ty = 55 + (m.rng() - 0.5) * 20; s = 2.6; vz = 0.3; }
            else { var mate = pickMate(m, p, -1, 30, 150); tx = mate ? mate.x : p.x + tm.dir * 100; ty = mate ? mate.y : 55; s = 2.0; vz = 0.5; }
        }
        var dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1;
        b.owner = -1; b.vx = dx / d * s; b.vy = dy / d * s; b.vz = vz;
        b.cd = 12; b.cdP = p.id; b.last = p.id; b.lastTeam = p.team; b.seq++;
        p.hcd = 30; p.kick = 8;
        if (Math.abs(gx - p.x) < 170) { m.shots[p.team]++; }
        m.ev.push('head');
    }

    // ---------- standardní situace ----------
    function startSP(m, type, team, x, y) {
        var tm = m.team[team], b = m.ball, taker = null, bestD = 1e9;
        if (type === 'goalkick') { taker = m.pl[team * 5]; }
        else if (type === 'corner') { taker = m.pl[team * 5 + 3]; }
        else {
            for (var i = 1; i < 5; i++) {
                var q = m.pl[team * 5 + i], d = Math.hypot(q.x - x, q.y - y);
                if (d < bestD) { bestD = d; taker = q; }
            }
        }
        taker.x = x; taker.y = y; taker.vx = taker.vy = 0; taker.st = 'run'; taker.t = 0;
        // směr do hřiště
        var fx = type === 'throw' ? 0 : (type === 'goalkick' ? tm.dir : (x < PL / 2 ? 1 : -1));
        var fy = type === 'throw' ? (y < PW / 2 ? 1 : -1) : 0;
        if (type === 'corner') { fx = x < PL / 2 ? 1 : -1; fy = y < PW / 2 ? 0.5 : -0.5; var l = Math.hypot(fx, fy); fx /= l; fy /= l; }
        taker.fx = fx; taker.fy = fy; if (fx !== 0) { taker.sx = fx > 0 ? 1 : -1; }
        b.x = x; b.y = y; b.z = type === 'throw' ? 9 : 0; b.vx = b.vy = b.vz = 0; b.owner = taker.id; b.cd = 0; b.cdP = -1;
        m.phase = 'sp';
        m.sp = { type: type, team: team, taker: taker.id, t: 0, wait: 45 + Math.floor(m.rng() * 35) };
        m.team[0].charge = m.team[1].charge = 0;
        m.ev.push('whistle');
    }

    function takeSP(m, p, pw, human) {
        var sp = m.sp, tm = m.team[p.team], b = m.ball, dir = tm.dir;
        var tx, ty, kind;
        if (human) {
            if (sp.type === 'kickoff') {
                var mate = pickMate(m, p, 0.3, 15, 200) || pickMate(m, p, -1, 15, 200);
                tx = mate.x; ty = mate.y; kind = 'pass';
            } else {
                var reach = (sp.type === 'throw' ? 30 + pw * 120 : 50 + pw * 190);
                tx = p.x + p.fx * reach; ty = p.y + p.fy * reach; kind = sp.type === 'throw' ? 'lob' : 'lob';
            }
        } else {
            if (sp.type === 'kickoff') {
                var mt = pickMate(m, p, -1, 15, 200); tx = mt.x; ty = mt.y; kind = 'pass';
            } else if (sp.type === 'throw') {
                var mt2 = pickMate(m, p, -1, 20, 120) || pickMate(m, p, -1, 10, 300);
                tx = mt2.x; ty = mt2.y; kind = 'lob';
            } else if (sp.type === 'corner') {
                tx = goalX(dir) - dir * 18; ty = 55 + (m.rng() - 0.5) * 20; kind = 'lob';
            } else {
                var mt3 = pickMate(m, p, -1, 120, 330);
                tx = mt3 ? mt3.x : p.x + dir * 200; ty = mt3 ? mt3.y : 55; kind = 'lob';
            }
        }
        launch(m, p, tx, ty, kind, 0, human ? 0 : tm.sk.aimErr * 0.5);
        m.phase = 'live'; m.sp = null;
    }

    // ---------- fire (uvolnění tlačítka) ----------
    function fire(m, tm, p, charge) {
        var pw = Math.min(1, charge / 40), b = m.ball;
        if (m.phase === 'sp') {
            if (m.sp.taker === p.id && m.sp.t > 10) { takeSP(m, p, pw, true); }
            return;
        }
        if (p.st !== 'run') { return; }
        var d = Math.hypot(b.x - p.x, b.y - p.y);
        if (b.owner === p.id) { humanKick(m, tm, p, pw, false); }
        else if (b.owner === -1 && d < 11 && b.z < 8) { humanKick(m, tm, p, pw, true); }
        else if (b.owner === -1 && d < 11 && b.z < 28 && p.i !== 0) { header(m, p, pw, true); }
        else { p.kick = 6; }
    }

    // ---------- řízení hráčů ----------
    function ranks(m) {
        for (var t = 0; t < 2; t++) {
            var arr = [];
            for (var i = 1; i < 5; i++) { arr.push(m.pl[t * 5 + i]); }
            var b = m.ball;
            arr.sort(function (a, c) { return Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y); });
            for (var k = 0; k < arr.length; k++) { arr[k].rank = k; }
        }
    }

    function updateControl(m) {
        var b = m.ball;
        for (var t = 0; t < 2; t++) {
            var tm = m.team[t];
            if (!tm.human) { tm.ctl = -1; continue; }
            if (m.phase === 'sp' && m.sp.team === t) { tm.ctl = m.pl[m.sp.taker].i; continue; }
            if (b.owner >= 0 && m.pl[b.owner].team === t && m.pl[b.owner].i > 0) { tm.ctl = m.pl[b.owner].i; continue; }
            var cur = tm.ctl > 0 ? m.pl[t * 5 + tm.ctl] : null;
            if (cur && cur.st !== 'run' && cur.st !== 'stun') { continue; }
            var bx = b.x + b.vx * 5, by = b.y + b.vy * 5;
            var best = null, bd = 1e9;
            for (var i = 1; i < 5; i++) {
                var q = m.pl[t * 5 + i], d = Math.hypot(q.x - bx, q.y - by);
                if (d < bd) { bd = d; best = q; }
            }
            if (!cur || cur.i === 0) { tm.ctl = best.i; }
            else {
                var dc = Math.hypot(cur.x - bx, cur.y - by);
                if (bd < dc - 6) { tm.ctl = best.i; }
            }
        }
    }

    function humanMove(m, tm, p) {
        var I = tm.input || {}, dx = I.dx || 0, dy = I.dy || 0, len = Math.hypot(dx, dy);
        if (len > 0) { dx /= len; dy /= len; }
        var taker = m.phase === 'sp' && m.sp.taker === p.id;
        if (taker) {
            p.vx = p.vy = 0;
            if (len > 0) { p.fx = dx; p.fy = dy; if (dx !== 0) { p.sx = dx > 0 ? 1 : -1; } }
            return;
        }
        var s = speedOf(m, p);
        p.vx += (dx * s - p.vx) * 0.4; p.vy += (dy * s - p.vy) * 0.4;
        if (len > 0) { p.fx = dx; p.fy = dy; if (dx !== 0) { p.sx = dx > 0 ? 1 : -1; } }
    }

    function moveTo(m, p, tx, ty, frac) {
        var dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
        var s = 0;
        if (d > 1.5) { s = speedOf(m, p) * frac * (d < 10 ? d / 10 : 1); }
        var ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : 0;
        p.vx += (ux * s - p.vx) * 0.3; p.vy += (uy * s - p.vy) * 0.3;
        if (s > 0.15) { p.fx = ux; p.fy = uy; if (Math.abs(ux) > 0.15) { p.sx = ux > 0 ? 1 : -1; } }
    }

    function startSlide(m, p) {
        p.st = 'slide'; p.t = 26; p.vx = p.fx * 2.0; p.vy = p.fy * 2.0; p.tcd = 0;
        m.ev.push('slide');
    }

    function aiCarrier(m, p) {
        var tm = m.team[p.team], sk = tm.sk, dir = tm.dir, gx = goalX(dir), b = m.ball;
        if (p.dec > 0) {
            p.dec--;
            moveTo(m, p, p.tx, p.ty, 1);
            return;
        }
        var dg = Math.abs(gx - p.x), no = nearestOpp(m, p);
        if (m.phase === 'sp') { return; }
        var r = m.rng();
        if (dg < 190 && r < sk.shoot * (dg < 120 ? 1 : 0.4)) {
            p.fx = dir; p.fy = 0;
            var g = goalTarget(m, p, 55 + (m.rng() - 0.5) * 26);
            launch(m, p, g[0], g[1], 'shot', 0.6 + m.rng() * 0.4, sk.aimErr);
            p.dec = 20; return;
        }
        if ((no < 15 && m.rng() < 0.6) || m.rng() < 0.03) {
            var mate = pickMate(m, p, -1, 28, 200, no < 9 ? -40 : 10);
            if (mate) {
                var d = dist(p, mate), lead = Math.min(d * 0.3, 24);
                launch(m, p, mate.x + mate.vx * lead, mate.y + mate.vy * lead, d > 140 ? 'lob' : 'pass', 0, sk.aimErr * 0.5);
                p.dec = 8; return;
            }
        }
        // vedení míče k brance s obcházením
        var ty = 55, tx = gx - dir * 8;
        var near = null, nd = 999;
        for (var i = 0; i < 10; i++) {
            var q = m.pl[i];
            if (q.team === p.team || q.i === 0) { continue; }
            var qd = dist(p, q);
            if (qd < nd) { nd = qd; near = q; }
        }
        if (near && nd < 22) { ty = p.y + (p.y >= near.y ? 1 : -1) * 40; ty = clamp(ty, 8, PW - 8); }
        else { ty = 55 + (p.y - 55) * 0.3; }
        p.tx = tx; p.ty = ty;
        p.dec = Math.max(4, Math.floor(sk.decide * 0.4));
        moveTo(m, p, p.tx, p.ty, 1);
    }

    var OFF_ATT = [0, -35, -35, 10, 55];
    var OFF_DEF = [0, 22, 22, 32, -15];

    function aiPlayer(m, p) {
        var tm = m.team[p.team], sk = tm.sk, dir = tm.dir, b = m.ball;
        var owner = b.owner >= 0 ? m.pl[b.owner] : null;
        if (m.phase === 'sp' && m.sp.taker === p.id) { p.vx = p.vy = 0; return; }
        if (owner && owner.id === p.id) { aiCarrier(m, p); return; }
        var mine = owner && owner.team === p.team;
        var tx, ty;
        var chaseN = owner ? (sk.press > 0.6 ? 2 : 1) : 1;
        if (m.phase === 'sp' && m.sp.type === 'corner') {
            var gx0 = goalX(m.team[m.sp.team].dir), atk = p.team === m.sp.team;
            var ys = [0, 40, 70, 55, 52];
            tx = gx0 - m.team[m.sp.team].dir * (atk ? 16 + p.i * 3 : 10 + p.i * 2); ty = ys[p.i] + (atk ? 0 : 3);
            moveTo(m, p, tx, ty, 1);
            return;
        }
        if (!mine && p.rank < chaseN && m.phase === 'live') {
            if (owner) {
                tx = owner.x + owner.vx * 6; ty = owner.y + owner.vy * 6;
                if (dist(p, owner) < 16 && p.st === 'run' && m.rng() < sk.slide && p.tcd === 0) { startSlide(m, p); return; }
            } else {
                tx = b.x + b.vx * 8; ty = b.y + b.vy * 8;
            }
            moveTo(m, p, tx, ty, 1);
            return;
        }
        if (!mine && owner && m.phase === 'live' && p.i !== 4 && Math.abs(owner.x - goalX(-dir)) < 0.6 * PL &&
            dist(p, owner) < 40 + 50 * sk.press) {
            moveTo(m, p, owner.x + owner.vx * 6, owner.y + owner.vy * 6, 1);
            return;
        }
        if (mine) {
            tx = b.x + dir * OFF_ATT[p.i];
        } else {
            tx = b.x - dir * OFF_DEF[p.i];
        }
        var hm = homePos(m, p);
        tx = 0.7 * tx + 0.3 * hm[0];
        ty = hm[1] + (b.y - 55) * 0.35;
        if (mine && p.i >= 3) { ty = hm[1] + (p.i === 4 ? -1 : 1) * 0; }
        tx = clamp(tx, 30, PL - 30); ty = clamp(ty, 6, PW - 6);
        if (m.phase === 'sp' && m.sp.type === 'kickoff') {
            if (dir > 0) { tx = Math.min(tx, PL / 2 - (p.team === m.sp.team ? 6 : 28)); } else { tx = Math.max(tx, PL / 2 + (p.team === m.sp.team ? 6 : 28)); }
        }
        moveTo(m, p, tx, ty, 0.9);
    }

    // ---------- brankář ----------
    function gkUpdate(m, g) {
        var tm = m.team[g.team], sk = tm.sk, b = m.ball, dir = tm.dir;
        var lineX = dir > 0 ? 0 : PL;
        if (m.phase === 'sp' && m.sp.taker === g.id) {
            if (tm.human && tm.ctl === 0) { humanMove(m, tm, g); } else { g.vx = g.vy = 0; }
            return;
        }
        if (g.st === 'hold') {
            g.vx = g.vy = 0; g.t--;
            if (g.t <= 0) {
                g.st = 'run';
                if (b.owner === g.id) {
                    var mate = pickMate(m, g, -1, 80, 330);
                    var tx = mate ? mate.x : g.x + dir * 220, ty = mate ? mate.y : 55;
                    g.fx = dir; g.fy = 0;
                    launch(m, g, tx, ty, 'lob', 0, sk.aimErr * 0.5);
                }
            }
            return;
        }
        if (g.st === 'dive') { /* pohyb se nemění */ }
        else {
            var tx2 = lineX + dir * 9, ty2 = clamp(55 + (b.y - 55) * 0.4, 44, 66), sp = 1.0 * sk.spd + 0.35;
            var inc = b.owner === -1 && b.vx * dir < -0.8 && Math.abs(b.x - lineX) < 150;
            if (inc) {
                if (g.seen !== b.seq) { g.seen = b.seq; g.err = (m.rng() - 0.5) * 2 * sk.gkErr * 0.35; }
                var tt = Math.abs(b.x - lineX) / Math.abs(b.vx);
                var yp = b.y + b.vy * tt + g.err;
                ty2 = clamp(yp, GY0 - 4, GY1 + 4);
                if (Math.abs(ty2 - g.y) > 10 && tt < 30 && tt > 2 && g.st === 'run') {
                    g.st = 'dive'; g.t = 16; g.vy = (ty2 > g.y ? 1 : -1) * 1.8; g.vx = dir * 0.4;
                    g.sx = dir; m.ev.push('slide');
                    return;
                }
                tx2 = lineX + dir * 7;
            } else if (b.owner === -1 && Math.abs(b.x - lineX) < 42 && b.y > 18 && b.y < 92 && Math.abs(b.vx) < 2.2 && b.z < 6) {
                var closest = true;
                for (var i = 1; i < 5; i++) { var q = m.pl[g.team * 5 + i]; if (dist(q, b) < dist(g, b) - 4) { closest = false; } }
                if (closest) { tx2 = b.x; ty2 = b.y; sp = 1.25; }
            } else if (b.owner >= 0 && m.pl[b.owner].team !== g.team && Math.abs(m.pl[b.owner].x - lineX) < 50) {
                var o = m.pl[b.owner];
                tx2 = lineX + dir * 12 + (o.x - lineX - dir * 12) * 0.35; ty2 = clamp(o.y, 30, 80);
            }
            var dx = tx2 - g.x, dy = ty2 - g.y, d = Math.hypot(dx, dy);
            var s = d > 1 ? Math.min(sp, d * 0.3) : 0;
            g.vx += ((d > 0 ? dx / d : 0) * s - g.vx) * 0.4; g.vy += ((d > 0 ? dy / d : 0) * s - g.vy) * 0.4;
            g.fx = dir; g.fy = 0; g.sx = dir;
        }
        // chytání / vyrážení
        if (b.owner === -1 && !(b.cdP === g.id && b.cd > 0) && b.z < 20) {
            var reach = g.st === 'dive' ? 12 : 8.5;
            if (dist(g, b) < reach) {
                var spd = Math.hypot(b.vx, b.vy);
                var pc = clamp(0.97 - spd * 0.1 - sk.gkErr * 0.003, 0.25, 0.95);
                if (m.rng() < pc) {
                    b.owner = g.id; b.vx = b.vy = b.vz = 0; b.z = 0; b.lastTeam = g.team; b.last = g.id;
                    g.st = 'hold'; g.t = 40 + Math.floor(m.rng() * 30); g.vx = g.vy = 0;
                    m.ev.push('save');
                } else {
                    b.vx = -b.vx * 0.45 + dir * 0.6; b.vy += (m.rng() - 0.5) * 2.4; b.vz = 0.5;
                    b.cd = 10; b.cdP = g.id; b.lastTeam = g.team; b.last = g.id;
                    m.ev.push('save');
                }
            }
        }
    }

    // ---------- fyzika ----------
    function ballFree(m) {
        var b = m.ball;
        b.x += b.vx; b.y += b.vy;
        if (b.z > 0.01 || b.vz !== 0) {
            b.z += b.vz; b.vz -= GRAV;
            b.vx *= 0.997; b.vy *= 0.997;
            if (b.z <= 0) {
                b.z = 0;
                if (b.vz < -0.55) { b.vz = -b.vz * 0.62; b.vx *= 0.93; b.vy *= 0.93; m.ev.push('bounce'); }
                else { b.vz = 0; }
            }
        }
        if (b.z < 0.01 && b.vz === 0) {
            b.vx *= 0.972; b.vy *= 0.972;
            if (Math.abs(b.vx) < 0.01) { b.vx = 0; }
            if (Math.abs(b.vy) < 0.01) { b.vy = 0; }
        }
    }

    function tryPickups(m) {
        var b = m.ball;
        if (b.owner !== -1 || b.z >= 5) { return; }
        var best = null, bd = 6.5;
        for (var i = 0; i < 10; i++) {
            var p = m.pl[i];
            if (p.i === 0 || p.st === 'stun' || p.st === 'dive') { continue; }
            if (b.cdP === p.id && b.cd > 0) { continue; }
            var d = dist(p, b);
            if (d < bd) { bd = d; best = p; }
        }
        if (!best) { return; }
        var spd = Math.hypot(b.vx, b.vy);
        if (best.st === 'slide') {
            b.vx = best.fx * 2.4; b.vy = best.fy * 2.4; b.cd = 6; b.cdP = best.id; b.lastTeam = best.team; b.last = best.id;
            m.ev.push('tackle'); return;
        }
        if (spd > 3.6 && m.rng() < 0.5) {
            b.vx = -b.vx * 0.3 + (m.rng() - 0.5); b.vy = b.vy * 0.5 + (m.rng() - 0.5); b.cd = 6; b.cdP = best.id;
            b.lastTeam = best.team; b.last = best.id; m.ev.push('bounce'); return;
        }
        b.owner = best.id; b.lastTeam = best.team; b.last = best.id;
        best.dec = 4;
        var tm = m.team[best.team];
        if (tm.human) { tm.ctl = best.i; }
    }

    function tryHeaders(m) {
        var b = m.ball;
        if (b.owner !== -1 || b.z < 7 || b.z > 26) { return; }
        for (var i = 0; i < 10; i++) {
            var p = m.pl[i], tm = m.team[p.team];
            if (p.i === 0 || p.st !== 'run' || p.hcd > 0) { continue; }
            if (b.cdP === p.id && b.cd > 0) { continue; }
            if (dist(p, b) > 7.5) { continue; }
            if (tm.human && tm.ctl === p.i) {
                if (tm.input && tm.input.kick) { continue; }   // čeká na hlavičku
                b.vx *= 0.35; b.vy *= 0.35; b.vz = Math.min(b.vz, 0) * 0.4 - 0.1; p.hcd = 20; b.lastTeam = p.team; b.last = p.id; b.cd = 6; b.cdP = p.id;
                continue;
            }
            header(m, p, 0.5, false);
            return;
        }
    }

    function tryTackles(m) {
        var b = m.ball;
        if (b.owner < 0) { return; }
        var o = m.pl[b.owner];
        if (o.i === 0) { return; }
        for (var i = 0; i < 10; i++) {
            var q = m.pl[i];
            if (q.team === o.team || q.i === 0) { continue; }
            if (q.tcd > 0) { continue; }
            var d = dist(q, o);
            if (q.st === 'slide' && d < 8.5) {
                q.tcd = 30;
                if (m.rng() < 0.8) { loseBall(m, o, q, 1.8); o.st = 'stun'; o.t = 26; m.ev.push('tackle'); return; }
                continue;
            }
            if (q.st !== 'run' || d > 6) { continue; }
            var tm = m.team[q.team];
            var P = tm.human && tm.ctl === q.i ? 0.045 : tm.sk.tackle;
            if (m.rng() < P) { loseBall(m, o, q, 1.2); o.st = 'stun'; o.t = 10; m.ev.push('tackle'); return; }
        }
    }

    function loseBall(m, o, q, s) {
        var b = m.ball;
        b.owner = -1; b.vx = q.fx * s + o.vx * 0.3; b.vy = q.fy * s + o.vy * 0.3; b.vz = 0.1;
        b.cd = 8; b.cdP = o.id; b.lastTeam = q.team; b.last = q.id;
    }

    function ballOut(m) {
        var b = m.ball;
        if (b.owner >= 0) { return; }
        if (b.y < 0 || b.y > PW) {
            var t = 1 - b.lastTeam;
            startSP(m, 'throw', t, clamp(b.x, 6, PL - 6), b.y < 0 ? 0.5 : PW - 0.5);
            return;
        }
        if (b.x < 0 || b.x > PL) {
            var left = b.x < 0;
            var inMouth = b.y > GY0 && b.y < GY1;
            var postHit = (Math.abs(b.y - GY0) < 1.8 || Math.abs(b.y - GY1) < 1.8) && b.z < GH;
            var barHit = inMouth && b.z >= GH - 2 && b.z < GH + 1.5;
            if (postHit || barHit) {
                b.x = left ? 0.5 : PL - 0.5; b.vx = (left ? 1 : -1) * Math.abs(b.vx) * 0.55; b.vy += (m.rng() - 0.5) * 1.2;
                if (barHit) { b.vz = -Math.abs(b.vz) * 0.4 - 0.2; }
                m.ev.push('post'); b.cd = 3;
                return;
            }
            if (inMouth && b.z < GH - 2) {
                var scorer = left ? (m.team[0].dir < 0 ? 0 : 1) : (m.team[0].dir > 0 ? 0 : 1);
                m.score[scorer]++;
                m.phase = 'goal'; m.pt = 150; m.concede = 1 - scorer; m.lastGoal = scorer; m.goalSeq++;
                m.lastScorerPl = b.last;
                m.ev.push('goal');
                return;
            }
            // aut u brány
            var defTeam = left ? (m.team[0].dir > 0 ? 0 : 1) : (m.team[0].dir < 0 ? 0 : 1);
            if (b.lastTeam === defTeam) {
                startSP(m, 'corner', 1 - defTeam, left ? 1 : PL - 1, b.y < PW / 2 ? 1 : PW - 1);
            } else {
                startSP(m, 'goalkick', defTeam, left ? 10 : PL - 10, 55);
            }
        }
    }

    function goalPhase(m) {
        var b = m.ball;
        ballFree(m);
        if (b.x < -NET + 1) { b.x = -NET + 1; b.vx = Math.abs(b.vx) * 0.2; }
        if (b.x > PL + NET - 1) { b.x = PL + NET - 1; b.vx = -Math.abs(b.vx) * 0.2; }
        if (b.y < GY0 + 1) { b.y = GY0 + 1; b.vy = Math.abs(b.vy) * 0.3; }
        if (b.y > GY1 - 1) { b.y = GY1 - 1; b.vy = -Math.abs(b.vy) * 0.3; }
        b.vx *= 0.93; b.vy *= 0.93;
        for (var i = 0; i < 10; i++) { var p = m.pl[i]; p.vx *= 0.8; p.vy *= 0.8; p.x += p.vx; p.y += p.vy; p.st = p.st === 'dive' ? 'run' : p.st; }
        camUpdate(m);
    }

    function settle(m) {
        for (var i = 0; i < 10; i++) { var p = m.pl[i]; p.vx *= 0.8; p.vy *= 0.8; }
        camUpdate(m);
    }

    function camUpdate(m) {
        var b = m.ball, o = b.owner >= 0 ? m.pl[b.owner] : null;
        var tx = b.x - 128 + (o ? o.fx * 26 : clamp(b.vx * 14, -50, 50));
        tx = clamp(tx, -NET - 2, PL + NET + 2 - 256);
        m.cam += clamp((tx - m.cam) * 0.1, -4, 4);
    }

    // ---------- hlavní krok ----------
    function step(m, inp) {
        m.frame++; m.ev.length = 0;
        var ph = m.phase, b = m.ball, i, p, t;
        if (ph === 'half' || ph === 'end') { settle(m); return; }
        if (ph === 'goal') {
            m.pt--; goalPhase(m);
            if (m.pt <= 0) { setupKickoff(m, m.concede); }
            return;
        }
        inp = inp || [{}, {}];
        ranks(m);
        updateControl(m);

        // vstup lidí
        for (t = 0; t < 2; t++) {
            var tm = m.team[t];
            if (!tm.human) { continue; }
            var I = inp[t] || {};
            tm.input = I;
            p = tm.ctl >= 0 ? m.pl[t * 5 + tm.ctl] : null;
            if (I.kick) { tm.charge = Math.min(45, tm.charge + 1); }
            else if (tm.prevKick) {
                if (p) { fire(m, tm, p, tm.charge); }
                tm.charge = 0;
            }
            tm.prevKick = !!I.kick;
            if (I.slide && !tm.prevSlide && p && p.st === 'run' && m.phase === 'live' && b.owner !== p.id && p.i > 0) { startSlide(m, p); }
            tm.prevSlide = !!I.slide;
        }
        if (m.phase === 'sp') {
            // pokud fire změnil fázi, pokračujeme jako 'live'
        }

        // hráči
        for (i = 0; i < 10; i++) {
            p = m.pl[i];
            var ptm = m.team[p.team];
            if (p.tcd > 0) { p.tcd--; }
            if (p.hcd > 0) { p.hcd--; }
            if (p.kick > 0) { p.kick--; }
            if (p.i === 0) {
                if (p.st === 'stun') { p.t--; p.vx *= 0.8; p.vy *= 0.8; if (p.t <= 0) { p.st = 'run'; } }
                else {
                    var wasDive = p.st === 'dive';
                    if (wasDive) { p.t--; if (p.t <= 0) { p.st = 'stun'; p.t = 16; p.vx = p.vy = 0; } }
                    if (p.st !== 'stun') { gkUpdate(m, p); }
                }
            } else if (p.st === 'slide') {
                p.t--; p.vx *= 0.95; p.vy *= 0.95; if (p.t <= 0) { p.st = 'stun'; p.t = 14; }
            } else if (p.st === 'stun') {
                p.t--; p.vx *= 0.8; p.vy *= 0.8; if (p.t <= 0) { p.st = 'run'; }
            } else if (ptm.human && ptm.ctl === p.i) {
                humanMove(m, ptm, p);
            } else {
                aiPlayer(m, p);
            }
        }
        for (i = 0; i < 10; i++) {
            p = m.pl[i];
            if (!(p.vx === p.vx) || !(p.vy === p.vy)) { p.vx = 0; p.vy = 0; }
            p.x += p.vx; p.y += p.vy;
            var sp2 = Math.hypot(p.vx, p.vy);
            p.step += sp2;
            if (p.i === 0) {
                var dir = m.team[p.team].dir, lx = dir > 0 ? 0 : PL;
                var inSP = m.phase === 'sp' && m.sp.taker === p.id;
                if (inSP) { p.x = clamp(p.x, 1, PL - 1); p.y = clamp(p.y, 1, PW - 1); }
                else {
                    var xa = lx + dir * 2, xb = lx + dir * 34;
                    p.x = clamp(p.x, Math.min(xa, xb), Math.max(xa, xb)); p.y = clamp(p.y, 22, 88);
                }
            } else {
                var taker = m.phase === 'sp' && m.sp.taker === p.id;
                p.x = clamp(p.x, taker ? 0 : 2, taker ? PL : PL - 2); p.y = clamp(p.y, taker ? 0 : 1, taker ? PW : PW - 1);
            }
        }
        // oddělení hráčů
        for (i = 1; i < 10; i++) {
            if (m.pl[i].i === 0) { continue; }
            for (var j = i + 1; j < 10; j++) {
                if (m.pl[j].i === 0) { continue; }
                var a = m.pl[i], c = m.pl[j];
                var dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
                if (d < 4.5) {
                    if (d < 0.01) { dx = 1; dy = 0; d = 1; }
                    var pu = (4.5 - d) * 0.2;
                    a.x -= dx / d * pu; a.y -= dy / d * pu; c.x += dx / d * pu; c.y += dy / d * pu;
                }
            }
        }
        if (m.phase === 'sp' && m.sp.type === 'kickoff') {
            for (i = 0; i < 10; i++) {
                p = m.pl[i];
                if (p.id === m.sp.taker || p.i === 0) { continue; }
                var lim = p.team === m.sp.team ? 4 : 26;
                if (m.team[p.team].dir > 0) { p.x = Math.min(p.x, PL / 2 - lim); } else { p.x = Math.max(p.x, PL / 2 + lim); }
            }
        }

        // míč
        if (m.phase === 'sp') {
            var tk = m.pl[m.sp.taker];
            b.owner = tk.id;
            b.x = tk.x + tk.fx * 4; b.y = tk.y + tk.fy * 3; if (m.sp.type === 'throw') { b.z = 9; } else { b.z = 0; }
            m.sp.t++;
            var tmk = m.team[tk.team];
            if (!tmk.human || (m.sp.t > 400)) {
                if (m.sp.t > m.sp.wait) { takeSP(m, tk, 0, false); }
            }
        } else if (b.owner >= 0) {
            var o = m.pl[b.owner];
            var gx = o.x + o.fx * 5, gy = o.y + o.fy * 3;
            if (o.i === 0) { gx = o.x + o.fx * 3; gy = o.y; }
            b.x += (gx - b.x) * 0.5; b.y += (gy - b.y) * 0.5; b.z = 0; b.vx = o.vx; b.vy = o.vy; b.vz = 0;
            b.lastTeam = o.team; b.last = o.id;
            if (b.cd > 0) { b.cd--; }
            tryTackles(m);
        } else {
            ballFree(m);
            if (b.cd > 0) { b.cd--; }
            tryHeaders(m);
            tryPickups(m);
        }
        if (m.phase === 'live') {
            ballOut(m);
            m.t++;
            if (m.t >= m.halfLen && m.phase === 'live') {
                m.phase = m.half === 1 ? 'half' : 'end';
                m.ev.push('whistle');
            }
        }
        camUpdate(m);
    }

    FB.Sim = {
        PL: PL, PW: PW, GY0: GY0, GY1: GY1, GH: GH, NET: NET, HALF: HALF, OPPS: OPPS, SK_MATE: SK_MATE,
        newMatch: newMatch, step: step, startSecondHalf: startSecondHalf, goalX: goalX
    };
})(typeof window !== 'undefined' ? window : globalThis);
