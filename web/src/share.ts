/**
 * @fileoverview Share utilities: copy badge markdown, download certificate JSON.
 */

import type { Certificate } from '../../src/core/types.ts';

export function getBadgeMarkdown(cert: Certificate): string {
  const eraLabel = cert.era === 'LAST_GEN' ? 'Last%20Gen' : 'AI%20Native';
  const color = cert.era === 'LAST_GEN' ? 'blue' : 'brightgreen';
  const badgeUrl = `https://img.shields.io/badge/lastgen-${eraLabel}-${color}?style=for-the-badge`;
  return `[![Last Gen Coder](${badgeUrl})](https://github.com/pgagnidze/lastgen)`;
}

export async function copyBadgeMarkdown(cert: Certificate): Promise<void> {
  const markdown = getBadgeMarkdown(cert);
  await navigator.clipboard.writeText(markdown);
}

export function downloadCertificateJson(cert: Certificate): void {
  const json = JSON.stringify(cert, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lastgen-${cert.identity.username}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
