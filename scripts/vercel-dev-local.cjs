const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

function readLocalEnv(filePath) {
  const env = {};

  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).replace(/^export\s+/, '');
    if (key !== 'RELAY_URL' && key !== 'RELAY_SECRET') continue;

    let value = trimmed.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
    }

    env[key] = value;
  }

  return env;
}

let localEnv;
try {
  localEnv = readLocalEnv(resolve(process.cwd(), '.env.local'));
} catch (error) {
  console.error(`Impossible de lire .env.local : ${error.message}`);
  process.exit(1);
}

if (!localEnv.RELAY_URL || !localEnv.RELAY_SECRET) {
  console.error('.env.local doit définir RELAY_URL et RELAY_SECRET.');
  process.exit(1);
}

try {
  const relayUrl = new URL(localEnv.RELAY_URL);
  if (relayUrl.protocol !== 'https:' && relayUrl.protocol !== 'http:') {
    throw new Error();
  }
} catch {
  console.error('RELAY_URL dans .env.local doit être une URL HTTP(S) valide.');
  process.exit(1);
}

if (process.argv.includes('--check')) {
  console.log('Configuration locale du proxy valide (URL et secret présents).');
  process.exit(0);
}

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const vercel = spawn(command, ['vercel', 'dev', '--listen', '3000'], {
  stdio: 'inherit',
  env: { ...process.env, ...localEnv },
});

vercel.on('error', (error) => {
  console.error(`Impossible de démarrer Vercel CLI : ${error.message}`);
  process.exitCode = 1;
});

vercel.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exitCode = code ?? 1;
  }
});
