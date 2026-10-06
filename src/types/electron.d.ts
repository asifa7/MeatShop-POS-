export interface ElectronApi {
  invoke(channel: string, ...args: any[]): Promise<any>;
  on?(channel: string, callback: (...args: any[]) => void): () => void;
}

declare global {
  interface Window {
    api: ElectronApi;
  }
}
