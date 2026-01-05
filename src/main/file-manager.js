const fs = require('fs-extra');
const path = require('path');
const chokidar = require('chokidar');
const { encrypt, decrypt } = require('./crypto');

class FileManager {
    constructor() {
        this.watcher = null;
        this.onUpdateCallback = null;
    }

    /**
     * Load a specific file and decrypt it
     */
    async loadFile(filePath, password) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const decrypted = decrypt(content, password);
            return JSON.parse(decrypted);
        } catch (err) {
            console.error(`Failed to load ${filePath}:`, err.message);
            return null;
        }
    }

    /**
     * Get all task data from the sync directory for a specific date (or all dates if date is null)
     */
    async getAllTasks(syncDir, password, date = null) {
        if (!syncDir || !await fs.pathExists(syncDir)) return [];

        const files = await fs.readdir(syncDir);
        const tasks = [];

        for (const file of files) {
            if (!file.endsWith('.enc')) continue;
            
            // Filter by date if provided (Filename format: YYYY-MM-DD_username.enc)
            if (date && !file.startsWith(date)) continue;

            const filePath = path.join(syncDir, file);
            const data = await this.loadFile(filePath, password);
            if (data) {
                tasks.push(data);
            }
        }
        return tasks;
    }

    /**
     * Save the current user's data
     */
    async saveTask(syncDir, username, password, data) {
        if (!syncDir) throw new Error("Sync directory not configured");
        
        // Ensure date is in the data
        const date = data.date; 
        const filename = `${date}_${username}.enc`;
        const filePath = path.join(syncDir, filename);

        const encrypted = encrypt(JSON.stringify(data), password);
        await fs.outputFile(filePath, encrypted);
        return filePath;
    }

    /**
     * Start watching the sync directory for changes
     */
    startWatching(syncDir, callback) {
        if (this.watcher) {
            this.watcher.close();
        }

        // Watch only .enc files
        this.watcher = chokidar.watch(path.join(syncDir, '*.enc'), {
            ignoreInitial: true,
            persistent: true,
            awaitWriteFinish: {
                stabilityThreshold: 500,
                pollInterval: 100
            }
        });

        this.watcher.on('add', () => callback());
        this.watcher.on('change', () => callback());
        this.onUpdateCallback = callback;
    }

    stopWatching() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }
}

module.exports = new FileManager();
