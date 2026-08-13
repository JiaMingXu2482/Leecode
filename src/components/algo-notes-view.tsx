"use client";

import { Pencil, Plus, Save, Search, Sparkles, Trash2, X } from "lucide-react";
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
const CHAT_KEY = "algo-note-chat";

type ChatTurn = { role: "user" | "assistant"; content: string };

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

      <NoteAssistant
        noteContext={
          draft
            ? `标题: ${draft.title}\n分类: ${draft.category}\n\n${draft.contentMarkdown}`
            : selected
              ? `标题: ${selected.title}\n分类: ${selected.category}\n\n${selected.contentMarkdown}`
              : ""
        }
        onInsert={
          draft
            ? (text) =>
                setDraft({
                  ...draft,
                  contentMarkdown: `${draft.contentMarkdown.trimEnd()}\n\n${text}\n`,
                })
            : null
        }
      />
    </div>
  );
}

// 笔记助手：只读的 DeepSeek 助手，能看做题历史和现有笔记，帮忙把零散收获整理成
// 成体系的总结。它不会写库 —— 产出是文字，要不要收下由用户决定（编辑状态下可以
// 一键追加到正文末尾）。
function NoteAssistant({
  noteContext,
  onInsert,
}: {
  noteContext: string;
  onInsert: ((text: string) => void) | null;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [chat, setChat] = useState<ChatTurn[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(CHAT_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.slice(-40) : [];
    } catch {
      return [];
    }
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(chat.slice(-40)));
    } catch {}
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat]);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setError("");
    setBusy(true);
    const next = [...chat, { role: "user" as const, content: message }];
    setChat(next);
    const response = await fetch("/api/note-assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, history: chat.slice(-8), noteContext }),
    });
    setBusy(false);
    const payload = (await response.json().catch(() => ({}))) as { reply?: string; error?: string };
    if (!response.ok) {
      setError(payload.error ?? "助手暂时不可用");
      return;
    }
    setChat([...next, { role: "assistant", content: payload.reply ?? "（没有内容）" }]);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 inline-flex h-11 items-center gap-2 rounded-full border border-amber-300 bg-surface px-4 text-sm font-medium text-amber-600 shadow-lg hover:bg-muted dark:border-amber-500/40 dark:text-amber-300"
        title="笔记助手：只读，帮你把做题记录整理成算法总结"
      >
        <Sparkles size={16} />
        笔记助手
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-30 flex h-[32rem] w-[26rem] max-w-[calc(100vw-3rem)] flex-col rounded-lg border border-line bg-surface shadow-2xl">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Sparkles size={15} className="shrink-0 text-amber-500" />
        <span className="text-sm font-semibold">笔记助手</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-fg-subtle">只读</span>
        <button
          onClick={() => {
            setChat([]);
            try {
              localStorage.removeItem(CHAT_KEY);
            } catch {}
          }}
          className="ml-auto rounded-md px-1.5 py-0.5 text-xs text-fg-subtle hover:bg-muted"
        >
          清空
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-md px-1 py-0.5 text-fg-subtle hover:bg-muted"
          title="收起"
        >
          <X size={15} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {chat.length ? (
          chat.map((turn, index) => (
            <div key={index} className={turn.role === "user" ? "text-right" : ""}>
              <div
                className={`inline-block max-w-full overflow-x-auto whitespace-pre-wrap rounded-md px-2.5 py-1.5 text-left text-xs leading-relaxed ${
                  turn.role === "user"
                    ? "bg-blue-600 text-white"
                    : "border border-line bg-muted text-fg"
                }`}
              >
                {turn.content}
              </div>
              {turn.role === "assistant" && onInsert ? (
                <button
                  onClick={() => onInsert(turn.content)}
                  className="mt-1 block rounded-md border border-line px-1.5 py-0.5 text-[10px] text-fg-subtle hover:bg-muted"
                  title="追加到当前正在编辑的笔记末尾"
                >
                  插入到笔记
                </button>
              ) : null}
            </div>
          ))
        ) : (
          <div className="space-y-2 text-xs leading-relaxed text-fg-subtle">
            <p>我能读你的做题记录、每道题的笔记原文和现有的算法总结，帮你整理成体系。</p>
            <p className="text-[11px]">只读 —— 不会改你的笔记、计划或代码，产出的内容你自己决定要不要收。</p>
            <p className="pt-1 font-medium text-fg-muted">可以试试：</p>
            <ul className="space-y-1">
              {[
                "我最近哪类题最弱？该先总结哪一类",
                "把我这两周做的 DP 题整理成一份总结",
                "我在背包问题上踩过哪些坑？",
                "这篇笔记还缺什么，帮我补一段",
              ].map((example) => (
                <li key={example}>
                  <button
                    onClick={() => setInput(example)}
                    className="w-full rounded-md border border-line px-2 py-1 text-left hover:bg-muted"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {busy ? <p className="text-xs text-fg-subtle">思考中…</p> : null}
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
      </div>

      <div className="border-t border-line p-2">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="问点什么，或让我整理一份总结（Ctrl+Enter 发送）"
          className="w-full resize-none rounded-md border border-line bg-canvas px-2 py-1.5 text-xs outline-none focus:border-blue-400"
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="mt-1.5 inline-flex h-8 w-full items-center justify-center rounded-md bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 disabled:bg-btn-strong"
        >
          {busy ? "思考中…" : "发送"}
        </button>
      </div>
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
