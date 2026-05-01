export type PriceMap = Record<string, number>;

declare global {
  interface Window {
    api: {
      openExternal: (url: string) => Promise<void>;
      exportPdf: (html: string, suggestedName: string) => Promise<string | null>;
      getPrices: () => Promise<PriceMap>;
      setPrice: (id: string, price: number | null) => Promise<PriceMap>;
    };
  }
}
export {};
