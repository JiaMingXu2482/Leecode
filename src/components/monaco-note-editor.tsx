"use client";

import Editor, { loader } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { imageFilesFrom } from "@/lib/note-image-upload";
import { fenceCode, insideFence, looksLikeCode } from "@/lib/paste-code";
import { noteToPlainText } from "@/lib/notes";

// Monaco 编辑器实例的类型，父组件做滚动同步时要用。
export type NoteEditorInstance = Parameters<
  NonNullable<React.ComponentProps<typeof Editor>["onMount"]>
>[0];

// Serve Monaco's assets from our own origin — the default jsdelivr CDN is
// unreliable from China, where this app is hosted and used.
loader.config({ paths: { vs: "/monaco/vs" } });

// Note editor backed by Monaco (the same engine as LeetCode's code editor).
// Storage format is plain text; legacy rich-text notes are flattened (text and
// line breaks kept) the first time they're opened for editing.
export default function MonacoNoteEditor({
  value,
  onChange,
  draftKey,
  language = "cpp",
  height = "28rem",
  onPasteImage,
  autoFenceCode = false,
  onEditorReady,
}: {
  value: string;
  onChange: (next: string) => void;
  // localStorage key for crash/navigation-safe drafts. Every change is
  // persisted; the caller clears the draft on successful submit.
  draftKey?: string;
  // 题目笔记写的是 C++；算法总结写的是 Markdown。
  language?: string;
  height?: string;
  // 粘贴/拖入图片时调用，返回要插入光标处的 Markdown（失败返回 null）。
  onPasteImage?: (file: File) => Promise<string | null>;
  // 粘贴纯文本时，如果看着像代码就自动包一层 ```cpp 围栏，这样渲染出来是
  // 代码框、和手写的说明文字分得开。
  autoFenceCode?: boolean;
  // 编辑器挂载/卸载时回调，父组件拿它做左右滚动同步。卸载时传 null。
  onEditorReady?: (editor: NoteEditorInstance | null) => void;
}) {
  const [initial] = useState(() => {
    let text = noteToPlainText(value);
    if (draftKey) {
      try {
        const draft = localStorage.getItem(draftKey);
        if (draft !== null) {
          const plain = noteToPlainText(draft);
          if (plain !== text) {
            text = plain;
          }
        }
      } catch {}
    }
    return text;
  });

  // If the initial text differs from the stored value (flattened legacy note or
  // restored draft), sync it into the parent state so submitting without
  // further edits saves what's on screen.
  const synced = useRef(false);
  useEffect(() => {
    if (!synced.current && initial !== value) {
      synced.current = true;
      onChange(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 粘贴/拖入图片。监听挂在 document 的**捕获阶段**，不是编辑器节点的冒泡阶段：
  // Monaco 自己在内部的 edit-context 节点上注册了 paste 并立刻 preventDefault，
  // 冒泡阶段的监听要看它有没有 stopPropagation、节点挂在哪、用的是 EditContext
  // 还是 textarea 实现 —— 这些都随版本变。捕获阶段在所有后代监听之前跑，
  // 与这些细节无关。用 hasTextFocus() 把作用范围限定在本编辑器聚焦时。
  const editorRef = useRef<NoteEditorInstance | null>(null);
  const readyRef = useRef(onEditorReady);
  useEffect(() => {
    readyRef.current = onEditorReady;
  });
  useEffect(() => () => readyRef.current?.(null), []);
  useEffect(() => {
    if (!onPasteImage && !autoFenceCode) {
      return;
    }
    async function insert(files: File[]) {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }
      for (const file of files) {
        const markdown = await onPasteImage?.(file);
        const selection = editor.getSelection();
        if (!markdown || !selection) {
          continue;
        }
        editor.executeEdits("paste-image", [
          { range: selection, text: markdown, forceMoveMarkers: true },
        ]);
        editor.focus();
      }
    }
    function onPaste(event: ClipboardEvent) {
      if (!editorRef.current?.hasTextFocus()) {
        return;
      }
      const files = onPasteImage ? imageFilesFrom([...(event.clipboardData?.items ?? [])]) : [];
      if (files.length) {
        event.preventDefault();
        event.stopPropagation();
        void insert(files);
        return;
      }
      if (!autoFenceCode) {
        return; // 普通文本粘贴，交给 Monaco
      }
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!looksLikeCode(text)) {
        return;
      }
      const editor = editorRef.current;
      const selection = editor?.getSelection();
      const model = editor?.getModel();
      if (!editor || !selection || !model) {
        return;
      }
      // 已经在一段没闭合的围栏里了，说明用户正往代码块里贴，不要再包一层。
      const before = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: selection.startLineNumber,
        endColumn: selection.startColumn,
      });
      if (insideFence(before)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      // 不在行首的话先换行，否则围栏起始的 ``` 会跟在正文后面，Markdown 不认。
      const prefix = selection.startColumn === 1 ? "" : "\n";
      editor.executeEdits("paste-code", [
        { range: selection, text: prefix + fenceCode(text), forceMoveMarkers: true },
      ]);
      editor.focus();
    }
    function onDrop(event: DragEvent) {
      const node = editorRef.current?.getDomNode();
      if (!node || !(event.target instanceof Node) || !node.contains(event.target)) {
        return;
      }
      const files = imageFilesFrom([...(event.dataTransfer?.items ?? [])]);
      if (!files.length) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void insert(files);
    }
    function onDragOver(event: DragEvent) {
      const node = editorRef.current?.getDomNode();
      if (node && event.target instanceof Node && node.contains(event.target)) {
        event.preventDefault();
      }
    }
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("dragover", onDragOver, true);
    return () => {
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("dragover", onDragOver, true);
    };
  }, [onPasteImage, autoFenceCode]);

  const dark =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-line-strong">
      <Editor
        height={height}
        defaultLanguage={language}
        theme={dark ? "vs-dark" : "light"}
        defaultValue={initial}
        onMount={(editor) => {
          editorRef.current = editor;
          onEditorReady?.(editor);
        }}
        onChange={(next) => {
          const text = next ?? "";
          onChange(text);
          if (draftKey) {
            try {
              localStorage.setItem(draftKey, text);
            } catch {}
          }
        }}
        loading={
          <div
            style={{ height }}
            className="flex items-center justify-center text-sm text-fg-subtle"
          >
            编辑器加载中…
          </div>
        }
        options={{
          fontFamily: 'Consolas, "Courier New", monospace',
          // 14px = Tailwind 的 text-sm，和侧边栏、右侧预览统一。
          fontSize: 14,
          lineHeight: 26,
          minimap: { enabled: false },
          wordWrap: "on",
          tabSize: 4,
          insertSpaces: true,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          lineNumbers: "off",
          folding: false,
          glyphMargin: false,
          lineDecorationsWidth: 8,
          renderLineHighlight: "none",
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          quickSuggestions: false,
          suggestOnTriggerCharacters: false,
          wordBasedSuggestions: "off",
          parameterHints: { enabled: false },
          hover: { enabled: false },
          links: false,
          occurrencesHighlight: "off",
          selectionHighlight: false,
          padding: { top: 12, bottom: 12 },
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
          // Chinese prose is full of full-width characters; don't box them.
          unicodeHighlight: { ambiguousCharacters: false },
        }}
      />
    </div>
  );
}
