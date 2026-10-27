import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, copyFile, rename, rmdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
// Static hosts may omit dependency/hidden directories. Publish exported assets
// under plain, content-hashed filenames and update Expo's literal asset URLs.
const assetsRoot = path.join(root, 'assets');
const assetPaths = await filesIn(assetsRoot);
const replacements = [];
for (const file of assetPaths) {
  const target = path.join(assetsRoot, path.basename(file));
  if (file === target) continue;
  if (assetPaths.some(other => other !== file && path.basename(other) === path.basename(file))) {
    throw new Error(`Duplicate exported asset filename: ${path.basename(file)}`);
  }
  replacements.push(['/' + path.relative(root, file).split(path.sep).join('/'), '/assets/' + path.basename(file)]);
  await rename(file, target);
}
async function removeEmptyDirectories(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const child = path.join(directory, entry.name);
      await removeEmptyDirectories(child);
      await rmdir(child);
    }
  }
}
await removeEmptyDirectories(assetsRoot);
for (const file of await filesIn(root)) {
  if (!/\.(js|css|html|json)$/.test(file)) continue;
  let contents = await readFile(file, 'utf8');
  for (const [before, after] of replacements) contents = contents.replaceAll(before, after);
  await writeFile(file, contents);
}
// Asset URL rewriting changes the bundle: give it a fresh URL for HTTP caches.
for (const file of await filesIn(path.join(root, '_expo', 'static', 'js'))) {
  if (!file.endsWith('.js')) continue;
  const digest = createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 32);
  const basename = path.basename(file);
  const nextName = basename.replace(/-[a-f0-9]+\.js$/, `-${digest}.js`);
  if (basename === nextName) continue;
  await rename(file, path.join(path.dirname(file), nextName));
  const indexPath = path.join(root, 'index.html');
  await writeFile(indexPath, (await readFile(indexPath, 'utf8')).replaceAll(basename, nextName));
}
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
      navigator.serviceWorker.ready.then(ready => ready.active?.postMessage('WARM_CACHE'));
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
await writeFile(path.join(root, 'sw.js'), `const CACHE = 'chain-offline-safari-v3-${version}';
const ASSETS = ${JSON.stringify(urls)};
const root = new URL('./', self.registration.scope);
function cleanResponse(response) {
  // A followed redirect retains a URL list in CacheStorage. Safari rejects it
  // when reused for navigation. Copy the readable body into a fresh response.
  if (!response.redirected) return response;
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
async function warmCache() {
  const cache = await caches.open(CACHE);
  await Promise.allSettled(ASSETS.map(async asset => {
    const key = new URL(asset, root);
    const response = await fetch(key, { cache: 'reload', credentials: 'same-origin' });
    const finalURL = new URL(response.url);
    const isShell = key.pathname === new URL('index.html', root).pathname;
    const validPath = decodeURIComponent(finalURL.pathname) === decodeURIComponent(key.pathname) || (isShell && finalURL.pathname === root.pathname);
    if (!response.ok || finalURL.origin !== root.origin || !validPath) throw new Error('Unexpected offline asset response');
    await cache.put(key, cleanResponse(response));
  }));
}
// Recovery must install even when authentication or an optional asset fails.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('message', event => {
  if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting();
  if (event.data === 'WARM_CACHE') event.waitUntil(warmCache());
});
self.addEventListener('activate', event => event.waitUntil((async () => {
  // Keep previous offline assets available during recovery. No user storage is touched.
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return;
  const route = url.pathname.slice(root.pathname.length).replace(/\\/$/, '');
  const appRoute = /^(|index.html|gate|plan|settings|onboarding|paywall|pause-gate-demo|gate-insights|gate-windows|chain\\/[^/]+|focus\\/[^/]+|rhythm\\/[^/]+)$/.test(route);
  // Let the browser handle authentication and other hosting routes directly.
  if (event.request.mode === 'navigate' && !appRoute) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = event.request.mode === 'navigate' ? new URL('index.html', root).href : event.request;
    let cached = await cache.match(key);
    if (!cached) {
      for (const name of (await caches.keys()).reverse()) {
        if (!name.startsWith('chain-offline-')) continue;
        cached = await (await caches.open(name)).match(key);
        if (cached) break;
      }
    }
    return cached ? cleanResponse(cached) : fetch(event.request);
  })());
});`);
console.log(`Chain PWA prepared: ${files.length} offline assets, version ${version}`);

