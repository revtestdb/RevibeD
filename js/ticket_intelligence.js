/**
 * Ticket Intelligence Analyzer Logic
 * Handles batch processing of tickets using Gemini API.
 */

document.addEventListener('DOMContentLoaded', () => {
    setupTicketIntelligenceListeners();
});

let ti_latestResult = null;
let ti_globalTickets = [];
let ti_globalIndex = 0;
let ti_isPaused = false;
let ti_tokenClient;
let ti_gAccessToken = null;

function initTicketIntelligence() {
    // Unify API Usage: Load from shared storage
    const savedKey = localStorage.getItem('cx_gemini_key');
    const keyInput = document.getElementById('ti_apiKey');
    if (savedKey && keyInput) {
        keyInput.value = savedKey;
    }

    // Load Sheets Config
    const savedSheetUrl = localStorage.getItem('ti_sheet_url');
    if (savedSheetUrl) document.getElementById('ti_sheetUrl').value = savedSheetUrl;

    const savedClientId = localStorage.getItem('ti_client_id');
    if (savedClientId) document.getElementById('ti_googleClientId').value = savedClientId;

    const savedSpreadId = localStorage.getItem('ti_spreadsheet_id');
    if (savedSpreadId) document.getElementById('ti_spreadsheetId').value = savedSpreadId;
}

function setupTicketIntelligenceListeners() {
    const analyzeBtn = document.getElementById('ti_analyzeBtn');
    const saveKeyBtn = document.getElementById('ti_saveKeyBtn');
    const resumeBtn = document.getElementById('ti_resumeBtn');
    const pauseBtn = document.getElementById('ti_pauseBtn');
    const downloadBtn = document.getElementById('ti_downloadBtn');
    const copyBtn = document.getElementById('ti_copyBtn');
    const outputFormat = document.getElementById('ti_outputFormat');

    const saveSheetUrlBtn = document.getElementById('ti_saveSheetUrlBtn');
    const sendToSheetBtn = document.getElementById('ti_sendToSheetBtn');
    const googleAuthBtn = document.getElementById('ti_googleAuthBtn');
    const sendToSheetApiBtn = document.getElementById('ti_sendToSheetApiBtn');

    if (saveKeyBtn) {
        saveKeyBtn.addEventListener('click', () => {
            const val = document.getElementById('ti_apiKey').value.trim();
            if (!val) return alert("Please enter a key to save.");

            // Save to shared storage
            localStorage.setItem('cx_gemini_key', val);
            alert("API Key saved! (Shared with AI Analyst)");
        });
    }

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', startTicketAnalysis);
    }

    if (resumeBtn) {
        resumeBtn.addEventListener('click', async () => {
            const key = document.getElementById('ti_apiKey').value;
            const model = document.getElementById('ti_model').value;
            resumeBtn.classList.add('hidden');
            document.getElementById('ti_progressSection').classList.remove('hidden');
            await processTicketAnalysis(key, model);
        });
    }

    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            ti_isPaused = true;
            pauseBtn.disabled = true;
            document.getElementById('ti_status').textContent = "Pausing after current batch...";
            ti_addLog("Pause requested...");
        });
    }

    if (outputFormat) {
        outputFormat.addEventListener('change', () => {
            if (ti_latestResult) ti_displayResults(ti_latestResult);
        });
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            if (!ti_latestResult) return alert('No data to download');

            const format = document.getElementById('ti_outputFormat').value;
            let content, type, ext;

            if (format === 'csv') {
                content = ti_jsonToCSV(ti_latestResult);
                type = 'text/csv';
                ext = 'csv';
            } else {
                content = JSON.stringify(ti_latestResult, null, 2);
                type = 'application/json';
                ext = 'json';
            }

            const blob = new Blob([content], { type: type });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `analyzed_tickets_${Date.now()}.${ext}`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            if (!ti_latestResult) return alert('No data to copy');
            try {
                const format = document.getElementById('ti_outputFormat').value;
                const text = format === 'csv' ? ti_jsonToCSV(ti_latestResult) : JSON.stringify(ti_latestResult, null, 2);
                await navigator.clipboard.writeText(text);
                alert("Copied to clipboard!");
            } catch (err) {
                console.error(err);
                alert("Failed to copy.");
            }
        });
    }

    // --- Sheets Integration Listeners ---

    if (saveSheetUrlBtn) {
        saveSheetUrlBtn.addEventListener('click', () => {
            const url = document.getElementById('ti_sheetUrl').value.trim();
            if (!url) return alert("Please enter a URL.");
            localStorage.setItem('ti_sheet_url', url);
            alert("Sheet URL saved!");
        });
    }

    if (sendToSheetBtn) {
        sendToSheetBtn.addEventListener('click', async () => {
            if (!ti_latestResult) return alert('No data to send. Run analysis first.');
            const url = document.getElementById('ti_sheetUrl').value.trim();
            if (!url) return alert('Please save a Google Apps Script URL first.');

            sendToSheetBtn.disabled = true;
            sendToSheetBtn.textContent = "Sending...";

            try {
                await fetch(url, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify(ti_latestResult)
                });
                alert("Data sent to Sheet! (Check your Google Sheet)");
            } catch (err) {
                console.error(err);
                alert("Failed to send data. Check console.");
            }
            sendToSheetBtn.disabled = false;
            sendToSheetBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Data (Apps Script)';
        });
    }

    if (googleAuthBtn) {
        googleAuthBtn.addEventListener('click', () => {
            const clientId = document.getElementById('ti_googleClientId').value.trim();
            if (!clientId) return alert("Please enter a Google Client ID.");
            localStorage.setItem('ti_client_id', clientId);

            ti_tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: 'https://www.googleapis.com/auth/spreadsheets',
                callback: (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        ti_gAccessToken = tokenResponse.access_token;
                        googleAuthBtn.textContent = "Signed In";
                        googleAuthBtn.disabled = true;
                        document.getElementById('ti_sendToSheetApiBtn').disabled = false;
                        alert("Signed in successfully!");
                    }
                },
            });
            ti_tokenClient.requestAccessToken();
        });
    }

    if (sendToSheetApiBtn) {
        sendToSheetApiBtn.addEventListener('click', async () => {
            const spreadId = document.getElementById('ti_spreadsheetId').value.trim();
            if (!spreadId) return alert("Please enter a Spreadsheet ID.");
            if (!ti_latestResult) return alert("No data to send.");
            localStorage.setItem('ti_spreadsheet_id', spreadId);

            sendToSheetApiBtn.textContent = "Sending...";
            sendToSheetApiBtn.disabled = true;

            try {
                const headers = Object.keys(ti_latestResult[0]);
                const values = ti_latestResult.map(row => headers.map(h => row[h] ?? ""));
                const body = { values: [headers, ...values] }; // Include headers

                const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadId}/values/A1:append?valueInputOption=USER_ENTERED`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${ti_gAccessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });

                if (response.ok) alert("Data appended successfully!");
                else throw new Error((await response.json()).error?.message);
            } catch (error) {
                console.error(error);
                alert("Error: " + error.message);
            }
            sendToSheetApiBtn.textContent = "Send (Direct API)";
            sendToSheetApiBtn.disabled = false;
        });
    }
}

function ti_addLog(msg) {
    const log = document.getElementById('ti_activityLog');
    if (!log) return;
    const time = new Date().toLocaleTimeString();
    log.value += `[${time}] ${msg}\n`;
    log.scrollTop = log.scrollHeight;
}

async function startTicketAnalysis() {
    const key = document.getElementById('ti_apiKey').value;
    const model = document.getElementById('ti_model').value;
    const fileInput = document.getElementById('ti_fileInput');
    const file = fileInput.files[0];

    if (!key || !file) {
        alert("Please provide both an API Key and a file.");
        return;
    }

    // Reset UI
    document.getElementById('ti_status').textContent = "Reading file...";
    document.getElementById('ti_activityLog').value = '';
    ti_addLog("Reading file...");

    ti_latestResult = [];
    ti_globalIndex = 0;

    document.getElementById('ti_resumeBtn').classList.add('hidden');
    document.getElementById('ti_pauseBtn').classList.add('hidden');
    document.getElementById('ti_resultContainer').classList.add('hidden');
    document.getElementById('ti_progressSection').classList.remove('hidden');
    document.getElementById('ti_progressBar').style.width = '0%';

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const text = e.target.result;
            if (file.name.toLowerCase().endsWith('.csv')) {
                ti_globalTickets = ti_parseCSV(text);
            } else {
                ti_globalTickets = JSON.parse(text);
            }

            ti_addLog(`File loaded. Found ${ti_globalTickets.length} tickets.`);
            await processTicketAnalysis(key, model);
        } catch (err) {
            console.error(err);
            document.getElementById('ti_status').textContent = "Error: Invalid file format.";
            ti_addLog("Error parsing file. Ensure valid JSON or CSV.");
        }
    };
    reader.readAsText(file);
}

async function processTicketAnalysis(key, model) {
    const status = document.getElementById('ti_status');
    const analyzeBtn = document.getElementById('ti_analyzeBtn');
    const pauseBtn = document.getElementById('ti_pauseBtn');
    const resumeBtn = document.getElementById('ti_resumeBtn');
    const progressBar = document.getElementById('ti_progressBar');

    status.textContent = `Analyzing tickets...`;
    analyzeBtn.disabled = true;
    analyzeBtn.classList.add('opacity-50', 'cursor-not-allowed');

    ti_isPaused = false;
    pauseBtn.classList.remove('hidden');
    pauseBtn.disabled = false;
    resumeBtn.classList.add('hidden');

    const batchSize = 15;
    if (!ti_latestResult) ti_latestResult = [];

    for (let i = ti_globalIndex; i < ti_globalTickets.length; i += batchSize) {
        if (ti_isPaused) {
            status.textContent = "Analysis Paused.";
            ti_addLog("Paused by user.");
            pauseBtn.classList.add('hidden');
            resumeBtn.classList.remove('hidden');

            analyzeBtn.disabled = false;
            analyzeBtn.classList.remove('opacity-50', 'cursor-not-allowed');

            ti_displayResults(ti_latestResult);
            return;
        }

        const batch = ti_globalTickets.slice(i, i + batchSize);
        const currentBatchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(ti_globalTickets.length / batchSize);

        status.textContent = `Processing batch ${currentBatchNum} of ${totalBatches}...`;
        ti_addLog(`Sending batch ${currentBatchNum}/${totalBatches} (${batch.length} tickets)...`);

        const prompt = `
        Analyze the following customer service tickets.
        For each ticket, extract the information into the specific JSON format provided in the schema.
        
        FIELDS:
        - ticket_id
        - website_issue
        - reason_not_buying
        - angry_reason
        - device_quality
        - pricing_topic

        TICKETS:
        ${JSON.stringify(batch)}

        OUTPUT MUST BE A RAW JSON ARRAY. DO NOT ADD MARKDOWN.
        `;

        let attempts = 0;
        let success = false;
        const maxAttempts = 3;

        while (attempts < maxAttempts && !success) {
            attempts++;
            try {
                const cleanModelName = model.includes('models/') ? model.split('models/')[1] : model;

                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${key}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: prompt
                            }]
                        }]
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    const errorMessage = data.error?.message || JSON.stringify(data);
                    console.error("Error from proxy/Google API:", data);
                    throw new Error(errorMessage);
                }

                // Check API response structure
                if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    const cleanJson = JSON.parse(data.candidates[0].content.parts[0].text);
                    ti_latestResult = ti_latestResult.concat(cleanJson);
                    ti_addLog(`Batch ${currentBatchNum} success. Extracted ${cleanJson.length} items.`);
                    ti_globalIndex = i + batchSize;

                    const percent = Math.min(100, Math.round((ti_globalIndex / ti_globalTickets.length) * 100));
                    progressBar.style.width = `${percent}%`;
                    success = true;
                } else {
                    console.error("Unexpected API response:", data);
                    throw new Error("API response error");
                }

            } catch (err) {
                console.error(err);
                if (attempts >= maxAttempts) {
                    status.textContent = `Stopped at batch ${currentBatchNum} due to error.`;
                    ti_addLog(`Error: ${err.message}. Processing paused after ${maxAttempts} attempts.`);
                    resumeBtn.classList.remove('hidden');
                    pauseBtn.classList.add('hidden');
                    ti_displayResults(ti_latestResult);
                    analyzeBtn.disabled = false;
                    return;
                } else {
                    ti_addLog(`Batch ${currentBatchNum} failed (Attempt ${attempts}). Retrying in ${attempts * 2}s...`);
                    await new Promise(resolve => setTimeout(resolve, attempts * 2000));
                }
            }
        }
    }

    status.textContent = "Analysis Complete!";
    ti_addLog("All batches processed.");
    analyzeBtn.disabled = false;
    analyzeBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    pauseBtn.classList.add('hidden');
    ti_displayResults(ti_latestResult);
}

function ti_displayResults(data) {
    ti_latestResult = data;
    document.getElementById('ti_resultContainer').classList.remove('hidden');
    const format = document.getElementById('ti_outputFormat').value;
    const output = document.getElementById('ti_output');

    if (format === 'csv') {
        output.textContent = ti_jsonToCSV(data);
    } else {
        output.textContent = JSON.stringify(data, null, 2);
    }
}

function ti_jsonToCSV(arr) {
    if (!arr || !arr.length) return '';
    const headers = Object.keys(arr[0]);
    const rows = [headers.join(',')];
    for (const obj of arr) {
        const row = headers.map(h => `"${String(obj[h] || '').replace(/