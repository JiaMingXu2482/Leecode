// @toast-ui/editor 把 typings 放在 types/index.d.ts，但 package.json 的 exports
// 没有映射它，TS 按 exports 解析时找不到，只能自己接一下。
//
// 注意：不能用 tsconfig 的 paths 指向那个 .d.ts —— Next 的打包器同样会读 paths，
// 会把运行时的 import 也解析到声明文件上，结果 Editor 是 undefined，
// 页面直接报 "(void 0) is not a constructor"。
declare module "@toast-ui/editor" {
  import Editor from "@toast-ui/editor/types/index";
  export default Editor;
}

declare module "@toast-ui/editor-plugin-code-syntax-highlight" {
  const plugin: (...args: unknown[]) => unknown;
  export default plugin;
}
