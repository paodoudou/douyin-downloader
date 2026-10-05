// EdgeOne Makers Edge Function —— 抖音接口同源反代 + 服务端签名
//   /dyapi/*  →  https://www.douyin.com/*
//
// 设计要点（安全）：
//   默认 Cookie 从「环境变量 DY_COOKIE」读取（在 Makers 控制台 → 项目设置 → 环境变量里配置），
//   不写入代码仓库、也不下发到浏览器，访问者既看不到也复制不了。
//   签名（a_bogus / x-secsdk-web-signature）在边缘节点本地计算，浏览器端无需提供 Cookie。

const ORIGIN = 'https://www.douyin.com/';
const PREFIX = '/dyapi/';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) EdgiOS/121.0.2277.107 Version/17.0 Mobile/15E148 Safari/604.1';

// 抖音做了签名保护的接口（官方 SDK protectedHost 列表）
const SIGNED_PATHS = [
  '/aweme/v1/web/aweme/detail/', '/aweme/v1/web/aweme/post/', '/aweme/v1/web/aweme/favorite/',
  '/aweme/v1/web/aweme/listcollection/', '/aweme/v1/web/mix/aweme/', '/aweme/v1/web/tab/feed/',
  '/aweme/v1/web/mix/list/', '/aweme/v1/web/music/aweme/', '/aweme/v1/web/music/list/',
  '/aweme/v1/web/mix/detail/', '/aweme/v1/web/mix/listcollection/', '/aweme/v1/web/music/detail/',
  '/aweme/v1/web/collects/list/', '/aweme/v1/web/collects/video/list/',
];
const SECSDK_SALT = 'A96D855A08C0A9707F8BEF0D9A527E4E';

/* ------------------------- MD5 ------------------------- */
const md5hex = (() => {
  const rl = (x, c) => (x << c) | (x >>> (32 - c));
  const au = (x, y) => {
    const l = (x & 0xFFFF) + (y & 0xFFFF);
    return (((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 0xFFFF);
  };
  const cmn = (q, a, b, x, s, t) => au(rl(au(au(a, q), au(x, t)), s), b);
  const ff = (a, b, c, d, x, s, t) => cmn((b & c) | (~b & d), a, b, x, s, t);
  const gg = (a, b, c, d, x, s, t) => cmn((b & d) | (c & ~d), a, b, x, s, t);
  const hh = (a, b, c, d, x, s, t) => cmn(b ^ c ^ d, a, b, x, s, t);
  const ii = (a, b, c, d, x, s, t) => cmn(c ^ (b | ~d), a, b, x, s, t);
  const hx = '0123456789abcdef';
  return function (str) {
    const bytes = new TextEncoder().encode(str);
    const bitLen = bytes.length * 8;
    const withOne = bytes.length + 1;
    const padLen = (56 - (withOne % 64) + 64) % 64;
    const total = withOne + padLen + 8;
    const buf = new Uint8Array(total);
    buf.set(bytes, 0);
    buf[bytes.length] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, bitLen >>> 0, true);
    dv.setUint32(total - 4, Math.floor(bitLen / 4294967296), true);
    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    const w = new Int32Array(16);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4, true);
      const [oa, ob, oc, od] = [a, b, c, d];
      a = ff(a, b, c, d, w[0], 7, -680876936); d = ff(d, a, b, c, w[1], 12, -389564586);
      c = ff(c, d, a, b, w[2], 17, 606105819); b = ff(b, c, d, a, w[3], 22, -1044525330);
      a = ff(a, b, c, d, w[4], 7, -176418897); d = ff(d, a, b, c, w[5], 12, 1200080426);
      c = ff(c, d, a, b, w[6], 17, -1473231341); b = ff(b, c, d, a, w[7], 22, -45705983);
      a = ff(a, b, c, d, w[8], 7, 1770035416); d = ff(d, a, b, c, w[9], 12, -1958414417);
      c = ff(c, d, a, b, w[10], 17, -42063); b = ff(b, c, d, a, w[11], 22, -1990404162);
      a = ff(a, b, c, d, w[12], 7, 1804603682); d = ff(d, a, b, c, w[13], 12, -40341101);
      c = ff(c, d, a, b, w[14], 17, -1502002290); b = ff(b, c, d, a, w[15], 22, 1236535329);
      a = gg(a, b, c, d, w[1], 5, -165796510); d = gg(d, a, b, c, w[6], 9, -1069501632);
      c = gg(c, d, a, b, w[11], 14, 643717713); b = gg(b, c, d, a, w[0], 20, -373897302);
      a = gg(a, b, c, d, w[5], 5, -701558691); d = gg(d, a, b, c, w[10], 9, 38016083);
      c = gg(c, d, a, b, w[15], 14, -660478335); b = gg(b, c, d, a, w[4], 20, -405537848);
      a = gg(a, b, c, d, w[9], 5, 568446438); d = gg(d, a, b, c, w[14], 9, -1019803690);
      c = gg(c, d, a, b, w[3], 14, -187363961); b = gg(b, c, d, a, w[8], 20, 1163531501);
      a = gg(a, b, c, d, w[13], 5, -1444681467); d = gg(d, a, b, c, w[2], 9, -51403784);
      c = gg(c, d, a, b, w[7], 14, 1735328473); b = gg(b, c, d, a, w[12], 20, -1926607734);
      a = hh(a, b, c, d, w[5], 4, -378558); d = hh(d, a, b, c, w[8], 11, -2022574463);
      c = hh(c, d, a, b, w[11], 16, 1839030562); b = hh(b, c, d, a, w[14], 23, -35309556);
      a = hh(a, b, c, d, w[1], 4, -1530992060); d = hh(d, a, b, c, w[4], 11, 1272893353);
      c = hh(c, d, a, b, w[7], 16, -155497632); b = hh(b, c, d, a, w[10], 23, -1094730640);
      a = hh(a, b, c, d, w[13], 4, 681279174); d = hh(d, a, b, c, w[0], 11, -358537222);
      c = hh(c, d, a, b, w[3], 16, -722521979); b = hh(b, c, d, a, w[6], 23, 76029189);
      a = hh(a, b, c, d, w[9], 4, -640364487); d = hh(d, a, b, c, w[12], 11, -421815835);
      c = hh(c, d, a, b, w[15], 16, 530742520); b = hh(b, c, d, a, w[2], 23, -995338651);
      a = ii(a, b, c, d, w[0], 6, -198630844); d = ii(d, a, b, c, w[7], 10, 1126891415);
      c = ii(c, d, a, b, w[14], 15, -1416354905); b = ii(b, c, d, a, w[5], 21, -57434055);
      a = ii(a, b, c, d, w[12], 6, 1700485571); d = ii(d, a, b, c, w[3], 10, -1894986606);
      c = ii(c, d, a, b, w[10], 15, -1051523); b = ii(b, c, d, a, w[1], 21, -2054922799);
      a = ii(a, b, c, d, w[8], 6, 1873313359); d = ii(d, a, b, c, w[15], 10, -30611744);
      c = ii(c, d, a, b, w[6], 15, -1560198380); b = ii(b, c, d, a, w[13], 21, 1309151649);
      a = ii(a, b, c, d, w[4], 6, -145523070); d = ii(d, a, b, c, w[11], 10, -1120210379);
      c = ii(c, d, a, b, w[2], 15, 718787259); b = ii(b, c, d, a, w[9], 21, -343485551);
      a = (a + oa) | 0; b = (b + ob) | 0; c = (c + oc) | 0; d = (d + od) | 0;
    }
    let out = '';
    [a, b, c, d].forEach((v) => {
      for (let i = 0; i < 4; i++) {
        const byte = (v >>> (i * 8)) & 0xFF;
        out += hx[(byte >> 4) & 0xF] + hx[byte & 0xF];
      }
    });
    return out;
  };
})();

/* ------------------------- SM3 ------------------------- */
const sm3hash = (() => {
  const IV = [0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600,
    0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e];
  const rotl = (x, n) => { n &= 31; return ((x << n) | (x >>> (32 - n))) >>> 0; };
  const P0 = (x) => (x ^ rotl(x, 9) ^ rotl(x, 17)) >>> 0;
  const P1 = (x) => (x ^ rotl(x, 15) ^ rotl(x, 23)) >>> 0;
  const T = (j) => (j <= 15 ? 0x79cc4519 : 0x7a879d8a);
  const FF = (j, x, y, z) => (j <= 15 ? (x ^ y ^ z) >>> 0 : ((x & y) | (x & z) | (y & z)) >>> 0);
  const GG = (j, x, y, z) => (j <= 15 ? (x ^ y ^ z) >>> 0 : ((x & y) | (~x & z)) >>> 0);
  return function (bytes) {
    const len = bytes.length;
    const bitLen = len * 8;
    const withOne = len + 1;
    const padLen = (56 - (withOne % 64) + 64) % 64;
    const total = withOne + padLen + 8;
    const buf = new Uint8Array(total);
    buf.set(bytes, 0);
    buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, Math.floor(bitLen / 4294967296), false);
    dv.setUint32(total - 4, bitLen >>> 0, false);
    let V = IV.slice();
    const W = new Uint32Array(68), W1 = new Uint32Array(64);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4, false);
      for (let i = 16; i < 68; i++) {
        W[i] = (P1((W[i - 16] ^ W[i - 9] ^ rotl(W[i - 3], 15)) >>> 0) ^ rotl(W[i - 13], 7) ^ W[i - 6]) >>> 0;
      }
      for (let i = 0; i < 64; i++) W1[i] = (W[i] ^ W[i + 4]) >>> 0;
      let A = V[0], B = V[1], C = V[2], D = V[3], E = V[4], F = V[5], G = V[6], H = V[7];
      for (let j = 0; j < 64; j++) {
        const SS1 = rotl(((rotl(A, 12) + E + rotl(T(j), j % 32)) >>> 0), 7);
        const SS2 = (SS1 ^ rotl(A, 12)) >>> 0;
        const TT1 = ((FF(j, A, B, C) + D + SS2 + W1[j]) >>> 0);
        const TT2 = ((GG(j, E, F, G) + H + SS1 + W[j]) >>> 0);
        D = C; C = rotl(B, 9); B = A; A = TT1;
        H = G; G = rotl(F, 19); F = E; E = P0(TT2);
      }
      V = [(V[0] ^ A) >>> 0, (V[1] ^ B) >>> 0, (V[2] ^ C) >>> 0, (V[3] ^ D) >>> 0,
           (V[4] ^ E) >>> 0, (V[5] ^ F) >>> 0, (V[6] ^ G) >>> 0, (V[7] ^ H) >>> 0];
    }
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) odv.setUint32(i * 4, V[i], false);
    return out;
  };
})();

/* ------------------------- A-Bogus ------------------------- */
const ABogusSign = (() => {
  const UA_KEY = new Uint8Array([0x00, 0x01, 0x0e]);
  const END_STRING = 'cus';
  const BROWSER = '1536|742|1536|864|0|0|0|0|1536|864|1536|864|1536|742|24|24|Win32';
  const S2 = 'Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=';
  const S4 = 'Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe';
  const toHex = (b) => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
  const utf8 = (s) => new TextEncoder().encode(s);
  function rc4(text, key) {
    const s = new Uint8Array(256);
    for (let i = 0; i < 256; i++) s[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) % 256; const t = s[i]; s[i] = s[j]; s[j] = t; }
    const out = new Uint8Array(text.length);
    let i = 0; j = 0;
    for (let k = 0; k < text.length; k++) {
      i = (i + 1) % 256; j = (j + s[i]) % 256;
      const t = s[i]; s[i] = s[j]; s[j] = t;
      out[k] = text[k] ^ s[(s[i] + s[j]) % 256];
    }
    return out;
  }
  function enc(bytes, table) {
    const masks = [0xFC0000, 0x03F000, 0x0FC0, 0x3F];
    const shifts = [18, 12, 6, 0];
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i];
      const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
      const n = ((a << 16) | (b << 8) | c) >>> 0;
      for (let k = 0; k < 4; k++) {
        if (k === 2 && i + 1 >= bytes.length) break;
        if (k === 3 && i + 2 >= bytes.length) break;
        out += table[((n & masks[k]) >>> shifts[k])];
      }
    }
    const pad = (4 - (out.length % 4)) % 4;
    return out + '='.repeat(pad);
  }
  const sm3HashDouble = (str) => sm3hash(utf8(toHex(sm3hash(utf8(str)))));
  function randList(a, b = 170, c = 85, d = 0, e = 0, f = 0, g = 0) {
    const r = a == null ? Math.random() * 10000 : a;
    const ri = Math.trunc(r);
    const v1 = ri & 255, v2 = ri >> 8;
    return [(v1 & b) | d, (v1 & c) | e, (v2 & b) | f, (v2 & c) | g];
  }
  function genString1() {
    const p1 = randList(null, 170, 85, 1, 2, 5, 45 & 170);
    const p2 = randList(null, 170, 85, 1, 0, 0, 0);
    const p3 = randList(null, 170, 85, 1, 0, 5, 0);
    return Uint8Array.from([...p1, ...p2, ...p3].map((n) => n & 255));
  }
  function list4(a, b, c, d, e, f, g, h, i, j, k, m, n, o, p, q, r) {
    return [44, a, 0, 0, 0, 0, 24, b, n, 0, c, d, 0, 0, 0, 1, 0, 239,
            e, o, f, g, 0, 0, 0, 0, h, 0, 0, 14, i, j, 0, k, m, 3, p, 1, q, 1, r, 0, 0, 0];
  }
  return function sign(urlParams, userAgent) {
    const browserCodes = Array.from(BROWSER).map((c) => c.charCodeAt(0));
    const uaCode = sm3hash(utf8(enc(rc4(utf8(userAgent), UA_KEY), S2)));
    const paramsCode = sm3HashDouble(urlParams + END_STRING);
    const methodCode = sm3HashDouble('GET' + END_STRING);
    const st = Date.now();
    const et = st + (4 + Math.floor(Math.random() * 5));
    const s1 = genString1();
    const a = list4(
      (et >>> 24) & 255, paramsCode[21], uaCode[23],
      (et >>> 16) & 255, paramsCode[22], uaCode[24],
      (et >>> 8) & 255, et & 255,
      (st >>> 24) & 255, (st >>> 16) & 255,
      (st >>> 8) & 255, st & 255,
      methodCode[21], methodCode[22], 0, 0, BROWSER.length,
    );
    let xorSum = a[0];
    for (let i = 1; i < a.length; i++) xorSum ^= a[i];
    const all = [...a, ...browserCodes, xorSum].map((n) => n & 255);
    const s2 = rc4(Uint8Array.from(all), utf8('y'));
    const joined = new Uint8Array(s1.length + s2.length);
    joined.set(s1, 0); joined.set(s2, s1.length);
    return enc(joined, S4);
  };
})();

/* ------------------------- WebSign ------------------------- */
const wsQuote = (s) => encodeURIComponent(s)
  .replace(/[!'()~]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
function websignNormalize(query) {
  return String(query).split('&').filter(Boolean).map((part) => {
    const i = part.indexOf('=');
    const name = i < 0 ? part : part.slice(0, i);
    const value = i < 0 ? '' : part.slice(i + 1);
    let dn = name, dv = value;
    try { dn = decodeURIComponent(name); } catch (_) {}
    try { dv = decodeURIComponent(value); } catch (_) {}
    return wsQuote(dn) + '=' + wsQuote(dv);
  }).join('&');
}

/** 按抖音要求重建带签名的 query（服务端完成，浏览器无需参与） */
function buildSignedPath(pathname, searchParams, uifid, userAgent) {
  const params = [];
  for (const [k, v] of searchParams.entries()) {
    if (k === 'a_bogus' || k === 'timestamp' || k === 'x-secsdk-web-signature') continue;
    params.push(k + '=' + v);
  }
  if (uifid) params.push('uifid=' + uifid);
  const protectedPath = SIGNED_PATHS.indexOf(pathname) >= 0;
  let query = params.join('&');
  if (protectedPath && uifid) query = websignNormalize(query);
  const ab = ABogusSign(query, userAgent);
  let signed = query + '&a_bogus=' + encodeURIComponent(ab);
  if (!(protectedPath && uifid)) return pathname + '?' + signed;
  const stamp = String(Math.floor(Date.now() / 1000));
  const withTs = websignNormalize(signed + '&timestamp=' + stamp);
  const sig = md5hex(uifid + '_' + stamp + '_' + SECSDK_SALT + '_' + withTs);
  return pathname + '?' + withTs + '&x-secsdk-web-signature=' + sig;
}

/** 只保留抖音鉴权相关字段，避免超长请求头 */
const KEEP_COOKIES = ['sessionid', 'sessionid_ss', 'sid_tt', 'sid_guard', 'uid_tt', 'uid_tt_ss',
  'sid_ucp_v1', 'ssid_ucp_v1', 'passport_csrf_token', 'passport_csrf_token_default',
  'ttwid', 'UIFID', 'UIFID_TEMP', 's_v_web_id', 'odin_tt', 'msToken', 'd_ticket',
  'passport_assist_user', 'login_time'];
function trimCookie(raw) {
  if (!raw) return '';
  const kept = [];
  for (const part of raw.split(';')) {
    const name = part.split('=')[0].trim();
    if (KEEP_COOKIES.indexOf(name) >= 0) kept.push(part.trim());
  }
  return kept.length ? kept.join('; ') : raw;
}
function cookieUifid(cookie) {
  const m = /(?:^|;\s*)UIFID=([^;]+)/.exec(cookie || '');
  return m ? m[1].trim() : '';
}

/* 环境变量里的 Cookie 可以是「明文」，也可以是 URL-safe base64（避免输入框拒绝空格/分号） */
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64decode(input) {
  let str = String(input).replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  let out = '', buffer = 0, bits = 0;
  for (const ch of str) {
    if (ch === '=') break;
    const v = B64_CHARS.indexOf(ch);
    if (v < 0) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((buffer >> bits) & 0xFF); }
  }
  return out;
}
function decodeEnvCookie(raw) {
  if (!raw) return '';
  if (/^[A-Za-z0-9\-_]+$/.test(raw) && raw.length > 40) {
    try {
      const text = b64decode(raw);
      if (text.includes('=')) return text;
    } catch (_) {}
  }
  return raw;
}
/** 支持单条或分片（控制台对单条值有 1000 字符限制）：DY_COOKIE_B64_1..N / DY_COOKIE_1..N */
function envCookieRaw(env) {
  if (env.DY_COOKIE_B64) return decodeEnvCookie(env.DY_COOKIE_B64);
  const b64 = [];
  for (let i = 1; i <= 12; i++) {
    const v = env['DY_COOKIE_B64_' + i];
    if (!v) break;
    b64.push(String(v).trim());
  }
  if (b64.length) return decodeEnvCookie(b64.join(''));
  if (env.DY_COOKIE) return decodeEnvCookie(env.DY_COOKIE);
  const plain = [];
  for (let i = 1; i <= 12; i++) {
    const v = env['DY_COOKIE_' + i];
    if (!v) break;
    plain.push(String(v).trim());
  }
  return plain.join('');
}

export default async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) {
    return new Response('not found', { status: 404 });
  }
  const env = (context && context.env) || (typeof process !== 'undefined' && process.env) || {};
  const envCookie = envCookieRaw(env);
  // 访客自己填的 Cookie 优先；没填就用环境变量里的默认 Cookie（默认值不写入代码、不下发浏览器）
  const rawCookie = request.headers.get('x-dy-cookie') || url.searchParams.get('__dyck') || envCookie;
  const cookie = trimCookie(rawCookie);
  const uifid = request.headers.get('x-dy-uifid') || cookieUifid(rawCookie);
  const userAgent = (request.headers.get('x-dy-ua') || UA).slice(0, 400);

  const pathname = url.pathname.slice(PREFIX.length - 1); // 保留开头的 /
  const base = ORIGIN.replace(/\/$/, '');

  // 诊断：/dyapi/__env__ 只回报环境变量是否存在与长度，不返回内容
  if (pathname === '/__env__') {
    const info = {
      hasDY_COOKIE: !!env.DY_COOKIE,
      hasDY_COOKIE_B64: !!env.DY_COOKIE_B64,
      chunkLengths: [],
      dyKeys: Object.keys(env).filter((k) => k.indexOf('DY_') === 0).slice(0, 20),
      codeVersion: 'sign-v2',
    };
    for (let i = 1; i <= 12; i++) {
      const v = env['DY_COOKIE_B64_' + i];
      if (v) info.chunkLengths.push(String(v).length);
    }
    return new Response(JSON.stringify(info, null, 1), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
    });
  }

  let target;

  // 通用取流：/dyapi/__proxy__?u=<目标地址>——用于下载视频/图片（只允许抖音系域名）
  if (pathname === '/__proxy__') {
    const raw = url.searchParams.get('u') || '';
    let t;
    try { t = new URL(raw); } catch (_) { return new Response('bad url', { status: 400 }); }
    if (t.protocol !== 'https:') return new Response('https only', { status: 400 });
    const host = t.hostname;
    const allowed = /(^|\.)(douyin\.com|douyinpic\.com|douyinvod\.com|douyinstatic\.com|bytednsdoc\.com|byteimg\.com|pstatp\.com|snssdk\.com|amemv\.com)$/i.test(host);
    if (!allowed) return new Response('domain not allowed', { status: 403 });
    try {
      const r = await fetch(t.href, {
        headers: { 'User-Agent': UA, Accept: '*/*' },   // 不带 Referer/Cookie，CDN 不需要
        redirect: 'follow',
      });
      const out = new Headers();
      out.set('content-type', r.headers.get('content-type') || 'application/octet-stream');
      out.set('Access-Control-Allow-Origin', '*');
      out.set('Cache-Control', 'no-store');
      out.set('X-Final-Url', r.url);
      return new Response(r.body, { status: r.status, headers: out });
    } catch (e) {
      return new Response('proxy error: ' + ((e && e.message) || e), {
        status: 502, headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  }

  try {
    target = base + buildSignedPath(pathname, url.searchParams, uifid, userAgent);
  } catch (e) {
    target = base + pathname + url.search;
  }

  try {
    const headers = new Headers();
    headers.set('User-Agent', userAgent);
    headers.set('Referer', 'https://www.douyin.com/');
    headers.set('Accept', '*/*');
    if (cookie) headers.set('Cookie', cookie);
    if (uifid) headers.set('Uifid', uifid);

    const resp = await fetch(target, { headers, redirect: 'follow' });
    const out = new Headers(resp.headers);
    out.delete('content-encoding');
    out.delete('content-length');
    out.delete('set-cookie');          // 不回传任何 Cookie，避免会话信息泄露到浏览器
    out.delete('set-cookie2');
    out.set('X-Final-Url', resp.url);
    out.set('Access-Control-Allow-Origin', '*');
    out.set('Cache-Control', 'no-store');
    return new Response(resp.body, { status: resp.status, headers: out });
  } catch (e) {
    return new Response('proxy error: ' + ((e && e.message) || e), {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}
