declare global {
  interface Window {
    api: {
      openExternal: (url: string) => Promise<void>;
    };
  }
}
export {};
