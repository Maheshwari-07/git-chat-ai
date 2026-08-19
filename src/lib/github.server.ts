/**
 * GitHub ingestion helpers (server-only).
 * Fetches a public repository tree, filters to source files, and splits
 * each file into logical, block-aware chunks.
 */

export type RepoRef = { owner: string; name: string; branch?: string | undefined };

export type CodeChunk = { filePath: string; content: string };

const CODE_EXTENSIONS = [
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".php",
  ".c",
  ".h",
  ".cpp",
  ".cs",
  ".swift",
  ".sql",
  ".sh",
  ".html",
  ".css",
  ".scss",
  ".md",
  ".mdx",
  ".json",
  ".yml",
  ".yaml",
  ".toml",
];

const IGNORED_SEGMENTS = [
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  ".next/",
  "out/",
  "vendor/",
  "coverage/",
  "__pycache__/",
  ".venv/",
  "public/assets/",
];

const IGNORED_FILES = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "poetry.lock",
  ".env",
];

const MAX_FILES = 120;
const MAX_FILE_BYTES = 80_000;
const MAX_CHUNK_CHARS = 1_500;

/** Parses `https://github.com/owner/repo(/tree/branch)` into a repo reference. */
export function parseRepoUrl(rawUrl: string): RepoRef {
  const cleaned = rawUrl.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const match = cleaned.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)(?:\/tree\/([\w./-]+))?/i,
  );
  if (!match) {
    throw new Error("Enter a valid public GitHub repository URL, e.g. https://github.com/vercel/next.js");
  }
  return { owner: match[1]!, name: match[2]!, branch: match[3] };
}

function githubHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "RepoChat",
  };
  const token = process.env["GITHUB_TOKEN"];
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function isIngestable(path: string) {
  const lower = path.toLowerCase();
  if (IGNORED_SEGMENTS.some((segment) => lower.includes(segment))) return false;
  if (IGNORED_FILES.some((file) => lower.endsWith(file))) return false;
  return CODE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Resolves the repo's default branch (falls back to the requested one). */
export async function resolveBranch(repo: RepoRef): Promise<string> {
  if (repo.branch) return repo.branch;
  const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}`, {
    headers: githubHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "Repository not found. Make sure it exists and is public."
        : `GitHub API error [${res.status}]: ${await res.text()}`,
    );
  }
  const data = (await res.json()) as { default_branch?: string };
  return data.default_branch ?? "main";
}

/** Lists ingestable file paths from the repository tree. */
export async function listSourceFiles(repo: RepoRef, branch: string): Promise<string[]> {
  const res = await fetch(
    `https://api.github.com/repos/${repo.owner}/${repo.name}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: githubHeaders() },
  );
  if (!res.ok) {
    throw new Error(`Could not read repository tree [${res.status}]: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    tree?: Array<{ path: string; type: string; size?: number }>;
  };
  return (data.tree ?? [])
    .filter((node) => node.type === "blob" && (node.size ?? 0) <= MAX_FILE_BYTES && isIngestable(node.path))
    .map((node) => node.path)
    .slice(0, MAX_FILES);
}

/** Downloads a single file's raw contents. */
export async function fetchFile(repo: RepoRef, branch: string, path: string): Promise<string | null> {
  const res = await fetch(
    `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${branch}/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
  );
  if (!res.ok) return null;
  return await res.text();
}

/**
 * Splits source text into chunks that respect logical boundaries: blocks are
 * separated on blank lines / top-level declarations first, and only oversized
 * blocks are hard-split by line.
 */
export function chunkFile(filePath: string, source: string): CodeChunk[] {
  const lines = source.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];

  const startsNewBlock = (line: string) =>
    /^(export\s+)?(async\s+)?(function|class|const|let|var|def|type|interface|enum|struct|impl|#{1,6}\s)/.test(line);

  for (const line of lines) {
    const isBoundary = line.trim() === "" || (current.length > 0 && startsNewBlock(line));
    if (isBoundary && current.join("\n").trim().length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.join("\n").trim().length > 0) blocks.push(current.join("\n"));

  const chunks: CodeChunk[] = [];
  let buffer = "";

  const flush = () => {
    const text = buffer.trim();
    if (text.length > 0) {
      chunks.push({ filePath, content: `File: ${filePath}\n\n${text}` });
    }
    buffer = "";
  };

  for (const block of blocks) {
    if (block.length > MAX_CHUNK_CHARS) {
      flush();
      for (let i = 0; i < block.length; i += MAX_CHUNK_CHARS) {
        buffer = block.slice(i, i + MAX_CHUNK_CHARS);
        flush();
      }
      continue;
    }
    if (buffer.length + block.length > MAX_CHUNK_CHARS) flush();
    buffer += (buffer ? "\n" : "") + block;
  }
  flush();

  return chunks;
}
