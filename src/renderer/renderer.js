// Global Error Handler for debugging
window.onerror = function(message, source, lineno, colno, error) {
    console.error(`[Global Error] ${message} at ${source}:${lineno}`);
    alert(`Global Error: ${message}\nLine: ${lineno}`);
};

console.log("Renderer script loaded");

// State
let currentUser = '';
let currentDate = new Date().toISOString().split('T')[0];
let currentData = { user: '', date: currentDate, plan: [], actual: [] };
let allUsersData = [];

// Elements
const getScreens = () => ({
    setup: document.getElementById('setup-screen'),
    dashboard: document.getElementById('dashboard-screen')
});
const modal = document.getElementById('my-day-modal');

// Init
window.addEventListener('DOMContentLoaded', async () => {
    // Initialize screens reference if needed
    
    // Setup Date Picker
    const datePicker = document.getElementById('current-date-picker');
    datePicker.value = currentDate;
    datePicker.addEventListener('change', (e) => {
        currentDate = e.target.value;
        refreshDashboard();
    });
    
    document.getElementById('prev-day').onclick = () => changeDate(-1);
    document.getElementById('next-day').onclick = () => changeDate(1);

    // Check Config
    const config = await window.api.getConfig();
    if (config.username && config.syncDir) {
        currentUser = config.username;
        document.getElementById('current-user-display').textContent = currentUser;
        
        // Pre-fill setup form for editing
        document.getElementById('setup-username').value = config.username;
        document.getElementById('setup-syncpath').value = config.syncDir;
        document.getElementById('setup-password').value = config.password || '';

        showScreen('dashboard');
        refreshDashboard();
    } else {
        showScreen('setup');
    }

    // Listen for updates
    window.api.onDataUpdate(() => {
        refreshDashboard();
    });

    // --- DEBUG: Explicitly bind settings button here to ensure DOM is ready ---
    console.log("DOMContentLoaded: Binding settings button...");
    const settingsBtn = document.getElementById('btn-open-settings');
    if (settingsBtn) {
        settingsBtn.onclick = () => {
            console.log("Settings button clicked (Event Fired)");
            // alert("DEBUG: Settings button clicked"); // Uncomment if needed
            openSettingsPage();
        };
        console.log("Settings button bound successfully");
    } else {
        console.error("Settings button NOT found in DOMContentLoaded");
        alert("严重错误：无法找到设置按钮，请检查页面结构。");
    }
});

function openSettingsPage() {
    try {
        console.log("Executing openSettingsPage...");

        // 1. UI Navigation (Safe switch)
        showScreen('setup');
        
        // 2. UI Elements Visibility (Safe check)
        const stSection = document.getElementById('syncthing-section');
        if (stSection) stSection.classList.remove('hidden');
        else console.warn("syncthing-section not found");
        
        const cancelBtn = document.getElementById('btn-cancel-config');
        if (cancelBtn) cancelBtn.classList.remove('hidden');
        else console.warn("btn-cancel-config not found");

        // 3. Backend Data Loading
        if (typeof initSyncthingUI === 'function') {
            console.log("Calling initSyncthingUI...");
            initSyncthingUI().then(() => {
                console.log("initSyncthingUI completed");
            }).catch(err => {
                console.error("Syncthing UI init failed:", err);
                const myIdInput = document.getElementById('my-device-id');
                if (myIdInput) {
                    myIdInput.value = "加载 Syncthing 失败: " + (err.message || "未知错误");
                    myIdInput.style.color = 'red';
                }
            });
        } else {
            console.error("initSyncthingUI function is missing");
        }
        
    } catch (e) {
        console.error("Error opening settings:", e);
        const debugInfo = [
            `Error: ${e.message}`,
            `Stack: ${e.stack}`,
            `dashboard-screen: ${!!document.getElementById('dashboard-screen')}`,
            `setup-screen: ${!!document.getElementById('setup-screen')}`
        ].join('\n');
        alert("无法打开设置页面。\n\n" + debugInfo);
    }
}

// Navigation
function showScreen(name) {
    try {
        const screens = getScreens();
        Object.values(screens).forEach(el => {
            if (el) el.classList.add('hidden');
        });
        if (screens[name]) {
            screens[name].classList.remove('hidden');
        } else {
            console.error(`Screen ${name} not found`);
        }
    } catch (e) {
        console.error("Error in showScreen:", e);
        alert("页面切换出错: " + e.message);
    }
}

// Tab Switching
window.switchTab = (tabName) => {
    // Hide all tabs
    document.getElementById('tab-general').classList.add('hidden');
    document.getElementById('tab-network').classList.add('hidden');
    
    // Show selected
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');

    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    // Find the button that triggered this or matches
    // Since we pass string, we can't easily get 'this', so we query by onclick attribute or just rely on index
    // A better way:
    const buttons = document.querySelectorAll('.tab-btn');
    if (tabName === 'general') buttons[0].classList.add('active');
    else buttons[1].classList.add('active');
};

async function initSyncthingUI() {
    try {
        const myId = await window.api.getSyncthingId();
        if (!myId) {
            document.getElementById('my-device-id').value = '启动失败：端口被占用或已有实例运行';
            document.getElementById('my-device-id').style.color = 'red';
            return;
        }
        document.getElementById('my-device-id').value = myId;
        document.getElementById('my-device-id').style.color = '#666';
        
        // Load Devices & Folders
        await refreshSyncthingLists();
    } catch (e) {
        console.error("Failed to get ST ID", e);
        document.getElementById('my-device-id').value = '连接 Syncthing 失败';
        document.getElementById('my-device-id').style.color = 'red';
    }
}

async function refreshSyncthingLists() {
    try {
        const config = await window.api.getSyncthingConfig();
        
        // Render Devices
        const deviceList = document.getElementById('st-device-list');
        deviceList.innerHTML = config.devices.length ? '' : '<div class="empty-state-small">暂无设备</div>';
        
        config.devices.forEach(d => {
            if (d.deviceID === document.getElementById('my-device-id').value) return; // Skip self

            const div = document.createElement('div');
            div.className = 'st-list-item';
            div.innerHTML = `
                <div class="st-info">
                    <span class="st-name">${d.name || '未命名设备'}</span>
                    <span class="st-id">${d.deviceID.substring(0, 12)}...</span>
                </div>
                <div class="st-status">
                    ${d.paused ? '<span class="tag-paused">暂停</span>' : '<span class="tag-active">正常</span>'}
                    <button class="icon-btn" onclick="toggleDevicePause('${d.deviceID}', ${d.paused})" title="${d.paused ? '恢复' : '暂停'}">
                        ${d.paused ? '▶' : '⏸'}
                    </button>
                    <button class="icon-btn danger-btn" onclick="removeDevice('${d.deviceID}')" title="移除设备">×</button>
                </div>
            `;
            deviceList.appendChild(div);
        });

        // Render Folders
        const folderList = document.getElementById('st-folder-list');
        folderList.innerHTML = config.folders.length ? '' : '<div class="empty-state-small">暂无文件夹</div>';
        
        config.folders.forEach(f => {
            const div = document.createElement('div');
            div.className = 'st-list-item';
            div.innerHTML = `
                <div class="st-info">
                    <span class="st-name">${f.label} (${f.id})</span>
                    <span class="st-path">${f.path}</span>
                </div>
                <div class="st-status">
                    ${f.paused ? '<span class="tag-paused">暂停</span>' : '<span class="tag-active">同步中</span>'}
                    <button class="icon-btn" onclick="toggleFolderPause('${f.id}', ${f.paused})" title="${f.paused ? '恢复' : '暂停'}">
                        ${f.paused ? '▶' : '⏸'}
                    </button>
                    <button class="icon-btn danger-btn" onclick="removeFolder('${f.id}')" title="移除文件夹">×</button>
                </div>
            `;
            folderList.appendChild(div);
        });

    } catch (e) {
        console.error("Failed to load ST config", e);
    }
}

// Device Actions
document.getElementById('btn-show-add-device').onclick = () => {
    document.getElementById('modal-add-device').classList.remove('hidden');
};

document.getElementById('btn-confirm-add-device').onclick = async () => {
    const id = document.getElementById('new-device-id').value.trim();
    const name = document.getElementById('new-device-name').value.trim();
    if (!id || !name) return alert('请填写完整');

    await window.api.addSyncthingDevice({ id, name });
    document.getElementById('modal-add-device').classList.add('hidden');
    await refreshSyncthingLists();
};

// Folder Actions
document.getElementById('btn-show-add-folder').onclick = async () => {
    const config = await window.api.getSyncthingConfig();
    const devices = config.devices.filter(d => d.deviceID !== document.getElementById('my-device-id').value);
    
    // Populate share checkboxes
    const container = document.getElementById('folder-share-devices');
    container.innerHTML = devices.map(d => `
        <label class="checkbox-label">
            <input type="checkbox" value="${d.deviceID}"> ${d.name}
        </label>
    `).join('');

    document.getElementById('modal-add-folder').classList.remove('hidden');
};

document.getElementById('btn-select-new-folder-path').onclick = async () => {
    const path = await window.api.selectFolder();
    if (path) document.getElementById('new-folder-path').value = path;
};

document.getElementById('btn-confirm-add-folder').onclick = async () => {
    const id = document.getElementById('new-folder-id').value.trim();
    const path = document.getElementById('new-folder-path').value.trim();
    if (!id || !path) return alert('请填写完整');

    // Get selected devices
    const checkboxes = document.querySelectorAll('#folder-share-devices input:checked');
    const devices = Array.from(checkboxes).map(cb => cb.value);

    await window.api.addSyncthingFolder({ id, label: id, path, devices });
    document.getElementById('modal-add-folder').classList.add('hidden');
    await refreshSyncthingLists();
};

// Global toggle functions (attached to window for HTML access)
window.toggleDevicePause = async (id, isPaused) => {
    if (isPaused) await window.api.resumeDevice(id);
    else await window.api.pauseDevice(id);
    await refreshSyncthingLists();
};

window.toggleFolderPause = async (id, isPaused) => {
    if (isPaused) await window.api.resumeFolder(id);
    else await window.api.pauseFolder(id);
    await refreshSyncthingLists();
};

window.removeDevice = async (id) => {
    if (!confirm('确定要移除此设备吗？')) return;
    await window.api.removeSyncthingDevice(id);
    await refreshSyncthingLists();
};

window.removeFolder = async (id) => {
    if (!confirm('确定要移除此文件夹吗？')) return;
    await window.api.removeSyncthingFolder(id);
    await refreshSyncthingLists();
};

// Close sub-modals
document.querySelectorAll('.close-sub-modal').forEach(btn => {
    btn.onclick = function() {
        this.closest('.modal').classList.add('hidden');
    }
});

// Helper for safe event binding
function safeBind(id, event, handler) {
    const el = document.getElementById(id);
    if (el) {
        el[event] = handler;
    } else {
        console.warn(`SafeBind: Element #${id} not found for event ${event}`);
    }
}

// Syncthing Actions
safeBind('btn-copy-id', 'onclick', () => {
    const id = document.getElementById('my-device-id').value;
    navigator.clipboard.writeText(id);
    alert('ID 已复制！');
});

function changeDate(delta) {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + delta);
    currentDate = date.toISOString().split('T')[0];
    document.getElementById('current-date-picker').value = currentDate;
    refreshDashboard();
}

// Setup Logic
safeBind('btn-select-folder', 'onclick', async () => {
    const path = await window.api.selectFolder();
    if (path) document.getElementById('setup-syncpath').value = path;
});

safeBind('btn-save-config', 'onclick', async () => {
    const username = document.getElementById('setup-username').value.trim();
    const syncDir = document.getElementById('setup-syncpath').value;
    const password = document.getElementById('setup-password').value;

    if (!username || !syncDir || !password) return alert("请填写所有字段");

    await window.api.saveConfig({ username, syncDir, password });
    currentUser = username;
    document.getElementById('current-user-display').textContent = currentUser;
    showScreen('dashboard');
    refreshDashboard();
});

safeBind('btn-cancel-config', 'onclick', () => {
    showScreen('dashboard');
});



// Dashboard Logic
async function refreshDashboard() {
    allUsersData = await window.api.loadTasks(currentDate);
    renderTeamGrid();
}

function renderTeamGrid() {
    const grid = document.getElementById('team-grid');
    grid.innerHTML = '';

    if (allUsersData.length === 0) {
        grid.innerHTML = '<div class="empty-state">暂无数据</div>';
        return;
    }

    allUsersData.forEach(userData => {
        const card = document.createElement('div');
        card.className = 'user-card';
        
        // Plan Section
        let planHtml = userData.plan.map(t => `<div>• ${t.text}</div>`).join('');
        
        // Actual Section
        let actualHtml = userData.actual.map(t => {
            let classes = 'ro-item';
            let badge = '';
            
            if (t.source === 'error') {
                return `<div class="ro-item"><span class="ro-error">${t.text}</span></div>`;
            }

            if (t.source === 'added') badge = '<span class="ro-new">新</span>';
            if (!t.done) classes += ' ro-failed';
            return `<div class="${classes}">${badge} ${t.text}</div>`;
        }).join('');

        card.innerHTML = `
            <h3>${userData.user}</h3>
            <div class="card-content">
                <div class="card-section">
                    <div class="card-label">计划</div>
                    ${planHtml || '<small>无</small>'}
                </div>
                <div class="card-section">
                    <div class="card-label">完成</div>
                    ${actualHtml || '<small>无</small>'}
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// My Day Logic
document.getElementById('btn-open-my-day').onclick = () => {
    try {
        console.log("My Day button clicked");
        // Find my data or init new
        const myData = allUsersData.find(u => u.user === currentUser) || {
            user: currentUser,
            date: currentDate,
            plan: [],
            actual: []
        };
        // Deep copy to avoid mutating reference before save
        currentData = JSON.parse(JSON.stringify(myData));
        
        // Update Date Display
        const d = new Date(currentData.date);
        const dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
        const dateDisplay = document.getElementById('modal-date-display');
        if (dateDisplay) {
            dateDisplay.textContent = dateStr;
        } else {
            console.warn("Date display element not found");
        }

        renderMyDayEditor();
        modal.classList.remove('hidden');
    } catch (e) {
        console.error("Error opening My Day modal:", e);
        alert("无法打开今日看板: " + e.message);
    }
};

document.querySelector('.close-modal').onclick = () => modal.classList.add('hidden');

function renderMyDayEditor() {
    const planList = document.getElementById('plan-list');
    const actualList = document.getElementById('actual-list');
    planList.innerHTML = '';
    actualList.innerHTML = '';

    // Render Plan
    currentData.plan.forEach((task, index) => {
        const div = document.createElement('div');
        div.className = 'task-item';
        div.innerHTML = `
            <input type="text" value="${task.text}" onchange="updatePlanItem(${index}, this.value)">
            <span class="delete-btn" onclick="deletePlanItem(${index})">×</span>
        `;
        planList.appendChild(div);
    });

    // Render Actual
    currentData.actual.forEach((task, index) => {
        const div = document.createElement('div');
        let classes = 'task-item';
        if (task.source === 'added') classes += ' new-item';
        if (!task.done) classes += ' failed-item';

        div.className = classes;
        div.innerHTML = `
            <input type="checkbox" class="task-checkbox" ${task.done ? 'checked' : ''} onchange="toggleActualDone(${index}, this.checked)">
            <input type="text" value="${task.text}" onchange="updateActualItem(${index}, this.value)">
            <span class="delete-btn" onclick="deleteActualItem(${index})">×</span>
        `;
        actualList.appendChild(div);
    });
}

// Editor Actions
window.addPlanItem = () => {
    currentData.plan.push({ id: crypto.randomUUID(), text: '', done: false });
    renderMyDayEditor();
};

window.updatePlanItem = (index, val) => {
    currentData.plan[index].text = val;
};

window.deletePlanItem = (index) => {
    currentData.plan.splice(index, 1);
    renderMyDayEditor();
};

window.addActualItem = () => {
    currentData.actual.push({ id: crypto.randomUUID(), text: '', done: true, source: 'added' });
    renderMyDayEditor();
};

window.updateActualItem = (index, val) => {
    currentData.actual[index].text = val;
};

window.toggleActualDone = (index, checked) => {
    currentData.actual[index].done = checked;
    renderMyDayEditor(); // To apply red style
};

window.deleteActualItem = (index) => {
    currentData.actual.splice(index, 1);
    renderMyDayEditor();
};

// Copy Previous Day Logic
document.getElementById('btn-copy-prev').onclick = async () => {
    // 1. Calculate previous date
    const today = new Date(currentData.date);
    today.setDate(today.getDate() - 1);
    const prevDateStr = today.toISOString().split('T')[0];

    // 2. Load previous tasks
    const prevTasks = await window.api.loadTasks(prevDateStr);
    
    // 3. Find current user's data
    const myPrevData = prevTasks.find(u => u.user === currentUser);

    if (myPrevData && myPrevData.plan && myPrevData.plan.length > 0) {
        // 4. Append to current plan (avoiding duplicates if needed, but for now just append)
        myPrevData.plan.forEach(task => {
            currentData.plan.push({
                id: crypto.randomUUID(), // Generate new ID
                text: task.text,
                done: false
            });
        });
        renderMyDayEditor();
    } else {
        alert(`未找到您在 ${prevDateStr} 的目标记录`);
    }
};

// Sync Logic
document.getElementById('btn-sync-plan').onclick = () => {
    currentData.plan.forEach(pTask => {
        // Check if already in actual (by ID)
        const exists = currentData.actual.find(a => a.id === pTask.id);
        if (!exists) {
            currentData.actual.push({
                id: pTask.id,
                text: pTask.text,
                done: true, // Default to done when synced
                source: 'plan'
            });
        }
    });
    renderMyDayEditor();
};

// Save
document.getElementById('btn-save-my-day').onclick = async () => {
    const status = document.getElementById('save-status');
    status.textContent = "保存中...";
    try {
        await window.api.saveTask(currentData);
        status.textContent = "已保存";
        setTimeout(() => {
            modal.classList.add('hidden');
            status.textContent = "";
            refreshDashboard();
        }, 500);
    } catch (e) {
        status.textContent = "保存失败: " + e.message;
        status.style.color = 'red';
    }
};
