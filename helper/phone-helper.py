# -*- coding: utf-8 -*-
"""
抖音下载 · 本地助手（手机端）

作用：在手机（或电脑）上跑一个小代理，让网页用「设备自身的网络 + 系统 curl 的客户端指纹」
去访问抖音官方接口。抖音对服务器/数据中心出口做了风控拦截，但对手机这种真实客户端是放行的，
所以实况图集的动态视频、评论区、合集混剪这些需要官方接口的功能，通过本地助手即可正常使用。

用法（手机 Termux）：
    pkg install python
    python phone-helper.py
然后刷新网页，右上角通道会变成「本地助手」。

用法（电脑）：python phone-helper.py 后同样刷新网页即可。
只监听 127.0.0.1，外部网络无法访问；Cookie 只在你的设备与本机进程之间传递。
"""
import os
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8787
UA = ('Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 '
      '(KHTML, like Gecko) EdgiOS/121.0.2277.107 Version/17.0 Mobile/15E148 Safari/604.1')
MAP = [
    ('/dyapi/', 'https://www.douyin.com/'),
    ('/dyapi-ies/', 'https://www.iesdouyin.com/'),
    ('/dyapi-v/', 'https://v.douyin.com/'),
]

# 优先用系统自带的 curl（Android 上是 BoringSSL，指纹与真实手机客户端一致）
CURL_CANDIDATES = ['/system/bin/curl', 'curl', '/usr/bin/curl', '/data/data/com.termux/files/usr/bin/curl']


def pick_curl():
    for path in CURL_CANDIDATES:
        if os.path.sep in path:
            if os.path.exists(path):
                return path
        else:
            from shutil import which
            found = which(path)
            if found:
                return found
    return None


CURL = pick_curl()


def curl_get(url, cookie='', uifid='', ua=UA):
    """用 curl 请求抖音，返回 (status, body_bytes, final_url)"""
    cmd = [CURL, '-s', '-L', '-m', '35', '-A', ua,
           '-H', 'Referer: https://www.douyin.com/', '-H', 'Accept: */*']
    if cookie:
        cmd += ['-H', 'Cookie: ' + cookie]
    if uifid:
        cmd += ['-H', 'Uifid: ' + uifid]
    cmd += ['-o', '-', '-w', '\n__STATUS__%{http_code}|%{url_effective}', url]
    out = subprocess.run(cmd, capture_output=True, timeout=60)
    raw = out.stdout or b''
    marker = b'\n__STATUS__'
    idx = raw.rfind(marker)
    if idx < 0:
        return 0, raw, url
    body = raw[:idx]
    meta = raw[idx + len(marker):].decode('utf-8', 'replace')
    code_part, _, final = meta.partition('|')
    try:
        code = int(code_part.strip())
    except ValueError:
        code = 0
    return code, body, (final.strip() or url)


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        self.send_header('Access-Control-Expose-Headers', 'X-Final-Url')

    def _send(self, code, body, ctype='application/json; charset=utf-8', final=''):
        if isinstance(body, str):
            body = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        if final:
            self.send_header('X-Final-Url', final)
        self._cors()
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            pass

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip('/') == '/health' or self.path == '/':
            self._send(200, 'douyin helper ok', 'text/plain; charset=utf-8')
            return
        if not CURL:
            self._send(500, 'curl not found: 请先在手机 Termux 里安装 curl（pkg install curl）',
                       'text/plain; charset=utf-8')
            return
        for prefix, origin in MAP:
            if self.path.startswith(prefix):
                target = origin + self.path[len(prefix):]
                cookie = self.headers.get('X-Dy-Cookie') or ''
                uifid = self.headers.get('X-Dy-Uifid') or ''
                if not uifid and cookie:
                    m = re.search(r'(?:^|;\s*)UIFID=([^;]+)', cookie)
                    if m:
                        uifid = m.group(1).strip()
                ua = self.headers.get('X-Dy-Ua') or UA
                try:
                    code, body, final = curl_get(target, cookie, uifid, ua)
                except Exception as exc:  # noqa: BLE001
                    self._send(502, 'helper error: %s' % exc, 'text/plain; charset=utf-8')
                    return
                # 原样回传（含抖音的 403 风控响应，便于页面提示）
                ctype = 'application/json; charset=utf-8'
                if body[:1] == b'<':
                    ctype = 'text/html; charset=utf-8'
                self._send(code or 502, body, ctype, final)
                print('[helper] %s -> %s [%s] %d bytes' % (self.path[:48], target[:64], code, len(body)), flush=True)
                return
        self._send(404, 'not found', 'text/plain; charset=utf-8')

    def log_message(self, fmt, *args):
        pass


if __name__ == '__main__':
    print('=' * 52)
    print('抖音下载 · 本地助手已启动')
    if CURL:
        print('使用 curl：%s' % CURL)
    else:
        print('⚠️ 没找到 curl，请先安装：Termux 里执行 pkg install curl')
    print('监听地址：http://127.0.0.1:%d  （仅本机可访问）' % PORT)
    print('现在打开网页刷新，右上角通道会变成「本地助手」')
    print('按 Ctrl+C 停止')
    print('=' * 52)
    try:
        ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print('\n已停止')
        sys.exit(0)
