/**
 * Built-in GitHub repository info tool — uses the public GitHub REST API.
 *
 * No API key required (60 req/hour unauthenticated, sufficient for chat usage).
 * Cloudflare Workers compatible — single or dual HTTP GET calls.
 * Covers: repo metadata, latest release version, README summary, top topics.
 */

import { z } from "zod";
import type { ToolSet } from "ai";
import { tool } from "ai";

export const BUILTIN_GITHUB_KEY = "builtin_github";

// ============ GitHub REST API Types ============

interface GithubRepo {
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  topics: string[];
  license: { spdx_id: string } | null;
  default_branch: string;
  pushed_at: string;
  created_at: string;
}

interface GithubRelease {
  tag_name: string;
  name: string | null;
  published_at: string;
  html_url: string;
  prerelease: boolean;
}

interface GithubSearchItem {
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  topics: string[];
}

interface GithubSearchResult {
  items: GithubSearchItem[];
}

// ============ API Helpers ============

const GITHUB_HEADERS = {
  "User-Agent": "ChatWithMe/2.0 (github tool)",
  Accept: "application/vnd.github+json",
};

async function fetchRepo(owner: string, repo: string): Promise<GithubRepo> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const resp = await fetch(url, { headers: GITHUB_HEADERS });
  if (resp.status === 404) {
    throw new Error(`Repository "${owner}/${repo}" not found on GitHub.`);
  }
  if (resp.status === 403) {
    throw new Error("GitHub API rate limit exceeded. Try again in a minute.");
  }
  if (!resp.ok) {
    throw new Error(`GitHub API failed: HTTP ${resp.status}`);
  }
  return (await resp.json()) as GithubRepo;
}

async function fetchLatestRelease(
  owner: string,
  repo: string
): Promise<GithubRelease | null> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`;
  const resp = await fetch(url, { headers: GITHUB_HEADERS });
  if (resp.status === 404) return null; // No releases yet
  if (!resp.ok) return null;
  return (await resp.json()) as GithubRelease;
}

async function searchRepos(query: string): Promise<GithubSearchItem[]> {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=5`;
  const resp = await fetch(url, { headers: GITHUB_HEADERS });
  if (!resp.ok) throw new Error(`GitHub search failed: HTTP ${resp.status}`);
  const data = (await resp.json()) as GithubSearchResult;
  return data.items ?? [];
}

// ============ Formatters ============

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatRepo(
  repo: GithubRepo,
  release: GithubRelease | null
): string {
  const lines: string[] = [];
  lines.push(`## ${repo.full_name}`);
  if (repo.description) lines.push(repo.description);
  lines.push("");
  lines.push(`- Stars: ⭐ ${formatStars(repo.stargazers_count)}`);
  lines.push(`- Forks: ${repo.forks_count}`);
  lines.push(`- Open issues: ${repo.open_issues_count}`);
  if (repo.language) lines.push(`- Primary language: ${repo.language}`);
  if (repo.license) lines.push(`- License: ${repo.license.spdx_id}`);
  if (repo.topics?.length > 0) {
    lines.push(`- Topics: ${repo.topics.slice(0, 8).join(", ")}`);
  }
  lines.push(`- Last push: ${repo.pushed_at.slice(0, 10)}`);
  lines.push(`- Default branch: ${repo.default_branch}`);
  lines.push(`- URL: ${repo.html_url}`);

  if (release) {
    lines.push("");
    lines.push(`### Latest Release`);
    lines.push(
      `**${release.tag_name}**${release.name && release.name !== release.tag_name ? ` — ${release.name}` : ""}${release.prerelease ? " *(pre-release)*" : ""}`
    );
    lines.push(`Published: ${release.published_at.slice(0, 10)}`);
    lines.push(`Release page: ${release.html_url}`);
  } else {
    lines.push("");
    lines.push("*No stable releases yet.*");
  }

  return lines.join("\n");
}

function formatSearchResults(items: GithubSearchItem[]): string {
  if (items.length === 0) return "No repositories found.";
  const lines: string[] = ["**GitHub search results:**", ""];
  for (const item of items) {
    lines.push(
      `**${item.full_name}** — ⭐ ${formatStars(item.stargazers_count)}${item.language ? ` · ${item.language}` : ""}`
    );
    if (item.description) lines.push(`  ${item.description}`);
    lines.push(`  ${item.html_url}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

// ============ Owner/Repo Parser ============

/**
 * Parse "owner/repo" or a GitHub URL into { owner, repo }.
 * Returns null if not parseable as a specific repo.
 */
function parseOwnerRepo(
  input: string
): { owner: string; repo: string } | null {
  // Handle full GitHub URLs
  const urlMatch = input.match(
    /github\.com\/([^/\s]+)\/([^/\s#?]+)/i
  );
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };

  // Handle "owner/repo" format
  const slashMatch = input.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (slashMatch) return { owner: slashMatch[1], repo: slashMatch[2] };

  return null;
}

// ============ AI Tool Definition ============

export function createGithubTool(): ToolSet {
  return {
    [BUILTIN_GITHUB_KEY]: tool({
      description:
        "Look up GitHub repository information: description, star count, latest release/version, language, license, and topics. Also supports searching repositories by keyword. Use when the user asks about a specific library/project version, repo stats, or wants to find relevant GitHub projects.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "Either a specific repo in 'owner/repo' format (e.g. 'facebook/react'), a full GitHub URL, or a search query (e.g. 'typescript http client library'). If owner/repo is known, prefer that for exact results."
          ),
      }),
      execute: async ({ query }: { query: string }) => {
        if (!query?.trim()) return "Error: No query provided.";

        const parsed = parseOwnerRepo(query.trim());

        if (parsed) {
          // Exact repo lookup + latest release (parallel)
          try {
            const [repo, release] = await Promise.all([
              fetchRepo(parsed.owner, parsed.repo),
              fetchLatestRelease(parsed.owner, parsed.repo),
            ]);
            return formatRepo(repo, release);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return `GitHub error: ${msg}`;
          }
        }

        // Fallback: search
        try {
          const items = await searchRepos(query.trim());
          return formatSearchResults(items);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `GitHub search error: ${msg}`;
        }
      },
    }),
  };
}
