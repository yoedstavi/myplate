// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts


import { contextBridge, ipcRenderer } from 'electron';

const tasksDataStorage = {
    saveToJsonFile: (tasksData: Object) => ipcRenderer.send('save-tasks', tasksData),
    loadFromJsonFile: () => ipcRenderer.invoke('load-tasks'),
    disableSaveOnUnload: (callback: Function) => ipcRenderer.on('user-reload', () => callback()),
    triggerReload: () => ipcRenderer.send('trigger-reload'),
    bindSaveShortcut: (callback: Function) => ipcRenderer.on('user-save', () => callback()),
    bindNewShortcut: (callback: Function) => ipcRenderer.on('user-new', () => callback()),
};

contextBridge.exposeInMainWorld('tasksDataStorage', tasksDataStorage);

