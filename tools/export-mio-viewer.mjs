import { readFile, writeFile, realpath, lstat } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRig } from '../src/rig/validate.ts';
import { parseViewerPackage, MAX_PACKAGE_BYTES } from '../src/viewer/package.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const projects = resolve(root, 'projects');
const args = process.argv.slice(2);
async function privatePath(path) {
  if (await realpath(projects) !== projects) throw new Error('projects/ にシンボリックリンクは使えません。');
  const actual = await realpath(path);
  const rel = relative(await realpath(projects), actual);
  if (rel.startsWith('..') || isAbsolute(rel) || !rel) throw new Error('入出力は projects/ 内に置いてください。');
  return actual;
}
try {
  if (args.includes('--help')) { console.log('Usage: npm run export:mio -- [projects/mio]'); }
  else {
    if (args.length > 1) throw new Error('プロジェクトフォルダを1つ指定してください。');
    const project = await privatePath(resolve(root, args[0] ?? 'projects/mio'));
    const rig = parseRig(JSON.parse(await readFile(await privatePath(resolve(project, 'rig.json')), 'utf8')));
    const assets = {};
    let total = 0;
    const add = async name => {
      if (!/^(layers\.json|sprites\/sprites\.json|(?:sprites\/)?[a-zA-Z0-9_-]+\.png)$/.test(name)) throw new Error(`素材名が不正です: ${name}`);
      const bytes = await readFile(await privatePath(resolve(project, 'built', name)));
      total += bytes.length;
      if (total * 4 / 3 > MAX_PACKAGE_BYTES - 65536) throw new Error('表示用ファイルが32MBを超えます。');
      assets[name] = { type: name.endsWith('.json') ? 'application/json' : 'image/png', data: bytes.toString('base64') };
      return bytes;
    };
    const layers = JSON.parse(await add('layers.json'));
    for (const name of ['base', 'hairmask', ...Object.keys(layers.layers)]) await add(`${name}.png`);
    const spriteFile = resolve(project, 'built/sprites/sprites.json');
    let hasSprites = false;
    try { await readFile(spriteFile); hasSprites = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (hasSprites) {
      const sprites = JSON.parse(await add('sprites/sprites.json'));
      for (const name of Object.keys(sprites.layers)) await add(`sprites/${name}.png`);
    }
    const pack = parseViewerPackage({ format: 'mesh-avatar-viewer', version: 1, name: 'Mio', rig, assets });
    const text = JSON.stringify(pack);
    if (Buffer.byteLength(text) > MAX_PACKAGE_BYTES) throw new Error('表示用ファイルが32MBを超えます。');
    const output = resolve(project, 'mio-viewer.json');
    try { if ((await lstat(output)).isSymbolicLink()) throw new Error('出力先にシンボリックリンクは使えません。'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await privatePath(dirname(output));
    await writeFile(output, text);
    console.log(`iPhone用ファイルを作成: ${relative(root, output)} (${(Buffer.byteLength(text) / 1024 / 1024).toFixed(1)} MB)`);
    console.log('画像を含む私用ファイルです。GitHubには追加せず、AirDropや「ファイル」で自分のiPhoneへ渡してください。');
  }
} catch (error) {
  console.error(`export:mio: ${error.message}`);
  process.exitCode = 1;
}
