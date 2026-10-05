import { test, expect, devices } from '@playwright/test';
import { build } from 'vite';
import { createServer, type Server } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

test.use({ ...devices['iPhone 13'], browserName: 'chromium' });
let server: Server;
let url: string;
let pack: Buffer;
test.beforeAll(async () => {
  await build({ configFile: resolve('vite.viewer.config.ts'), logLevel: 'silent' });
  const files = new Map<string, Buffer>();
  for (const name of await readdir('dist/viewer', { recursive: true })) {
    if (/^(index\.html|assets\/[^/]+\.(js|css))$/.test(name)) files.set(name, await readFile(resolve('dist/viewer', name)));
  }
  server = createServer((req, res) => {
    const name = new URL(req.url!, 'http://viewer').pathname.replace(/^\/mio\//, '') || 'index.html';
    if (!files.has(name)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(files.get(name));
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Viewer server did not start.');
  url = `http://127.0.0.1:${address.port}/mio/`;
  const source = resolve('samples/miko-qipao');
  const rig = JSON.parse(await readFile(resolve(source, 'rig.json'), 'utf8'));
  const layers = JSON.parse(await readFile(resolve(source, 'built/layers.json'), 'utf8'));
  const sprites = JSON.parse(await readFile(resolve(source, 'built/sprites/sprites.json'), 'utf8'));
  const assets: Record<string, object> = {};
  for (const name of ['layers.json', 'base.png', 'hairmask.png', ...Object.keys(layers.layers).map(n => `${n}.png`), 'sprites/sprites.json', ...Object.keys(sprites.layers).map(n => `sprites/${n}.png`)]) {
    assets[name] = { type: name.endsWith('.json') ? 'application/json' : 'image/png', data: (await readFile(resolve(source, 'built', name))).toString('base64') };
  }
  pack = Buffer.from(JSON.stringify({ format: 'mesh-avatar-viewer', version: 1, name: 'Mio', rig, assets }));
});
test.afterAll(async () => { if (server) await new Promise<void>(done => server.close(() => done())); });

test('iPhone view keeps images local, reloads saved Mio, and deletes it', async ({ page }) => {
  const requests: { url: string; method: string }[] = [];
  const errors: string[] = [];
  page.on('request', request => requests.push({ url: request.url(), method: request.method() }));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await expect(page.getByRole('status')).toContainText('初回');
  await page.locator('#avatar-file').setInputFiles({ name: 'mio-viewer.json', mimeType: 'application/json', buffer: pack });
  await expect(page.getByRole('status')).toContainText('この端末に保存しました', { timeout: 30000 });
  await expect(page.locator('#avatar')).toBeVisible();
  await page.getByRole('button', { name: '一時停止' }).click();
  const picture = () => page.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
  const neutral = await picture();
  await page.getByRole('button', { name: '笑顔' }).click();
  expect(await picture()).not.toBe(neutral);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // A canvas's intrinsic height must not stretch its grid row and clip the feet.
  expect(await page.locator('canvas').evaluate(canvas => {
    const stage = canvas.parentElement!, box = canvas.getBoundingClientRect();
    return box.height <= stage.clientHeight + 1 && box.width <= stage.clientWidth + 1;
  })).toBe(true);
  await page.reload();
  await expect(page.getByRole('status')).toContainText('保存したMioを表示', { timeout: 30000 });
  await page.getByRole('button', { name: '保存を削除' }).click();
  await expect(page.locator('#welcome')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('status')).toContainText('初回');
  expect(errors).toEqual([]);
  expect(requests.filter(request => request.url.startsWith('http')).every(request => request.url.startsWith(url) && request.method === 'GET' && !/\.(png|json)(?:\?|$)/.test(request.url))).toBe(true);
});

test('a malformed file leaves the current saved avatar intact', async ({ page }) => {
  await page.goto(url);
  await expect(page.getByRole('status')).toContainText('初回');
  await page.locator('#avatar-file').setInputFiles({ name: 'mio-viewer.json', mimeType: 'application/json', buffer: pack });
  await expect(page.getByRole('status')).toContainText('保存しました', { timeout: 30000 });
  await page.locator('#avatar-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
  await expect(page.getByRole('status')).toContainText('export:mio');
  await expect(page.locator('canvas')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('status')).toContainText('保存したMioを表示', { timeout: 30000 });
});
