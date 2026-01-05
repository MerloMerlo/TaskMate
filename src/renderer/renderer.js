// State
let currentUser = '';
let currentDate = new Date().toISOString().split('T')[0];
let currentData = { user: '', date: currentDate, plan: [], actual: [] };
let allUsersData = [];

// Elements
const screens = {
    setup: document.getElementById('setup-screen'),
    dashboard: document.getElementById('dashboard-screen')
};
const modal = document.getElementById('my-day-modal');

// Init
window.addEventListener('DOMContentLoaded', async () => {
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
        showScreen('dashboard');
        refreshDashboard();
    } else {
        showScreen('setup');
    }

    // Listen for updates
    window.api.onDataUpdate(() => {
        refreshDashboard();
    });
});

// Navigation
function showScreen(name) {
    Object.values(screens).forEach(el => el.classList.add('hidden'));
    screens[name].classList.remove('hidden');
}

function changeDate(delta) {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + delta);
    currentDate = date.toISOString().split('T')[0];
    document.getElementById('current-date-picker').value = currentDate;
    refreshDashboard();
}

// Setup Logic
document.getElementById('btn-select-folder').onclick = async () => {
    const path = await window.api.selectFolder();
    if (path) document.getElementById('setup-syncpath').value = path;
};

document.getElementById('btn-save-config').onclick = async () => {
    const username = document.getElementById('setup-username').value.trim();
    const syncDir = document.getElementById('setup-syncpath').value;
    const password = document.getElementById('setup-password').value;

    if (!username || !syncDir || !password) return alert("请填写所有字段");

    await window.api.saveConfig({ username, syncDir, password });
    currentUser = username;
    document.getElementById('current-user-display').textContent = currentUser;
    showScreen('dashboard');
    refreshDashboard();
};

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
    // Find my data or init new
    const myData = allUsersData.find(u => u.user === currentUser) || {
        user: currentUser,
        date: currentDate,
        plan: [],
        actual: []
    };
    // Deep copy to avoid mutating reference before save
    currentData = JSON.parse(JSON.stringify(myData));
    renderMyDayEditor();
    modal.classList.remove('hidden');
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
