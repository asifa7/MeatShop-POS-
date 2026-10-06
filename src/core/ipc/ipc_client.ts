import { IPCRequestMap, IPCResponseMap } from './ipc_types';
import { deserializeIPCResponse } from './ipc_errors';

declare global {
  interface Window {
    api: {
      invoke(channel: string, ...args: any[]): Promise<any>;
      on?(channel: string, callback: (...args: any[]) => void): () => void;
    };
  }
}

export const ipcClient = {
  /**
   * Invoke a typed IPC channel call and safely deserialize custom AppError subclasses on error.
   */
  async invoke<K extends keyof IPCRequestMap>(
    channel: K,
    payload?: IPCRequestMap[K]
  ): Promise<IPCResponseMap[K]> {
    try {
      const response = await window.api.invoke(channel, payload);
      return deserializeIPCResponse(response);
    } catch (err: any) {
      throw err;
    }
  }
};

export default ipcClient;
