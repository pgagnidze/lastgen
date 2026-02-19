/**
 * @fileoverview CLI wrapper for certificate verification. Handles file I/O and display.
 */

import { readFileSync } from 'node:fs';

import type { HashFn } from './core/types.ts';
import { isValidCertificate, verifyCertificateData } from './core/verify.ts';
import { BOX_WIDTH, boxLine, boxRule, error, info, style } from './display.ts';

export async function verifyCertificate(
  filePath: string,
  hashFn: HashFn,
  token?: string,
): Promise<boolean> {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    error(`Cannot read file: ${filePath}`);
    return false;
  }

  let cert: unknown;
  try {
    cert = JSON.parse(raw);
  } catch {
    error('Invalid JSON in certificate file.');
    return false;
  }

  if (!isValidCertificate(cert)) {
    error('File is not a valid lastgen certificate.');
    return false;
  }

  info(`Verifying certificate ${cert.certificateNumber}...`);
  info(`Developer: ${cert.identity.username}`);
  info('');

  if (cert.proof.firstCommit.sha) {
    info(`Fetching commit ${cert.proof.firstCommit.sha.slice(0, 7)} from GitHub...`);
  }

  const { valid, results } = await verifyCertificateData(cert, hashFn, token);

  const out = process.stdout;
  const lines: string[] = [];

  lines.push(boxRule());

  const title = style('bold', 'VERIFICATION');
  const titleRaw = 'VERIFICATION';
  const titlePadL = Math.floor((BOX_WIDTH - titleRaw.length) / 2);
  const titlePadR = BOX_WIDTH - titleRaw.length - titlePadL;
  lines.push(boxLine(' '.repeat(titlePadL) + title + ' '.repeat(titlePadR), BOX_WIDTH));

  lines.push(boxRule());

  for (const result of results) {
    const icon = result.passed ? style('green', 'PASS') : style('red', 'FAIL');
    const checkLine = `${icon}  ${style('bold', result.check)}`;
    lines.push(boxLine(checkLine, 4 + 2 + result.check.length));
    const indent = 6;
    const maxLen = BOX_WIDTH - indent;
    let remaining = result.detail;
    while (remaining.length > 0) {
      const chunk = remaining.slice(0, maxLen);
      remaining = remaining.slice(maxLen);
      const line = ' '.repeat(indent) + style('dim', chunk);
      lines.push(boxLine(line, indent + chunk.length));
    }
  }

  lines.push(boxRule());

  if (valid) {
    const msg = style('green', 'Certificate is valid.');
    lines.push(boxLine(msg, 21));
  } else {
    const msg = style('red', 'Certificate verification failed.');
    lines.push(boxLine(msg, 32));
  }

  lines.push(boxRule());

  out.write('\n' + lines.join('\n') + '\n\n');
  return valid;
}
