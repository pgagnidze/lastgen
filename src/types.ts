/**
 * @fileoverview Shared interfaces, constants, and type definitions for lastgen.
 */

export const CUTOFF_DATE = '2025-02-21T00:00:00Z';

export const ERAS = {
  LAST_GEN: {
    title: 'Last Generation Coder',
    description: 'Wrote code before AI agents shipped',
  },
  AI_NATIVE: {
    title: 'AI Native Coder',
    description: 'First verifiable commit after AI agents shipped',
  },
} as const;

export type EraKey = keyof typeof ERAS;

export const CERTIFICATE_VERSION = '1.0';
export const CERTIFICATE_SALT = 'lastgen_v1';
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
  createdAt: string;
}

export interface FirstCommit {
  date: string;
  repo: string;
  sha: string;
  message: string;
  repoCreatedAt?: string;
  committerDate?: string;
}

export interface CertificateIdentity {
  username: string;
  githubId: number;
  name: string | null;
}

export interface CertificateProof {
  accountCreated: string;
  firstCommit: FirstCommit;
  proofDate: string;
}

export interface CertificateVerification {
  hash: string;
  salt: string;
}

export interface Certificate {
  version: string;
  type: 'LASTGEN_CERTIFICATE';
  identity: CertificateIdentity;
  proof: CertificateProof;
  era: EraKey;
  verification: CertificateVerification;
  certificateNumber: string;
  issuedAt: string;
}

export interface CommitDetail {
  sha: string;
  authorLogin: string | null;
  committerLogin: string | null;
  authorEmail: string | null;
  authorDate: string | null;
  committerDate: string | null;
  authorId: number | null;
  verificationReason: string | null;
  isRootCommit: boolean;
  message: string;
  verified: boolean;
}

export interface VerifyResult {
  check: string;
  passed: boolean;
  detail: string;
}
