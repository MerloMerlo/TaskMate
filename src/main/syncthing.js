const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const fetch = require('node-fetch'); // Need to install node-fetch@2 for CommonJS
const { app } = require('electron'); // Import app to check isPackaged

class SyncthingManager {
    constructor(userDataPath) {
        this.userDataPath = userDataPath;
        this.binPath = this.getBinaryPath();
        this.configPath = path.join(userDataPath, 'syncthing-config');
        this.process = null;
        this.apiKey = null;
        this.apiUrl = 'http://127.0.0.1:8385'; // Default custom port
        this.eventLoopRunning = false;
        this.initPromise = null;
    }

    getBinaryPath() {
        // In production, resources are in resources/bin
        const isDev = !app.isPackaged;
        let binName = 'syncthing.exe';
        
        if (process.platform === 'darwin') {
            binName = 'syncthing';
        }

        if (isDev) {
            // D:\workspace\TaskMate\TaskMate\src\main\syncthing.js -> D:\workspace\TaskMate\TaskMate\bin\syncthing.exe
            return path.join(__dirname, '../../bin', binName);
        } else {
            return path.join(process.resourcesPath, 'bin', binName);
        }
    }

    async start() {
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            // Ensure config dir exists
            await fs.ensureDir(this.configPath);
    
            console.log(`Starting Syncthing from: ${this.binPath}`);
            console.log(`Config path: ${this.configPath}`);
    
            // Ensure binary is executable on macOS/Linux
            if (process.platform !== 'win32') {
                try {
                    await fs.chmod(this.binPath, 0o755);
                } catch (e) {
                    console.error('Failed to set executable permissions:', e);
                }
            }
    
            this.process = spawn(this.binPath, [
                '--home', this.configPath,
                '--no-browser',
                '--gui-address', '127.0.0.1:8385'
            ]);
    
            this.process.stdout.on('data', (data) => {
                console.log(`[Syncthing]: ${data}`);
                // Extract API Key from logs on first run if needed, 
                // but better to read config.xml
            });
    
            this.process.stderr.on('data', (data) => {
                console.error(`[Syncthing Err]: ${data}`);
            });
    
            // Wait for config generation
            await this.waitForConfig();
            await this.loadApiKey();
            await this.waitForApi();
        })();

        return this.initPromise;
    }

    async waitForConfig() {
        const configXml = path.join(this.configPath, 'config.xml');
        let retries = 0;
        while (retries < 20) {
            if (await fs.pathExists(configXml)) return;
            await new Promise(r => setTimeout(r, 1000));
            retries++;
        }
        throw new Error('Syncthing config creation timed out');
    }

    async waitForApi() {
        let retries = 0;
        while (retries < 30) { // Wait up to 30 seconds
            try {
                // Do not use fetchApi() here to avoid circular dependency on initPromise
                await fetch(`${this.apiUrl}/rest/system/status`, {
                    headers: { 'X-API-Key': this.apiKey }
                });
                console.log('Syncthing API is ready');
                return;
            } catch (e) {
                // Ignore errors and retry
                await new Promise(r => setTimeout(r, 1000));
                retries++;
            }
        }
        console.warn('Syncthing API failed to become ready in time, but proceeding...');
    }

    async loadApiKey() {
        const configXml = path.join(this.configPath, 'config.xml');
        const content = await fs.readFile(configXml, 'utf8');
        // Simple regex to extract API key
        const match = content.match(/<apikey>(.*?)<\/apikey>/);
        if (match) {
            this.apiKey = match[1];
            console.log('Syncthing API Key loaded');
        } else {
            console.error('Could not find API Key in config');
        }
    }

    async stop() {
        this.eventLoopRunning = false;
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }

    async startEventLoop(callback) {
        if (this.eventLoopRunning) return;
        this.eventLoopRunning = true;
        let lastId = 0;

        console.log("Starting Syncthing event loop...");

        // Run in background
        (async () => {
            while (this.eventLoopRunning) {
                try {
                    if (!this.apiKey) {
                        await new Promise(r => setTimeout(r, 1000));
                        continue;
                    }
                    
                    // Long polling, waits up to 60s by default if no events
                    // Use a separate fetch call to avoid timeout issues with the wrapper if it has one
                    const res = await fetch(`${this.apiUrl}/rest/events?since=${lastId}&limit=1`, {
                        headers: { 'X-API-Key': this.apiKey }
                    });
                    
                    if (!res.ok) {
                        if (res.status === 403) await this.loadApiKey();
                        throw new Error(`Event API Error: ${res.status}`);
                    }

                    const events = await res.json();
                    
                    for (const event of events) {
                        lastId = event.id;
                        if (event.type === 'DeviceRejected') {
                            callback({ type: 'device-rejected', data: event.data });
                        } else if (event.type === 'FolderRejected') {
                            callback({ type: 'folder-rejected', data: event.data });
                        }
                    }
                } catch (e) {
                    // If error (e.g. syncthing not started yet), wait a bit
                    // console.error("Event loop error:", e.message);
                    await new Promise(r => setTimeout(r, 5000));
                }
            }
        })();
    }

    // API Wrappers
    async getMyId() {
        const data = await this.fetchApi('/rest/system/status');
        return data.myID;
    }

    async getConfig() {
        return await this.fetchApi('/rest/system/config');
    }

    async addDevice(deviceId, name) {
        const config = await this.getConfig();
        // Check if exists
        if (config.devices.find(d => d.deviceID === deviceId)) return;

        config.devices.push({
            deviceID: deviceId,
            name: name,
            addresses: ['dynamic'],
            compression: 'metadata',
            introducer: false,
            paused: false
        });

        await this.postApi('/rest/system/config', config);
    }

    async addFolder(id, label, path, devices = []) {
        const config = await this.getConfig();
        if (config.folders.find(f => f.id === id)) return;

        // Ensure path exists
        await fs.ensureDir(path);

        config.folders.push({
            id: id,
            label: label,
            path: path,
            type: 'sendreceive',
            rescanIntervalS: 3600,
            fsWatcherEnabled: true,
            fsWatcherDelayS: 10,
            devices: devices.map(did => ({ deviceID: did })),
            paused: false
        });

        await this.postApi('/rest/system/config', config);
    }

    async removeDevice(deviceId) {
        const config = await this.getConfig();
        const initialLength = config.devices.length;
        config.devices = config.devices.filter(d => d.deviceID !== deviceId);
        
        if (config.devices.length !== initialLength) {
            await this.postApi('/rest/system/config', config);
        }
    }

    async removeFolder(folderId) {
        const config = await this.getConfig();
        const initialLength = config.folders.length;
        config.folders = config.folders.filter(f => f.id !== folderId);
        
        if (config.folders.length !== initialLength) {
            await this.postApi('/rest/system/config', config);
        }
    }

    async setDevicePause(deviceId, paused) {
        const config = await this.getConfig();
        const device = config.devices.find(d => d.deviceID === deviceId);
        if (device) {
            device.paused = paused;
            await this.postApi('/rest/system/config', config);
        }
    }

    async setFolderPause(folderId, paused) {
        const config = await this.getConfig();
        const folder = config.folders.find(f => f.id === folderId);
        if (folder) {
            folder.paused = paused;
            await this.postApi('/rest/system/config', config);
        }
    }

    async shareFolderWithDevice(folderId, deviceId) {
        const config = await this.getConfig();
        const folder = config.folders.find(f => f.id === folderId);
        if (!folder) throw new Error('Folder not found');

        if (!folder.devices.find(d => d.deviceID === deviceId)) {
            folder.devices.push({ deviceID: deviceId });
            await this.postApi('/rest/system/config', config);
        }
    }

    async fetchApi(endpoint) {
        // Wait for initialization to complete if it's running
        if (this.initPromise) {
            try {
                await this.initPromise;
            } catch (e) {
                console.warn('Syncthing init failed, proceeding to API call anyway:', e);
            }
        }

        if (!this.apiKey) await this.loadApiKey();
        
        let lastError;
        for (let i = 0; i < 3; i++) {
            try {
                const res = await fetch(`${this.apiUrl}${endpoint}`, {
                    headers: { 'X-API-Key': this.apiKey }
                });
                return await res.json();
            } catch (e) {
                lastError = e;
                if (e.code === 'ECONNREFUSED') {
                    await new Promise(r => setTimeout(r, 500)); // Wait 500ms before retry
                    continue;
                }
                throw e;
            }
        }
        throw lastError;
    }

    async postApi(endpoint, body) {
        // Wait for initialization to complete if it's running
        if (this.initPromise) {
            try {
                await this.initPromise;
            } catch (e) {
                console.warn('Syncthing init failed, proceeding to API call anyway:', e);
            }
        }

        if (!this.apiKey) await this.loadApiKey();
        const res = await fetch(`${this.apiUrl}${endpoint}`, {
            method: 'POST',
            headers: { 
                'X-API-Key': this.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
    }
}

module.exports = SyncthingManager;
