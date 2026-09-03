"use client";

import { ImagePlus, Pencil, Plus, Save, Search, Sparkles, Trash2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AlgoNoteSummary } from "@/lib/algo-notes";
import { attachCopyButtons } from "@/lib/code-copy";
import { markdownToHtml } from "@/lib/markdown";
import { uploadNoteImage } from "@/lib/note-image-upload";
import { boxAfterDrag, boxAfterResize, isPanelBox, type PanelBox } from "@/lib/panel-box";
import type { NoteEditorInstance } from "@/components/monaco-note-editor";
import { syncedScrollTop } from "@/lib/scroll-sync";

// Monaco is heavy and only needed once the user actually edits.
const MonacoNoteEditor = dynamic(() => import("@/components/monaco-note-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[80rem] items-center justify-center rounded-md border border-line-strong text-sm text-fg-subtle">
      编辑器加载中…
    </div>
  ),
});

const UNCATEGORIZED = "未分类";
const DRAFT_KEY = "algo-note-draft";
const CHAT_KEY = "algo-note-chat";
const BOX_KEY = "algo-note-assistant-box";

type ChatTurn = { role: "user" | "assistant"; content: string };

function readBox(): PanelBox | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(BOX_KEY) ?? "null");
    return isPanelBox(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

type Draft = { id: string | null; title: string; category: string; contentMarkdown: string };

const EMPTY_DRAFT: Draft = { id: null, title: "", category: "", contentMarkdown: "" };

export default function AlgoNotesView({ initialNotes }: { initialNotes: AlgoNoteSummary[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [selectedId, setSelectedId] = useState<string | null>(initialNotes[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [autoSavedAt, setAutoSavedAt] = useState<Date | null>(null);

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

  // 每分钟自动存一次，防止写着写着被刷新/关标签页冲掉。
  //
  // 和手动「保存」的区别：不关闭编辑器、不清草稿、不改选中项 —— 只是把内容落库。
  // 新笔记第一次自动保存会 POST 建一条，然后把返回的 id 写回 draft，后续都走
  // PATCH；不这么做的话每分钟都会新建一篇。
  //
  // 用 ref 存最近一次保存过的内容，只有真的改动过才发请求，避免空转。
  const draftRef = useRef(draft);
  const savedSnapshotRef = useRef("");
  const autoSavingRef = useRef(false);
  // 每次渲染后刷新，不能在渲染期间写 ref（react-hooks/refs）。
  useEffect(() => {
    draftRef.current = draft;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      void (async () => {
        const current = draftRef.current;
        if (!current || autoSavingRef.current) return;
        // 标题和正文都空的草稿不值得建一条笔记
        if (!current.title.trim() && !current.contentMarkdown.trim()) return;
        const snapshot = JSON.stringify([current.title, current.category, current.contentMarkdown]);
        if (snapshot === savedSnapshotRef.current) return;

        autoSavingRef.current = true;
        try {
          const body = {
            title: current.title,
            category: current.category,
            contentMarkdown: current.contentMarkdown,
          };
          const response = await fetch(
            current.id ? `/api/algo-notes/${current.id}` : "/api/algo-notes",
            {
              method: current.id ? "PATCH" : "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            },
          );
          const payload = (await response.json().catch(() => ({}))) as {
            notes?: AlgoNoteSummary[];
            id?: string;
          };
          if (!response.ok) return;
          savedSnapshotRef.current = snapshot;
          if (payload.notes) setNotes(payload.notes);
          // 新建的笔记拿到 id 后写回草稿，下一次自动保存才会走 PATCH。
          if (!current.id && payload.id) {
            setDraft((prev) => (prev && !prev.id ? { ...prev, id: payload.id ?? null } : prev));
          }
          setAutoSavedAt(new Date());
        } finally {
          autoSavingRef.current = false;
        }
      })();
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

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
            autoSavedAt={autoSavedAt}
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
  const panelRef = useRef<HTMLDivElement>(null);
  // 位置和尺寸都记在 localStorage：拖到顺手的地方、拉到顺手的大小之后，
  // 下次打开还是那样。null = 还没动过，用默认的右下角。
  const [box, setBox] = useState<PanelBox | null>(() => readBox());

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(chat.slice(-40)));
    } catch {}
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat]);

  // 拖动/缩放期间挂在 window 上，指针跑出面板也不会掉。几何计算在 panel-box.ts
  // 里，那边有单测覆盖各种边界（拖出屏幕、缩成负数）。
  function trackPointer(onMove: (event: PointerEvent) => void) {
    function move(event: PointerEvent) {
      onMove(event);
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function viewport() {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  // 拖标题栏移动窗口。
  function startDrag(event: React.PointerEvent) {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const grab = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    const size = { w: rect.width, h: rect.height };
    trackPointer((moveEvent) =>
      saveBox(boxAfterDrag({ x: moveEvent.clientX, y: moveEvent.clientY }, grab, size, viewport())),
    );
  }

  // 拖右下角改大小。用自绘的把手而不是 CSS resize —— 面板是 flex 布局，
  // 原生 resize 和 flex 子项容易打架，自己算更可控。
  function startResize(event: React.PointerEvent) {
    event.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const origin = { x: rect.left, y: rect.top };
    trackPointer((moveEvent) =>
      saveBox(boxAfterResize({ x: moveEvent.clientX, y: moveEvent.clientY }, origin, viewport())),
    );
  }

  function saveBox(next: PanelBox) {
    setBox(next);
    try {
      localStorage.setItem(BOX_KEY, JSON.stringify(next));
    } catch {}
  }

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
    <div
      ref={panelRef}
      style={box ? { left: box.x, top: box.y, width: box.w, height: box.h, right: "auto", bottom: "auto" } : undefined}
      className="fixed bottom-6 right-6 z-30 flex h-[34rem] w-[30rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-2xl"
    >
      <div
        onPointerDown={startDrag}
        className="flex cursor-move touch-none select-none items-center gap-2 border-b border-line px-3 py-2"
        title="拖这里可以移动窗口"
      >
        <Sparkles size={15} className="shrink-0 text-amber-500" />
        <span className="text-sm font-semibold">笔记助手</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-fg-subtle">只读</span>
        <button
          onPointerDown={(event) => event.stopPropagation()}
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
        {box ? (
          <button
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              setBox(null);
              try {
                localStorage.removeItem(BOX_KEY);
              } catch {}
            }}
            className="rounded-md px-1.5 py-0.5 text-xs text-fg-subtle hover:bg-muted"
            title="恢复默认位置和大小"
          >
            复位
          </button>
        ) : null}
        <button
          onPointerDown={(event) => event.stopPropagation()}
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
              {turn.role === "user" ? (
                <div className="inline-block max-w-full whitespace-pre-wrap rounded-md bg-blue-600 px-2.5 py-1.5 text-left text-xs leading-relaxed text-white">
                  {turn.content}
                </div>
              ) : (
                // 助手的产出本来就是 Markdown（标题/代码块/表格），按纯文本显示等于
                // 把它最有用的部分糟蹋掉，所以走和笔记正文同一套渲染。
                <div className="overflow-x-auto rounded-md border border-line bg-muted px-2.5 py-1.5">
                  <NoteBody html={markdownToHtml(turn.content).html} compact />
                </div>
              )}
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

      {/* 右下角的缩放把手 */}
      <div
        onPointerDown={startResize}
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none"
        title="拖动改变窗口大小"
      >
        <svg viewBox="0 0 16 16" className="h-full w-full text-fg-subtle" aria-hidden>
          <path d="M15 6 L6 15 M15 11 L11 15" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      </div>
    </div>
  );
}

function NoteEditor({
  draft,
  autoSavedAt,
  categories,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  autoSavedAt: Date | null;
  categories: string[];
  busy: boolean;
  onChange: (next: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [preview, setPreview] = useState(true);
  const [imageError, setImageError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rendered = useMemo(() => markdownToHtml(draft.contentMarkdown), [draft.contentMarkdown]);

  // 左右滚动同步。两边内容高度不一样（预览有标题样式、代码块配色、图片），
  // 所以按「滚动比例」换算而不是按像素：一边滚到 30%，另一边也滚到 30%。
  //
  // syncingRef 防死循环：程序设置 scrollTop 同样会触发对方的 scroll 事件，
  // 不挡住的话两边会互相推着抖。
  const previewRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<NoteEditorInstance | null>(null);
  const disposeRef = useRef<{ dispose: () => void } | null>(null);
  const syncingRef = useRef(false);

  function withSyncLock(run: () => void) {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      run();
    } finally {
      // 用微任务复位：对方的 scroll 事件是同步派发的，这一轮之内要一直挡住。
      queueMicrotask(() => {
        syncingRef.current = false;
      });
    }
  }

  function attachEditor(editor: NoteEditorInstance | null) {
    disposeRef.current?.dispose();
    disposeRef.current = null;
    editorRef.current = editor;
    if (!editor) return;
    disposeRef.current = editor.onDidScrollChange(() => {
      const box = previewRef.current;
      if (!box) return;
      const next = syncedScrollTop(
        {
          scrollTop: editor.getScrollTop(),
          scrollHeight: editor.getScrollHeight(),
          clientHeight: editor.getLayoutInfo().height,
        },
        { scrollHeight: box.scrollHeight, clientHeight: box.clientHeight },
      );
      if (next === null) return;
      withSyncLock(() => {
        box.scrollTop = next;
      });
    });
  }

  function onPreviewScroll() {
    const editor = editorRef.current;
    const box = previewRef.current;
    if (!editor || !box) return;
    const next = syncedScrollTop(
      { scrollTop: box.scrollTop, scrollHeight: box.scrollHeight, clientHeight: box.clientHeight },
      { scrollHeight: editor.getScrollHeight(), clientHeight: editor.getLayoutInfo().height },
    );
    if (next === null) return;
    withSyncLock(() => {
      editor.setScrollTop(next);
    });
  }

  useEffect(() => () => disposeRef.current?.dispose(), []);

  async function addImage(file: File) {
    setImageError("");
    setUploading(true);
    const result = await uploadNoteImage(file, (image) =>
      fetch("/api/note-images", {
        method: "POST",
        headers: { "content-type": image.type },
        body: image,
      }),
    );
    setUploading(false);
    if (!result.ok) {
      setImageError(result.error);
      return null;
    }
    return result.markdown;
  }

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
        {/* 粘贴/拖入之外的兜底入口：剪贴板拦截依赖浏览器行为，选文件不依赖。 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-fg-muted hover:bg-muted disabled:opacity-60"
          title="也可以直接 Ctrl+V 粘贴截图，或把图片拖进编辑器"
        >
          <ImagePlus size={15} />
          {uploading ? "上传中…" : "插入图片"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const markdown = await addImage(file);
            if (markdown) {
              onChange({
                ...draft,
                contentMarkdown: `${draft.contentMarkdown.trimEnd()}

${markdown}
`,
              });
            }
          }}
        />
        {autoSavedAt ? (
          <span className="shrink-0 text-xs text-fg-subtle" title="每分钟自动保存一次">
            已自动保存 {autoSavedAt.toTimeString().slice(0, 5)}
          </span>
        ) : null}
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

      {imageError ? <p className="mt-2 text-xs text-red-500">{imageError}</p> : null}
      <div className={`mt-3 grid gap-3 ${preview ? "xl:grid-cols-2" : ""}`}>
        <MonacoNoteEditor
          value={draft.contentMarkdown}
          language="markdown"
          height="80rem"
          draftKey={DRAFT_KEY}
          onChange={(next) => onChange({ ...draft, contentMarkdown: next })}
          onPasteImage={addImage}
          onEditorReady={attachEditor}
        />
        {preview ? (
          <div
            ref={previewRef}
            onScroll={onPreviewScroll}
            /* mt-2 和 MonacoNoteEditor 外层的 mt-2 对齐；高度也用固定值而不是
               max-h，否则内容不够长时右框会比左框矮一截。 */
            className="mt-2 h-[80rem] overflow-auto rounded-md border border-line p-4"
          >
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
function NoteBody({ html, compact = false }: { html: string; compact?: boolean }) {
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
      className={compact ? "md-body md-compact" : "md-body"}
      // html 由 markdownToHtml 生成，所有用户输入都经过 escapeHtml
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
