"use client";

import Editor from "@toast-ui/editor";
import "@toast-ui/editor/dist/toastui-editor.css";
import "@toast-ui/editor/dist/theme/toastui-editor-dark.css";
import codeSyntaxHighlight from "@toast-ui/editor-plugin-code-syntax-highlight";
import "@toast-ui/editor-plugin-code-syntax-highlight/dist/toastui-editor-plugin-code-syntax-highlight.css";
import Prism from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-python";
import "prismjs/components/prism-java";
import { useEffect, useRef } from "react";
import { noteToPlainText } from "@/lib/notes";

// 所见即所得的 Markdown 笔记编辑器（toast-ui）。
//
// 为什么不是 Monaco：Monaco 是纯文本代码编辑器，图片只能显示成
// ![](/api/note-images/xxx) 这行字，代码块也只是带高亮的普通文本。用户要的是
// 「一粘贴就看到图片」「粘贴代码直接是代码框」，那得在正文里真的渲染出来。
//
// 存储格式仍然是 Markdown —— 历史笔记渲染、题号反链(extractProblemRefs) 都依赖它，
// 所以选了原生吃 Markdown 的 toast-ui，而不是 TipTap 那种存 ProseMirror JSON 的。
//
// 语法高亮插件用的是 prismjs，只注册实际会用到的几种语言。

export default function WysiwygNoteEditor({
  value,
  onChange,
  draftKey,
  height = "28rem",
  onUploadImage,
}: {
  value: string;
  onChange: (next: string) => void;
  // localStorage key，防止误关页面丢草稿；提交成功后由调用方清掉。
  draftKey?: string;
  height?: string;
  // 粘贴/拖入图片时调用，返回图片 URL（失败返回 null）。
  onUploadImage?: (file: File) => Promise<string | null>;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  // 回调放进 ref，避免它们变化时重建编辑器（重建会丢光标和撤销栈）。
  const onChangeRef = useRef(onChange);
  const onUploadRef = useRef(onUploadImage);
  // 每次渲染后刷新，不能在渲染期间写 ref（react-hooks/refs）。
  useEffect(() => {
    onChangeRef.current = onChange;
    onUploadRef.current = onUploadImage;
  });

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) {
      return;
    }

    let initial = noteToPlainText(value);
    if (draftKey) {
      try {
        const draft = localStorage.getItem(draftKey);
        if (draft !== null && noteToPlainText(draft) !== initial) {
          initial = noteToPlainText(draft);
        }
      } catch {}
    }

    const dark = document.documentElement.classList.contains("dark");
    const editor = new Editor({
      el: holder,
      height,
      initialValue: initial,
      initialEditType: "wysiwyg",
      previewStyle: "vertical",
      hideModeSwitch: false,
      usageStatistics: false,
      theme: dark ? "dark" : "light",
      language: "zh-CN",
      plugins: [[codeSyntaxHighlight, { highlighter: Prism }]],
      toolbarItems: [
        ["heading", "bold", "italic", "strike"],
        ["ul", "ol", "task"],
        ["code", "codeblock", "quote"],
        ["image", "link", "table"],
      ],
      hooks: {
        // 粘贴/拖入/工具栏插图都会走这里。callback(url, alt) 让编辑器把图片
        // 作为图片节点插进正文 —— 所以粘完当场就能看到图。
        addImageBlobHook: (blob: Blob, callback: (url: string, alt: string) => void) => {
          const upload = onUploadRef.current;
          if (!upload) {
            return false;
          }
          void (async () => {
            const url = await upload(blob as File);
            if (url) {
              callback(url, "");
            }
          })();
          return false;
        },
      },
      events: {
        change: () => {
          const markdown = editorRef.current?.getMarkdown() ?? "";
          onChangeRef.current(markdown);
          if (draftKey) {
            try {
              localStorage.setItem(draftKey, markdown);
            } catch {}
          }
        },
      },
    });
    editorRef.current = editor;

    // 初始文本和传进来的 value 不一致（拍平了老笔记，或恢复了草稿）时，同步回
    // 父组件，这样用户不再编辑直接提交也能存下屏幕上看到的内容。
    if (initial !== value) {
      onChangeRef.current(initial);
    }

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
    // 只在挂载时建一次：value 由编辑器自己持有，外部回填会打断输入。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={holderRef} className="tui-note-editor mt-2" />;
}
