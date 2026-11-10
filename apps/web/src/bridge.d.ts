export {};
declare global {
  interface Window {
    cafe?: {
      invoke: (action: string, payload?: any) => Promise<any>;
      onState: (callback: (state: any) => void) => () => void;
    };
  }
}
