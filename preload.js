const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Config
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    selectFolder: () => ipcRenderer.invoke('select-folder'),

    // Data
    loadTasks: (date) => ipcRenderer.invoke('load-tasks', date),
    saveTask: (data) => ipcRenderer.invoke('save-task', data),

    // Events
    onDataUpdate: (callback) => ipcRenderer.on('data-updated', callback),
    
    // System
    minimize: () => ipcRenderer.invoke('minimize-window'),
    close: () => ipcRenderer.invoke('close-window')
});
