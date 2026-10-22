// Ruční zápis PNG (RGB) přes zlib – pro kontrolu vzhledu framebufferu.
'use strict';
var zlib = require('zlib');
var fs = require('fs');
function crc32(buf) {
    var c, crc = 0xFFFFFFFF;
    for (var n = 0; n < buf.length; n++) {
        c = (crc ^ buf[n]) & 0xFF;
        for (var k = 0; k < 8; k++) { c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
    var len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    var td = Buffer.concat([Buffer.from(type), data]);
    var crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}
// rgba: Uint8ClampedArray w*h*4, scale = celočíselné zvětšení
exports.write = function (file, rgba, w, h, scale) {
    scale = scale || 1;
    var W = w * scale, H = h * scale, raw = Buffer.alloc((W * 3 + 1) * H), o = 0;
    for (var y = 0; y < H; y++) {
        raw[o++] = 0;
        for (var x = 0; x < W; x++) {
            var i = (Math.floor(y / scale) * w + Math.floor(x / scale)) * 4;
            raw[o++] = rgba[i]; raw[o++] = rgba[i + 1]; raw[o++] = rgba[i + 2];
        }
    }
    var ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
    fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
};
