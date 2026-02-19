/**
 * @fileoverview Terminal output formatting with ASCII box-drawing for certificates and verification.
 */

import { styleText } from 'node:util';

import type { Certificate } from './core/types.ts';
import { ERAS } from './core/types.ts';

function shouldUseColor(): boolean {
  if (process.env['NO_COLOR'] !== undefined) {
    return false;
  }
  if (process.env['TERM'] === 'dumb') {
    return false;
  }
  if (process.argv.includes('--no-color')) {
    return false;
  }
  return process.stdout.isTTY === true;
}

export function style(format: string | string[], text: string): string {
  if (!shouldUseColor()) {
    return text;
  }
  return styleText(format as Parameters<typeof styleText>[0], text);
}

export const BOX_WIDTH = 50;

export function boxRule(): string {
  return style('dim', '+' + '-'.repeat(BOX_WIDTH + 2) + '+');
}

export function boxLine(content: string, rawLength: number): string {
  const pad = BOX_WIDTH - rawLength;
  return style('dim', '|') + ' ' + content + ' '.repeat(Math.max(pad, 0)) + ' ' + style('dim', '|');
}

function boxEmpty(): string {
  return boxLine('', 0);
}

const LABEL_WIDTH = 13;

function labelLine(label: string, value: string, styledValue: string, lines: string[]): void {
  const max = BOX_WIDTH - LABEL_WIDTH;
  if (value.length <= max) {
    lines.push(boxLine(style('dim', label) + styledValue, LABEL_WIDTH + value.length));
    return;
  }
  const indent = ' '.repeat(LABEL_WIDTH);
  let remaining = value;
  let isFirst = true;
  while (remaining.length > 0) {
    const chunk = remaining.slice(0, max);
    remaining = remaining.slice(max);
    const prefix = isFirst ? style('dim', label) : indent;
    lines.push(boxLine(prefix + chunk, LABEL_WIDTH + chunk.length));
    isFirst = false;
  }
}

export function displayCertificate(cert: Certificate): void {
  const out = process.stdout;
  const isLastGen = cert.era === 'LAST_GEN';
  const eraInfo = ERAS[cert.era];
  const lines: string[] = [];

  lines.push(boxRule());

  const title = style('bold', 'LASTGEN CERTIFICATE');
  const titleRaw = 'LASTGEN CERTIFICATE';
  const titlePadL = Math.floor((BOX_WIDTH - titleRaw.length) / 2);
  const titlePadR = BOX_WIDTH - titleRaw.length - titlePadL;
  lines.push(boxLine(' '.repeat(titlePadL) + title + ' '.repeat(titlePadR), BOX_WIDTH));

  lines.push(boxRule());

  labelLine('Certificate  ', cert.certificateNumber, cert.certificateNumber, lines);

  const issuedDate = new Date(cert.issuedAt).toISOString().slice(0, 10);
  labelLine('Issued       ', issuedDate, issuedDate, lines);

  lines.push(boxEmpty());

  const devValue = cert.identity.name
    ? `${cert.identity.username} (${cert.identity.name})`
    : cert.identity.username;
  labelLine('Developer    ', devValue, devValue, lines);

  const eraColor = isLastGen ? 'green' : 'cyan';
  labelLine('Era          ', eraInfo.title, style(eraColor, eraInfo.title), lines);
  labelLine('             ', eraInfo.description, style('dim', eraInfo.description), lines);

  if (cert.proof.firstCommit.sha) {
    lines.push(boxEmpty());

    const commitDate = new Date(cert.proof.firstCommit.date).toISOString().slice(0, 10);
    const repo = cert.proof.firstCommit.repo;
    labelLine('Proof Commit ', repo, repo, lines);
    const shaShort = cert.proof.firstCommit.sha.slice(0, 7);
    const commitMsg = `${shaShort} ${cert.proof.firstCommit.message.replace(/\n/g, ' ')}`;
    labelLine('             ', commitMsg, style('dim', commitMsg), lines);
    labelLine('Commit Date  ', commitDate, commitDate, lines);
  }

  lines.push(boxEmpty());

  const hash = cert.verification.hash;
  labelLine('Hash         ', hash, style('dim', hash), lines);

  lines.push(boxRule());

  out.write('\n' + lines.join('\n') + '\n\n');
}

export function displayBadgeMarkdown(cert: Certificate): void {
  const out = process.stdout;
  const eraLabel = cert.era === 'LAST_GEN' ? 'Last%20Gen' : 'AI%20Native';
  const color = cert.era === 'LAST_GEN' ? 'blue' : 'brightgreen';
  const badgeUrl = `https://img.shields.io/badge/lastgen-${eraLabel}-${color}?style=for-the-badge`;

  out.write('\n');
  out.write(style('bold', '  Add to your GitHub README:') + '\n');
  out.write('\n');
  out.write(`  [![Last Gen Coder](${badgeUrl})](https://github.com/pgagnidze/lastgen)\n`);
  out.write('\n');
}

export function displayJson(cert: Certificate): void {
  process.stdout.write(JSON.stringify(cert, null, 2) + '\n');
}

export function info(message: string): void {
  process.stderr.write(style('dim', `  ${message}`) + '\n');
}

export function error(message: string): void {
  process.stderr.write(style('red', `  ${message}`) + '\n');
}
