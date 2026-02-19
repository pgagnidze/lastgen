/**
 * @fileoverview Renders Certificate and VerifyResult to HTML strings.
 * Reimplements the CLI's box-drawing display using <span> classes instead of ANSI codes.
 */

import type { Certificate, VerifyResult } from '../../src/core/types.ts';
import { ERAS } from '../../src/core/types.ts';

const BOX_WIDTH = 50;

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dim(text: string): string {
  return `<span class="dim">${esc(text)}</span>`;
}

function bold(text: string): string {
  return `<span class="bold">${esc(text)}</span>`;
}

function colored(cls: string, text: string): string {
  return `<span class="${cls}">${esc(text)}</span>`;
}

function boxRule(): string {
  return dim('+' + '-'.repeat(BOX_WIDTH + 2) + '+');
}

function boxLine(content: string, rawLength: number): string {
  const pad = BOX_WIDTH - rawLength;
  return dim('|') + ' ' + content + ' '.repeat(Math.max(pad, 0)) + ' ' + dim('|');
}

function boxEmpty(): string {
  return boxLine('', 0);
}

const LABEL_WIDTH = 13;

function labelLine(label: string, value: string, styledValue: string): string[] {
  const max = BOX_WIDTH - LABEL_WIDTH;
  if (value.length <= max) {
    return [boxLine(dim(label) + styledValue, LABEL_WIDTH + value.length)];
  }
  const indent = ' '.repeat(LABEL_WIDTH);
  const lines: string[] = [];
  let remaining = value;
  let isFirst = true;
  while (remaining.length > 0) {
    const chunk = remaining.slice(0, max);
    remaining = remaining.slice(max);
    const prefix = isFirst ? dim(label) : indent;
    lines.push(boxLine(prefix + esc(chunk), LABEL_WIDTH + chunk.length));
    isFirst = false;
  }
  return lines;
}

export function renderCertificate(cert: Certificate): string {
  const isLastGen = cert.era === 'LAST_GEN';
  const eraInfo = ERAS[cert.era];
  const lines: string[] = [];

  lines.push(boxRule());

  const titleRaw = 'LASTGEN CERTIFICATE';
  const titlePadL = Math.floor((BOX_WIDTH - titleRaw.length) / 2);
  const titlePadR = BOX_WIDTH - titleRaw.length - titlePadL;
  lines.push(
    boxLine(' '.repeat(titlePadL) + bold(titleRaw) + ' '.repeat(titlePadR), BOX_WIDTH),
  );

  lines.push(boxRule());

  lines.push(...labelLine('Certificate  ', cert.certificateNumber, esc(cert.certificateNumber)));

  const issuedDate = new Date(cert.issuedAt).toISOString().slice(0, 10);
  lines.push(...labelLine('Issued       ', issuedDate, esc(issuedDate)));

  lines.push(boxEmpty());

  const devValue = cert.identity.name
    ? `${cert.identity.username} (${cert.identity.name})`
    : cert.identity.username;
  lines.push(...labelLine('Developer    ', devValue, esc(devValue)));

  const eraClass = isLastGen ? 'era-lastgen' : 'era-ainative';
  lines.push(
    ...labelLine('Era          ', eraInfo.title, colored(eraClass, eraInfo.title)),
  );
  lines.push(
    ...labelLine('             ', eraInfo.description, dim(eraInfo.description)),
  );

  if (cert.proof.firstCommit.sha) {
    lines.push(boxEmpty());

    const repo = cert.proof.firstCommit.repo;
    lines.push(...labelLine('Proof Commit ', repo, esc(repo)));
    const shaShort = cert.proof.firstCommit.sha.slice(0, 7);
    const commitMsg = `${shaShort} ${cert.proof.firstCommit.message.replace(/\n/g, ' ')}`;
    lines.push(...labelLine('             ', commitMsg, dim(commitMsg)));
    const commitDate = new Date(cert.proof.firstCommit.date).toISOString().slice(0, 10);
    lines.push(...labelLine('Commit Date  ', commitDate, esc(commitDate)));
  }

  lines.push(boxEmpty());

  const hash = cert.verification.hash;
  lines.push(...labelLine('Hash         ', hash, dim(hash)));

  lines.push(boxRule());

  return `<pre class="certificate ${eraClass}">${lines.join('\n')}</pre>`;
}

export function renderVerifyResults(
  results: VerifyResult[],
  allPassed: boolean,
): string {
  const lines: string[] = [];

  lines.push(boxRule());

  const titleRaw = 'VERIFICATION';
  const titlePadL = Math.floor((BOX_WIDTH - titleRaw.length) / 2);
  const titlePadR = BOX_WIDTH - titleRaw.length - titlePadL;
  lines.push(
    boxLine(' '.repeat(titlePadL) + bold(titleRaw) + ' '.repeat(titlePadR), BOX_WIDTH),
  );

  lines.push(boxRule());

  for (const result of results) {
    const icon = result.passed
      ? colored('pass', 'PASS')
      : colored('fail', 'FAIL');
    const checkLine = `${icon}  ${bold(result.check)}`;
    lines.push(boxLine(checkLine, 4 + 2 + result.check.length));
    const indent = 6;
    const maxLen = BOX_WIDTH - indent;
    let remaining = result.detail;
    while (remaining.length > 0) {
      const chunk = remaining.slice(0, maxLen);
      remaining = remaining.slice(maxLen);
      const line = ' '.repeat(indent) + dim(chunk);
      lines.push(boxLine(line, indent + chunk.length));
    }
  }

  lines.push(boxRule());

  if (allPassed) {
    const msg = colored('pass', 'Certificate is valid.');
    lines.push(boxLine(msg, 21));
  } else {
    const msg = colored('fail', 'Certificate verification failed.');
    lines.push(boxLine(msg, 32));
  }

  lines.push(boxRule());

  return `<pre class="verification">${lines.join('\n')}</pre>`;
}
