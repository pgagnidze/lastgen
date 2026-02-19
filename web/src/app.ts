/**
 * @fileoverview Orchestrates the lookup flow with in-memory cache.
 */

import type { Certificate } from '../../src/core/types.ts';
import { fetchUser, fetchFirstCommit } from '../../src/core/github.ts';
import { createCertificate } from '../../src/core/proof.ts';
import { webHash } from './hash.ts';

interface CacheEntry {
  certificate: Certificate;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

function getCached(username: string): Certificate | null {
  const key = username.toLowerCase();
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.certificate;
}

function setCache(username: string, certificate: Certificate): void {
  cache.set(username.toLowerCase(), { certificate, timestamp: Date.now() });
}

export async function lookupUser(
  username: string,
  onStatus: (message: string) => void,
): Promise<Certificate> {
  const cached = getCached(username);
  if (cached) {
    onStatus('Using cached result...');
    return cached;
  }

  onStatus('Fetching GitHub profile...');
  const user = await fetchUser(username);

  onStatus('Searching for earliest commit...');
  const firstCommit = await fetchFirstCommit(user.login);

  onStatus('Generating certificate...');
  const certificate = await createCertificate(webHash, user, firstCommit);

  setCache(username, certificate);
  return certificate;
}
