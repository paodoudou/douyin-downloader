// EdgeOne Makers Edge Function —— 抖音分享页同源反代（/dyapi-ies/* → www.iesdouyin.com）
// 分享页需要带 Cookie 才会返回完整数据（实况图集的作品数据就在这里）。
const ORIGIN = 'https://www.iesdouyin.com/';
const PREFIX = '/dyapi-ies/';
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

  // 默认 Cookie 从环境变量 DY_COOKIE 读取（控制台配置，不写入仓库、不下发浏览器）
  const env = (context && context.env) || (typeof process !== 'undefined' && process.env) || {};
  const cookie = request.headers.get('x-dy-cookie') || url.searchParams.get('__dyck') || env.DY_COOKIE;
  if (cookie) headers.set('Cookie', cookie);

  let uifid = request.headers.get('x-dy-uifid');
  if (!uifid && cookie) {
    const m = /(?:^|;\s*)UIFID=([^;]+)/.exec(cookie);
    if (m) uifid = m[1].trim();
  }
  if (uifid) headers.set('Uifid', uifid);

  const resp = await fetch(target, { headers, redirect: 'follow' });
  const out = new Headers(resp.headers);
  out.delete('content-encoding');
  out.delete('content-length');
  out.set('X-Final-Url', resp.url);
  out.set('Access-Control-Allow-Origin', '*');
  out.set('Cache-Control', 'no-store');
  return new Response(resp.body, { status: resp.status, headers: out });
}
