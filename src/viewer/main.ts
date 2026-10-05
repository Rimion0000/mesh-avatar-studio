import './style.css';
import { createMeshAvatar, type MeshAvatar } from '../engine';
import { MAX_PACKAGE_BYTES, parseViewerPackage, viewerAssetUrls, type ViewerPackage } from './package';
import { savedAvatar, saveAvatar } from './storage';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>('avatar');
const fileInput = element<HTMLInputElement>('avatar-file');
const status = element('status');
const pauseButton = element<HTMLButtonElement>('pause');
const smileButton = element<HTMLButtonElement>('smile');
let avatar: MeshAvatar | undefined;
let releaseAssets = () => {};
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let smiling = false;
let frame = 0;
let last = 0;
let busy = false;

function message(text: string, error = false) { status.textContent = text; status.dataset.error = String(error); }
function pauseLabel() { pauseButton.textContent = paused ? '再生' : '一時停止'; pauseButton.setAttribute('aria-pressed', String(paused)); }
function animate(now: number) {
  if (!paused && avatar && now - last >= 1000 / 30) { avatar.advance(1 / 30, 30); last = now; }
  frame = requestAnimationFrame(animate);
}
function startAnimation() {
  cancelAnimationFrame(frame);
  if (!document.hidden && avatar && !paused) { last = performance.now(); frame = requestAnimationFrame(animate); }
}

async function display(pack: ViewerPackage) {
  avatar?.destroy(); avatar = undefined;
  releaseAssets();
  const local = viewerAssetUrls(pack);
  releaseAssets = local.release;
  canvas.hidden = false;
  element('welcome').hidden = true;
  try {
    avatar = await createMeshAvatar(canvas, { rig: pack.rig, assets: local.assets, manual: true });
    avatar.advance(1);
    element('controls').hidden = false;
    element('forget').hidden = false;
    document.querySelector('h1')!.textContent = pack.name;
    smiling = false; smileButton.setAttribute('aria-pressed', 'false');
    pauseLabel(); startAnimation();
  } catch (error) {
    canvas.hidden = true; element('welcome').hidden = false; element('controls').hidden = true;
    releaseAssets();
    throw error;
  }
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file || busy) return;
  busy = true; fileInput.disabled = true; element<HTMLButtonElement>('forget').disabled = true; document.body.setAttribute('aria-busy', 'true');
  message('Mioを読み込んでいます…');
  try {
    if (file.size > MAX_PACKAGE_BYTES) throw new Error('表示用ファイルは32MBまでです。');
    const pack = parseViewerPackage(JSON.parse(await file.text()));
    await display(pack);
    try {
      await saveAvatar(pack);
      // Safari may decline persistence; successful IndexedDB storage still permits reloads.
      try { await navigator.storage?.persist?.(); } catch { /* Optional on Safari. */ }
      message('この端末に保存しました。次回も同じURLで開けます。');
    } catch { message('表示できました。端末への保存ができないため、次回はもう一度ファイルを開いてください。'); }
  } catch (error) { message(error instanceof Error ? error.message : 'ファイルを読み込めませんでした。', true); }
  finally { busy = false; fileInput.value = ''; fileInput.disabled = false; element<HTMLButtonElement>('forget').disabled = false; document.body.removeAttribute('aria-busy'); }
});

pauseButton.addEventListener('click', () => { paused = !paused; pauseLabel(); startAnimation(); avatar?.advance(0); });
smileButton.addEventListener('click', () => {
  smiling = !smiling; smileButton.setAttribute('aria-pressed', String(smiling));
  avatar?.setParameters(smiling ? { eyeROpen: 0, eyeLOpen: 0, eyeSmile: 1, eyeSmileL: 1, blush: .3 } : {});
  avatar?.advance(0);
});
element('nod').addEventListener('click', () => { paused = false; pauseLabel(); avatar?.play('nod'); startAnimation(); });
element('forget').addEventListener('click', async () => {
  try {
    await saveAvatar(null);
    cancelAnimationFrame(frame); avatar?.destroy(); avatar = undefined; releaseAssets();
    canvas.hidden = true; element('welcome').hidden = false; element('controls').hidden = true; element('forget').hidden = true;
    message('この端末に保存したMioを削除しました。');
  } catch { message('保存を削除できませんでした。SafariのWebサイトデータから削除できます。', true); }
});
document.addEventListener('visibilitychange', startAnimation);
window.addEventListener('resize', () => { if (paused) avatar?.advance(0); });
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); cancelAnimationFrame(frame); avatar?.destroy(); avatar = undefined;
  message('描画が中断されました。ページを再読み込みしてください。', true);
});

async function restore() {
  busy = true; fileInput.disabled = true;
  try {
    const value = await savedAvatar();
    if (value) { await display(parseViewerPackage(value)); message('この端末に保存したMioを表示しています。'); }
    else message('初回は「Mioを読み込む」から表示用ファイルを開いてください。');
  } catch { message('保存を読み込めませんでした。表示用ファイルをもう一度開いてください。', true); }
  finally { busy = false; fileInput.disabled = false; }
}
void restore();
