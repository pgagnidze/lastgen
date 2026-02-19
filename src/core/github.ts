/**
 * @fileoverview GitHub API client using built-in fetch. Zero dependencies.
 */

import type { GitHubUser, FirstCommit, CommitDetail } from './types.ts';
import { CUTOFF_DATE } from './types.ts';

const GITHUB_API = 'https://api.github.com';
const USER_AGENT = 'lastgen';

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': USER_AGENT,
  };
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }
  return headers;
}

async function githubFetch(
  url: string,
  token?: string,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const response = await fetch(url, { headers: { ...buildHeaders(token), ...extraHeaders } });

  if (response.status === 403) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining === '0') {
      const resetTimestamp = response.headers.get('x-ratelimit-reset');
      const resetDate = resetTimestamp
        ? new Date(Number(resetTimestamp) * 1000).toLocaleTimeString()
        : 'soon';
      throw new Error(`GitHub API rate limit exceeded. Resets at ${resetDate}.`);
    }
  }

  if (response.status === 404) {
    const userMatch = url.match(/\/users\/([^/?]+)/);
    if (userMatch?.[1]) {
      throw new Error(
        `GitHub user '${decodeURIComponent(userMatch[1])}' not found. Check the spelling?`,
      );
    }
    throw new Error(`Not found: ${url}`);
  }

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return response;
}

export async function fetchUser(username: string, token?: string): Promise<GitHubUser> {
  const response = await githubFetch(`${GITHUB_API}/users/${encodeURIComponent(username)}`, token);
  const data = (await response.json()) as Record<string, unknown>;

  return {
    login: data.login as string,
    id: data.id as number,
    name: (data.name as string | null) ?? null,
    createdAt: data.created_at as string,
  };
}

export async function fetchFirstCommit(
  username: string,
  token?: string,
): Promise<FirstCommit | null> {
  const commit = await searchFirstCommit(username, token);

  if (commit?.repo) {
    commit.repoCreatedAt = await fetchRepoCreatedAt(commit.repo, token);
  }

  return commit;
}

async function fetchRepoCreatedAt(
  repoFullName: string,
  token?: string,
): Promise<string | undefined> {
  try {
    const response = await githubFetch(`${GITHUB_API}/repos/${repoFullName}`, token);
    const data = (await response.json()) as Record<string, unknown>;
    return (data.created_at as string | undefined) ?? undefined;
  } catch {
    return undefined;
  }
}

async function searchFirstCommitByQuery(
  query: string,
  token?: string,
  order: 'asc' | 'desc' = 'asc',
): Promise<FirstCommit | null> {
  try {
    const url = `${GITHUB_API}/search/commits?q=${encodeURIComponent(query)}&sort=committer-date&order=${order}&per_page=1`;
    const response = await githubFetch(url, token, {
      Accept: 'application/vnd.github.cloak-preview+json',
    });

    const data = (await response.json()) as Record<string, unknown>;
    const items = data.items as Array<Record<string, unknown>> | undefined;
    const item = items?.[0];
    if (!item) return null;

    const commit = item.commit as Record<string, unknown>;
    const author = commit.author as Record<string, unknown>;
    const commitCommitter = commit.committer as Record<string, unknown> | undefined;
    const repo = item.repository as Record<string, unknown>;

    return {
      date: author.date as string,
      repo: (repo.full_name as string) ?? '',
      sha: item.sha as string,
      message: ((commit.message as string) ?? '').split('\n')[0] ?? '',
      committerDate: (commitCommitter?.date as string | undefined) ?? undefined,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('rate limit')) throw err;
    return null;
  }
}

async function searchFirstCommit(username: string, token?: string): Promise<FirstCommit | null> {
  const cutoffDate = CUTOFF_DATE.slice(0, 10);

  return (
    (await searchFirstCommitByQuery(
      `author:${username} user:${username} committer-date:<${cutoffDate}`,
      token,
      'desc',
    )) ??
    (await searchFirstCommitByQuery(
      `author:${username} committer-date:<${cutoffDate}`,
      token,
      'desc',
    )) ??
    (await searchFirstCommitByQuery(`author:${username}`, token))
  );
}

export async function fetchCommit(
  repoFullName: string,
  sha: string,
  token?: string,
): Promise<CommitDetail> {
  const url = `${GITHUB_API}/repos/${repoFullName}/commits/${sha}`;
  const response = await githubFetch(url, token);
  const data = (await response.json()) as Record<string, unknown>;

  const commit = data.commit as Record<string, unknown>;
  const commitAuthor = commit.author as Record<string, unknown>;
  const commitCommitter = commit.committer as Record<string, unknown> | undefined;
  const verification = commit.verification as Record<string, unknown> | undefined;
  const author = data.author as Record<string, unknown> | null;
  const committer = data.committer as Record<string, unknown> | null;
  const parents = data.parents as Array<unknown> | undefined;

  return {
    sha: data.sha as string,
    authorLogin: (author?.login as string | undefined) ?? null,
    committerLogin: (committer?.login as string | undefined) ?? null,
    authorEmail: (commitAuthor.email as string | undefined) ?? null,
    authorDate: (commitAuthor.date as string | undefined) ?? null,
    committerDate: (commitCommitter?.date as string | undefined) ?? null,
    authorId: (author?.id as number | undefined) ?? null,
    verificationReason: (verification?.reason as string | undefined) ?? null,
    isRootCommit: Array.isArray(parents) && parents.length === 0,
    message: ((commit.message as string) ?? '').split('\n')[0] ?? '',
    verified: Boolean(verification?.verified),
  };
}
