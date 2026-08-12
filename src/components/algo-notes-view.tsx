"use client";

import { Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AlgoNoteSummary } from "@/lib/algo-notes";
import { attachCopyButtons } from "@/lib/code-copy";
import { markdownToHtml } from "@/lib/markdown";

// Monaco is heavy and only needed once the user actually edits.
const MonacoNoteEditor = dynamic(() => import("@/components/monaco-note-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[32rem] items-center justify-center rounded-md border border-line-strong text-sm text-fg-subtle">
      编辑器加载中…
    </div>
  ),
});

const UNCATEGORIZED = "未分类";
const DRAFT_KEY = "algo-note-draft";

type Draft = { id: string | null; title: string; category: string; contentMarkdown: string };

const EMPTY_DRAFT: Draft = { id: null, title: "", category: "", contentMarkdown: "" };

export default function AlgoNotesView({ initialNotes }: { initialNotes: AlgoNoteSummary[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [selectedId, setSelectedId] = useState<string | null>(initialNotes[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selected = notes.find((note) => note.id === selectedId) ?? null;

  // 全文搜索：标题、分类、正文都搜。命中的笔记才留在左侧目录里。
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((note) =>
      [note.title, note.category, note.contentMarkdown].some((field) =>
        field.toLowerCase().includes(q),
      ),
    );
  }, [notes, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, AlgoNoteSummary[]>();
    for (const note of filtered) {
      const key = note.category.trim() || UNCATEGORIZED;
      const list = map.get(key);
      if (list) list.push(note);
      else map.set(key, [note]);
    }
    // 「未分类」永远排最后
    return [...map.entries()].sort(([a], [b]) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b, "zh");
    });
  }, [filtered]);

  const categories = useMemo(
    () => [...new Set(notes.map((note) => note.category.trim()).filter(Boolean))].sort(),
    [notes],
  );

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setMessage("");
    const response = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    const payload = (await response.json().catch(() => ({}))) as {
      notes?: AlgoNoteSummary[];
      id?: string;
      error?: string;
    };
    if (!response.ok) {
      setMessage(payload.error ?? "操作失败");
      return null;
    }
    if (payload.notes) setNotes(payload.notes);
    return payload;
  }

  async function save() {
    if (!draft) return;
    const body = {
      title: draft.title,
      category: draft.category,
      contentMarkdown: draft.contentMarkdown,
    };
    const result = draft.id
      ? await send(`/api/algo-notes/${draft.id}`, "PATCH", body)
      : await send("/api/algo-notes", "POST", body);
    if (!result) return;
    setSelectedId(draft.id ?? result.id ?? null);
    setDraft(null);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  async function remove(note: AlgoNoteSummary) {
    if (!window.confirm(`删除「${note.title}」？不可恢复。`)) return;
    const result = await send(`/api/algo-notes/${note.id}`, "DELETE");
    if (result && selectedId === note.id) {
      setSelectedId(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜标题、分类、正文"
            className="h-9 w-full rounded-md border border-line bg-surface pl-8 pr-2 text-sm outline-none focus:border-blue-400"
          />
        </div>
        <button
          onClick={() => setDraft({ ...EMPTY_DRAFT })}
          className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus size={15} />
          新建笔记
        </button>

        <div className="mt-3 space-y-3">
          {grouped.length ? (
            grouped.map(([category, list]) => (
              <div key={category}>
                <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                  {category}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {list.map((note) => (
                    <li key={note.id}>
                      <button
                        onClick={() => {
                          setSelectedId(note.id);
                          setDraft(null);
                        }}
                        className={`w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${
                          note.id === selectedId && !draft
                            ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                            : "text-fg-muted hover:bg-muted"
                        }`}
                      >
                        {note.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="px-1 text-xs text-fg-subtle">
              {query ? "没搜到匹配的笔记。" : "还没有笔记，点上面「新建笔记」开始。"}
            </p>
          )}
        </div>
      </aside>

      <section className="min-w-0">
        {message ? <p className="mb-3 text-sm text-red-500">{message}</p> : null}
        {draft ? (
          <NoteEditor
            draft={draft}
            categories={categories}
            busy={busy}
            onChange={setDraft}
            onSave={save}
            onCancel={() => {
              setDraft(null);
              try {
                localStorage.removeItem(DRAFT_KEY);
              } catch {}
            }}
          />
        ) : selected ? (
          <NoteReader
            note={selected}
            onEdit={() =>
              setDraft({
                id: selected.id,
                title: selected.title,
                category: selected.category,
                contentMarkdown: selected.contentMarkdown,
              })
            }
            onDelete={() => remove(selected)}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-line p-10 text-center text-sm text-fg-subtle">
            左边选一篇笔记，或者新建一篇。
            <br />
            正文里的题号（<code>#53</code> / <code>HJ14</code> / <code>P2352</code>）会自动变成链接。
          </div>
        )}
      </section>
    </div>
  );
}

function NoteEditor({
  draft,
  categories,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  categories: string[];
  busy: boolean;
  onChange: (next: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [preview, setPreview] = useState(true);
  const rendered = useMemo(() => markdownToHtml(draft.contentMarkdown), [draft.contentMarkdown]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          placeholder="标题，比如「DP 的主要类型与模板」"
          className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm outline-none focus:border-blue-400"
        />
        <input
          value={draft.category}
          onChange={(event) => onChange({ ...draft, category: event.target.value })}
          placeholder="分类"
          list="algo-note-categories"
          className="h-9 w-36 rounded-md border border-line bg-surface px-3 text-sm outline-none focus:border-blue-400"
        />
        <datalist id="algo-note-categories">
          {categories.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <button
          onClick={() => setPreview((value) => !value)}
          className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm text-fg-muted hover:bg-muted"
        >
          {preview ? "只写" : "预览"}
        </button>
        <button
          onClick={onSave}
          disabled={busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-btn-strong"
        >
          <Save size={15} />
          保存
        </button>
        <button
          onClick={onCancel}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-fg-muted hover:bg-muted"
          title="取消"
        >
          <X size={15} />
        </button>
      </div>

      <div className={`mt-3 grid gap-3 ${preview ? "xl:grid-cols-2" : ""}`}>
        <MonacoNoteEditor
          value={draft.contentMarkdown}
          language="markdown"
          height="32rem"
          draftKey={DRAFT_KEY}
          onChange={(next) => onChange({ ...draft, contentMarkdown: next })}
        />
        {preview ? (
          <div className="max-h-[32rem] overflow-auto rounded-md border border-line p-4">
            <NoteBody html={rendered.html} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NoteReader({
  note,
  onEdit,
  onDelete,
}: {
  note: AlgoNoteSummary;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const rendered = useMemo(() => markdownToHtml(note.contentMarkdown), [note.contentMarkdown]);
  // 只有小标题多到值得导航时才显示目录
  const toc = rendered.toc.filter((entry) => entry.level === 2 || entry.level === 3);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_13rem]">
      <article className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">{note.title}</h2>
            <p className="mt-1 text-xs text-fg-subtle">
              {note.category || UNCATEGORIZED} · 更新于 {note.updatedAt.slice(0, 10)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onEdit}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-fg-muted hover:bg-muted"
            >
              <Pencil size={14} />
              编辑
            </button>
            <button
              onClick={onDelete}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
              title="删除这篇笔记"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
        <div className="mt-4">
          <NoteBody html={rendered.html} />
        </div>
      </article>

      {toc.length > 2 ? (
        <nav className="hidden xl:sticky xl:top-24 xl:block xl:self-start">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">目录</div>
          <ul className="mt-2 space-y-1 border-l border-line">
            {toc.map((entry) => (
              <li key={entry.id}>
                <a
                  href={`#${entry.id}`}
                  className={`block truncate border-l-2 border-transparent py-0.5 text-xs text-fg-subtle hover:border-blue-400 hover:text-fg ${
                    entry.level === 3 ? "pl-5" : "pl-2.5"
                  }`}
                >
                  {entry.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}

// 渲染好的 HTML 挂进 DOM，并给每个代码块加一个复制按钮。
// 注入逻辑抽在 attachCopyButtons 里，那边有单测覆盖。
function NoteBody({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) {
      return;
    }
    return attachCopyButtons(root, (text) => navigator.clipboard.writeText(text));
  }, [html]);

  return (
    <div
      ref={ref}
      className="md-body"
      // html 由 markdownToHtml 生成，所有用户输入都经过 escapeHtml
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
