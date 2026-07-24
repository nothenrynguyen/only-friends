import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type DragEvent,
  type SetStateAction,
} from "react";
import {
  compareLists,
  discoverInstagramExport,
  displayFilePath,
  parseInstagramFiles,
  type ImportKind,
  type ParsedImport,
} from "./lib/instagram";

type ImportState = {
  status: "empty" | "loading" | "choosing" | "ready" | "error";
  data?: ParsedImport;
  candidates?: File[];
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
  states,
  onFiles,
  onCandidate,
}: {
  states: Record<ImportKind, ImportState>;
  onFiles: (files: File[]) => void;
  onCandidate: (kind: ImportKind, file: File) => void;
}) {
  const folderInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const ready = states.followers.status === "ready" && states.following.status === "ready";
  const loading =
    states.followers.status === "loading" || states.following.status === "loading";
  const errors = [states.followers.error, states.following.error].filter(Boolean);
  const choices = (["followers", "following"] as ImportKind[]).filter(
    (kind) => states[kind].status === "choosing" && states[kind].candidates,
  );

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
      className={`import-card single-import ${dragging ? "is-dragging" : ""} ${ready ? "is-ready" : ""}`}
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
          <p className="eyebrow">One folder, both lists</p>
          <h3>followers_and_following</h3>
        </div>
        {ready && (
          <span className="ready-badge" aria-label="Instagram export ready">
            ✓ Ready
          </span>
        )}
      </div>

      {ready && states.followers.data && states.following.data ? (
        <div className="import-success dual-success">
          <div>
            <strong>{states.followers.data.usernames.length.toLocaleString()}</strong>
            <span>followers</span>
          </div>
          <span className="success-divider" aria-hidden="true" />
          <div>
            <strong>{states.following.data.usernames.length.toLocaleString()}</strong>
            <span>following in export</span>
          </div>
          <p>
            Read the exact followers and following files; other relationship files
            were ignored.
          </p>
        </div>
      ) : choices.length > 0 ? (
        <div className="candidate-picker">
          {choices.map((kind) => (
            <div key={kind} className="candidate-group">
              <strong>Which file contains your {kind}?</strong>
              <p>We could not identify it by its filename.</p>
              <div className="candidate-list">
                {states[kind].candidates?.map((file) => (
                  <button
                    key={`${kind}-${displayFilePath(file)}`}
                    className="candidate-button"
                    onClick={() => onCandidate(kind, file)}
                    title={displayFilePath(file)}
                  >
                    <span>{displayFilePath(file)}</span>
                    <b>Use this file</b>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="drop-copy">
          <span className="folder-icon" aria-hidden="true">
            ↓
          </span>
          <strong>Drop the followers_and_following folder here</strong>
          <span>We’ll find the correct HTML or JSON files inside it</span>
        </div>
      )}

      {loading && (
        <p className="status-message" aria-live="polite">
          Searching this folder on your device…
        </p>
      )}
      {errors.map((error) => (
        <p key={error} className="error-message" role="alert">
          {error}
        </p>
      ))}

      <div className="import-actions">
        <button className="primary-button" onClick={() => folderInput.current?.click()}>
          {ready || choices.length > 0 ? "Choose a different folder" : "Choose Instagram folder"}
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
        aria-label="Choose followers and following folder"
        aria-hidden="true"
        tabIndex={-1}
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
  const [imports, setImports] = useState<Record<ImportKind, ImportState>>({
    followers: { status: "empty" },
    following: { status: "empty" },
  });
  const [activeTab, setActiveTab] = useState<ResultTab>("notFollowingBack");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("az");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [liveFollowers, setLiveFollowers] = useState("");
  const [liveFollowing, setLiveFollowing] = useState("");
  const [folderFileCount, setFolderFileCount] = useState(0);
  const [notice, setNotice] = useState("");

  const resetSessionActions = () => {
    setSelected(new Set());
    setReviewed(new Set());
    setUnavailable(new Set());
    setHidden(new Set());
    setLiveFollowers("");
    setLiveFollowing("");
    setNotice("");
  };

  const updateUsernameSet = (
    setter: Dispatch<SetStateAction<Set<string>>>,
    username: string,
    force?: boolean,
  ) => {
    setter((current) => {
      const next = new Set(current);
      const shouldAdd = force ?? !next.has(username);
      if (shouldAdd) next.add(username);
      else next.delete(username);
      return next;
    });
  };

  const setImport = (kind: ImportKind, state: ImportState) => {
    setImports((current) => ({ ...current, [kind]: state }));
  };

  const parseFiles = async (kind: ImportKind, files: File[]) => {
    setImport(kind, { status: "loading" });
    try {
      const data = await parseInstagramFiles(files, kind);
      setImport(kind, { status: "ready", data });
    } catch (error) {
      setImport(kind, {
        status: "error",
        error: error instanceof Error ? error.message : "We could not read that folder.",
      });
    }
  };

  const handleFolder = async (files: File[]) => {
    resetSessionActions();
    setFolderFileCount(files.length);
    setImports({
      followers: { status: "loading" },
      following: { status: "loading" },
    });
    try {
      const discovery = discoverInstagramExport(files);
      (["followers", "following"] as ImportKind[]).forEach((kind) => {
        if (discovery[kind].automaticFiles.length > 0) {
          void parseFiles(kind, discovery[kind].automaticFiles);
        } else {
          setImport(kind, {
            status: "choosing",
            candidates: discovery[kind].candidates,
          });
        }
      });
    } catch (error) {
      const failed: ImportState = {
        status: "error",
        error: error instanceof Error ? error.message : "We could not read that folder.",
      };
      setImports({ followers: failed, following: failed });
    }
  };

  const comparison = useMemo(() => {
    if (!imports.followers.data || !imports.following.data) return null;
    return compareLists(
      imports.followers.data.usernames,
      imports.following.data.usernames,
    );
  }, [imports.followers.data, imports.following.data]);

  const currentResults = comparison?.[activeTab] ?? [];
  const visibleResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...currentResults]
      .filter((username) => !hidden.has(username) && username.includes(query))
      .sort((a, b) =>
        sortOrder === "az" ? a.localeCompare(b) : b.localeCompare(a),
      );
  }, [currentResults, hidden, search, sortOrder]);

  const selectedResults = visibleResults.filter((username) => selected.has(username));
  const unreviewedResults = visibleResults.filter((username) => !reviewed.has(username));

  const handleReviewNext = () => {
    const username = unreviewedResults[0];
    if (!username) {
      setNotice("Everything visible in this view has been reviewed.");
      return;
    }
    updateUsernameSet(setReviewed, username, true);
    window.open(`https://www.instagram.com/${username}/`, "_blank", "noopener,noreferrer");
    setNotice(`Opened @${username} and marked it reviewed.`);
  };

  const handleCopySelected = async () => {
    try {
      await navigator.clipboard.writeText(
        selectedResults.map((username) => `@${username}`).join("\n"),
      );
      setNotice(`Copied ${selectedResults.length} selected usernames.`);
    } catch {
      setNotice("Your browser did not allow copying. Download the selected list instead.");
    }
  };

  const applyToSelected = (action: "reviewed" | "unavailable" | "hidden") => {
    const setter =
      action === "reviewed"
        ? setReviewed
        : action === "unavailable"
          ? setUnavailable
          : setHidden;
    setter((current) => new Set([...current, ...selectedResults]));
    if (action === "unavailable") {
      setReviewed((current) => new Set([...current, ...selectedResults]));
    }
    if (action === "hidden") setSelected(new Set());
    setNotice(
      `${selectedResults.length} account${selectedResults.length === 1 ? "" : "s"} marked ${action}.`,
    );
  };

  const clearData = () => {
    setImports({
      followers: { status: "empty" },
      following: { status: "empty" },
    });
    setFolderFileCount(0);
    resetSessionActions();
    setSearch("");
    setActiveTab("notFollowingBack");
  };

  const liveFollowerNumber = liveFollowers === "" ? null : Number(liveFollowers);
  const liveFollowingNumber = liveFollowing === "" ? null : Number(liveFollowing);
  const followerDifference =
    liveFollowerNumber === null
      ? null
      : (imports.followers.data?.usernames.length ?? 0) - liveFollowerNumber;
  const followingDifference =
    liveFollowingNumber === null
      ? null
      : (imports.following.data?.usernames.length ?? 0) - liveFollowingNumber;

  return (
    <>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Only Friends home">
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
            Choose Instagram’s followers_and_following folder once. Only Friends
            finds both lists inside, compares them, and shows you where everyone stands.
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

          <div className="import-grid single-grid">
            <FolderImport
              states={imports}
              onFiles={handleFolder}
              onCandidate={(kind, file) => parseFiles(kind, [file])}
            />
          </div>

          {!comparison && (
            <p className="compare-hint">
              We use only followers, split followers files, and following. Other
              files in this folder are ignored.
            </p>
          )}

          {comparison && (
            <section className="results" aria-labelledby="results-title">
              <div className="results-heading">
                <div>
                  <p className="eyebrow">Your circle</p>
                  <h2 id="results-title">Here’s everyone</h2>
                </div>
                <div className="results-actions">
                  <button className="secondary-button" onClick={clearData}>
                    Clear my data
                  </button>
                  <button
                    className="download-button"
                    onClick={() =>
                      downloadCsv(visibleResults, TAB_DETAILS[activeTab].label)
                    }
                  >
                    Download this view
                  </button>
                </div>
              </div>

              <div className="results-note" role="note">
                Compared {imports.followers.data?.usernames.length.toLocaleString()} followers
                with {imports.following.data?.usernames.length.toLocaleString()} following.
                Results reflect the export, which can differ from Instagram’s live totals.
                Deactivated, renamed, or otherwise unavailable accounts may still appear under
                “Don’t follow you back.”
              </div>

              <section className="health-panel" aria-labelledby="health-title">
                <div className="health-heading">
                  <div>
                    <p className="eyebrow">Import check</p>
                    <h3 id="health-title">Your export looks readable</h3>
                  </div>
                  <span>{folderFileCount.toLocaleString()} files scanned locally</span>
                </div>
                <div className="health-grid">
                  <div className="health-stat">
                    <strong>{imports.followers.data?.usernames.length.toLocaleString()}</strong>
                    <span>unique followers</span>
                    <small>{imports.followers.data?.parsedFileNames.join(", ")}</small>
                  </div>
                  <div className="health-stat">
                    <strong>{imports.following.data?.usernames.length.toLocaleString()}</strong>
                    <span>unique following</span>
                    <small>{imports.following.data?.parsedFileNames.join(", ")}</small>
                  </div>
                  <div className="health-cleanup">
                    <strong>Automatic cleanup</strong>
                    <span>Duplicate usernames, invalid links, and deleted placeholders removed.</span>
                  </div>
                </div>
                <div className="live-count-check">
                  <div>
                    <strong>Compare with Instagram’s live profile</strong>
                    <span>Optional—this helps reveal a stale export or unavailable accounts.</span>
                  </div>
                  <label>
                    <span>Live followers</span>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={liveFollowers}
                      onChange={(event) => setLiveFollowers(event.target.value)}
                      placeholder="e.g. 968"
                    />
                  </label>
                  <label>
                    <span>Live following</span>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={liveFollowing}
                      onChange={(event) => setLiveFollowing(event.target.value)}
                      placeholder="e.g. 901"
                    />
                  </label>
                </div>
                {(followerDifference !== null || followingDifference !== null) && (
                  <div className="count-warning" role="status">
                    {followerDifference !== null && (
                      <span>
                        Followers:{" "}
                        {followerDifference === 0
                          ? "export matches live"
                          : `export is ${Math.abs(followerDifference)} ${
                              followerDifference > 0 ? "higher" : "lower"
                            } than live`}
                      </span>
                    )}
                    {followingDifference !== null && (
                      <span>
                        Following:{" "}
                        {followingDifference === 0
                          ? "export matches live"
                          : `export is ${Math.abs(followingDifference)} ${
                              followingDifference > 0 ? "higher" : "lower"
                            } than live`}
                      </span>
                    )}
                  </div>
                )}
              </section>

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
                      setSelected(new Set());
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

                <div className="review-toolbar">
                  <div className="review-progress">
                    <strong>
                      {currentResults.filter((username) => reviewed.has(username)).length} reviewed
                    </strong>
                    <span> · {unavailable.size} marked unavailable · {hidden.size} hidden</span>
                  </div>
                  <div className="review-buttons">
                    {hidden.size > 0 && (
                      <button className="small-button" onClick={() => setHidden(new Set())}>
                        Restore hidden
                      </button>
                    )}
                    <button className="small-button accent" onClick={handleReviewNext}>
                      Open next unreviewed
                    </button>
                  </div>
                </div>

                {notice && (
                  <p className="action-notice" role="status">
                    {notice}
                  </p>
                )}

                <div className="selection-toolbar">
                  <label className="select-visible">
                    <input
                      type="checkbox"
                      checked={
                        visibleResults.length > 0 &&
                        visibleResults.every((username) => selected.has(username))
                      }
                      onChange={(event) =>
                        setSelected(
                          event.target.checked ? new Set(visibleResults) : new Set(),
                        )
                      }
                    />
                    Select visible
                  </label>
                  {selectedResults.length > 0 && (
                    <div className="selection-actions">
                      <strong>{selectedResults.length} selected</strong>
                      <button onClick={handleCopySelected}>Copy</button>
                      <button onClick={() => applyToSelected("reviewed")}>Reviewed</button>
                      <button onClick={() => applyToSelected("unavailable")}>
                        Unavailable
                      </button>
                      <button onClick={() => applyToSelected("hidden")}>Hide</button>
                      <button
                        onClick={() => downloadCsv(selectedResults, "Only Friends selected")}
                      >
                        Download
                      </button>
                    </div>
                  )}
                </div>

                <p className="result-count">
                  Showing {visibleResults.length.toLocaleString()} of{" "}
                  {currentResults.length.toLocaleString()}
                  {hidden.size > 0 ? ` · ${hidden.size} hidden this session` : ""}
                </p>

                {visibleResults.length > 0 ? (
                  <ul className="username-list">
                    {visibleResults.map((username) => (
                      <li
                        key={username}
                        className={`${reviewed.has(username) ? "is-reviewed" : ""} ${unavailable.has(username) ? "is-unavailable" : ""}`}
                      >
                        <label className="row-select">
                          <input
                            type="checkbox"
                            checked={selected.has(username)}
                            onChange={() => updateUsernameSet(setSelected, username)}
                          />
                          <span className="sr-only">Select @{username}</span>
                        </label>
                        <span className="avatar-placeholder">
                          {username.charAt(0).toUpperCase()}
                        </span>
                        <div className="username-info">
                          <a
                            href={`https://www.instagram.com/${username}/`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            @{username} ↗
                          </a>
                          <div className="account-badges">
                            {reviewed.has(username) && <span>Reviewed</span>}
                            {unavailable.has(username) && <span>Unavailable?</span>}
                          </div>
                        </div>
                        <div className="row-actions">
                          <button
                            className={reviewed.has(username) ? "active" : ""}
                            onClick={() => updateUsernameSet(setReviewed, username)}
                          >
                            {reviewed.has(username) ? "Undo review" : "Reviewed"}
                          </button>
                          <button
                            className={unavailable.has(username) ? "active warning" : ""}
                            onClick={() => {
                              const markingUnavailable = !unavailable.has(username);
                              updateUsernameSet(setUnavailable, username);
                              if (markingUnavailable) {
                                updateUsernameSet(setReviewed, username, true);
                              }
                            }}
                          >
                            {unavailable.has(username) ? "Undo unavailable" : "Unavailable"}
                          </button>
                          <button
                            onClick={() => {
                              updateUsernameSet(setHidden, username, true);
                              updateUsernameSet(setSelected, username, false);
                            }}
                          >
                            Hide
                          </button>
                        </div>
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
            <h2>
              Download once.
              <br />
              Choose one folder.
            </h2>
            <p>
              Request “Followers and following” from Instagram’s Accounts Center.
              Unzip the download, then choose its followers_and_following folder.
              You do not need to find or select any HTML or JSON files yourself.
            </p>
          </div>
          <ol className="how-steps">
            <li>
              <span>01</span>
              <strong>Download your information</strong>
              <p>Choose Followers and following, select All time, and use JSON when possible.</p>
            </li>
            <li>
              <span>02</span>
              <strong>Open the unzipped download</strong>
              <p>Find Instagram’s folder named followers_and_following.</p>
            </li>
            <li>
              <span>03</span>
              <strong>Choose that one folder</strong>
              <p>Only Friends finds both lists, combines split files, and ignores the rest.</p>
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
            Your folders and review marks are read locally by your browser and
            disappear when you close, refresh, or choose Clear my data.
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
