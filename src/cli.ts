/**
 * @fileoverview CLI argument parsing and command routing using built-in parseArgs.
 */

import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';

import { fetchFirstCommit, fetchUser } from './core/github.ts';
import { createCertificate } from './core/proof.ts';
import { nodeHash } from './hash.ts';
import { displayBadgeMarkdown, displayCertificate, displayJson, error, info } from './display.ts';
import { verifyCertificate } from './verify-cli.ts';
import { serve } from './serve.ts';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const buildInfo: string[] = [];
if (process.env.GITHUB_SHA) {
  buildInfo.push(`commit: ${process.env.GITHUB_SHA.substring(0, 7)}`);
}
if (process.env.BUILD_DATE) {
  buildInfo.push(`built: ${process.env.BUILD_DATE}`);
}
const buildString = buildInfo.length > 0 ? ` (${buildInfo.join(', ')})` : '';

const VERSION = `lastgen ${pkg.version}${buildString}`;

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
    lastgen serve [--port <port>]     Launch web UI

  Options:
    --token <token>       GitHub personal access token
    --json                Output as JSON
    --badge               Output as README badge markdown
    --port <port>         Port for web UI (default: 3000)
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
    npx lastgen serve
`;

interface CliOptions {
  command: string;
  target: string;
  token?: string;
  port: number;
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
      port: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
      'no-color': { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  const first = positionals[0] ?? '';
  const isVerify = first === 'verify';
  const isServe = first === 'serve';

  return {
    command: isVerify ? 'verify' : isServe ? 'serve' : first ? 'lookup' : '',
    target: isVerify ? (positionals[1] ?? '') : first,
    token: (values.token as string | undefined) ?? process.env['GITHUB_TOKEN'],
    port: Number(values.port) || 3000,
    json: Boolean(values.json),
    badge: Boolean(values.badge),
    help: Boolean(values.help),
    version: Boolean(values.version),
  };
}

export async function run(argv: string[]): Promise<void> {
  const opts = parseCli(argv);

  if (opts.version) {
    process.stdout.write(VERSION + '\n');
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
    case 'serve': {
      serve(opts.port);
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

  const cert = await createCertificate(nodeHash, user, firstCommit);

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

  const valid = await verifyCertificate(opts.target, nodeHash, opts.token);
  if (!valid) {
    process.exitCode = 1;
  }
}
