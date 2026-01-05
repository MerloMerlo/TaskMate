const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const fileManager = require('./src/main/file-manager');

let mainWindow;
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
let appConfig = {
    username: '',
    syncDir: '',
    password: '' // In a real app, use SafeStorage. For MVP, store plain or hashed.
};

async function loadConfig() {
    try {
        if (await fs.pathExists(CONFIG_PATH)) {
            appConfig = await fs.readJson(CONFIG_PATH);
            // Start watching if configured
            if (appConfig.syncDir) {
                fileManager.startWatching(appConfig.syncDir, () => {
                    if (mainWindow) mainWindow.webContents.send('data-updated');
                });
            }
        }
    } catch (e) {
        console.error('Failed to load config', e);
    }
    return appConfig;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        autoHideMenuBar: true
    });

    mainWindow.loadFile('src/renderer/index.html');
}

app.whenReady().then(async () => {
    await loadConfig();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers

ipcMain.handle('get-config', () => appConfig);

ipcMain.handle('save-config', async (event, newConfig) => {
    appConfig = { ...appConfig, ...newConfig };
    await fs.writeJson(CONFIG_PATH, appConfig);
    
    // Restart watcher
    if (appConfig.syncDir) {
        fileManager.startWatching(appConfig.syncDir, () => {
            if (mainWindow) mainWindow.webContents.send('data-updated');
        });
    }
    return true;
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
});

ipcMain.handle('load-tasks', async (event, date) => {
    if (!appConfig.syncDir || !appConfig.password) return [];
    // If date is null, maybe load all? For now, let's support loading specific date
    // or we can load all and let frontend filter.
    // The requirement says "Daily progress", so date filtering is key.
    return await fileManager.getAllTasks(appConfig.syncDir, appConfig.password, date);
});

ipcMain.handle('save-task', async (event, data) => {
    if (!appConfig.syncDir || !appConfig.username || !appConfig.password) {
        throw new Error("Configuration missing");
    }
    // Force username to match config
    data.user = appConfig.username;
    return await fileManager.saveTask(appConfig.syncDir, appConfig.username, appConfig.password, data);
});

ipcMain.handle('minimize-window', () => mainWindow.minimize());
ipcMain.handle('close-window', () => mainWindow.close());
