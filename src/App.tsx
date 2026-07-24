import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  compareLists,
  parseInstagramFiles,
  type ImportKind,
  type ParsedImport,
} from "./lib/instagram";

type ImportState = {
  status: "empty" | "loading" | "ready" | "error";
  data?: ParsedImport;
  error?: string;
};

type ResultTab = "notFollowingBack" | "youDoNotFollow" | "mutuals";

const EMPTY_STATE: ImportState = { status: "empty" };

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

function ImportCard({
  kind,
  state,
  onFiles,
}: {
  kind: ImportKind;
  state: ImportState;
  onFiles: (files: File[]) => void;
}) {
  const folderInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const title = kind === "followers" ? "Followers" : "Following";
  const number = kind === "followers" ? "1" : "2";

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
      className={`import-card ${dragging ? "is-dragging" : ""} ${state.status === "ready" ? "is-ready" : ""}`}
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
        <span className="step-number">{number}</span>
        <div>
          <p className="eyebrow">Import {number}</p>
          <h3>{title}</h3>
        </div>
        {state.status === "ready" && (
          <span className="ready-badge" aria-label={`${title} import ready`}>
            ✓ Ready
          </span>
        )}
      </div>

      {state.status === "ready" && state.data ? (
        <div className="import-success">
          <strong>{state.data.usernames.length.toLocaleString()}</strong>
          <span>accounts found</span>
          <p>
            {state.data.parsedFileNames.length} Instagram{" "}
            {state.data.parsedFileNames.length === 1 ? "file" : "files"} read
          </p>
        </div>
      ) : (
        <div className="drop-copy">
          <span className="folder-icon" aria-hidden="true">
            ↗
          </span>
          <strong>Drop the {title.toLowerCase()} folder here</strong>
          <span>JSON or HTML exports work</span>
        </div>
      )}

      {state.status === "loading" && (
        <p className="status-message" aria-live="polite">
          Reading your files on this device…
        </p>
      )}
      {state.status === "error" && (
        <p className="error-message" role="alert">
          {state.error}
        </p>
      )}

      <div className="import-actions">
        <button className="primary-button" onClick={() => folderInput.current?.click()}>
          {state.status === "ready" ? "Replace folder" : "Choose folder"}
        </button>
        <button className="text-button" onClick={() => fileInput.current?.click()}>
          Choose files instead
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
        aria-label={`Choose ${title.toLowerCase()} folder`}
      />
      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        multiple
        accept=".json,.html,.htm,application/json,text/html"
        onChange={handleInput}
        aria-label={`Choose ${title.toLowerCase()} files`}
      />
    </article>
  );
}

const TAB_DETAILS: Record<
  ResultTab,
  { label: string; description: string }
> = {
  notFollowingBack: {
    label: "Don’t follow you back",
    description: "You follow these accounts, but they are not in your followers list.",
  },
  youDoNotFollow: {
    label: "You don’t follow back",
    description: "These accounts follow you, but you do not follow them.",
  },
  mutuals: {
    label: "Mutuals",
    description: "You follow each other.",
  },
};

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
  const [followers, setFollowers] = useState<ImportState>(EMPTY_STATE);
  const [following, setFollowing] = useState<ImportState>(EMPTY_STATE);
  const [activeTab, setActiveTab] = useState<ResultTab>("notFollowingBack");
  const [search, setSearch] = useState("");

  const handleFiles = async (kind: ImportKind, files: File[]) => {
    const setter = kind === "followers" ? setFollowers : setFollowing;
    setter({ status: "loading" });
    try {
      const data = await parseInstagramFiles(files, kind);
      setter({ status: "ready", data });
    } catch (error) {
      setter({
        status: "error",
        error: error instanceof Error ? error.message : "We could not read those files.",
      });
    }
  };

  const comparison = useMemo(() => {
    if (!followers.data || !following.data) return null;
    return compareLists(followers.data.usernames, following.data.usernames);
  }, [followers.data, following.data]);

  const currentResults = comparison?.[activeTab] ?? [];
  const filteredResults = currentResults.filter((username) =>
    username.includes(search.trim().toLowerCase()),
  );

  return (
    <>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Mutual Check home">
          <span className="brand-mark">M</span>
          Mutual Check
        </a>
        <a className="header-link" href="#how-it-works">
          How it works
        </a>
      </header>

      <main id="top">
        <section className="hero">
          <p className="pill">No login · No uploads · No tracking</p>
          <h1>
            Find out who’s
            <br />
            <em>actually mutual.</em>
          </h1>
          <p className="hero-copy">
            Compare your official Instagram followers and following exports.
            Everything stays in your browser, exactly where it belongs.
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
              <h2 id="import-title">Add your two lists</h2>
            </div>
            <span className="local-note">Files never leave this device</span>
          </div>

          <div className="import-grid">
            <ImportCard
              kind="followers"
              state={followers}
              onFiles={(files) => handleFiles("followers", files)}
            />
            <ImportCard
              kind="following"
              state={following}
              onFiles={(files) => handleFiles("following", files)}
            />
          </div>

          {!comparison && (
            <p className="compare-hint">
              Your comparison will appear automatically when both imports are ready.
            </p>
          )}

          {comparison && (
            <section className="results" aria-labelledby="results-title">
              <div className="results-heading">
                <div>
                  <p className="eyebrow">Your comparison</p>
                  <h2 id="results-title">The results are in</h2>
                </div>
                <button
                  className="download-button"
                  onClick={() =>
                    downloadCsv(currentResults, TAB_DETAILS[activeTab].label)
                  }
                >
                  Download CSV
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
                  <label className="search-field">
                    <span className="sr-only">Search usernames</span>
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search usernames"
                    />
                  </label>
                </div>

                {filteredResults.length > 0 ? (
                  <ul className="username-list">
                    {filteredResults.map((username) => (
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
            <h2>Get the right files from Instagram</h2>
            <p>
              Request your information from Instagram’s Accounts Center. Choose
              “Followers and following,” select all time, and use JSON or HTML.
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
              <strong>Import both lists here</strong>
              <p>Use the followers files for box 1 and the following file for box 2.</p>
            </li>
          </ol>
        </section>

        <section className="privacy-section">
          <span className="privacy-icon" aria-hidden="true">
            ◌
          </span>
          <div>
            <p className="eyebrow">Privacy by design</p>
            <h2>We couldn’t see your lists even if we wanted to.</h2>
          </div>
          <p>
            There is no account, database, analytics tracker, or upload server.
            Your files are read locally by your browser and disappear when you
            close or refresh the page.
          </p>
        </section>
      </main>

      <footer>
        <span>Mutual Check</span>
        <p>
          Not affiliated with Instagram or Meta. Results reflect the export you provide.
        </p>
      </footer>
    </>
  );
}
