import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';

const root = path.resolve('dist');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    if (file === root) file = path.join(root, 'index.html');
    try { if (!(await stat(file)).isFile()) throw new Error(); }
    catch { if (path.extname(pathname)) { res.writeHead(404); res.end(); return; } file = path.join(root, 'index.html'); }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  } catch { res.writeHead(500); res.end('Chain could not be loaded.'); }
}).listen(Number(process.env.PORT || 4173), '0.0.0.0', () => console.log('Chain web app ready on port ' + (process.env.PORT || 4173)));
