/**
 * @fileoverview Era classification, hashing, and certificate generation.
 */

import { createHash } from 'node:crypto';

import type { Certificate, EraKey, FirstCommit, GitHubUser } from './types.ts';

import { CERTIFICATE_SALT, CERTIFICATE_VERSION, CUTOFF_DATE } from './types.ts';

export function classifyEra(proofDate: string): EraKey {
  const cutoff = new Date(CUTOFF_DATE).getTime();
  const date = new Date(proofDate).getTime();
  return date < cutoff ? 'LAST_GEN' : 'AI_NATIVE';
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function resolveProofDate(user: GitHubUser, firstCommit: FirstCommit | null): string {
  if (!firstCommit) {
    return new Date().toISOString();
  }

  const effectiveDate = getEffectiveCommitDate(firstCommit);
  const commitTime = new Date(effectiveDate).getTime();
  const accountTime = new Date(user.createdAt).getTime();
  const repoTime = firstCommit.repoCreatedAt
    ? new Date(firstCommit.repoCreatedAt).getTime()
    : Infinity;

  if (commitTime < repoTime) {
    return firstCommit.repoCreatedAt ?? user.createdAt;
  }

  return commitTime < accountTime ? effectiveDate : user.createdAt;
}

function getEffectiveCommitDate(commit: FirstCommit): string {
  if (!commit.committerDate) {
    return commit.date;
  }

  const authorTime = new Date(commit.date).getTime();
  const committerTime = new Date(commit.committerDate).getTime();

  if (committerTime - authorTime > THIRTY_DAYS_MS) {
    return commit.committerDate;
  }

  return commit.date;
}

export function generateCertificateHash(
  username: string,
  githubId: number,
  proofDate: string,
  era: EraKey,
): string {
  const payload = JSON.stringify({
    username,
    githubId,
    proofDate,
    era,
    salt: CERTIFICATE_SALT,
  });

  return createHash('sha256').update(payload).digest('hex');
}

export function generateCertificateNumber(hash: string): string {
  const prefix = hash.slice(0, 4).toUpperCase();
  const numericPart = parseInt(hash.slice(4, 12), 16) % 1000000;
  const padded = String(numericPart).padStart(6, '0');
  return `LGC-${prefix}-${padded}`;
}

export function createCertificate(user: GitHubUser, firstCommit: FirstCommit | null): Certificate {
  const proofDate = resolveProofDate(user, firstCommit);
  const era = classifyEra(proofDate);
  const hash = generateCertificateHash(user.login, user.id, proofDate, era);
  const certificateNumber = generateCertificateNumber(hash);

  return {
    version: CERTIFICATE_VERSION,
    type: 'LASTGEN_CERTIFICATE',
    identity: {
      username: user.login,
      githubId: user.id,
      name: user.name,
    },
    proof: {
      accountCreated: user.createdAt,
      firstCommit: firstCommit ?? {
        date: user.createdAt,
        repo: '',
        sha: '',
        message: '(no public commits found - using account creation date)',
      },
      proofDate,
    },
    era,
    verification: {
      hash: `sha256:${hash}`,
      salt: CERTIFICATE_SALT,
    },
    certificateNumber,
    issuedAt: new Date().toISOString(),
  };
}
