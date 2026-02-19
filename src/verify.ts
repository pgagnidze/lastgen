/**
 * @fileoverview Certificate verification - re-checks saved proofs against GitHub API.
 */

import { readFileSync } from 'node:fs';

import type { Certificate, VerifyResult } from './types.ts';
import { CUTOFF_DATE } from './types.ts';
import { fetchCommit } from './github.ts';
import { generateCertificateHash, resolveProofDate } from './proof.ts';
import { BOX_WIDTH, boxLine, boxRule, error, info, style } from './display.ts';

function isValidCertificate(data: unknown): data is Certificate {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const cert = data as Record<string, unknown>;
  return (
    cert.type === 'LASTGEN_CERTIFICATE' &&
    typeof cert.version === 'string' &&
    typeof cert.identity === 'object' &&
    typeof cert.proof === 'object' &&
    typeof cert.verification === 'object' &&
    typeof cert.certificateNumber === 'string'
  );
}

function matchesNoreplyEmail(email: string, username: string): boolean {
  const lower = email.toLowerCase();
  const user = username.toLowerCase();
  const pattern = new RegExp(`^(\\d+\\+)?${escapeRegex(user)}@users\\.noreply\\.github\\.com$`);
  return pattern.test(lower);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function verifyCertificate(filePath: string, token?: string): Promise<boolean> {
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

  const results: VerifyResult[] = [];

  const expectedHash = generateCertificateHash(
    cert.identity.username,
    cert.identity.githubId,
    cert.proof.proofDate,
    cert.era,
  );

  const actualHash = cert.verification.hash.replace('sha256:', '');
  results.push({
    check: 'Hash integrity',
    passed: expectedHash === actualHash,
    detail:
      expectedHash === actualHash
        ? 'Certificate hash is valid'
        : 'Certificate hash does not match - data may have been tampered with',
  });

  const proofDate = new Date(cert.proof.proofDate);
  const cutoff = new Date(CUTOFF_DATE);
  const isBeforeCutoff = proofDate.getTime() < cutoff.getTime();
  const expectedEra = isBeforeCutoff ? 'LAST_GEN' : 'AI_NATIVE';
  results.push({
    check: 'Era classification',
    passed: cert.era === expectedEra,
    detail:
      cert.era === expectedEra
        ? `Era ${cert.era} is correct for proof date ${cert.proof.proofDate}`
        : `Era should be ${expectedEra} but certificate claims ${cert.era}`,
  });

  const reconstructedUser = {
    login: cert.identity.username,
    id: cert.identity.githubId,
    name: cert.identity.name,
    createdAt: cert.proof.accountCreated,
  };
  const expectedProofDate = resolveProofDate(
    reconstructedUser,
    cert.proof.firstCommit.sha ? cert.proof.firstCommit : null,
  );
  const proofDateMatch =
    Math.abs(new Date(expectedProofDate).getTime() - proofDate.getTime()) < 60000;
  results.push({
    check: 'Proof date',
    passed: proofDateMatch,
    detail: proofDateMatch
      ? `Proof date ${cert.proof.proofDate} is consistent with commit and account data`
      : `Proof date should be ${expectedProofDate} but certificate claims ${cert.proof.proofDate}`,
  });

  if (cert.proof.firstCommit.sha) {
    try {
      info(`Fetching commit ${cert.proof.firstCommit.sha.slice(0, 7)} from GitHub...`);
      const commitDetail = await fetchCommit(
        cert.proof.firstCommit.repo,
        cert.proof.firstCommit.sha,
        token,
      );

      const username = cert.identity.username.toLowerCase();
      const authorMatch = (commitDetail.authorLogin ?? '').toLowerCase() === username;
      const committerMatch = (commitDetail.committerLogin ?? '').toLowerCase() === username;
      const emailMatch = commitDetail.authorEmail
        ? matchesNoreplyEmail(commitDetail.authorEmail, cert.identity.username)
        : false;

      const identityMatch = authorMatch || committerMatch || emailMatch;
      const matchMethods: string[] = [];
      if (authorMatch) {
        matchMethods.push('author login');
      }
      if (committerMatch) {
        matchMethods.push('committer login');
      }
      if (emailMatch) {
        matchMethods.push('noreply email');
      }

      results.push({
        check: 'Identity',
        passed: identityMatch,
        detail: identityMatch
          ? `Matched via: ${matchMethods.join(', ')}`
          : `Commit author (${commitDetail.authorLogin}) does not match ${cert.identity.username}`,
      });

      const repoOwner = cert.proof.firstCommit.repo.split('/')[0] ?? '';
      const isSelfOwned = repoOwner.toLowerCase() === cert.identity.username.toLowerCase();
      results.push({
        check: 'Repo ownership',
        passed: true,
        detail: isSelfOwned
          ? `Commit is in a repo owned by ${cert.identity.username}`
          : `Commit is in a third-party repo (${cert.proof.firstCommit.repo})`,
      });

      if (commitDetail.authorId !== null) {
        const idMatch = commitDetail.authorId === cert.identity.githubId;
        results.push({
          check: 'GitHub ID',
          passed: idMatch,
          detail: idMatch
            ? `GitHub ID ${commitDetail.authorId} matches certificate`
            : `Commit author ID ${commitDetail.authorId} does not match certificate ID ${cert.identity.githubId}`,
        });
      }

      const commitDate = new Date(commitDetail.authorDate ?? '');
      const certDate = new Date(cert.proof.firstCommit.date);
      const datesClose = Math.abs(commitDate.getTime() - certDate.getTime()) < 60000;
      results.push({
        check: 'Commit date',
        passed: datesClose,
        detail: datesClose
          ? `Commit date matches certificate (${commitDetail.authorDate})`
          : `Commit date ${commitDetail.authorDate} differs from certificate ${cert.proof.firstCommit.date}`,
      });

      if (commitDetail.authorDate && commitDetail.committerDate) {
        const authorTime = new Date(commitDetail.authorDate).getTime();
        const committerTime = new Date(commitDetail.committerDate).getTime();
        const driftMs = Math.abs(committerTime - authorTime);
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const driftDays = Math.round(driftMs / (24 * 60 * 60 * 1000));
        const consistent = driftMs <= thirtyDaysMs;
        results.push({
          check: 'Date consistency',
          passed: consistent,
          detail: consistent
            ? `Author/committer date drift: ${driftDays}d (within 30d threshold)`
            : `Author/committer date drift: ${driftDays}d exceeds 30d - author date may be forged`,
        });
      }

      if (commitDetail.isRootCommit) {
        results.push({
          check: 'Root commit',
          passed: true,
          detail: 'Commit has no parents (first commit in repo - higher trust)',
        });
      }

      if (commitDetail.verified) {
        const reason = commitDetail.verificationReason;
        const reasonDetail = reason && reason !== 'valid' ? ` (${reason})` : '';
        results.push({
          check: 'GPG signature',
          passed: true,
          detail: `Commit is GPG-signed${reasonDetail}`,
        });
      }
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
      results.push({
        check: 'Commit verification',
        passed: false,
        detail: `Could not fetch commit from GitHub: ${message}`,
      });
    }
  }

  const out = process.stdout;
  const lines: string[] = [];

  lines.push(boxRule());

  const title = style('bold', 'VERIFICATION');
  const titleRaw = 'VERIFICATION';
  const titlePadL = Math.floor((BOX_WIDTH - titleRaw.length) / 2);
  const titlePadR = BOX_WIDTH - titleRaw.length - titlePadL;
  lines.push(boxLine(' '.repeat(titlePadL) + title + ' '.repeat(titlePadR), BOX_WIDTH));

  lines.push(boxRule());

  let allPassed = true;
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
    if (!result.passed) {
      allPassed = false;
    }
  }

  lines.push(boxRule());

  if (allPassed) {
    const msg = style('green', 'Certificate is valid.');
    lines.push(boxLine(msg, 21));
  } else {
    const msg = style('red', 'Certificate verification failed.');
    lines.push(boxLine(msg, 32));
  }

  lines.push(boxRule());

  out.write('\n' + lines.join('\n') + '\n\n');
  return allPassed;
}
