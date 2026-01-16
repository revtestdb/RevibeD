/**
 * Automation Center Logic
 * Handles Google OAuth Login and future automation tasks.
 */

let ac_tokenClient;
let ac_accessToken = null;
let ac_latestData = null; // Store large datasets in memory

document.addEventListener('DOMContentLoaded', () => {
    ac_log("System initialized.");

    // Check if Google Script is loaded
    if (typeof google !== 'undefined' && google.accounts) {
        document.getElementById('scriptStatus').textContent = "GSI Library Loaded ✅";
        document.getElementById('scriptStatus').className = "text-[10px] text-accent-green";
        ac_initializeGsi();
    } else {
        document.getElementById('scriptStatus').textContent = "GSI Library Missing ❌";
        document.getElementById('scriptStatus').className = "text-[10px] text-accent-red";
        ac_log("Error: Google Identity Services script failed to load.", "error");
    }

    // Load Sheet Config
    const savedSheetUrl = localStorage.getItem('ac_sheet_url');
    if (savedSheetUrl) document.getElementById('ac_sheetUrl').value = savedSheetUrl;

    // Add event listeners
    const loginBtn = document.getElementById('ac_loginBtn');
    if (loginBtn) loginBtn.addEventListener('click', ac_handleLogin);

    const logoutButton = document.getElementById('ac_logoutBtn'); // Target by ID
    if (logoutButton) logoutButton.addEventListener('click', ac_handleLogout);

    if (document.getElementById('ac_testConnectionBtn')) document.getElementById('ac_testConnectionBtn').addEventListener('click', ac_testConnection);
    if (document.getElementById('ac_fetchDataBtn')) document.getElementById('ac_fetchDataBtn').addEventListener('click', ac_fetchData);
    if (document.getElementById('ac_sendDataAppendBtn')) document.getElementById('ac_sendDataAppendBtn').addEventListener('click', () => ac_sendData('append'));
    if (document.getElementById('ac_sendDataUpdateBtn')) document.getElementById('ac_sendDataUpdateBtn').addEventListener('click', () => ac_sendData('update'));
    if (document.getElementById('ac_viewJsonInTabBtn')) document.getElementById('ac_viewJsonInTabBtn').addEventListener('click', ac_viewJsonInTab);
    if (document.getElementById('ac_clearDataBtn')) document.getElementById('ac_clearDataBtn').addEventListener('click', ac_clearData);
    if (document.getElementById('ac_formatJsonBtn')) document.getElementById('ac_formatJsonBtn').addEventListener('click', ac_formatJson);
    if (document.getElementById('ac_schedStartBtn')) document.getElementById('ac_schedStartBtn').addEventListener('click', ac_startSchedule);
    if (document.getElementById('ac_schedStopBtn')) document.getElementById('ac_schedStopBtn').addEventListener('click', ac_stopSchedule);
    if (document.getElementById('ac_schedFrequency')) document.getElementById('ac_schedFrequency').addEventListener('change', ac_toggleTimeInput);
});

function ac_initializeGsi() {
    const clientId = localStorage.getItem('google_client_id');
    if (!clientId) {
        ac_log("Google Client ID not found in local storage. Please set it in the Credentials Manager.", "info");
        return;
    }

    ac_tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        callback: (response) => {
            if (response.error) {
                ac_updateUiState(false);
                return;
            }
            if (response.access_token) {
                ac_accessToken = response.access_token;
                ac_log("Silent login successful!", "success");
                ac_updateUiState(true);
            }
        },
    });

    ac_tokenClient.requestAccessToken({ prompt: 'none' });
}

function ac_handleLogin() {
    if (window.location.protocol === 'file:') {
        alert("Google Sign-In requires a web server (http://localhost). It does not work on file://.");
        return;
    }

    if (ac_tokenClient) {
        ac_tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        ac_log("Token client not initialized. Trying to initialize now.", "info");
        ac_initializeGsi();
        if (ac_tokenClient) {
            ac_tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            ac_log("Failed to initialize token client. A Client ID might be missing from the credentials manager.", "error");
        }
    }
}

function ac_handleLogout() {
    ac_accessToken = null;
    if (google && google.accounts && google.accounts.oauth2) {
        google.accounts.oauth2.revoke(ac_accessToken, () => { console.log('Token revoked'); });
    }
    ac_updateUiState(false);
    ac_log("User disconnected.");
}

function ac_updateUiState(isConnected) {
    const loginSection = document.getElementById('loginSection');
    const connectedSection = document.getElementById('connectedSection');
    const features = document.getElementById('automationFeatures');

    if (isConnected) {
        loginSection.classList.add('hidden');
        connectedSection.classList.remove('hidden');
        features.classList.remove('opacity-50', 'pointer-events-none', 'grayscale');
    } else {
        loginSection.classList.remove('hidden');
        connectedSection.classList.add('hidden');
        features.classList.add('opacity-50', 'pointer-events-none', 'grayscale');
        const btn = document.getElementById('ac_loginBtn');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-brands fa-google text-accent-blue"></i> Sign In & Authorize';
    }
}

// ==========================================
// 📊 SHEETS OPERATIONS
// ==========================================

async function ac_testConnection() {
    if (!ac_accessToken) return alert("Please sign in first.");
    const config = ac_getConfig();
    if (!config) return;

    const safeSheetName = config.sheetName.includes(' ') ? `'${config.sheetName}'` : config.sheetName;
    const range = `${safeSheetName}!A1:A1`;

    ac_log(`Testing connection to ${range}...`);

    try {
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${range}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${ac_accessToken}` }
        });

        if (!response.ok) throw new Error(`API Error: ${response.status} ${response.statusText}`);
        ac_log(`✅ Connection Successful! Sheet is accessible.`, 'success');
    } catch (error) {
        console.error(error);
        ac_log(`❌ Connection Failed: ${error.message}`, 'error');
    }
}

async function ac_fetchData() {
    if (!ac_accessToken) {
        alert("Please sign in first.");
        return null;
    }
    const config = ac_getConfig();
    if (!config) return null;

    ac_log(`Fetching data from ${config.range}...`);

    try {
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${config.range}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${ac_accessToken}` }
        });

        if (!response.ok) throw new Error(`API Error: ${response.status} ${response.statusText}`);

        const data = await response.json();
        const rows = data.values || [];
        ac_log(`Fetch complete. Retrieved ${rows.length} rows.`);

        // Store in memory for other operations
        ac_latestData = rows;

        return rows;

    } catch (error) {
        console.error(error);
        ac_log(`Error fetching data: ${error.message}`, 'error');
        return null;
    }
}

async function ac_sendData(mode) {
    if (!ac_accessToken) return alert("Please sign in first.");
    const config = ac_getConfig();
    if (!config) return;

    let rawInput = document.getElementById('ac_dataArea').value.trim();
    if (!rawInput) return alert("Please enter JSON data to send.");

    let values = [];
    let json;

    try {
        // Check if we should use the hidden memory data
        if (rawInput.startsWith("[DATA HIDDEN") && ac_latestData) {
            ac_log("Using cached data from memory...");
            json = ac_latestData; // Use object directly (Zero CPU cost)
        } else {
            json = JSON.parse(rawInput);
        }

        if (Array.isArray(json)) {
            if (json.length > 0 && typeof json[0] === 'object' && !Array.isArray(json[0])) {
                values = json.map(obj => Object.values(obj));
            } else if (Array.isArray(json[0])) {
                values = json;
            } else {
                values = [json];
            }
        } else {
            throw new Error("Input must be a JSON Array.");
        }
    } catch (e) {
        ac_log(`Data Error: ${e.message}`, 'error');
        return;
    }

    const urlBase = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${config.range}`;
    let url, method;

    if (mode === 'append') {
        url = `${urlBase}:append?valueInputOption=USER_ENTERED`;
        method = 'POST';
        ac_log(`Appending ${values.length} rows...`);
    } else {
        url = `${urlBase}?valueInputOption=USER_ENTERED`;
        method = 'PUT';
        ac_log(`Updating range...`);
    }

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `Bearer ${ac_accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values: values })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || response.statusText);
        }

        ac_log(`${mode === 'append' ? 'Append' : 'Update'} successful!`, 'success');
    } catch (error) {
        console.error(error);
        ac_log(`Error sending data: ${error.message}`, 'error');
    }
}

function ac_getConfig() {
    const url = document.getElementById('ac_sheetUrl').value.trim();
    const sheetName = document.getElementById('ac_sheetName').value.trim();
    const startRow = document.getElementById('ac_startRow').value.trim();

    if (!url) { alert("Please enter a Spreadsheet URL."); return null; }
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) { alert("Invalid Google Sheets URL."); return null; }

    localStorage.setItem('ac_sheet_url', url);
    const safeSheetName = sheetName.includes(' ') ? `'${sheetName}'` : sheetName;
    return { spreadsheetId: match[1], range: `${safeSheetName}!A${startRow}:ZZ`, sheetName };
}

function ac_formatJson() {
    const area = document.getElementById('ac_dataArea');
    try { area.value = JSON.stringify(JSON.parse(area.value), null, 2); } catch (e) { alert("Invalid JSON"); }
}

function ac_clearData() {
    ac_latestData = null;
    document.getElementById('ac_dataArea').value = '';
}

function ac_viewJsonInTab() {
    if (!ac_latestData) {
        // Try to parse textarea if memory is empty
        const val = document.getElementById('ac_dataArea').value;
        if (!val || val.startsWith("[DATA HIDDEN")) return alert("No data to view.");
        try {
            ac_latestData = JSON.parse(val);
        } catch (e) { return alert("Invalid JSON in text area."); }
    }

    const jsonStr = JSON.stringify(ac_latestData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
}

// ==========================================
// ⏰ SCHEDULER LOGIC
// ==========================================
let ac_schedulerTimer = null;

function ac_toggleTimeInput() {
    const freq = document.getElementById('ac_schedFrequency').value;
    const container = document.getElementById('ac_schedTimeContainer');
    if (freq === 'daily') container.classList.remove('hidden');
    else container.classList.add('hidden');
}

function ac_startSchedule() {
    const freq = document.getElementById('ac_schedFrequency').value;
    const statusEl = document.getElementById('ac_schedStatus');

    if (ac_schedulerTimer) clearTimeout(ac_schedulerTimer);

    let delay = 0;
    let nextRunMsg = "";

    if (freq === 'hourly') {
        delay = 60 * 60 * 1000;
        nextRunMsg = "in 1 hour";
    } else {
        const timeVal = document.getElementById('ac_schedTime').value;
        if (!timeVal) return alert("Please select a time for daily schedule.");

        const now = new Date();
        const [h, m] = timeVal.split(':');
        const target = new Date();
        target.setHours(h, m, 0, 0);

        if (target <= now) target.setDate(target.getDate() + 1);
        delay = target - now;
        nextRunMsg = `at ${target.toLocaleTimeString()}`;
    }

    document.getElementById('ac_schedStartBtn').classList.add('hidden');
    document.getElementById('ac_schedStopBtn').classList.remove('hidden');
    statusEl.innerHTML = `Status: <span class="text-accent-yellow animate-pulse font-bold">Running</span> (Next: ${nextRunMsg})`;
    ac_log(`Scheduler started. Next fetch ${nextRunMsg}.`, 'success');

    ac_schedulerTimer = setTimeout(async () => {
        ac_log("⏰ Scheduler: Executing scheduled fetch...", 'info');
        await ac_fetchData();
        ac_startSchedule();
    }, delay);
}

function ac_stopSchedule() {
    if (ac_schedulerTimer) clearTimeout(ac_schedulerTimer);
    ac_schedulerTimer = null;
    document.getElementById('ac_schedStartBtn').classList.remove('hidden');
    document.getElementById('ac_schedStopBtn').classList.add('hidden');
    document.getElementById('ac_schedStatus').innerHTML = `Status: <span class="text-gray-400">Idle</span>`;
    ac_log("Scheduler stopped by user.", 'info');
}

function ac_log(msg, type = 'info') {
    const consoleEl = document.getElementById('ac_console');
    const time = new Date().toLocaleTimeString();
    let colorClass = 'text-gray-400';

    if (type === 'error') colorClass = 'text-accent-red font-bold';
    if (type === 'success') colorClass = 'text-accent-green font-bold';

    const line = document.createElement('div');
    line.className = `mb-1 border-b border-slate-800 pb-1 ${colorClass}`;
    line.innerHTML = `<span class="opacity-50">[${time}]</span> ${msg}`;

    consoleEl.prepend(line);
}