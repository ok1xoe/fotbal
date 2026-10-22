// Sprity hráčů, míče a doplňků (pole řetězců; 'X' = bod). Vše vlastní kreslení.
(function (root) {
    'use strict';

    var FB = root.FB = root.FB || {};

    // hráč 8x11: stání, běh 1, běh 2, kop
    var PLAYER = [
        ['..XXX...', '..XXX...', '...X....', '.XXXXX..', '.XXXXX..', 'X.XXX.X.', '..XXX...', '..XXX...', '..X.X...', '..X.X...', '..X.X...'],
        ['..XXX...', '..XXX...', '...X....', '.XXXXX..', 'XXXXXX..', '..XXXX..', '..XXX...', '..XXX...', '.XX..X..', 'XX...XX.', 'X.....X.'],
        ['..XXX...', '..XXX...', '...X....', '.XXXXX..', '..XXXXX.', '..XXXX..', '..XXX...', '..XXX...', '..X.XX..', '.XX..XX.', '.X....X.'],
        ['..XXX...', '..XXX...', '...X....', '.XXXXX..', 'X.XXXX..', '..XXX...', '..XXXX..', '..X..XXX', '..X....X', '..X.....', '..X.....']
    ];
    // skluz 12x5
    var SLIDE = ['........XX..', '.......XXXX.', '..XXXXXXXXXX', '.XXXXXXXXXX.', 'XXX.........'];
    // brankář 8x11 (ruce nahoře), skok 12x6
    var GK = ['..XXX...', '..XXX...', 'XXXXXXX.', 'X.XXX.X.', 'X.XXX.X.', '..XXX...', '..XXX...', '..X.X...', '..X.X...', '..X.X...', '..X.X...'];
    var GKDIVE = ['........XX..', '.XX....XXXX.', 'XXXXXXXXXXXX', '.XXXXXXXXX.X', '...X.X....X.', '..X...X.....'];
    var BALL = ['.X.', 'XXX', '.X.'];
    var BALLBIG = ['.XX.', 'XXXX', 'XXXX', '.XX.'];
    var ARROW = ['XXXXX', '.XXX.', '..X..'];

    FB.SPR = { PLAYER: PLAYER, SLIDE: SLIDE, GK: GK, GKDIVE: GKDIVE, BALL: BALL, BALLBIG: BALLBIG, ARROW: ARROW };
})(typeof window !== 'undefined' ? window : globalThis);
