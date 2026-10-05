import { execFileSync } from 'node:child_process';
import { readFile, readdir, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const branch = 'mio/viewer-site';
const git = (args, options = {}) => execFileSync('git', args, { cwd: root, encoding: 'utf8', ...options }).trim();
let scratch;
try {
  const npm = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
  const buildArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run build:viewer'] : ['run', 'build:viewer'];
  execFileSync(npm, buildArgs, { cwd: root, stdio: 'inherit' });
  const dist = resolve(root, 'dist/viewer');
  const entries = await readdir(dist, { recursive: true, withFileTypes: true });
  const files = new Map([['.nojekyll', Buffer.alloc(0)]]);
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const path = resolve(entry.parentPath, entry.name);
    const name = path.slice(dist.length + 1).replaceAll('\\', '/');
    // A positive list keeps every source image and generated layer out of the site.
    if (!entry.isFile() || !/^(index\.html|assets\/[A-Za-z0-9_-]+\.(js|css))$/.test(name)) throw new Error(`公開対象にできないファイル: ${name}`);
    files.set(name, await readFile(path));
  }
  if (!files.has('index.html') || files.size < 4) throw new Error('閲覧ページのビルドが不足しています。');
  const ref = `refs/heads/${branch}`;
  const remote = git(['ls-remote', '--heads', 'origin', ref]).split(/\s/)[0];
  if (remote) git(['fetch', '--no-tags', 'origin', ref]);
  await mkdir(resolve(root, 'work'), { recursive: true });
  scratch = await mkdtemp(resolve(root, 'work/viewer-publish-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(scratch, 'index') };
  git(['read-tree', '--empty'], { env });
  for (const [name, content] of files) {
    const blob = git(['hash-object', '-w', '--stdin'], { input: content });
    git(['update-index', '--add', '--cacheinfo', `100644,${blob},${name}`], { env });
  }
  const tree = git(['write-tree'], { env });
  if (remote && tree === git(['rev-parse', `${remote}^{tree}`])) console.log('公開ブランチはすでに同じ内容です。');
  else {
    const commit = git(['commit-tree', tree, ...(remote ? ['-p', remote] : []), '-m', 'Publish image-free Mio viewer']);
    git(['push', 'origin', `${commit}:${ref}`], { stdio: ['pipe', 'pipe', 'inherit'] });
    console.log(`画像を含まない閲覧ページを origin/${branch} に保存しました。`);
  }
  console.log('GitHub Pagesの公開元: mio/viewer-site ブランチの / (root)');
} catch (error) {
  console.error(`publish:viewer: ${error.message}`);
  process.exitCode = 1;
} finally { if (scratch) await rm(scratch, { recursive: true, force: true }); }
