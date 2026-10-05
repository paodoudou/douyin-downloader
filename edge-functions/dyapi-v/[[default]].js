// EdgeOne Makers Edge Function —— 抖音短链同源反代（/dyapi-v/* → v.douyin.com）
// 短链会 302 到作品页，这里跟随跳转并把最终地址通过 X-Final-Url 回传给页面。
const ORIGIN = 'https://v.douyin.com/';
const PREFIX = '/dyapi-v/';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) EdgiOS/121.0.2277.107 Version/17.0 Mobile/15E148 Safari/604.1';

export default async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) {
    return new Response('not found', { status: 404 });
  }
  const target = ORIGIN + url.pathname.slice(PREFIX.length) + url.search;

  const headers = new Headers();
  headers.set('User-Agent', request.headers.get('x-dy-ua') || UA);
  headers.set('Referer', 'https://www.douyin.com/');
  headers.set('Accept', '*/*');
  const env = (context && context.env) || (typeof process !== 'undefined' && process.env) || {};
  const chunks = [];
  for (let i = 1; i <= 12; i++) {
    const v = env['DY_COOKIE_B64_' + i];
    if (!v) break;
    chunks.push(String(v).trim());
  }
  const rawEnv = env.DY_COOKIE_B64 || (chunks.length ? chunks.join('') : '') || env.DY_COOKIE || '';
  if (rawEnv) {
    let cookie = rawEnv;
    if (/^[A-Za-z0-9\-_]+$/.test(rawEnv) && rawEnv.length > 40) {
      try {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        let s = rawEnv.replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        let out = '', buf = 0, bits = 0;
        for (const ch of s) {
          if (ch === '=') break;
          const v = chars.indexOf(ch);
          if (v < 0) continue;
          buf = (buf << 6) | v; bits += 6;
          if (bits >= 8) { bits -= 8; out += String.fromCharCode((buf >> bits) & 0xFF); }
        }
        if (out.includes('=')) cookie = out;
      } catch (_) {}
    }
    headers.set('Cookie', cookie);
  }

  const resp = await fetch(target, { headers, redirect: 'follow' });
  const out = new Headers(resp.headers);
  out.delete('content-encoding');
  out.delete('content-length');
  out.set('X-Final-Url', resp.url);
  out.set('Access-Control-Allow-Origin', '*');
  out.set('Cache-Control', 'no-store');
  return new Response(resp.body, { status: resp.status, headers: out });
}
