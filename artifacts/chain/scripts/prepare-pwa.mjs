import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
await copyFile('assets/images/icon.png', path.join(root, 'chain-icon.png'));
await writeFile(path.join(root, 'manifest.webmanifest'), JSON.stringify({
  id: './', name: 'Chain', short_name: 'Chain', start_url: './', scope: './',
  display: 'standalone', background_color: '#050506', theme_color: '#050506',
  icons: [{ src: './chain-icon.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' }],
}));
let html = await readFile(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<meta\s+name="viewport"[^>]*>/i, '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">');
html = html.replace('</head>', `<meta name="theme-color" content="#050506">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="./chain-icon.png">
<link rel="manifest" href="./manifest.webmanifest">
<script src="./pwa.js" defer></script>
<style>html,body,#root{background:#050506;min-height:100%;overscroll-behavior:none}body{margin:0}#root{height:100dvh}@supports not (backdrop-filter:blur(1px)){[data-chain-glass]{background:#17171c}}</style>
</head>`);
await writeFile(path.join(root, 'index.html'), html);
await writeFile(path.join(root, 'pwa.js'), `(() => {
  const base = new URL('./', document.currentScript.src);
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  if (!('serviceWorker' in navigator)) return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.pathname });
      const offerUpdate = () => {
        if (!registration.waiting || document.getElementById('chain-update')) return;
        const button = document.createElement('button');
        button.id = 'chain-update'; button.textContent = 'Update Chain · your data stays saved';
        button.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top) + 8px);left:16px;right:16px;z-index:99999;padding:14px;border-radius:20px;border:1px solid #666;background:#25252e;color:white;font:14px system-ui;box-shadow:0 6px 24px #0008';
        button.onclick = () => { refreshing = true; registration.waiting?.postMessage('ACTIVATE_UPDATE'); };
        document.body.appendChild(button);
      };
      offerUpdate();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(); });
      });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) registration.update().catch(() => {}); });
    } catch (error) { console.warn('Chain offline setup could not finish', error); }
  });
})();`);
async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? filesIn(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}
const files = (await filesIn(root)).filter(file => !file.endsWith('.map') && path.basename(file) !== 'sw.js').sort();
const hash = createHash('sha256');
for (const file of files) { hash.update(path.relative(root, file)); hash.update(await readFile(file)); }
const version = hash.digest('hex').slice(0, 16);
const urls = files.map(file => './' + path.relative(root, file).split(path.sep).map(encodeURIComponent).join('/'));
await writeFile(path.join(root, 'sw.js'), `const CACHE = 'chain-offline-${version}';
const ASSETS = ${JSON.stringify(urls)};
const root = new URL('./', self.registration.scope);
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new URL(url, root).href)))));
self.addEventListener('message', event => { if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting(); });
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('chain-offline-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = event.request.mode === 'navigate' ? new URL('index.html', root).href : event.request;
    return await cache.match(key) || fetch(event.request);
  })());
});`);
console.log(`Chain PWA prepared: ${files.length} offline assets, version ${version}`);
