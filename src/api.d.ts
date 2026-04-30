declare global {
  interface Window {
    api: {
      openExternal: (url: string) => Promise<void>;
      exportPdf: (html: string, suggestedName: string) => Promise<string | null>;
    };
  }
}
export {};
