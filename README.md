# TaskMate P2P

Designed for small teams (7-8 people), this tool provides a secure, serverless workflow management system using local P2P synchronization.

## Prerequisites

1.  **Node.js**: Installed on your machine.
2.  **Syncthing**: Installed and running on all team members' machines.
    *   **Windows**: Recommended to use [SyncTrayzor](https://github.com/canton7/SyncTrayzor/releases) (Built-in GUI, easier to use).
    *   **macOS**: Recommended to use [Syncthing for macOS](https://github.com/syncthing/syncthing-macos/releases) (.dmg installer).
    *   **Setup**:
        *   Create a shared folder (e.g., `TaskMate_Sync`).
        *   **CRITICAL STEP**: Edit the folder -> "Sharing" tab -> Check all team members' devices. If it says "Unshared", data will NOT sync!
        *   Share it with all team members via Device IDs.
        *   **Important**: Ensure all members have Read/Write access.

## Installation

1.  Open a terminal in this directory.
2.  Install dependencies:
    ```bash
    npm install
    ```

## Running Development Version

```bash
npm start
```

## Building for Distribution (Windows .exe)

To create a standalone executable for your team:

```bash
npm run dist
```
The output file will be in the `dist` folder.

## Usage Guide

### 1. Initial Setup (First Run)
*   **Username**: Enter your unique name (e.g., "Alice").
*   **Team Key**: Enter the shared password decided by the team leader. Everyone must use the **exact same password** to decrypt each other's files.
*   **Sync Folder**: Select the Syncthing folder you created.

### 2. Daily Workflow
*   **Morning**: Click "My Daily Plan", add your goals in the **Left Column**, then Save.
*   **Evening**:
    1.  Open "My Daily Plan".
    2.  Click **Sync** to copy morning goals to the **Right Column** (Actual).
    3.  Check off completed items.
    4.  Add any unplanned tasks directly to the Right Column (they will show as **Green**).
    5.  If a planned task wasn't finished, uncheck it in the Right Column (it will show as **Red**).
    6.  Save.

### 3. Team Dashboard
The main screen automatically updates when Syncthing syncs files from other members. You will see everyone's progress in real-time.

## Troubleshooting

*   **Decryption Failed**: Ensure you are using the correct Team Key. If you changed the key, you cannot read old files.
*   **Not Syncing**: Check Syncthing status. This app only reads/writes files; Syncthing handles the network transfer.
