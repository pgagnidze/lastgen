/**
 * @fileoverview CLI argument parsing and command routing using built-in parseArgs.
 */

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchFirstCommit, fetchUser } from './github.ts';
import { createCertificate } from './proof.ts';
import { displayBadgeMarkdown, displayCertificate, displayJson, error, info } from './display.ts';
import { verifyCertificate } from './verify.ts';

function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packagePath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

const HELP_BRIEF = `
    _            _
   | | __ _ ___ | |_  __ _  ___ _ __
   | |/ _\` / __|| __/ _\` |/ _ \\ '_ \\
   | | (_| \\__ \\| || (_| |  __/ | | |
   |_|\\__,_|___/ \\__\\__, |\\___|_| |_|
                     |___/
  Check if you started coding before or after AI agents.

  Usage:
    lastgen <username>                Classify a GitHub user
    lastgen verify <file.json>        Verify a saved certificate

  Options:
    --token <token>       GitHub personal access token
    --json                Output as JSON
    --badge               Output as README badge markdown
    --no-color            Disable colors
    -h, --help            Show this help
    -v, --version         Show version

  Environment:
    GITHUB_TOKEN          GitHub token (alternative to --token)
    NO_COLOR              Disable colors (any value)

  Examples:
    npx lastgen torvalds
    npx lastgen --json torvalds > proof.json
    npx lastgen verify proof.json
    npx lastgen --badge torvalds
`;

interface CliOptions {
  command: string;
  target: string;
  token?: string;
  json: boolean;
  badge: boolean;
  help: boolean;
  version: boolean;
}

export function parseCli(argv: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      token: { type: 'string' },
      json: { type: 'boolean', default: false },
      badge: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
      'no-color': { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  const first = positionals[0] ?? '';
  const isVerify = first === 'verify';

  return {
    command: isVerify ? 'verify' : first ? 'lookup' : '',
    target: isVerify ? (positionals[1] ?? '') : first,
    token: (values.token as string | undefined) ?? process.env['GITHUB_TOKEN'],
    json: Boolean(values.json),
    badge: Boolean(values.badge),
    help: Boolean(values.help),
    version: Boolean(values.version),
  };
}

export async function run(argv: string[]): Promise<void> {
  const opts = parseCli(argv);

  if (opts.version) {
    process.stdout.write(`lastgen ${getVersion()}\n`);
    return;
  }

  if (opts.help || !opts.command) {
    process.stdout.write(HELP_BRIEF);
    return;
  }

  switch (opts.command) {
    case 'lookup': {
      await handleLookup(opts);
      break;
    }
    case 'verify': {
      await handleVerify(opts);
      break;
    }
    default: {
      error(`Unknown command: ${opts.command}`);
      process.stdout.write(HELP_BRIEF);
      process.exitCode = 2;
    }
  }
}

async function handleLookup(opts: CliOptions): Promise<void> {
  if (!opts.target) {
    error('Username required. Usage: lastgen <username>');
    process.exitCode = 2;
    return;
  }

  if (!opts.json && !opts.badge) {
    info(`Looking up ${opts.target} on GitHub...`);
  }

  const [user, firstCommit] = await Promise.all([
    fetchUser(opts.target, opts.token),
    fetchFirstCommit(opts.target, opts.token),
  ]);

  const cert = createCertificate(user, firstCommit);

  if (opts.badge) {
    displayBadgeMarkdown(cert);
  } else if (opts.json) {
    displayJson(cert);
  } else {
    displayCertificate(cert);
  }
}

async function handleVerify(opts: CliOptions): Promise<void> {
  if (!opts.target) {
    error('Certificate file required. Usage: lastgen verify <file.json>');
    process.exitCode = 2;
    return;
  }

  const valid = await verifyCertificate(opts.target, opts.token);
  if (!valid) {
    process.exitCode = 1;
  }
}
