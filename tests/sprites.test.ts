import { expect, test } from 'vitest';
import fixture from '../samples/miko-qipao/rig.json';
import { parseRig } from '../src/rig/validate';
import { createRig, PARAMS } from '../src/engine/rig.js';
import { createPhysics } from '../src/engine/physics.js';
import { createSpriteModule } from '../src/engine/sprites.js';

function setup() {
  const rig = parseRig(fixture);
  const engine = createRig(rig);
  const layers = new Map<string, { visible: boolean; alpha: number }>();
  const renderer = {
    addLayer(name: string) {
      const layer = { visible: true, alpha: 1 };
      layers.set(name, layer);
      return layer;
    },
  };
  const names = ['eyes_closed_0', 'eyes_closed_1', 'eyes_half_0', 'eyes_half_1', 'eyes_smile_0', 'eyes_smile_1'];
  const sheet = { layers: Object.fromEntries(names.map(name => [name, [450, 415, 40, 30]])) };
  const images = Object.fromEntries(names.map(name => [name, { width: 40, height: 30 }]));
  const grid = () => ({ rest: new Float32Array([465, 430]), pos: new Float32Array(2) });
  const parameters = Object.fromEntries(PARAMS.map(p => [p.id, p.def]));
  const { Physics } = createPhysics(engine, rig);
  const physics = new Physics().step(parameters, 0);
  // The JS factory's descriptive JSDoc infers the image map as void.
  type Factory = (target: typeof renderer, metadata: typeof sheet, textures: typeof images,
    gridBuilder: typeof grid, alpha: () => Uint8Array) => {
      update(pose: Record<string, number>, state: typeof physics, dt: number): { eyes: boolean[]; mouth: string | null };
    };
  const createSprites = createSpriteModule(engine, rig).createSprites as unknown as Factory;
  const sprites = createSprites(renderer, sheet, images, grid, () => new Uint8Array(1200).fill(255));
  return { sprites, layers, parameters, physics };
}

test('paused zero-time renders apply closed, half, smiling and open eyes immediately', () => {
  const { sprites, layers, parameters, physics } = setup();
  for (const [open, smile, name] of [[0, 0, 'eyes_closed'], [0.5, 0, 'eyes_half'], [0, 1, 'eyes_smile']] as const) {
    const covered = sprites.update({ ...parameters, eyeLOpen: open, eyeROpen: open, eyeSmile: smile, eyeSmileL: smile }, physics, 0);
    expect(covered.eyes).toEqual([true, true]);
    expect([...layers].filter(([, layer]) => layer.visible).map(([key]) => key).sort()).toEqual([`${name}_0`, `${name}_1`]);
    expect(layers.get(`${name}_0`)!.alpha).toBe(1);
    expect(layers.get(`${name}_1`)!.alpha).toBe(1);
  }
  expect(sprites.update(parameters, physics, 0).eyes).toEqual([false, false]);
  expect([...layers.values()].every(layer => !layer.visible)).toBe(true);
});

test('animated eyes retain their timed cross-fade', () => {
  const { sprites, layers, parameters, physics } = setup();
  const closed = { ...parameters, eyeLOpen: 0, eyeROpen: 0 };
  expect(sprites.update(closed, physics, 1 / 60).eyes).toEqual([false, false]);
  expect(layers.get('eyes_closed_0')!.alpha).toBeGreaterThan(0);
  expect(layers.get('eyes_closed_0')!.alpha).toBeLessThan(1);
  expect(sprites.update(closed, physics, 0.1).eyes).toEqual([true, true]);
});
