// Fotbálek: stavy hry, vykreslení, vstup, smyčka (50 Hz).
(function (root) {
    'use strict';

    var FB = root.FB;
    var S = FB.Sim;
    var canvas = document.getElementById('screen');
    var ctx = canvas.getContext('2d');
    var scr = new FB.Screen();

    var PL = S.PL, PW = S.PW, PY0 = 48;
    var TEAMINK = [2, 5];
    var OPPINK = [5, 3, 7, 1, 0];
    var OPPGK = [3, 6, 5, 6, 6];

    // title | intro | play | result | pens | dying | over | win | paused
    var state = 'title', prevState = 'title';
    var mode = 1, menuSel = 0, stage = 0;
    var m = null, pens = null, frame = 0, stateTimer = 0, halfTimer = 0, spBanner = 0, resultInfo = null, penInfo = null;
    var rec = { w: 0, d: 0, l: 0, gf: 0, ga: 0, best: 0, titles: 0 };
    var held = {};
    var ovr = null;                       // přepsání vstupu (testy)

    try {
        var rj = JSON.parse(localStorage.getItem('fotbalek.rec') || 'null');
        if (rj && typeof rj === 'object') { for (var k in rec) { if (typeof rj[k] === 'number') { rec[k] = rj[k]; } } }
    } catch (e) { /* ignorovat */ }

    function saveRec() { try { localStorage.setItem('fotbalek.rec', JSON.stringify(rec)); } catch (e) { /* ignorovat */ } }

    // ---------- pomocné ----------
    function T(x, y, str, ink, scale) { return FB.drawText(scr, x, y, str, ink, scale || 1); }
    function C(y, str, ink, scale) {
        var w = FB.textWidth(str, scale || 1);
        T(Math.floor((256 - w) / 2), y, str, ink, scale || 1);
    }
    function pad(n, len) { var s = String(n); while (s.length < len) { s = '0' + s; } return s; }
    function setBorder(color) {
        var c = FB.PAL[color & 7];
        document.body.style.background = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    }
    function sfx(list) { for (var i = 0; i < list.length; i++) { FB.sound.play(list[i]); } }

    function teamName(t) {
        if (t === 0) { return 'ČERVENÍ'; }
        return mode === 2 ? 'MODŘÍ' : S.OPPS[stage].name;
    }
    function teamInk(t) { return t === 0 ? TEAMINK[0] : (mode === 2 ? TEAMINK[1] : OPPINK[stage]); }
    function gkInk(t) { return t === 0 ? 6 : (mode === 2 ? 3 : OPPGK[stage]); }

    // ---------- vstup ----------
    function readInput(t) {
        if (ovr && ovr[t]) { return ovr[t]; }
        var h = held, r = { dx: 0, dy: 0, kick: false, slide: false };
        if (mode === 2) {
            if (t === 0) {
                r.dx = (h.KeyD ? 1 : 0) - (h.KeyA ? 1 : 0); r.dy = (h.KeyS ? 1 : 0) - (h.KeyW ? 1 : 0);
                r.kick = !!(h.Space || h.touchKick); r.slide = !!(h.ShiftLeft || h.KeyQ || h.touchSlide);
            } else {
                r.dx = (h.ArrowRight ? 1 : 0) - (h.ArrowLeft ? 1 : 0); r.dy = (h.ArrowDown ? 1 : 0) - (h.ArrowUp ? 1 : 0);
                r.kick = !!(h.Enter || h.NumpadEnter); r.slide = !!(h.ShiftRight || h.Slash || h.Period);
            }
        } else if (t === 0) {
            r.dx = ((h.KeyD || h.ArrowRight || h.touchRight) ? 1 : 0) - ((h.KeyA || h.ArrowLeft || h.touchLeft) ? 1 : 0);
            r.dy = ((h.KeyS || h.ArrowDown || h.touchDown) ? 1 : 0) - ((h.KeyW || h.ArrowUp || h.touchUp) ? 1 : 0);
            r.kick = !!(h.Space || h.Enter || h.KeyZ || h.touchKick);
            r.slide = !!(h.ShiftLeft || h.ShiftRight || h.KeyX || h.KeyV || h.touchSlide);
        }
        return r;
    }

    // ---------- průběh ----------
    function newRng() { return Math.floor(Math.random() * 1e9) + 1; }

    function startMatch(seed) {
        m = S.newMatch({ seed: seed || newRng(), mode: mode, opp: mode === 2 ? S.SK_MATE : S.OPPS[stage], names: [teamName(0), teamName(1)] });
        state = 'play'; spBanner = 70; halfTimer = 0;
        setBorder(4);
        FB.sound.stopTune();
    }

    function startGame() {
        stage = 0;
        toIntro();
    }

    function toIntro() {
        state = 'intro'; stateTimer = 200;
        setBorder(1);
        FB.sound.stopTune();
    }

    function toTitle() {
        state = 'title'; setBorder(0);
        FB.sound.startTune();
    }

    function startPens() {
        pens = FB.Pens.create({ mode: mode, sk: mode === 2 ? S.SK_MATE : S.OPPS[stage], names: [teamName(0), teamName(1)] });
        state = 'pens'; setBorder(4);
    }

    function enterResult() {
        state = 'result'; stateTimer = 0; setBorder(1);
        var a = m.score[0], b = m.score[1];
        resultInfo = { a: a, b: b, w: a > b ? 0 : (b > a ? 1 : -1), shots: m.shots.slice() };
        rec.gf += a; rec.ga += b;
        if (mode === 1) {
            if (a > b) { rec.w++; } else if (a === b) { rec.d++; } else { rec.l++; }
            saveRec();
        }
        sfx([resultInfo.w === 0 || resultInfo.w === -1 ? 'win' : 'over']);
    }

    function concludeMatch(w) {
        if (mode === 2) { toTitle(); return; }
        if (w === 0) {
            if (stage + 1 > rec.best) { rec.best = stage + 1; saveRec(); }
            stage++;
            if (stage >= S.OPPS.length) { rec.titles++; saveRec(); state = 'win'; stateTimer = 0; FB.sound.play('win'); }
            else { toIntro(); }
        } else {
            state = 'dying'; stateTimer = 100; FB.sound.play('over');
        }
    }

    function resultPress() {
        if (!resultInfo) { toTitle(); return; }
        if (resultInfo.w === -1) { startPens(); } else { concludeMatch(resultInfo.w); }
    }

    function playTick() {
        var inp = [readInput(0), readInput(1)];
        if (m.phase === 'half') {
            halfTimer++;
            if (halfTimer > 200) { S.startSecondHalf(m); halfTimer = 0; spBanner = 70; }
            return;
        }
        if (m.phase === 'end') {
            halfTimer++;
            if (halfTimer > 150) { enterResult(); }
            return;
        }
        var ph0 = m.phase;
        S.step(m, inp);
        if (m.phase === 'sp' && ph0 !== 'sp') { spBanner = 80; }
        if (m.phase === 'half' || m.phase === 'end') { halfTimer = 0; }
        if (spBanner > 0) { spBanner--; }
        sfx(m.ev);
    }

    function pensTick() {
        var inp = [readInput(0), readInput(1)];
        FB.Pens.step(pens, inp);
        sfx(pens.ev);
        if (pens.done && pens.phase === 'end' && pens.t > 120) {
            // výsledek rozstřelu
            resultInfo.w = pens.winner;
            penInfo = pens.score.slice();
            concludeMatch(pens.winner);
        }
    }

    function tick() {
        frame++;
        switch (state) {
            case 'intro':
                if (--stateTimer <= 0) { startMatch(); }
                break;
            case 'play': playTick(); break;
            case 'pens': pensTick(); break;
            case 'dying':
                if (--stateTimer <= 0) { state = 'over'; stateTimer = 0; setBorder(2); }
                break;
            default: break;
        }
    }

    // ---------- vykreslení: zápas ----------
    var CROWD = [
        ['X.X..X.X', '.X.XX.X.', 'XX.X.XX.', 'X.X.X.XX'],
        ['.X.X.X.X', 'X.XX.XX.', '.XX.X.X.', 'XX.X.XX.']
    ];

    function hl(cam, x0, x1, y) { scr.block(Math.round(x0 - cam), PY0 + y, Math.round(x1 - x0) + 1, 1, 1, 7, false); }
    function vl(cam, x, y0, y1) { scr.block(Math.round(x - cam), PY0 + y0, 1, y1 - y0 + 1, 1, 7, false); }
    function dot(cam, x, y) {
        var sx = Math.round(x - cam), sy = PY0 + Math.round(y);
        scr.block(sx, sy, 1, 1, 1, 7, false);
    }

    function drawPitch(cam) {
        var cx, cr, i, k;
        // tribuna a reklamní panely
        for (cr = 2; cr < 5; cr++) {
            for (cx = 0; cx < 32; cx++) {
                scr.setCell(cx, cr, [6, 2, 7, 5, 3][(cx + Math.floor(cam / 8)) % 5 < 0 ? 0 : (cx + Math.floor(cam / 8)) % 5], 1, 0);
                var pat = CROWD[(cr + cx + Math.floor(frame / 25)) & 1];
                scr.pattern(cx, cr, [pat[0], pat[1], pat[2], pat[3], pat[0], pat[1], pat[2], pat[3]], [6, 2, 7, 5, 3][(cx + Math.floor(cam / 8) + 50) % 5]);
                scr.paper[cr * 32 + cx] = 1;
            }
        }
        scr.fillCells(0, 5, 32, 1, 7, 2, 0);
        for (k = -1; k < 5; k++) {
            var bx = k * 96 - (((cam % 96) + 96) % 96);
            T(bx, 40, 'FOTBÁLEK', 15, 1);
        }
        scr.fillCells(0, 20, 32, 1, 7, 1, 0);
        for (k = -1; k < 5; k++) {
            var bx2 = k * 96 + 40 - (((cam % 96) + 96) % 96);
            T(bx2, 160, 'DOMÁCÍ LIGA', 14, 1);
        }
        // trávník
        for (cr = 6; cr < 20; cr++) {
            for (cx = 0; cx < 32; cx++) {
                var wx = cam + cx * 8, st = Math.floor(wx / 40) & 1;
                scr.setCell(cx, cr, 7, 4, st ? 1 : 0);
            }
        }
        // čáry
        hl(cam, 0, PL, 0); hl(cam, 0, PL, PW);
        vl(cam, 0, 0, PW); vl(cam, PL, 0, PW);
        vl(cam, PL / 2, 0, PW);
        for (i = 0; i < 126; i++) { var a = i / 20; dot(cam, PL / 2 + Math.cos(a) * 22, PW / 2 + Math.sin(a) * 22); }
        dot(cam, PL / 2, PW / 2); dot(cam, PL / 2 + 1, PW / 2);
        hl(cam, 0, 50, 20); hl(cam, 0, 50, 90); vl(cam, 50, 20, 90);
        hl(cam, 0, 18, 35); hl(cam, 0, 18, 75); vl(cam, 18, 35, 75);
        hl(cam, PL - 50, PL, 20); hl(cam, PL - 50, PL, 90); vl(cam, PL - 50, 20, 90);
        hl(cam, PL - 18, PL, 35); hl(cam, PL - 18, PL, 75); vl(cam, PL - 18, 35, 75);
        dot(cam, 36, 55); dot(cam, PL - 36, 55);
        // branky
        var ends = [[-1, -S.NET, 0], [1, PL, PL + S.NET]];
        ends.forEach(function (e) {
            var x0 = e[1], x1 = e[2];
            for (var x = x0; x <= x1; x += 2) {
                for (var y = S.GY0; y <= S.GY1; y += 2) { dot(cam, x, y); }
            }
            var xl = e[0] < 0 ? 0 : PL;
            vl(cam, xl, S.GY0 - S.GH, S.GY0); vl(cam, xl, S.GY1 - S.GH, S.GY1);
            vl(cam, xl, S.GY0 - S.GH, S.GY1 - S.GH);
            hl(cam, x0, x1, S.GY0 - S.GH); hl(cam, x0, x1, S.GY1 - S.GH);
            vl(cam, e[0] < 0 ? x0 : x1, S.GY0 - S.GH, S.GY1 - S.GH);
        });
    }

    function drawPlayer(cam, p) {
        var sx = Math.round(p.x - cam), feet = PY0 + Math.round(p.y);
        var ink = p.i === 0 ? gkInk(p.team) : teamInk(p.team);
        var flip = p.sx < 0;
        var spr, w, h;
        if (p.st === 'slide' || (p.st === 'stun' && p.i > 0 && p.t > 4 && false)) {
            spr = FB.SPR.SLIDE; w = 12; h = 5;
        } else if (p.i === 0 && p.st === 'dive') {
            spr = FB.SPR.GKDIVE; w = 12; h = 6;
        } else if (p.i === 0) {
            spr = FB.SPR.GK; w = 8; h = 11;
        } else {
            var f = 0;
            if (p.kick > 0) { f = 3; }
            else if (Math.hypot(p.vx, p.vy) > 0.2) { f = 1 + (Math.floor(p.step / 4) & 1); }
            spr = FB.SPR.PLAYER[f]; w = 8; h = 11;
        }
        scr.sprite(sx - (w >> 1), feet - h, spr, ink, flip);
    }

    function drawBall(cam) {
        var b = m.ball;
        var sx = Math.round(b.x - cam), gy = PY0 + Math.round(b.y), sy = gy - Math.round(b.z) - 2;
        scr.sprite(sx - 1, sy - 1, FB.SPR.BALL, 7, false);
    }

    function drawMatch() {
        var cam = Math.round(m.cam);
        scr.clear(0, 7);
        drawPitch(cam);
        var b = m.ball;
        // stín míče
        if (b.z > 1.5) { scr.block(Math.round(b.x - cam) - 1, PY0 + Math.round(b.y), 3, 1, 1, 0, true); }
        // entity podle hloubky
        var list = [], i;
        for (i = 0; i < 10; i++) { list.push({ y: m.pl[i].y, p: m.pl[i] }); }
        var oy = b.owner >= 0 ? m.pl[b.owner].y : b.y;
        list.push({ y: b.owner >= 0 ? oy + 0.1 : b.y, ball: true });
        list.sort(function (a, c) { return a.y - c.y; });
        for (i = 0; i < list.length; i++) {
            if (list[i].ball) { drawBall(cam); } else { drawPlayer(cam, list[i].p); }
        }
        // kurzory
        for (var t = 0; t < 2; t++) {
            var tm = m.team[t];
            if (!tm.human || tm.ctl < 0) { continue; }
            var p = m.pl[t * 5 + tm.ctl];
            var csx = Math.round(p.x - cam), cf = PY0 + Math.round(p.y);
            if (mode === 2) { T(csx - 2, cf - 11 - 10 + (p.i === 0 ? 0 : 0), String(t + 1), teamInk(t), 1); }
            else { scr.sprite(csx - 2, cf - 11 - 5, FB.SPR.ARROW, teamInk(t), false); }
        }
        drawHud();
    }

    function matchClock() {
        var secs = Math.floor(((m.half - 1) * 45 * 60) + (m.t / m.halfLen) * 45 * 60);
        if (m.phase === 'end') { secs = 90 * 60; }
        return pad(Math.floor(secs / 60), 2) + ':' + pad(secs % 60, 2);
    }

    function powerBar(x, ink, charge) {
        scr.block(x, 169, 66, 7, 0, 7, false);
        scr.block(x, 169, 66, 1, 1, 7, false); scr.block(x, 175, 66, 1, 1, 7, false);
        scr.block(x, 169, 1, 7, 1, 7, false); scr.block(x + 65, 169, 1, 7, 1, 7, false);
        var w = Math.round(charge / 45 * 62);
        if (w > 0) { scr.block(x + 2, 171, w, 3, 1, charge > 33 ? 10 : (charge > 14 ? 14 : 12), true); }
        // dělicí značka (přihrávka / střela)
        scr.block(x + 2 + Math.round(14 / 45 * 62), 168, 1, 9, 1, 15, true);
    }

    function drawHud() {
        // horní lišta
        scr.fillCells(0, 0, 32, 2, 7, 0, 0);
        T(4, -1, m.names[0], teamInk(0), 1);
        T(256 - 4 - FB.textWidth(m.names[1], 1), -1, m.names[1], teamInk(1), 1);
        var sc = m.score[0] + ' - ' + m.score[1];
        T(Math.floor((256 - FB.textWidth(sc, 2)) / 2), -2, sc, 15, 2);
        T(4, 7, matchClock(), 7, 1);
        T(256 - 4 - FB.textWidth(m.half + '. POLOČAS', 1), 7, m.half + '. POLOČAS', 7, 1);
        // spodní lišta
        scr.fillCells(0, 21, 32, 3, 7, 0, 0);
        T(4, 167, 'SÍLA', 15, 1);
        powerBar(32, 7, m.team[0].charge);
        if (mode === 2) {
            T(256 - 4 - FB.textWidth('SÍLA', 1), 167, 'SÍLA', 15, 1);
            powerBar(256 - 4 - 24 - 4 - 66, 7, m.team[1].charge);
        } else {
            var lbl = 'ZÁPAS ' + (stage + 1) + '/' + S.OPPS.length;
            T(256 - 4 - FB.textWidth(lbl, 1), 167, lbl, 14, 1);
        }
        var hint = 'P PAUZA  M ZVUK';
        if (m.phase === 'sp' && m.sp) {
            var tk = m.team[m.sp.team];
            if (tk.human) { hint = mode === 2 ? 'ROZEHRA: KOP' : 'ROZEHRA: ŠIPKY MÍŘÍ, MEZERNÍK KOP'; }
        }
        C(181, hint, 5, 1);
        // hlášky
        if (m.phase === 'goal') {
            var fl = (frame >> 3) & 1;
            scr.fillCells(4, 8, 24, 5, 7, 1, 1);
            scr.block(32, 64, 192, 40, 0, 0, false);
            C(66, 'GÓÓÓL!', fl ? 14 : 15, 3);
            C(94, m.names[m.lastGoal] + ' ' + m.score[0] + ':' + m.score[1], 15, 1);
        } else if (m.phase === 'sp' && spBanner > 0 && m.sp) {
            var tt = { kickoff: 'ROZEHRA', throw: 'AUT', corner: 'ROH', goalkick: 'VYKOPÁVÁNÍ' }[m.sp.type];
            scr.fillCells(8, 8, 16, 2, 7, 1, 1);
            scr.block(64, 64, 128, 18, 0, 0, false);
            C(66, tt, 15, 1);
            C(75, m.names[m.sp.team], 7, 1);
        } else if (m.phase === 'half' || m.phase === 'end') {
            scr.fillCells(3, 7, 26, 6, 7, 1, 1);
            scr.block(24, 56, 208, 48, 0, 0, false);
            C(62, m.phase === 'half' ? 'KONEC POLOČASU' : 'KONEC ZÁPASU', 15, 1);
            C(74, m.score[0] + ' : ' + m.score[1], 14, 2);
            if (m.phase === 'half') { C(94, 'DRUHÝ POLOČAS ZA CHVÍLI', 5, 1); }
        }
    }

    // ---------- ostatní obrazovky ----------
    function bigPlayer(x, y, ink, f, scale, flip) {
        var rows = FB.SPR.PLAYER[f], w = rows[0].length;
        for (var r = 0; r < rows.length; r++) {
            for (var c = 0; c < w; c++) {
                if (rows[r].charAt(flip ? w - 1 - c : c) === 'X') { scr.block(x + c * scale, y + r * scale, scale, scale, 1, ink, true); }
            }
        }
    }

    function drawTitle() {
        scr.clear(0, 7);
        var c;
        for (c = 0; c < 32; c++) { scr.setCell(c, 0, 7, [2, 6, 4, 5, 3][c % 5], 1); }
        C(12, 'FOTBÁLEK', 14, 3);
        C(40, 'FOTBAL 5 NA 5 S BOČNÍM POHLEDEM', 5, 1);
        T(70, 56, (menuSel === 0 ? '> ' : '  ') + '1 HRÁČ  (TURNAJ)', menuSel === 0 ? 15 : 7, 1);
        T(70, 66, (menuSel === 1 ? '> ' : '  ') + '2 HRÁČI (PŘÁTELÁK)', menuSel === 1 ? 15 : 7, 1);
        C(78, 'NAHORU/DOLŮ + MEZERNÍK/ENTER', 4, 1);
        T(8, 94, 'OVLÁDÁNÍ', 14, 1);
        T(8, 104, 'ŠIPKY/WASD  POHYB HRÁČE U MÍČE (KURZOR)', 7, 1);
        T(8, 114, 'MEZERNÍK  KRÁTCE PŘIHRÁVKA, DLOUHO STŘELA', 7, 1);
        T(8, 124, 'X/SHIFT  SKLUZ    VE VZDUCHU HLAVIČKA', 7, 1);
        T(8, 136, '2 HRÁČI: P1 WASD + MEZERNÍK + L.SHIFT', 5, 1);
        T(8, 146, '         P2 ŠIPKY + ENTER + P.SHIFT', 5, 1);
        T(8, 158, 'P PAUZA   M ZVUK   2 X 90 S   5 SOUPEŘŮ', 3, 1);
        var bil = 'V-R-P ' + rec.w + '-' + rec.d + '-' + rec.l + '  GÓLY ' + rec.gf + ':' + rec.ga + '  NEJDÁL ' + rec.best + '/' + S.OPPS.length + (rec.titles ? '  TITULY ' + rec.titles : '');
        C(170, 'BILANCE', 6, 1);
        C(180, bil, 6, 1);
        var xx = (frame * 1.2) % 330 - 40;
        bigPlayer(Math.round(xx), 28, 2, 1 + (Math.floor(frame / 6) & 1), 1, false);
        scr.sprite(Math.round(xx) + 12, 35 + (Math.floor(frame / 10) & 1), FB.SPR.BALL, 7, false);
        bigPlayer(Math.round(256 - xx + 20), 28, 5, 1 + (Math.floor(frame / 6) & 1), 1, true);
    }

    function drawIntro() {
        scr.clear(0, 7);
        scr.fillCells(0, 4, 32, 15, 7, 4, 0);
        C(8, 'ZÁPAS ' + (stage + 1) + ' Z ' + S.OPPS.length, 14, 2);
        var p0 = teamName(0), p1 = teamName(1);
        var wob = (frame >> 3) & 1;
        bigPlayer(40, 66 + wob, teamInk(0), 1 + wob, 4, false);
        bigPlayer(184, 66 + wob, teamInk(1), 1 + wob, 4, true);
        T(40, 120, p0, teamInk(0), 1);
        T(216 - FB.textWidth(p1, 1), 120, p1, teamInk(1), 1);
        C(80, 'PROTI', 15, 1);
        if (mode === 1) {
            var st = '';
            for (var i = 0; i < S.OPPS.length; i++) { st += i <= stage ? '*' : '-'; }
            C(138, 'OBTÍŽNOST ' + st, 14, 1);
        }
        C(158, '2 X 90 SEKUND', 7, 1);
        C(172, 'MEZERNÍK = HRAJ', 5, 1);
    }

    function drawResult() {
        scr.clear(0, 7);
        scr.fillCells(0, 3, 32, 18, 7, 1, 0);
        C(16, 'KONEC ZÁPASU', 14, 2);
        var r = resultInfo;
        C(48, r.a + ' : ' + r.b, 15, 4);
        C(88, teamName(0) + '  -  ' + teamName(1), 7, 1);
        C(104, 'STŘELY ' + r.shots[0] + ' : ' + r.shots[1], 5, 1);
        var msg = r.w === 0 ? (mode === 2 ? 'VYHRÁLI ČERVENÍ!' : 'VÝHRA - POSTUPUJEŠ!') : (r.w === 1 ? (mode === 2 ? 'VYHRÁLI MODŘÍ!' : 'PROHRA') : 'REMÍZA - PENALTY!');
        C(124, msg, (frame >> 3) & 1 ? 14 : 15, 1);
        C(150, 'MEZERNÍK = POKRAČOVAT', 6, 1);
    }

    function drawPens() {
        FB.Pens.draw(pens, scr);
        scr.fillCells(0, 0, 32, 3, 7, 0, 0);
        C(0, 'PENALTY', 14, 1);
        T(4, 9, teamName(0), teamInk(0), 1);
        T(256 - 4 - FB.textWidth(teamName(1), 1), 9, teamName(1), teamInk(1), 1);
        function marks(t, x) {
            var s = '';
            for (var i = 0; i < Math.max(5, pens.res[t].length); i++) { s += i < pens.res[t].length ? (pens.res[t][i] ? 'O' : 'X') : '-'; }
            T(x, 17, s, teamInk(t), 1);
        }
        marks(0, 4);
        var s1 = ''; for (var i = 0; i < Math.max(5, pens.res[1].length); i++) { s1 += i < pens.res[1].length ? (pens.res[1][i] ? 'O' : 'X') : '-'; }
        T(256 - 4 - FB.textWidth(s1, 1), 17, s1, teamInk(1), 1);
        var sc = pens.score[0] + ' : ' + pens.score[1];
        T(Math.floor((256 - FB.textWidth(sc, 2)) / 2), 7, sc, 15, 2);
        var kt = pens.turn, ke = 1 - kt;
        if (pens.phase === 'aim') {
            if (pens.human[kt]) { C(166, mode === 2 ? teamName(kt) + ': MÍŘI A DRŽÍ KOP' : 'MÍŘ ŠIPKAMI, DRŽ MEZERNÍK = SÍLA, PUSŤ = STŘELA', 7, 1); }
            else { C(166, 'BRANKÁŘ: ŠIPKA VLEVO / NAHORU / VPRAVO', 7, 1); }
            if (pens.human[ke]) {
                var hd = pens.hold < 0 ? 'VLEVO' : (pens.hold > 0 ? 'VPRAVO' : 'STŘED');
                C(174, 'BRANKÁŘ SKÁČE: ' + hd, 14, 1);
            }
        }
        if (pens.phase === 'res' || pens.phase === 'end') {
            scr.fillCells(8, 11, 16, 2, 7, 1, 1);
            scr.block(64, 88, 128, 16, 0, 0, false);
            C(92, pens.outcome, (frame >> 2) & 1 ? 14 : 15, 1);
        }
        if (pens.phase === 'end') {
            C(130, pens.winner === 0 ? teamName(0) + ' VYHRÁVÁ' : teamName(1) + ' VYHRÁVÁ', 14, 1);
        }
    }

    function drawEnd(title, sub, ink) {
        scr.clear(0, 7);
        var c;
        for (c = 0; c < 32; c++) { scr.setCell(c, 0, 7, ink, 1); scr.setCell(c, 23, 7, ink, 1); }
        C(40, title, 14, 3);
        C(80, sub, 7, 1);
        C(100, 'BILANCE V-R-P ' + rec.w + '-' + rec.d + '-' + rec.l, 6, 1);
        C(112, 'GÓLY ' + rec.gf + ':' + rec.ga + '   NEJDÁL ' + rec.best + '/' + S.OPPS.length, 5, 1);
        C(150, 'MEZERNÍK = MENU', 15, 1);
    }

    function draw() {
        switch (state) {
            case 'title': drawTitle(); break;
            case 'intro': drawIntro(); break;
            case 'result': drawResult(); break;
            case 'pens': drawPens(); break;
            case 'over': drawEnd('KONEC HRY', 'TURNAJ KONČÍ V ' + (stage + 1) + '. ZÁPASE', 2); break;
            case 'win': drawEnd('MISTR!', 'PORAZIL JSI VŠECH ' + S.OPPS.length + ' SOUPEŘŮ', 4); break;
            case 'dying': drawMatchOrPens(); break;
            case 'paused':
                if (prevState === 'pens') { drawPens(); } else { drawMatch(); }
                scr.fillCells(8, 8, 16, 3, 7, 1, 1);
                scr.block(64, 64, 128, 24, 0, 0, false);
                C(68, 'PAUZA', 15, 2);
                C(80, 'P - POKRAČOVAT', 15, 1);
                break;
            default: drawMatch(); break;
        }
        scr.render(ctx);
    }

    function drawMatchOrPens() {
        drawResult();
        if (resultInfo && resultInfo.w === 1) { C(166, 'PROHRÁL JSI...', 2, 1); }
        else { C(166, 'PENALTY PROHRÁNY...', 2, 1); }
    }

    // ---------- ovládání ----------
    function press() {
        FB.sound.unlock();
        if (state === 'title') { mode = menuSel + 1; FB.sound.play('menu'); startGame(); }
        else if (state === 'intro') { startMatch(); }
        else if (state === 'result') { resultPress(); }
        else if (state === 'over' || state === 'win') { toTitle(); }
    }

    function togglePause() {
        if (state === 'play' || state === 'pens') { prevState = state; state = 'paused'; }
        else if (state === 'paused') { state = prevState; }
    }

    var PREVENT = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, Space: 1, Enter: 1, ShiftLeft: 0, Slash: 1 };

    document.addEventListener('keydown', function (e) {
        var c = e.code;
        if (PREVENT[c]) { e.preventDefault(); }
        FB.sound.unlock();
        if (e.repeat) { return; }
        held[c] = true;
        if (state === 'title') {
            if (c === 'ArrowUp' || c === 'KeyW') { menuSel = 0; FB.sound.play('menu'); }
            else if (c === 'ArrowDown' || c === 'KeyS') { menuSel = 1; FB.sound.play('menu'); }
            else if (c === 'Digit1' || c === 'Numpad1') { menuSel = 0; press(); }
            else if (c === 'Digit2' || c === 'Numpad2') { menuSel = 1; press(); }
            else if (c === 'Space' || c === 'Enter' || c === 'NumpadEnter') { press(); }
        } else if (c === 'Space' || c === 'Enter' || c === 'NumpadEnter') {
            if (state === 'intro' || state === 'result' || state === 'over' || state === 'win') { press(); }
        }
        if (c === 'KeyP' || c === 'Escape') { togglePause(); }
        else if (c === 'KeyM') { if (!FB.sound.toggleMute() && state === 'title') { FB.sound.startTune(); } }
    });

    document.addEventListener('keyup', function (e) { held[e.code] = false; });

    // dotyková tlačítka
    var TOUCHMAP = { left: 'touchLeft', right: 'touchRight', up: 'touchUp', down: 'touchDown', kick: 'touchKick', slide: 'touchSlide' };
    Array.prototype.forEach.call(document.querySelectorAll('#touch button'), function (b) {
        var act = b.getAttribute('data-act');
        function down(e) {
            e.preventDefault();
            FB.sound.unlock();
            if (act === 'pause') { togglePause(); return; }
            held[TOUCHMAP[act]] = true;
            if (act === 'kick' && (state === 'title' || state === 'intro' || state === 'result' || state === 'over' || state === 'win')) { press(); }
            if (state === 'title' && act === 'up') { menuSel = 0; }
            if (state === 'title' && act === 'down') { menuSel = 1; }
        }
        function up(e) { e.preventDefault(); if (act !== 'pause') { held[TOUCHMAP[act]] = false; } }
        b.addEventListener('pointerdown', down);
        b.addEventListener('pointerup', up);
        b.addEventListener('pointercancel', up);
        b.addEventListener('pointerleave', up);
        b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });

    canvas.addEventListener('pointerdown', function () {
        FB.sound.unlock();
        if (state === 'paused') { togglePause(); }
        else if (state === 'title') { menuSel = 0; press(); }
        else if (state === 'intro' || state === 'result' || state === 'over' || state === 'win') { press(); }
    });

    document.addEventListener('visibilitychange', function () {
        if (document.hidden && (state === 'play' || state === 'pens')) { prevState = state; state = 'paused'; }
    });

    // ---------- celočíselné měřítko ----------
    function fit() {
        var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        var availH = window.innerHeight - (touch ? 190 : 24);
        var s = Math.min(window.innerWidth / 256, availH / 192);
        s = s >= 1 ? Math.floor(s) : Math.max(0.5, s);
        canvas.style.width = Math.round(256 * s) + 'px';
        canvas.style.height = Math.round(192 * s) + 'px';
    }
    window.addEventListener('resize', fit);
    fit();

    // ---------- smyčka (logika 50 Hz) ----------
    var last = 0, acc = 0, STEP = 20;

    function loop(ts) {
        var dt = Math.min(250, ts - last || 0);
        last = ts;
        if (state !== 'paused') {
            acc += dt;
            while (acc >= STEP) { tick(); acc -= STEP; }
        } else {
            acc = 0; frame++;
        }
        draw();
        requestAnimationFrame(loop);
    }

    FB.game = {
        // pro testy
        _get: function () { return { state: state, mode: mode, stage: stage, m: m, pens: pens, rec: rec, result: resultInfo }; },
        _tick: tick, _draw: draw, _press: press,
        _setMode: function (md) { mode = md; menuSel = md - 1; },
        _setStage: function (s) { stage = s; },
        _setInput: function (o) { ovr = o; },
        _startPens: function () { resultInfo = resultInfo || { w: -1, a: 0, b: 0, shots: [0, 0] }; resultInfo.w = -1; startPens(); },
        _scr: scr, _togglePause: togglePause, _startMatch: startMatch, _enterResult: enterResult
    };

    toTitle();
    requestAnimationFrame(loop);
})(window);
