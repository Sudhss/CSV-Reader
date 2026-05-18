import Papa from "papaparse";
import {
  ArrowDownAZ,
  ArrowDownUp,
  BarChart3,
  Check,
  ExternalLink,
  FileUp,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const DB_NAME = "dsa-sheet-ledger";
const DB_VERSION = 1;
const SHEET_KEY = "current-sheet";
const DIFFICULTY_ORDER = { Easy: 1, Medium: 2, Hard: 3 };

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("progress")) {
        db.createObjectStore("progress", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(storeName, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function idbGetAll(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function idbPut(storeName, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function idbDelete(storeName, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cleanNumber(value) {
  const parsed = Number(String(value || "").replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanDifficulty(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "easy") return "Easy";
  if (text === "medium") return "Medium";
  if (text === "hard") return "Hard";
  return "Unknown";
}

function questionKey(question) {
  if (question.id) return `id:${question.id}`;
  if (question.link) return `link:${question.link}`;
  return `title:${question.title.toLowerCase()}`;
}

function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: normalizeHeader,
      complete: (result) => {
        if (result.errors?.length) {
          reject(result.errors[0]);
          return;
        }

        const rows = result.data
          .map((row, index) => {
            const id = String(row.id || "").trim();
            const title = String(row.title || "").trim();
            const link = String(
              row["leetcode question link"] ||
                row.link ||
                row.url ||
                ""
            ).trim();

            if (!id && !title && !link) return null;

            const question = {
              rowId: `${id || title || link}-${index}`,
              id,
              title: title || `Problem ${id || index + 1}`,
              acceptance: cleanNumber(row.acceptance),
              difficulty: cleanDifficulty(row.difficulty),
              frequency: cleanNumber(row.frequency),
              link,
            };

            return { ...question, key: questionKey(question) };
          })
          .filter(Boolean);

        resolve({
          filename: file.name,
          uploadedAt: new Date().toISOString(),
          rows,
        });
      },
      error: reject,
    });
  });
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function formatFrequency(value) {
  return value ? value.toFixed(2) : "0.00";
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function lastNDays(count) {
  const days = [];
  const today = new Date();
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    days.push(isoDay(date));
  }
  return days;
}

function EmptyState({ onUpload }) {
  return (
    <section className="empty-shell">
      <div className="empty-rule" />
      <div className="empty-copy">
        <p className="eyebrow">Local-first DSA sheet</p>
        <h1>Drop in your LeetCode CSV. Get a real practice sheet.</h1>
        <p>
          Upload columns like ID, Title, Acceptance, Difficulty, Frequency, and
          Leetcode Question Link. The sheet stays in your browser with solved
          progress saved locally.
        </p>
      </div>
      <button className="primary-action large" onClick={onUpload}>
        <Upload size={19} />
        Upload CSV
      </button>
    </section>
  );
}

function StatCell({ label, value, accent }) {
  return (
    <div className={`stat-cell ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SortButton({ field, activeSort, onSort, children }) {
  const active = activeSort.field === field;
  return (
    <button
      className={`sort-button ${active ? "active" : ""}`}
      onClick={() => onSort(field)}
      type="button"
    >
      {children}
      <ArrowDownUp size={13} />
      {active ? <span>{activeSort.direction === "asc" ? "Asc" : "Desc"}</span> : null}
    </button>
  );
}

function App() {
  const fileInputRef = useRef(null);
  const [sheet, setSheet] = useState(null);
  const [progress, setProgress] = useState({});
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState("All");
  const [solvedFilter, setSolvedFilter] = useState("All");
  const [sort, setSort] = useState({ field: "frequency", direction: "desc" });
  const [isDragging, setIsDragging] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function restore() {
      const [storedSheet, storedProgress] = await Promise.all([
        idbGet("meta", SHEET_KEY),
        idbGetAll("progress"),
      ]);
      if (storedSheet?.sheet) setSheet(storedSheet.sheet);
      setProgress(
        Object.fromEntries(storedProgress.map((item) => [item.key, item]))
      );
    }

    restore().catch(() => {
      setNotice("Could not restore the saved browser data.");
    });
  }, []);

  async function handleFiles(fileList) {
    const file = Array.from(fileList || []).find((item) =>
      item.name.toLowerCase().endsWith(".csv")
    );
    if (!file) {
      setNotice("Choose a CSV file first.");
      return;
    }

    try {
      const parsedSheet = await parseCsv(file);
      await idbPut("meta", { key: SHEET_KEY, sheet: parsedSheet });
      const storedProgress = await idbGetAll("progress");
      setSheet(parsedSheet);
      setProgress(
        Object.fromEntries(storedProgress.map((item) => [item.key, item]))
      );
      setQuery("");
      setDifficulty("All");
      setSolvedFilter("All");
      setSort({ field: "frequency", direction: "desc" });
      setNotice(`Loaded ${parsedSheet.rows.length} questions from ${file.name}.`);
    } catch (error) {
      setNotice(`CSV upload failed: ${error.message || "unknown parse error"}`);
    }
  }

  async function toggleSolved(question, solved) {
    const existing = progress[question.key] || {};
    const next = {
      key: question.key,
      solved,
      completedAt: solved ? existing.completedAt || new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    };

    setProgress((current) => ({ ...current, [question.key]: next }));
    await idbPut("progress", next);
  }

  async function clearSheet() {
    await idbDelete("meta", SHEET_KEY);
    setSheet(null);
    setQuery("");
    setDifficulty("All");
    setSolvedFilter("All");
    setNotice("Current sheet cleared. Progress remains saved for matching IDs.");
  }

  function setSortField(field) {
    setSort((current) => {
      if (current.field !== field) {
        const defaultDirection = ["title", "id", "difficulty"].includes(field)
          ? "asc"
          : "desc";
        return { field, direction: defaultDirection };
      }
      return {
        field,
        direction: current.direction === "asc" ? "desc" : "asc",
      };
    });
  }

  const rowsWithProgress = useMemo(() => {
    return (sheet?.rows || []).map((question) => ({
      ...question,
      solved: Boolean(progress[question.key]?.solved),
      completedAt: progress[question.key]?.completedAt || null,
    }));
  }, [sheet, progress]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rowsWithProgress
      .filter((row) => {
        const queryMatches =
          !normalizedQuery ||
          row.title.toLowerCase().includes(normalizedQuery) ||
          row.id.includes(normalizedQuery);
        const difficultyMatches =
          difficulty === "All" || row.difficulty === difficulty;
        const solvedMatches =
          solvedFilter === "All" ||
          (solvedFilter === "Solved" ? row.solved : !row.solved);
        return queryMatches && difficultyMatches && solvedMatches;
      })
      .sort((a, b) => {
        let left = a[sort.field];
        let right = b[sort.field];

        if (sort.field === "difficulty") {
          left = DIFFICULTY_ORDER[a.difficulty] || 99;
          right = DIFFICULTY_ORDER[b.difficulty] || 99;
        }

        if (sort.field === "title") {
          left = a.title.toLowerCase();
          right = b.title.toLowerCase();
        }

        if (sort.field === "id") {
          left = Number(a.id) || 0;
          right = Number(b.id) || 0;
        }

        if (left < right) return sort.direction === "asc" ? -1 : 1;
        if (left > right) return sort.direction === "asc" ? 1 : -1;
        return a.title.localeCompare(b.title);
      });
  }, [rowsWithProgress, query, difficulty, solvedFilter, sort]);

  const analytics = useMemo(() => {
    const total = rowsWithProgress.length;
    const solved = rowsWithProgress.filter((row) => row.solved).length;
    const byDifficulty = ["Easy", "Medium", "Hard"].map((level) => {
      const all = rowsWithProgress.filter((row) => row.difficulty === level);
      const done = all.filter((row) => row.solved).length;
      return { level, total: all.length, done };
    });
    const days = lastNDays(14);
    const countsByDay = Object.fromEntries(days.map((day) => [day, 0]));

    rowsWithProgress.forEach((row) => {
      if (!row.completedAt) return;
      const day = row.completedAt.slice(0, 10);
      if (day in countsByDay) countsByDay[day] += 1;
    });

    return {
      total,
      solved,
      unsolved: total - solved,
      percent: total ? Math.round((solved / total) * 100) : 0,
      byDifficulty,
      daily: days.map((day) => ({ day, count: countsByDay[day] })),
    };
  }, [rowsWithProgress]);

  const maxDaily = Math.max(1, ...analytics.daily.map((item) => item.count));

  return (
    <main
      className={`app-shell ${isDragging ? "dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="visually-hidden"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <header className="topbar">
        <div>
          <p className="eyebrow">Browser-only / IndexedDB</p>
          <h1>DSA Sheet Ledger</h1>
        </div>
        <div className="topbar-actions">
          {sheet ? (
            <button className="ghost-action" onClick={clearSheet} type="button">
              <Trash2 size={16} />
              Clear
            </button>
          ) : null}
          <button
            className="primary-action"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <FileUp size={17} />
            Upload CSV
          </button>
        </div>
      </header>

      {notice ? (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice("")} type="button">
            Dismiss
          </button>
        </div>
      ) : null}

      {!sheet ? (
        <EmptyState onUpload={() => fileInputRef.current?.click()} />
      ) : (
        <div className="workbench">
          <section className="sheet-head">
            <div>
              <p className="eyebrow">Current file</p>
              <h2>{sheet.filename.trim("_")}</h2>
              <span>
                {sheet.rows.length} questions loaded · progress remembered by
                problem ID
              </span>
            </div>
            <div className="completion-ring" aria-label={`${analytics.percent}% solved`}>
              <svg viewBox="0 0 120 120">
                <circle className="ring-bg" cx="60" cy="60" r="46" />
                <circle
                  className="ring-progress"
                  cx="60"
                  cy="60"
                  r="46"
                  style={{ "--progress": analytics.percent }}
                />
              </svg>
              <strong>{analytics.percent}%</strong>
            </div>
          </section>

          <section className="analytics-strip" aria-label="Progress analytics">
            <StatCell label="Solved" value={analytics.solved} accent />
            <StatCell label="Remaining" value={analytics.unsolved} />
            {analytics.byDifficulty.map((item) => (
              <div className="difficulty-stat" key={item.level}>
                <div>
                  <span>{item.level}</span>
                  <strong>
                    {item.done}/{item.total}
                  </strong>
                </div>
                <div className="meter">
                  <span
                    style={{
                      width: `${item.total ? (item.done / item.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="spark-panel">
              <div>
                <BarChart3 size={15} />
                <span>Last 14 days</span>
              </div>
              <div className="bars">
                {analytics.daily.map((item) => (
                  <span
                    key={item.day}
                    title={`${item.day}: ${item.count}`}
                    style={{ height: `${18 + (item.count / maxDaily) * 54}px` }}
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="controls" aria-label="Sheet controls">
            <label className="search-box">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search title or ID"
              />
            </label>
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value)}
              aria-label="Filter by difficulty"
            >
              <option>All</option>
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>
            <select
              value={solvedFilter}
              onChange={(event) => setSolvedFilter(event.target.value)}
              aria-label="Filter by solved status"
            >
              <option>All</option>
              <option>Solved</option>
              <option>Unsolved</option>
            </select>
            <button
              className="ghost-action"
              onClick={() => {
                setQuery("");
                setDifficulty("All");
                setSolvedFilter("All");
                setSort({ field: "frequency", direction: "desc" });
              }}
              type="button"
            >
              <RotateCcw size={15} />
              Reset
            </button>
          </section>

          <section className="table-panel">
            <div className="sort-row" aria-label="Sort controls">
              <ArrowDownAZ size={16} />
              <SortButton field="id" activeSort={sort} onSort={setSortField}>
                ID
              </SortButton>
              <SortButton field="title" activeSort={sort} onSort={setSortField}>
                Title
              </SortButton>
              <SortButton
                field="difficulty"
                activeSort={sort}
                onSort={setSortField}
              >
                Difficulty
              </SortButton>
              <SortButton
                field="acceptance"
                activeSort={sort}
                onSort={setSortField}
              >
                Acceptance
              </SortButton>
              <SortButton
                field="frequency"
                activeSort={sort}
                onSort={setSortField}
              >
                Frequency
              </SortButton>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="check-col">Done</th>
                    <th>ID</th>
                    <th>Question</th>
                    <th>Difficulty</th>
                    <th>Acceptance</th>
                    <th>Frequency</th>
                    <th>Link</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((question) => (
                    <tr
                      key={question.rowId}
                      className={question.solved ? "solved-row" : ""}
                    >
                      <td className="check-col">
                        <label className="checkbox-wrap">
                          <input
                            type="checkbox"
                            checked={question.solved}
                            onChange={(event) =>
                              toggleSolved(question, event.target.checked)
                            }
                          />
                          <span>
                            <Check size={14} />
                          </span>
                        </label>
                      </td>
                      <td className="id-cell">#{question.id || "—"}</td>
                      <td>
                        <strong>{question.title}</strong>
                      </td>
                      <td>
                        <span className={`badge ${question.difficulty.toLowerCase()}`}>
                          {question.difficulty}
                        </span>
                      </td>
                      <td>{formatPercent(question.acceptance)}</td>
                      <td>{formatFrequency(question.frequency)}</td>
                      <td>
                        {question.link ? (
                          <a
                            className="link-button"
                            href={question.link}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open ${question.title} on LeetCode`}
                          >
                            <ExternalLink size={15} />
                          </a>
                        ) : (
                          <span className="muted">Missing</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredRows.length ? (
                <div className="no-results">No questions match the current filters.</div>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
