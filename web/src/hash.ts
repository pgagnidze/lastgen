/**
 * @fileoverview Browser SHA-256 hash implementation using crypto.subtle.
 */

import type { HashFn } from '../../src/core/types.ts';

export const webHash: HashFn = async (data: string): Promise<string> => {
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};
