export type ImportKind = "followers" | "following";

export type ParsedImport = {
  usernames: string[];
  parsedFileNames: string[];
  skippedFileCount: number;
};

export type ImportFileDiscovery = {
  automaticFiles: File[];
  candidates: File[];
};

export type InstagramExportDiscovery = Record<ImportKind, ImportFileDiscovery>;

const SUPPORTED_FILE = /\.(json|html?)$/i;

function cleanUsername(input: string): string | null {
  let value = input.trim();

  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return null;
      const pieces = url.pathname.split("/").filter(Boolean);
      if (pieces[0] === "_u") {
        value = pieces[1] ?? "";
      } else {
        if (pieces.length !== 1) return null;
        value = pieces[0] ?? "";
      }
    }
  } catch {
    return null;
  }

  value = decodeURIComponent(value).replace(/^@/, "").replace(/\/+$/, "");
  if (
    /^(accounts|about|developer|direct|explore|legal|p|reel|stories)$/i.test(value) ||
    /^_+deleted_+/i.test(value)
  ) {
    return null;
  }
  return /^[a-zA-Z0-9._]{1,30}$/.test(value) ? value.toLowerCase() : null;
}

function collectJsonUsernames(value: unknown, results: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonUsernames(item, results));
    return;
  }

  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  const stringList = record.string_list_data;

  if (Array.isArray(stringList)) {
    stringList.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const entry = item as Record<string, unknown>;
      const candidate =
        typeof entry.value === "string"
          ? entry.value
          : typeof entry.href === "string"
            ? entry.href
            : null;
      const username = candidate ? cleanUsername(candidate) : null;
      if (username) results.add(username);
    });
  }

  Object.values(record).forEach((child) => collectJsonUsernames(child, results));
}

export function parseInstagramJson(text: string): string[] {
  const results = new Set<string>();
  collectJsonUsernames(JSON.parse(text), results);
  return [...results].sort();
}

export function parseInstagramHtml(text: string): string[] {
  const document = new DOMParser().parseFromString(text, "text/html");
  const results = new Set<string>();

  document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href") ?? "";
    if (!/instagram\.com/i.test(href)) return;
    const username = cleanUsername(href) ?? cleanUsername(anchor.textContent ?? "");
    if (username) results.add(username);
  });

  return [...results].sort();
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}.`));
    reader.readAsText(file);
  });
}

function filePath(file: File): string {
  return file.webkitRelativePath || file.name;
}

function classifyPath(file: File): ImportKind | null {
  const name = filePath(file).replaceAll("\\", "/").split("/").pop() ?? "";
  if (/^followers(?:_\d+)?\.(json|html?)$/i.test(name)) return "followers";
  if (/^following\.(json|html?)$/i.test(name)) return "following";
  return null;
}

function relevantFiles(files: File[], kind: ImportKind): File[] {
  const supported = files.filter((file) => SUPPORTED_FILE.test(file.name));
  const targetPattern =
    kind === "followers"
      ? /(^|\/)followers(?:_\d+)?\.(json|html?)$/i
      : /(^|\/)following\.(json|html?)$/i;
  const targeted = supported.filter((file) =>
    targetPattern.test(filePath(file).replaceAll("\\", "/")),
  );

  return targeted.length > 0 ? targeted : supported;
}

export async function parseInstagramFiles(
  files: File[],
  kind: ImportKind,
): Promise<ParsedImport> {
  const selected = relevantFiles(files, kind);
  if (selected.length === 0) {
    throw new Error("No Instagram JSON or HTML files were found in that selection.");
  }

  const usernames = new Set<string>();

  for (const file of selected) {
    const text = await readFileText(file);
    const parsed = /\.json$/i.test(file.name)
      ? parseInstagramJson(text)
      : parseInstagramHtml(text);
    parsed.forEach((username) => usernames.add(username));
  }

  if (usernames.size === 0) {
    throw new Error(
      `The selected ${kind} file${selected.length === 1 ? "" : "s"} did not contain any Instagram usernames.`,
    );
  }

  return {
    usernames: [...usernames].sort(),
    parsedFileNames: selected.map(filePath),
    skippedFileCount: files.length - selected.length,
  };
}

export function discoverImportFiles(
  files: File[],
  kind: ImportKind,
): ImportFileDiscovery {
  const supported = files.filter((file) => SUPPORTED_FILE.test(file.name));
  if (supported.length === 0) {
    throw new Error("No JSON or HTML files were found inside that folder.");
  }

  const standard = supported.filter((file) => classifyPath(file) === kind);
  if (standard.length > 0) {
    if (kind === "followers" || standard.length === 1) {
      return { automaticFiles: standard, candidates: [] };
    }
    return {
      automaticFiles: [],
      candidates: [...standard].sort((a, b) =>
        filePath(a).localeCompare(filePath(b)),
      ),
    };
  }

  const unclassified = supported.filter((file) => classifyPath(file) === null);
  if (unclassified.length === 0) {
    throw new Error(
      `Could not find Instagram’s ${kind} HTML or JSON file in that folder.`,
    );
  }
  if (unclassified.length === 1) {
    return { automaticFiles: unclassified, candidates: [] };
  }

  return {
    automaticFiles: [],
    candidates: [...unclassified].sort((a, b) =>
      filePath(a).localeCompare(filePath(b)),
    ),
  };
}

export function discoverInstagramExport(files: File[]): InstagramExportDiscovery {
  return {
    followers: discoverImportFiles(files, "followers"),
    following: discoverImportFiles(files, "following"),
  };
}

export function displayFilePath(file: File): string {
  return filePath(file);
}

export function compareLists(followers: string[], following: string[]) {
  const followerSet = new Set(followers);
  const followingSet = new Set(following);

  return {
    all: [...new Set([...followers, ...following])].sort(),
    notFollowingBack: following.filter((username) => !followerSet.has(username)),
    youDoNotFollow: followers.filter((username) => !followingSet.has(username)),
    mutuals: followers.filter((username) => followingSet.has(username)),
  };
}
