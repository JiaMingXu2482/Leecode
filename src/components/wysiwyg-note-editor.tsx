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
import { looksLikeAsciiArt, looksLikeCode, normalizeNewlines } from "@/lib/paste-code";
import { nextImageWidth, parseImageWidth, withImageWidth } from "@/lib/image-width";

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

// 往光标处插一个代码块。
//
// 试过但不行的几条路：
//   - exec("codeBlock") + insertText(text)：insertText 遇到换行会切块，只有第一
//     行留在代码块里，其余掉出来变成普通段落。
//   - replaceSelection(text)：WYSIWYG 下它把文本按换行切成 paragraph 节点，同样
//     不会变成代码块。
//   - 伪造带 text/html 的粘贴事件：整段确实进了一个代码块，但 data-language 不
//     被识别（没有语言就没高亮），而且会把相邻段落并进代码块。
// 所以直接构造 ProseMirror 节点 —— 这是唯一能一次拿到「整段 + 语言」的方式。
// getCurrentModeEditor().view 不在公开类型里，所以整段都做了防御，拿不到就返回
// false 让调用方走默认粘贴。
function insertCodeBlock(editor: Editor, text: string, language = "cpp"): boolean {
  try {
    const mode = editor.getCurrentModeEditor() as unknown as {
      view?: {
        state: { schema: { nodes: Record<string, unknown> }; tr: unknown };
        dispatch: (tr: unknown) => void;
      };
    };
    const view = mode?.view;
    const codeBlock = view?.state.schema.nodes.codeBlock as
      | { create: (attrs: unknown, content: unknown) => unknown }
      | undefined;
    if (!view || !codeBlock) {
      return false;
    }
    const schema = view.state.schema as unknown as { text: (value: string) => unknown };
    const node = codeBlock.create({ language }, schema.text(text));
    const tr = view.state.tr as unknown as {
      replaceSelectionWith: (node: unknown) => { scrollIntoView: () => unknown };
    };
    view.dispatch(tr.replaceSelectionWith(node).scrollIntoView());
    return true;
  } catch {
    return false;
  }
}

// 把文档里 imageUrl 等于 oldUrl 的那个图片节点改成 newUrl。
// 改节点属性（而不是直接改 DOM）才会写回 Markdown，尺寸才存得住。
// 和 insertCodeBlock 一样用了非公开的 view，所以整段防御，失败返回 false。
function updateImageUrl(editor: Editor, oldUrl: string, newUrl: string): boolean {
  try {
    const mode = editor.getCurrentModeEditor() as unknown as {
      view?: {
        state: {
          doc: {
            descendants: (fn: (node: PmNode, pos: number) => void) => void;
          };
          tr: PmTr;
        };
        dispatch: (tr: unknown) => void;
      };
    };
    const view = mode?.view;
    if (!view) {
      return false;
    }
    let target: { pos: number; node: PmNode } | null = null;
    view.state.doc.descendants((node, pos) => {
      if (!target && node.type?.name === "image" && node.attrs?.imageUrl === oldUrl) {
        target = { pos, node };
      }
    });
    if (!target) {
      return false;
    }
    const { pos, node } = target as { pos: number; node: PmNode };
    const tr = view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, imageUrl: newUrl });
    view.dispatch(tr);
    return true;
  } catch {
    return false;
  }
}

type PmNode = { type?: { name?: string }; attrs?: Record<string, unknown> };
type PmTr = { setNodeMarkup: (pos: number, type: null, attrs: Record<string, unknown>) => unknown };

export default function WysiwygNoteEditor({
  value,
  onChange,
  draftKey,
  height = "56rem",
  onUploadImage,
}: {
  value: string;
  onChange: (next: string) => void;
  // localStorage key，防止误关页面丢草稿；提交成功后由调用方清掉。
  draftKey?: string;
  // 外层容器的高度。编辑器本身填满容器（toast-ui 传的是 100%），这样容器上的
  // CSS resize 才能真的拖动编辑区大小。
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
      height: "100%",
      initialValue: initial,
      initialEditType: "wysiwyg",
      previewStyle: "vertical",
      hideModeSwitch: true,
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

    // 粘贴代码 → 直接变成代码块。toast-ui 默认把纯文本按段落插进去，一行行的
    // 普通文字，看不出是代码。挂在 document 的捕获阶段，在编辑器自己的处理之前
    // 拦下来；用 holder.contains 把作用范围限定在本编辑器内。
    const root = holder;
    function onPaste(event: ClipboardEvent) {
      if (!(event.target instanceof Node) || !root.contains(event.target)) {
        return;
      }
      const items = [...(event.clipboardData?.items ?? [])];
      // 图片交给 addImageBlobHook，不在这里拦。
      if (items.some((item) => item.kind === "file" && item.type.startsWith("image/"))) {
        return;
      }
      const text = event.clipboardData?.getData("text/plain") ?? "";
      // 代码用 cpp 高亮；靠空格对齐的图形（树形图等）不带语言，只要保住空格。
      const language = looksLikeCode(text) ? "cpp" : looksLikeAsciiArt(text) ? "" : null;
      if (language === null) {
        return; // 普通文字，照常粘贴
      }
      if (!insertCodeBlock(editor, normalizeNewlines(text), language)) {
        return; // 插不进去就退回默认粘贴，别把内容吞了
      }
      event.preventDefault();
      event.stopPropagation();
    }
    document.addEventListener("paste", onPaste, true);

    // 图片尺寸：点一下在 240 / 400 / 640 / 原始 之间循环。
    // toast-ui 的 image 节点没有宽高属性，Markdown 也存不下尺寸，所以把宽度写进
    // 图片 URL 的 query（?w=400），编辑器和渲染两端都读它。
    function applyWidths() {
      for (const img of root.querySelectorAll("img")) {
        const width = parseImageWidth(img.getAttribute("src") ?? "");
        img.style.width = width ? `${width}px` : "";
        if (!img.title) {
          img.title = "点击切换图片大小";
        }
        img.style.cursor = "pointer";
      }
    }

    function onClickImage(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLImageElement) || !root.contains(target)) {
        return;
      }
      const src = target.getAttribute("src") ?? "";
      const next = withImageWidth(src, nextImageWidth(src));
      // 改的是节点属性而不是 DOM，这样会写回 Markdown，存下来也保留尺寸。
      if (!updateImageUrl(editor, src, next)) {
        // 拿不到 ProseMirror 就退回只改样式，至少当前视图能变
        target.style.width = parseImageWidth(next) ? `${parseImageWidth(next)}px` : "";
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    }

    root.addEventListener("click", onClickImage, true);
    // 图片是异步渲染进来的（粘贴上传、切换文档），用 observer 兜住所有时机。
    const observer = new MutationObserver(() => applyWidths());
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    applyWidths();

    return () => {
      observer.disconnect();
      root.removeEventListener("click", onClickImage, true);
      document.removeEventListener("paste", onPaste, true);
      editor.destroy();
      editorRef.current = null;
    };
    // 只在挂载时建一次：value 由编辑器自己持有，外部回填会打断输入。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 必须是两层：toast-ui 会把 height 选项直接写成挂载节点的行内样式，挂载节点
  // 和外层是同一个 div 的话，React 传的高度会被它覆盖掉。所以外层由我们控制
  // 高度和 resize，内层留给 toast-ui（它自己填 height:100%）。
  return (
    <div className="tui-note-editor mt-2" style={{ height }}>
      <div ref={holderRef} className="tui-note-editor-inner" />
    </div>
  );
}
