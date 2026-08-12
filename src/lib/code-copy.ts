// 给渲染好的 Markdown 正文里每个代码块加一个「复制」按钮。
//
// 按钮是渲染之后注入 DOM 的，不是 markdownToHtml 生成的 —— 这样渲染器保持纯函数、
// 可以单测，复制这种只有浏览器里才有意义的行为也能单独测（见 code-copy.test.ts）。
export function attachCopyButtons(
  root: HTMLElement,
  copyText: (text: string) => Promise<void>,
  resetDelayMs = 1500,
) {
  const timers: ReturnType<typeof setTimeout>[] = [];

  for (const block of root.querySelectorAll("pre")) {
    if (block.querySelector("[data-copy]")) {
      continue; // 已经加过了（正文没变时 effect 可能重跑）
    }
    const button = block.ownerDocument.createElement("button");
    button.type = "button";
    button.dataset.copy = "";
    button.textContent = "复制";
    button.className =
      "absolute right-2 top-2 rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-fg-subtle opacity-0 transition group-hover:opacity-100";
    block.classList.add("group", "relative");
    block.appendChild(button);
  }

  function onClick(event: Event) {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLElement>("[data-copy]");
    if (!button) {
      return;
    }
    // 按钮是 <pre> 的子节点，代码在同级的 <code> 里
    const code = button.parentElement?.querySelector("code")?.textContent ?? "";
    copyText(code).then(
      () => {
        button.textContent = "已复制";
        timers.push(
          setTimeout(() => {
            button.textContent = "复制";
          }, resetDelayMs),
        );
      },
      () => {
        button.textContent = "复制失败";
        timers.push(
          setTimeout(() => {
            button.textContent = "复制";
          }, resetDelayMs),
        );
      },
    );
  }

  root.addEventListener("click", onClick);
  return () => {
    root.removeEventListener("click", onClick);
    for (const timer of timers) {
      clearTimeout(timer);
    }
  };
}
