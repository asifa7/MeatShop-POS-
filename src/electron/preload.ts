import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  /**
   * Safe IPC invocation channel (Permissions enforced at IPC boundary in main.ts)
   */
  invoke: async (channel: string, ...args: any[]): Promise<any> => {
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * Event listener subscription from main process to renderer.
   * Returns an unsubscribe cleanup callback.
   */
  on: (channel: string, callback: (...args: any[]) => void): (() => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
});
