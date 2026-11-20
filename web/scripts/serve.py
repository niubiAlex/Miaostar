"""本地预览服务：和 python3 -m http.server 一样，但告诉浏览器每次都重新取文件。

不这样的话浏览器会用缓存里的旧脚本，改了代码刷新后新旧脚本混在一起跑。
另外支持按段取文件（Range）：Safari 放视频必须要，Chrome 没有它时会一直占着连接把整个视频拉完。
用法（在 web/ 下）：python3 scripts/serve.py [端口，默认 5173]
"""
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PAGES = {'/cats': '/cats.html', '/new': '/new.html', '/about': '/about.html', '/privacy': '/privacy.html', '/terms': '/terms.html'}


class NoCacheHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # /cats、/new 是固定页面；/house/12 是喵星首页飞到喵城镇 12 号；其余一段、没扩展名、又不是真文件的地址，都是某只猫的主页 /xiaowu。
        route = path.split('?', 1)[0].split('#', 1)[0].rstrip('/')
        if route in PAGES:
            return super().translate_path(PAGES[route])
        if route.startswith('/house/'):
            return super().translate_path('/index.html')
        real = super().translate_path(path)
        if route.count('/') == 1 and '.' not in route and route != '' and not Path(real).exists():
            return super().translate_path('/cat.html')
        return real

    def send_head(self):
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', self.headers.get('Range', ''))
        path = self.translate_path(self.path)
        if not match or not os.path.isfile(path):
            self.range = None
            return super().send_head()
        size = os.path.getsize(path)
        start = int(match[1]) if match[1] else max(0, size - int(match[2] or 0))
        end = min(int(match[2]), size - 1) if match[1] and match[2] else size - 1
        if start >= size:
            self.send_error(416)
            return None
        handle = open(path, 'rb')
        handle.seek(start)
        self.range = end - start + 1
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(self.range))
        self.end_headers()
        return handle

    def copyfile(self, source, outputfile):
        if self.range is None:
            return super().copyfile(source, outputfile)
        remaining = self.range
        while remaining > 0:
            chunk = source.read(min(65536, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    root = Path(__file__).resolve().parent.parent
    server = ThreadingHTTPServer(('127.0.0.1', port), partial(NoCacheHandler, directory=str(root)))
    print(f'http://127.0.0.1:{port}/home.html')
    server.serve_forever()
