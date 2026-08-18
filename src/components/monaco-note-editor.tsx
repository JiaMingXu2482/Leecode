"use client";

import Editor, { loader } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { imageFilesFrom } from "@/lib/note-image-upload";
import { noteToPlainText } from "@/lib/notes";

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
  // 只有算法总结页传它；题目笔记不需要图片。
  onPasteImage?: (file: File) => Promise<string | null>;
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
          if (!onPasteImage) {
            return;
          }
          // Monaco 自己处理 paste，但剪贴板里的图片它直接丢掉。在编辑器的 DOM
          // 节点上捕获 paste/drop，发现图片就拦下来，上传完把 Markdown 插到光标处。
          const node = editor.getDomNode();
          if (!node) {
            return;
          }
          async function insert(files: File[]) {
            for (const file of files) {
              const markdown = await onPasteImage!(file);
              if (!markdown) {
                continue;
              }
              const selection = editor.getSelection();
              if (!selection) {
                continue;
              }
              editor.executeEdits("paste-image", [
                { range: selection, text: markdown, forceMoveMarkers: true },
              ]);
              editor.focus();
            }
          }
          node.addEventListener("paste", (event) => {
            const files = imageFilesFrom([...(event.clipboardData?.items ?? [])]);
            if (!files.length) {
              return; // 普通文本粘贴，交给 Monaco
            }
            event.preventDefault();
            event.stopPropagation();
            void insert(files);
          });
          node.addEventListener("dragover", (event) => event.preventDefault());
          node.addEventListener("drop", (event) => {
            const files = imageFilesFrom([...(event.dataTransfer?.items ?? [])]);
            if (!files.length) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            void insert(files);
          });
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
          fontSize: 15,
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
