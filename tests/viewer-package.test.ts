import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseViewerPackage, type ViewerPackage } from '../src/viewer/package';

function samplePackage(): ViewerPackage {
  const base = resolve('samples/miko-qipao');
  const rig = JSON.parse(readFileSync(resolve(base, 'rig.json'), 'utf8'));
  const layers = JSON.parse(readFileSync(resolve(base, 'built/layers.json'), 'utf8'));
  const assets: ViewerPackage['assets'] = {};
  for (const name of ['layers.json', 'base.png', 'hairmask.png', ...Object.keys(layers.layers).map(n => `${n}.png`)]) {
    assets[name] = { type: name.endsWith('.json') ? 'application/json' : 'image/png', data: readFileSync(resolve(base, 'built', name)).toString('base64') };
  }
  return { format: 'mesh-avatar-viewer', version: 1, name: 'Sample', rig, assets };
}
describe('portable viewer packages', () => {
  it('accepts the real sample layers and optional drawn expressions', () => {
    const pack = samplePackage();
    const sprites = JSON.parse(readFileSync('samples/miko-qipao/built/sprites/sprites.json', 'utf8'));
    for (const name of ['sprites/sprites.json', ...Object.keys(sprites.layers).map(n => `sprites/${n}.png`)]) {
      pack.assets[name] = { type: name.endsWith('.json') ? 'application/json' : 'image/png', data: readFileSync(`samples/miko-qipao/built/${name}`).toString('base64') };
    }
    expect(parseViewerPackage(pack).rig.image).toEqual(pack.rig.image);
  });
  it('refuses remote image URLs and filesystem paths', () => {
    const pack = samplePackage();
    pack.assets['base.png'].data = 'https://example.com/private.png';
    expect(() => parseViewerPackage(pack)).toThrow('素材の形式');
    pack.assets['base.png'].data = samplePackage().assets['base.png'].data;
    pack.assets['../../source.png'] = pack.assets['base.png'];
    expect(() => parseViewerPackage(pack)).toThrow('素材名');
  });
  it('detects missing eye layers before opening a project', () => {
    const pack = samplePackage();
    delete pack.assets['eye0_lash.png'];
    expect(() => parseViewerPackage(pack)).toThrow('eye0_lash.png');
  });
  it('rejects PNG dimensions that disagree with the layer crop', () => {
    const pack = samplePackage();
    pack.assets['eye0_ball.png'] = pack.assets['base.png'];
    expect(() => parseViewerPackage(pack)).toThrow('PNGのサイズ');
  });
  it('rejects unsupported export versions and a mismatched source size', () => {
    const pack = samplePackage();
    expect(() => parseViewerPackage({ ...pack, version: 9 })).toThrow('export:mio');
    pack.rig.image.width++;
    expect(() => parseViewerPackage(pack)).toThrow('サイズが一致');
  });
});
