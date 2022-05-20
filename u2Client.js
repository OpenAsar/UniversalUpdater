
const { get } = require('https');
const { join } = require('path');

const zlib = require('zlib');
const fs = require('fs');
const cp = require('child_process');

const copyFolderSync = (orig, dest) => {
  fs.mkdirSync(dest);

  for (const x of fs.readdirSync(orig)) {
    const from = join(orig, x);
    const to = join(dest, x);

    if (fs.lstatSync(from).isFile()) fs.copyFileSync(from, to);
      else copyFolderSync(from, to);
  }
};

const downloadPackage = async (url, path) => {
  const tarPath = path + '.tar';
  const exPath = path + '-ex';

  console.log('downloading package...', url, path);

  const stream = zlib.createBrotliDecompress();

  stream.pipe(fs.createWriteStream(tarPath));

  get(url, (res) => {
    res.pipe(stream);
  });

  await new Promise(res => stream.on('end', res));

  fs.mkdirSync(exPath);

  // try { fs.mkdirSync(path); } catch { }

  const proc = cp.execFile('tar', ['-xvf', tarPath, '-C', exPath]);

  proc.on('error', e => {});
  proc.stdout.on('data', x => {});

  await new Promise(res => proc.on('close', res));

  fs.rm(tarPath, () => {});

  copyFolderSync(join(exPath, 'files'), path);

  fs.rm(exPath, { recursive: true, force: true }, () => {});
};


let _manifest;
const getManifest = () => _manifest = _manifest ?? new Promise((resolve) => get('https://discord.com/api/updates/distributions/app/manifests/latest?channel=canary&platform=win&arch=x86', (res) => {
  let data = '';

  res.on('data', chunk => data += chunk);

  res.on('end', () => {
    resolve(JSON.parse(data));
  });
}));

const updateHost = async (manifest, paths, current, latest) => {
  await downloadPackage(manifest.full.url, join(paths.install, 'app-' + latest.join('.')));
};

const checkHost = async () => {
  const manifest = await getManifest();
  console.log(manifest);

  const installMatch = __dirname.match(/app\-[0-9]+\.[0-9]+\.[0-9]+/);
  const current = installMatch[0].split('-')[1].split('.').map(x => parseInt(x));

  const installPath = __dirname.slice(0, installMatch.index - 1);
  const currentAppPath = __dirname.slice(0, installMatch.index + installMatch[0].length);

  console.log({ current, installPath, currentAppPath });

  const latest = manifest.full.host_version;

  console.log(current.join('.'), latest.join('.'));
  if (current.join('.') !== latest.join('.')) await updateHost(manifest, { install: installPath, current: currentAppPath }, current, latest);
};

checkHost();