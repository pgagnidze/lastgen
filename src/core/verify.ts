/**
 * @fileoverview Certificate verification logic. Platform-agnostic: no I/O, no display.
 * Accepts parsed data and a HashFn, returns structured results.
 */

import type { Certificate, HashFn, VerifyResult } from './types.ts';
import { CUTOFF_DATE, THIRTY_DAYS_MS } from './types.ts';
import { fetchCommit } from './github.ts';
import { generateCertificateHash, resolveProofDate } from './proof.ts';

export function isValidCertificate(data: unknown): data is Certificate {
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

export interface VerifyCertificateResult {
  valid: boolean;
  results: VerifyResult[];
  certificateNumber: string;
  username: string;
}

export async function verifyCertificateData(
  cert: Certificate,
  hashFn: HashFn,
  token?: string,
): Promise<VerifyCertificateResult> {
  const results: VerifyResult[] = [];

  const expectedHash = await generateCertificateHash(
    hashFn,
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
      if (authorMatch) matchMethods.push('author login');
      if (committerMatch) matchMethods.push('committer login');
      if (emailMatch) matchMethods.push('noreply email');

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
        const driftDays = Math.round(driftMs / (24 * 60 * 60 * 1000));
        const consistent = driftMs <= THIRTY_DAYS_MS;
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

  const allPassed = results.every((r) => r.passed);

  return {
    valid: allPassed,
    results,
    certificateNumber: cert.certificateNumber,
    username: cert.identity.username,
  };
}
