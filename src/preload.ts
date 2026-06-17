// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts


import { contextBridge, ipcRenderer } from 'electron';

const tasksDataStorage = {
    saveToJsonFile: (tasksData: Object) => ipcRenderer.send('save-tasks', tasksData),
    loadFromJsonFile: () => ipcRenderer.invoke('load-tasks'),
};

contextBridge.exposeInMainWorld('tasksDataStorage', tasksDataStorage);

