/**
 * @fileoverview DOM wiring, event handlers, entry point.
 */

import './style.css';
import { lookupUser } from './app.ts';
import { renderCertificate, renderVerifyResults } from './certificate.ts';
import { copyBadgeMarkdown, downloadCertificateJson } from './share.ts';
import { isValidCertificate, verifyCertificateData } from '../../src/core/verify.ts';
import { webHash } from './hash.ts';
import type { Certificate } from '../../src/core/types.ts';

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel)!;

const form = $<HTMLFormElement>('#lookup-form');
const input = $<HTMLInputElement>('#username-input');
const statusEl = $<HTMLDivElement>('#status');
const certOutput = $<HTMLDivElement>('#certificate-output');
const shareButtons = $<HTMLDivElement>('#share-buttons');
const copyLinkBtn = $<HTMLButtonElement>('#copy-link');
const copyBadgeBtn = $<HTMLButtonElement>('#copy-badge');
const downloadJsonBtn = $<HTMLButtonElement>('#download-json');
const dropZone = $<HTMLDivElement>('#drop-zone');
const fileInput = $<HTMLInputElement>('#file-input');
const verifyOutput = $<HTMLDivElement>('#verify-output');

let currentCert: Certificate | null = null;

function showStatus(message: string): void {
  statusEl.textContent = message;
  statusEl.hidden = false;
  statusEl.className = 'status';
}

function showError(message: string): void {
  statusEl.textContent = message;
  statusEl.hidden = false;
  statusEl.className = 'status error';
}

function hideStatus(): void {
  statusEl.hidden = true;
}

function setLoading(loading: boolean): void {
  input.disabled = loading;
  if (loading) {
    input.classList.add('loading');
  } else {
    input.classList.remove('loading');
  }
}

async function handleLookup(username: string): Promise<void> {
  const trimmed = username.trim();
  if (!trimmed) return;

  setLoading(true);
  certOutput.hidden = true;
  shareButtons.hidden = true;
  currentCert = null;

  try {
    const cert = await lookupUser(trimmed, showStatus);
    currentCert = cert;
    certOutput.innerHTML = renderCertificate(cert);
    certOutput.hidden = false;
    shareButtons.hidden = false;
    hideStatus();

    const url = new URL(window.location.href);
    url.searchParams.set('u', trimmed);
    history.replaceState(null, '', url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    showError(message);
  } finally {
    setLoading(false);
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  handleLookup(input.value);
});

copyLinkBtn.addEventListener('click', async () => {
  if (!currentCert) return;
  try {
    await navigator.clipboard.writeText(window.location.href);
    copyLinkBtn.textContent = 'copied!';
    setTimeout(() => {
      copyLinkBtn.textContent = 'copy link';
    }, 2000);
  } catch {
    copyLinkBtn.textContent = 'failed';
    setTimeout(() => {
      copyLinkBtn.textContent = 'copy link';
    }, 2000);
  }
});

copyBadgeBtn.addEventListener('click', async () => {
  if (!currentCert) return;
  try {
    await copyBadgeMarkdown(currentCert);
    copyBadgeBtn.textContent = 'copied!';
    setTimeout(() => {
      copyBadgeBtn.textContent = 'copy badge';
    }, 2000);
  } catch {
    copyBadgeBtn.textContent = 'failed';
    setTimeout(() => {
      copyBadgeBtn.textContent = 'copy badge';
    }, 2000);
  }
});

downloadJsonBtn.addEventListener('click', () => {
  if (!currentCert) return;
  downloadCertificateJson(currentCert);
});

async function handleVerifyFile(file: File): Promise<void> {
  verifyOutput.hidden = true;

  let data: unknown;
  try {
    const text = await file.text();
    data = JSON.parse(text);
  } catch {
    verifyOutput.innerHTML = '<p class="error">Invalid JSON file.</p>';
    verifyOutput.hidden = false;
    return;
  }

  if (!isValidCertificate(data)) {
    verifyOutput.innerHTML = '<p class="error">File is not a valid lastgen certificate.</p>';
    verifyOutput.hidden = false;
    return;
  }

  verifyOutput.innerHTML = '<p class="status">Verifying...</p>';
  verifyOutput.hidden = false;

  try {
    const result = await verifyCertificateData(data, webHash);
    verifyOutput.innerHTML = renderVerifyResults(result.results, result.valid);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    verifyOutput.innerHTML = `<p class="error">${escapeHtml(message)}</p>`;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

dropZone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) handleVerifyFile(file);
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer?.files[0];
  if (file) handleVerifyFile(file);
});

const params = new URLSearchParams(window.location.search);
const usernameParam = params.get('u');
if (usernameParam) {
  input.value = usernameParam;
  handleLookup(usernameParam);
}
