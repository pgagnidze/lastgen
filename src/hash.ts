/**
 * @fileoverview Node.js SHA-256 hash implementation using node:crypto.
 */

import { createHash } from 'node:crypto';

import type { HashFn } from './core/types.ts';

export const nodeHash: HashFn = async (data: string): Promise<string> => {
  return createHash('sha256').update(data).digest('hex');
};
