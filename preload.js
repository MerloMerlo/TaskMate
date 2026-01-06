const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Config
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    selectFolder: () => ipcRenderer.invoke('select-folder'),

    // Syncthing
    getSyncthingId: () => ipcRenderer.invoke('st-get-id'),
    getSyncthingConfig: () => ipcRenderer.invoke('st-get-config'),
    addSyncthingDevice: (device) => ipcRenderer.invoke('st-add-device', device),
    addSyncthingFolder: (folder) => ipcRenderer.invoke('st-add-folder', folder),
    removeSyncthingDevice: (id) => ipcRenderer.invoke('st-remove-device', id),
    removeSyncthingFolder: (id) => ipcRenderer.invoke('st-remove-folder', id),
    pauseDevice: (id) => ipcRenderer.invoke('st-pause-device', id),
    resumeDevice: (id) => ipcRenderer.invoke('st-resume-device', id),
    pauseFolder: (id) => ipcRenderer.invoke('st-pause-folder', id),
    resumeFolder: (id) => ipcRenderer.invoke('st-resume-folder', id),
    
    // Data
    loadTasks: (date) => ipcRenderer.invoke('load-tasks', date),
    saveTask: (data) => ipcRenderer.invoke('save-task', data),

    // Events
    onDataUpdate: (callback) => ipcRenderer.on('data-updated', callback),
    
    // System
    minimize: () => ipcRenderer.invoke('minimize-window'),
    close: () => ipcRenderer.invoke('close-window')
});
