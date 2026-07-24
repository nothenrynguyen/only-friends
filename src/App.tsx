import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  compareLists,
  parseInstagramExport,
  type ParsedInstagramExport,
} from "./lib/instagram";

type ImportState = {
  status: "empty" | "loading" | "ready" | "error";
  data?: ParsedInstagramExport;
  error?: string;
};

type ResultTab = "all" | "mutuals" | "notFollowingBack" | "youDoNotFollow";
type SortOrder = "az" | "za";

const TAB_DETAILS: Record<ResultTab, { label: string; description: string }> = {
  all: {
    label: "All accounts",
    description: "Every unique account found across both lists.",
  },
  mutuals: {
    label: "Mutuals",
    description: "You follow each other.",
  },
  notFollowingBack: {
    label: "Don’t follow you back",
    description: "You follow these accounts, but they do not follow you.",
  },
  youDoNotFollow: {
    label: "You don’t follow back",
    description: "These accounts follow you, but you do not follow them.",
  },
};

function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve, reject) =>
      (entry as FileSystemFileEntry).file((file) => resolve([file]), reject),
    );
  }

  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    return new Promise((resolve, reject) => {
      const entries: FileSystemEntry[] = [];
      const readBatch = () => {
        reader.readEntries(async (batch) => {
          if (batch.length === 0) {
            try {
              resolve((await Promise.all(entries.map(readEntry))).flat());
            } catch (error) {
              reject(error);
            }
            return;
          }
          entries.push(...batch);
          readBatch();
        }, reject);
      };
      readBatch();
    });
  }

  return Promise.resolve([]);
}

async function filesFromDrop(event: DragEvent): Promise<File[]> {
  const entries = [...event.dataTransfer.items]
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntry => entry !== null);

  if (entries.length > 0) {
    return (await Promise.all(entries.map(readEntry))).flat();
  }
  return [...event.dataTransfer.files];
}

function FolderImport({
  state,
  onFiles,
}: {
  state: ImportState;
  onFiles: (files: File[]) => void;
}) {
  const folderInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    if (files.length) onFiles(files);
    event.target.value = "";
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = await filesFromDrop(event);
    if (files.length) onFiles(files);
  };

  return (
    <article
      className={`import-card single-import ${dragging ? "is-dragging" : ""} ${state.status === "ready" ? "is-ready" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setDragging(false);
        }
      }}
      onDrop={handleDrop}
    >
      <div className="card-heading">
        <span className="step-number">1</span>
        <div>
          <p className="eyebrow">One folder, that’s it</p>
          <h3>Your Instagram export</h3>
        </div>
        {state.status === "ready" && (
          <span className="ready-badge" aria-label="Instagram export ready">
            ✓ Ready
          </span>
        )}
      </div>

      {state.status === "ready" && state.data ? (
        <div className="import-success dual-success">
          <div>
            <strong>{state.data.followers.usernames.length.toLocaleString()}</strong>
            <span>followers</span>
          </div>
          <span className="success-divider" aria-hidden="true" />
          <div>
            <strong>{state.data.following.usernames.length.toLocaleString()}</strong>
            <span>following</span>
          </div>
          <p>
            Found automatically in {state.data.totalFilesScanned.toLocaleString()} scanned{" "}
            {state.data.totalFilesScanned === 1 ? "file" : "files"}
          </p>
        </div>
      ) : (
        <div className="drop-copy">
          <span className="folder-icon" aria-hidden="true">
            ↓
          </span>
          <strong>Drop the complete Instagram export folder here</strong>
          <span>We’ll find the followers and following files inside it</span>
        </div>
      )}

      {state.status === "loading" && (
        <p className="status-message" aria-live="polite">
          Searching the folder on this device…
        </p>
      )}
      {state.status === "error" && (
        <p className="error-message" role="alert">
          {state.error}
        </p>
      )}

      <div className="import-actions">
        <button className="primary-button" onClick={() => folderInput.current?.click()}>
          {state.status === "ready" ? "Choose a different folder" : "Choose Instagram folder"}
        </button>
      </div>

      <input
        ref={folderInput}
        className="sr-only"
        type="file"
        multiple
        webkitdirectory=""
        directory=""
        onChange={handleInput}
        aria-label="Choose complete Instagram export folder"
      />
    </article>
  );
}

function downloadCsv(usernames: string[], label: string) {
  const contents = ["username", ...usernames].join("\n");
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${label.toLowerCase().replaceAll(/\W+/g, "-")}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [importState, setImportState] = useState<ImportState>({ status: "empty" });
  const [activeTab, setActiveTab] = useState<ResultTab>("notFollowingBack");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("az");

  const handleFiles = async (files: File[]) => {
    setImportState({ status: "loading" });
    try {
      const data = await parseInstagramExport(files);
      setImportState({ status: "ready", data });
    } catch (error) {
      setImportState({
        status: "error",
        error: error instanceof Error ? error.message : "We could not read that folder.",
      });
    }
  };

  const comparison = useMemo(() => {
    if (!importState.data) return null;
    return compareLists(
      importState.data.followers.usernames,
      importState.data.following.usernames,
    );
  }, [importState.data]);

  const currentResults = comparison?.[activeTab] ?? [];
  const visibleResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...currentResults]
      .filter((username) => username.includes(query))
      .sort((a, b) =>
        sortOrder === "az" ? a.localeCompare(b) : b.localeCompare(a),
      );
  }, [currentResults, search, sortOrder]);

  return (
    <>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Only Friends home">
          <span className="brand-mark">OF</span>
          Only Friends
        </a>
        <a className="header-link" href="#how-it-works">
          How it works
        </a>
      </header>

      <main id="top">
        <section className="hero">
          <p className="pill">No login · No uploads · No tracking</p>
          <h1>
            Your Instagram circle,
            <br />
            <em>made obvious.</em>
          </h1>
          <p className="hero-copy">
            Choose one Instagram export folder. Only Friends finds both lists,
            compares them, and shows you exactly where everyone stands.
          </p>
          <div className="trust-row">
            <span>100% on-device</span>
            <span>No Instagram password</span>
            <span>Free to use</span>
          </div>
        </section>

        <section className="tool-section" aria-labelledby="import-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Private comparison tool</p>
              <h2 id="import-title">Choose one folder</h2>
            </div>
            <span className="local-note">Files never leave this device</span>
          </div>

          <FolderImport state={importState} onFiles={handleFiles} />

          {!comparison && (
            <p className="compare-hint">
              We’ll search every subfolder for Instagram’s followers and following files.
            </p>
          )}

          {comparison && (
            <section className="results" aria-labelledby="results-title">
              <div className="results-heading">
                <div>
                  <p className="eyebrow">Your circle</p>
                  <h2 id="results-title">Here’s everyone</h2>
                </div>
                <button
                  className="download-button"
                  onClick={() =>
                    downloadCsv(visibleResults, TAB_DETAILS[activeTab].label)
                  }
                >
                  Download this view
                </button>
              </div>

              <div className="result-tabs" role="tablist" aria-label="Comparison results">
                {(Object.keys(TAB_DETAILS) as ResultTab[]).map((tab) => (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={activeTab === tab}
                    className={activeTab === tab ? "active" : ""}
                    onClick={() => {
                      setActiveTab(tab);
                      setSearch("");
                    }}
                  >
                    <strong>{comparison[tab].length.toLocaleString()}</strong>
                    <span>{TAB_DETAILS[tab].label}</span>
                  </button>
                ))}
              </div>

              <div className="list-panel">
                <div className="list-toolbar">
                  <div>
                    <h3>{TAB_DETAILS[activeTab].label}</h3>
                    <p>{TAB_DETAILS[activeTab].description}</p>
                  </div>
                  <div className="filter-controls">
                    <label className="search-field">
                      <span className="sr-only">Search usernames</span>
                      <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search usernames"
                      />
                    </label>
                    <label className="sort-field">
                      <span className="sr-only">Sort usernames</span>
                      <select
                        value={sortOrder}
                        onChange={(event) => setSortOrder(event.target.value as SortOrder)}
                        aria-label="Sort usernames"
                      >
                        <option value="az">A–Z</option>
                        <option value="za">Z–A</option>
                      </select>
                    </label>
                  </div>
                </div>

                <p className="result-count">
                  Showing {visibleResults.length.toLocaleString()} of{" "}
                  {currentResults.length.toLocaleString()}
                </p>

                {visibleResults.length > 0 ? (
                  <ul className="username-list">
                    {visibleResults.map((username) => (
                      <li key={username}>
                        <span className="avatar-placeholder">
                          {username.charAt(0).toUpperCase()}
                        </span>
                        <a
                          href={`https://www.instagram.com/${username}/`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          @{username}
                        </a>
                        <span className="external-mark" aria-hidden="true">
                          ↗
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-result">
                    {search
                      ? "No usernames match that search."
                      : "No accounts in this group. Nice and tidy."}
                  </p>
                )}
              </div>
            </section>
          )}
        </section>

        <section className="how-section" id="how-it-works">
          <div className="how-heading">
            <p className="eyebrow">Before you start</p>
            <h2>Download once. Choose once.</h2>
            <p>
              Request “Followers and following” from Instagram’s Accounts Center.
              When the download is ready, choose the complete unzipped folder here—
              not the individual files inside it.
            </p>
          </div>
          <ol className="how-steps">
            <li>
              <span>01</span>
              <strong>Open Accounts Center</strong>
              <p>Instagram Settings → Accounts Center → Your information and permissions.</p>
            </li>
            <li>
              <span>02</span>
              <strong>Download your information</strong>
              <p>Select Followers and following, all time, then JSON or HTML.</p>
            </li>
            <li>
              <span>03</span>
              <strong>Choose the complete folder</strong>
              <p>Only Friends finds and compares the right files automatically.</p>
            </li>
          </ol>
        </section>

        <section className="privacy-section">
          <span className="privacy-icon" aria-hidden="true">
            ✦
          </span>
          <div>
            <p className="eyebrow">Privacy by design</p>
            <h2>Your social circle stays yours.</h2>
          </div>
          <p>
            There is no account, database, analytics tracker, or upload server.
            Your folder is read locally by your browser and disappears when you
            close or refresh the page.
          </p>
        </section>
      </main>

      <footer>
        <span>Only Friends</span>
        <p>
          Not affiliated with Instagram or Meta. Results reflect the export you provide.
        </p>
      </footer>
    </>
  );
}
