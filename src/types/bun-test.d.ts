// NOTE: Bun の公式型定義が未提供のため、tsc が bundle 時に 'bun:test' を解決できるよう最低限の宣言を置いている。
declare module 'bun:test' {
  export const describe: (...args: any[]) => void;
  export const test: (...args: any[]) => void;
  export const expect: any;
}
