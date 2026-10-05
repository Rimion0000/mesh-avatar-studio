import { parseRig } from '../rig/validate.ts';
import type { Rig } from '../rig/types';

export const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;
export interface ViewerPackage {
  format: 'mesh-avatar-viewer';
  version: 1;
  name: string;
  rig: Rig;
  assets: Record<string, { type: 'image/png' | 'application/json'; data: string }>;
}
type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('表示用ファイルの形式が違います。');
  return value as ObjectValue;
}
export function assetBytes(data: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(data), char => char.charCodeAt(0));
}

export function parseViewerPackage(value: unknown): ViewerPackage {
  const input = object(value);
  if (input.format !== 'mesh-avatar-viewer' || input.version !== 1) throw new Error('PCで npm run export:mio を実行して作ったJSONを選んでください。');
  const rig = parseRig(input.rig);
  const rawAssets = object(input.assets);
  const assets: ViewerPackage['assets'] = {};
  let total = 0;
  for (const [name, raw] of Object.entries(rawAssets)) {
    if (!/^(layers\.json|sprites\/sprites\.json|(?:sprites\/)?[a-zA-Z0-9_-]+\.png)$/.test(name)) throw new Error(`表示用ファイルに使えない素材名: ${name}`);
    const entry = object(raw);
    const type = name.endsWith('.png') ? 'image/png' : 'application/json';
    if (entry.type !== type || typeof entry.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(entry.data)) throw new Error(`素材の形式が違います: ${name}`);
    total += entry.data.length;
    if (total > MAX_PACKAGE_BYTES) throw new Error('表示用ファイルが大きすぎます（32MBまで）。');
    assets[name] = { type, data: entry.data };
  }
  const metadata = (name: string) => {
    if (!assets[name]) throw new Error(`素材が不足しています: ${name}`);
    return object(JSON.parse(new TextDecoder().decode(assetBytes(assets[name].data))));
  };
  const layers = metadata('layers.json');
  if (!Array.isArray(layers.size) || layers.size[0] !== rig.image.width || layers.size[1] !== rig.image.height) throw new Error('画像とリグのサイズが一致しません。PCで再出力してください。');
  const rectangles = { ...object(layers.layers) };
  const required = ['base.png', 'hairmask.png', ...[0, 1].flatMap(i => ['ball', 'low', 'crease', 'lash'].map(p => `eye${i}_${p}.png`)), ...(rig.hand ? ['hand.png'] : []), ...(rig.accessories ?? []).map(a => `${a.name}.png`)];
  if (assets['sprites/sprites.json']) {
    for (const [name, rect] of Object.entries(object(metadata('sprites/sprites.json').layers))) rectangles[`sprites/${name}`] = rect;
  }
  for (const [name, rect] of Object.entries(rectangles)) {
    if (!/^(?:sprites\/)?[a-zA-Z0-9_-]+$/.test(name) || !Array.isArray(rect) || rect.length !== 4 || rect.some(n => !Number.isInteger(n)) || rect[0] < 0 || rect[1] < 0 || rect[2] <= 0 || rect[3] <= 0 || rect[0] + rect[2] > rig.image.width || rect[1] + rect[3] > rig.image.height) throw new Error('レイヤーの設定が不正です。');
    required.push(`${name}.png`);
  }
  for (const name of new Set(required)) {
    if (!assets[name]) throw new Error(`素材が不足しています: ${name}`);
    const bytes = assetBytes(assets[name].data);
    if (bytes.length < 24 || [137, 80, 78, 71, 13, 10, 26, 10].some((v, i) => bytes[i] !== v)) throw new Error(`PNGではありません: ${name}`);
    const header = new DataView(bytes.buffer);
    const rect = rectangles[name.replace(/\.png$/, '')];
    const expected = Array.isArray(rect) ? rect.slice(2) : [rig.image.width, rig.image.height];
    if (header.getUint32(16) !== expected[0] || header.getUint32(20) !== expected[1]) throw new Error(`PNGのサイズが違います: ${name}`);
  }
  return { format: 'mesh-avatar-viewer', version: 1, name: typeof input.name === 'string' ? input.name.slice(0, 50) : 'Mio', rig, assets };
}

export function viewerAssetUrls(pack: ViewerPackage) {
  const assets = Object.fromEntries(Object.entries(pack.assets).map(([name, entry]) => [name, URL.createObjectURL(new Blob([assetBytes(entry.data)], { type: entry.type }))]));
  return { assets, release: () => Object.values(assets).forEach(url => URL.revokeObjectURL(url)) };
}
