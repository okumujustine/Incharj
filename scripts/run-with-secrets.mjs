import { spawn } from 'node:child_process';
import { loadSecrets as loadInfisicalSecrets, providerMetadata as infisicalMetadata } from './secrets/providers/infisical.mjs';

const providers = {
  infisical: {
    loadSecrets: loadInfisicalSecrets,
    metadata: infisicalMetadata,
  },
};

function fail(message) {
  console.error(`Secrets bootstrap error: ${message}`);
  process.exit(1);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    fail(`${name} is required`);
  }
  return value;
}

function parseCommand(argv) {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  if (args.length === 0) {
    fail('pass a command after `--`');
  }
  return args;
}

function getProvider() {
  const providerName = requiredEnv('SECRETS_PROVIDER').toLowerCase();
  const provider = providers[providerName];
  if (!provider) {
    fail(
      `unsupported SECRETS_PROVIDER "${providerName}". Supported providers: ${Object.keys(providers).join(', ')}`
    );
  }
  return provider;
}

async function loadSecretsFromProvider() {
  const provider = getProvider();
  return provider.loadSecrets({ fail, requiredEnv });
}

async function main() {
  const command = parseCommand(process.argv.slice(2));
  const [bin, ...args] = command;
  const secretsEnv = await loadSecretsFromProvider();

  const child = spawn(bin, args, {
    env: { ...secretsEnv, ...process.env },
    shell: false,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });

  child.on('error', (error) => {
    fail(error.message);
  });
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
