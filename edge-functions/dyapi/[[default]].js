// EdgeOne Makers Edge Function —— 抖音接口同源反代（/dyapi/* → www.douyin.com）
// 作用：解决浏览器跨域限制，并透传 UA / Cookie / Uifid，让实况图集视频、合集、评论、登录可用。
// 路由：仓库 edge-functions/dyapi/[[default]].js → 所有 /dyapi/xxx 请求
const ORIGIN = 'https://www.douyin.com/';
const PREFIX = '/dyapi/';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) EdgiOS/121.0.2277.107 Version/17.0 Mobile/15E148 Safari/604.1';

export default async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) {
    return new Response('not found', { status: 404 });
  }
  const target = ORIGIN + url.pathname.slice(PREFIX.length) + url.search;

  // 浏览器 Cookie 可能很长（5KB+），只保留抖音鉴权相关字段，避免请求头超限
  const KEEP = ['sessionid', 'sessionid_ss', 'sid_tt', 'sid_guard', 'uid_tt', 'uid_tt_ss',
    'sid_ucp_v1', 'ssid_ucp_v1', 'passport_csrf_token', 'passport_csrf_token_default',
    'ttwid', 'UIFID', 'UIFID_TEMP', 's_v_web_id', 'odin_tt', 'msToken', 'd_ticket',
    'passport_assist_user', 'login_time'];
  const trimCookie = (raw) => {
    if (!raw) return '';
    const kept = [];
    for (const part of raw.split(';')) {
      const name = part.split('=')[0].trim();
      if (KEEP.indexOf(name) >= 0) kept.push(part.trim());
    }
    return kept.length ? kept.join('; ') : raw;
  };

  try {
    const headers = new Headers();
    headers.set('User-Agent', (request.headers.get('x-dy-ua') || UA).slice(0, 400));
    headers.set('Referer', 'https://www.douyin.com/');
    headers.set('Accept', '*/*');

    const rawCookie = request.headers.get('x-dy-cookie') || url.searchParams.get('__dyck') || '';
    const cookie = trimCookie(rawCookie);
    if (cookie) headers.set('Cookie', cookie);

    // 抖音风控要求带 Uifid 请求头（可从 Cookie 的 UIFID 字段推导）
    let uifid = request.headers.get('x-dy-uifid');
    if (!uifid) {
      const m = /(?:^|;\s*)UIFID=([^;]+)/.exec(rawCookie);
      if (m) uifid = m[1].trim();
    }
    if (uifid) headers.set('Uifid', uifid);

    const resp = await fetch(target, { headers, redirect: 'follow' });
    const out = new Headers(resp.headers);
    out.delete('content-encoding');
    out.delete('content-length');
    out.set('X-Final-Url', resp.url);
    out.set('X-Dy-Cookie-Len', String(cookie.length));
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
