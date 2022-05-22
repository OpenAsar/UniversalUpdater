
const { get } = require('https');
const { join } = require('path');

const zlib = require('zlib');
const fs = require('fs');
const cp = require('child_process');

const copyFolderSync = (orig, dest, cb) => {
  fs.mkdirSync(dest);

  for (const x of fs.readdirSync(orig)) {
    const from = join(orig, x);
    const to = join(dest, x);

    if (fs.lstatSync(from).isFile()) {
      fs.copyFileSync(from, to);
      cb?.(from);
    } else copyFolderSync(from, to, cb);
  }
};

const downloadPackage = async (url, path) => {
  const tarPath = path + '.tar';
  const exPath = path + '-ex';

  // console.log('Downloading package |', url, '->', path.replace(join(__dirname, '..'), '..'));

  const stream = zlib.createBrotliDecompress();

  stream.pipe(fs.createWriteStream(tarPath));

  let downloadTotal = 0, downloadCurrent = 0;
  get(url, (res) => {
    res.pipe(stream);

    downloadTotal = parseInt(res.headers['content-length'] ?? 1, 10);

    res.on('data', c => {
      downloadCurrent += c.length;

      process.stdout.write(`\r${((downloadCurrent / downloadTotal) * 100).toFixed(0)}% Downloading package... | ${url} -> ${path.replace(join(__dirname, '..'), '..')}`);
    });
  });

  await new Promise(res => stream.on('end', res));

  console.log();

  fs.mkdirSync(exPath);

  // try { fs.mkdirSync(path); } catch { }

  let extractTotal = 0, extractCurrent = 0;

  cp.execFile('tar', ['-tf', tarPath]).stdout.on('data', x => extractTotal += x.toString().split('\n').length - 1);

  const proc = cp.execFile('tar', ['-xvf', tarPath, '-C', exPath]);

  proc.on('error', e => {});
  proc.stdout.on('data', x => {
    extractCurrent += x.toString().split('\n').length - 1;

    process.stdout.write(`\r${((extractCurrent / extractTotal) * 100).toFixed(0)}% Extracting package... | ${url} -> ${path.replace(join(__dirname, '..'), '..')}`);
  });

  await new Promise(res => proc.on('close', res));

  console.log();

  fs.rm(tarPath, () => {});

  let copyTotal = extractTotal - 1, copyCurrent = 0;

  copyFolderSync(join(exPath, 'files'), path, x => {
    copyCurrent++;

    process.stdout.write(`\r${((copyCurrent / copyTotal) * 100).toFixed(0)}% Copying package... | ${url} -> ${path.replace(join(__dirname, '..'), '..')}`);
  });

  fs.rm(exPath, { recursive: true, force: true }, () => {});

  console.log('\nDownloaded package!');
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
  console.log(`Host update available! ${current.join('.')} -> ${latest.join('.')}\n`);
  await downloadPackage(manifest.full.url, join(paths.install, 'app-' + latest.join('.')));
};

const checkHost = async () => {
  const manifest = await getManifest();
  // console.log(manifest, '\n');

  console.log('Checking host...');

  const installMatch = __dirname.match(/app\-[0-9]+\.[0-9]+\.[0-9]+/);
  const current = installMatch[0].split('-')[1].split('.').map(x => parseInt(x));

  const installPath = __dirname.slice(0, installMatch.index - 1);
  const currentAppPath = __dirname.slice(0, installMatch.index + installMatch[0].length);

  const latest = manifest.full.host_version;

  console.log('Install path:', installPath);

  console.log(`Host: ${current.join('.')} (latest ${latest.join('.')})`);
  if (current.join('.') !== latest.join('.')) await updateHost(manifest, { install: installPath, current: currentAppPath }, current, latest);
};

const checkModules = async () => {
  const manifest = await getManifest();

  console.log('\nChecking modules...');

  const installMatch = __dirname.match(/app\-[0-9]+\.[0-9]+\.[0-9]+/);
  const currentAppPath = __dirname.slice(0, installMatch.index + installMatch[0].length);

  const modulesPath = join(currentAppPath, 'modules');

  try { fs.mkdirSync(modulesPath) } catch { }

  let installedModules = [];
  try {
    installedModules = fs.readdirSync(modulesPath);
  } catch { }

  for (const x of (manifest.required_modules.every(x => installedModules.some(y => y.includes(x + '-'))) ? installedModules : (console.log('Bootstrapping...') || manifest.required_modules))) {
    let [ name, current ] = x.split('-');
    if (current) current = parseInt(current);

    const moduleManifest = manifest.modules[name];
    const latest = moduleManifest.full.module_version;

    console.log(`Module: ${name}@${current} (latest: ${latest})`);
    if (!current || current !== latest) {
      console.log(`\nModule update available! ${name}@${current} -> ${latest}`);
      await downloadPackage(moduleManifest.full.url, join(modulesPath, [ name, latest ].join('-')))
    }
  }
};

(async () => {
  await checkHost();
  await checkModules();
})();