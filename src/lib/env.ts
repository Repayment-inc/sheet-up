// Runtime environment helpers used to branch between Tauri and browser builds.
export const isBrowser = typeof window !== 'undefined';

export const isTauri = isBrowser && '__TAURI_INTERNALS__' in window;

export const isDevelopment = import.meta.env.DEV;
