// app.js

const GAS_URL = "https://script.google.com/macros/s/AKfycbwWAQkT-9QVAAPiehDYeU3jIEDRGO4XlvFgBmg9cpyoGGUM1xYwUO0BhbDAYR7K-orQ/exec"; // User to replace this

// DOM Elements
const viewInit = document.getElementById('view-init');
const viewMain = document.getElementById('view-main');
const initForm = document.getElementById('init-form');
const initName = document.getElementById('init-name');
const initDept = document.getElementById('init-dept');
const recentSessionsContainer = document.getElementById('recent-sessions-container');
const recentSessionsList = document.getElementById('recent-sessions-list');
const headerSession = document.getElementById('header-session');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnSync = document.getElementById('btn-sync');
const btnClose = document.getElementById('btn-close') || document.getElementById('btn-exit');
const btnExport = document.getElementById('btn-export');
const installContainer = document.getElementById('install-container');
const btnInstall = document.getElementById('btn-install');
const syncCountBadge = document.getElementById('sync-count');
const entryForm = document.getElementById('entry-form');
const inputNumber = document.getElementById('input-number');
const inputName = document.getElementById('input-name');
const inputQty = document.getElementById('input-qty');
const itemList = document.getElementById('item-list');
const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
const toastEl = document.getElementById('toast');

// State
let stockItems = [];
let isSyncing = false;
let editingItemId = null;

// Initialize App
async function initApp() {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW registration failed:', err));
    }

    const name = localStorage.getItem('session_name');
    const dept = localStorage.getItem('session_dept');

    if (name && dept) {
        showMainApp(name, dept);
    } else {
        viewInit.classList.remove('hidden');
        viewMain.classList.add('hidden');
        renderRecentSessions();
    }

    // Load data from IndexedDB
    try {
        const storedItems = await localforage.getItem('stock_items');
        if (storedItems) {
            stockItems = storedItems;
        }
    } catch (err) {
        console.error("Error loading from localforage", err);
    }
}

// --- PWA INSTALLATION LOGIC ---
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI notify the user they can install the PWA
    if (installContainer) {
        installContainer.classList.remove('hidden');
    }
});

if (btnInstall) {
    btnInstall.addEventListener('click', async () => {
        if (deferredPrompt) {
            // Show the install prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            // We've used the prompt, and can't use it again, throw it away
            deferredPrompt = null;
            installContainer.classList.add('hidden');
        }
    });
}

window.addEventListener('appinstalled', () => {
    // Hide the app-provided install promotion
    if (installContainer) {
        installContainer.classList.add('hidden');
    }
    // Clear the deferredPrompt so it can be garbage collected
    deferredPrompt = null;
    console.log('PWA was installed');
});

// Show Toast
function showToast(message, duration = 3000) {
    toastEl.textContent = message;
    toastEl.classList.add('toast-visible');
    setTimeout(() => {
        toastEl.classList.remove('toast-visible');
    }, duration);
}

// UI State Toggling
function showMainApp(name, dept) {
    headerSession.textContent = `${name} | ${dept}`;
    viewInit.classList.add('hidden');
    viewMain.classList.remove('hidden');
    inputNumber.focus();
    renderList();
    updateSyncBadge();
}

// Close Session (syncs, then goes to init view)
if (btnClose) {
    btnClose.addEventListener('click', async () => {
        // Attempt sync before closing
        await performSync();
        
        localStorage.removeItem('session_name');
        localStorage.removeItem('session_dept');
        viewInit.classList.remove('hidden');
        viewMain.classList.add('hidden');
        initName.value = '';
        initDept.value = '';
        renderRecentSessions();
    });
}

// Recent Sessions Logic
function renderRecentSessions() {
    const historyJson = localStorage.getItem('session_history');
    let history = [];
    if (historyJson) {
        try { history = JSON.parse(historyJson); } catch (e) {}
    }

    if (history.length > 0) {
        recentSessionsContainer.classList.remove('hidden');
        recentSessionsList.innerHTML = '';
        history.forEach(session => {
            const btn = document.createElement('button');
            btn.className = "w-full text-left px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-200 active:bg-blue-100 transition-colors flex items-center justify-between";
            btn.innerHTML = `
                <div class="flex flex-col">
                    <span class="font-bold text-slate-700">${escapeHtml(session.dept)}</span>
                    <span class="text-xs text-slate-500">${escapeHtml(session.name)}</span>
                </div>
                <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
            `;
            btn.onclick = () => {
                initName.value = session.name;
                initDept.value = session.dept;
                initForm.dispatchEvent(new Event('submit'));
            };
            recentSessionsList.appendChild(btn);
        });
    } else {
        recentSessionsContainer.classList.add('hidden');
    }
}

// Init Form Submit
initForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = initName.value.trim();
    const dept = initDept.value.trim();
    if (name && dept) {
        localStorage.setItem('session_name', name);
        localStorage.setItem('session_dept', dept);
        
        // Save to history
        const historyJson = localStorage.getItem('session_history');
        let history = [];
        if (historyJson) {
            try { history = JSON.parse(historyJson); } catch (err) {}
        }
        // Remove duplicate if exists
        history = history.filter(s => !(s.name === name && s.dept === dept));
        // Add to top
        history.unshift({ name, dept });
        // Keep only last 5
        if (history.length > 5) history = history.slice(0, 5);
        localStorage.setItem('session_history', JSON.stringify(history));

        showMainApp(name, dept);
    }
});

// Fullscreen Toggle Logic
if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(err => {
                    showToast("Fullscreen not supported on this device.");
                });
            } else if (document.documentElement.webkitRequestFullscreen) { /* Safari */
                document.documentElement.webkitRequestFullscreen();
            } else if (document.documentElement.msRequestFullscreen) { /* IE11 */
                document.documentElement.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) { /* Safari */
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { /* IE11 */
                document.msExitFullscreen();
            }
        }
    });
}

// Keyboard Flow Logic
inputNumber.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        inputName.focus();
    }
});
inputName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        inputQty.focus();
    }
});
// inputQty enter key is naturally handled by the form submit

// Autocomplete Logic
function updateAutocomplete() {
    if (!autocompleteDropdown) return;
    
    const numQuery = inputNumber.value.trim().toLowerCase();
    const nameQuery = inputName.value.trim().toLowerCase();

    // Hide if both empty or if we are actively editing an existing item
    if ((!numQuery && !nameQuery) || editingItemId) {
        autocompleteDropdown.classList.add('hidden');
        return;
    }

    // Extract unique pairs
    const uniquePairs = [];
    const seen = new Set();
    for (const item of stockItems) {
        const key = `${item.number.toLowerCase()}|${(item.name || '').toLowerCase()}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniquePairs.push({ number: item.number, name: item.name || '' });
        }
    }

    // Filter matches
    const matches = uniquePairs.filter(pair => {
        const matchNum = numQuery ? pair.number.toLowerCase().includes(numQuery) : true;
        const matchName = nameQuery ? pair.name.toLowerCase().includes(nameQuery) : true;
        const exactMatch = (pair.number.toLowerCase() === numQuery && pair.name.toLowerCase() === nameQuery);
        return matchNum && matchName && !exactMatch;
    });

    if (matches.length === 0) {
        autocompleteDropdown.classList.add('hidden');
        return;
    }

    // Render matches
    autocompleteDropdown.innerHTML = '';
    matches.slice(0, 8).forEach(match => {
        const div = document.createElement('div');
        div.className = "px-4 py-3 cursor-pointer hover:bg-blue-100 active:bg-blue-200 transition-colors flex items-center space-x-3";
        
        div.innerHTML = `
            <span class="px-2 py-1 bg-slate-200 text-slate-800 font-mono font-bold rounded text-sm shrink-0 shadow-sm border border-slate-300"># ${escapeHtml(match.number)}</span>
            <span class="text-blue-700 font-semibold truncate flex-1">${escapeHtml(match.name)}</span>
        `;
        
        // Use mousedown to prevent input blur on click
        div.addEventListener('mousedown', (e) => {
            e.preventDefault(); 
            inputNumber.value = match.number;
            inputName.value = match.name;
            autocompleteDropdown.classList.add('hidden');
            inputQty.focus();
        });
        
        // Also support touchstart for mobile responsiveness
        div.addEventListener('touchstart', (e) => {
            e.preventDefault();
            inputNumber.value = match.number;
            inputName.value = match.name;
            autocompleteDropdown.classList.add('hidden');
            inputQty.focus();
        }, {passive: false});

        autocompleteDropdown.appendChild(div);
    });
    
    autocompleteDropdown.classList.remove('hidden');
}

inputNumber.addEventListener('input', updateAutocomplete);
inputName.addEventListener('input', updateAutocomplete);
inputNumber.addEventListener('focus', updateAutocomplete);
inputName.addEventListener('focus', updateAutocomplete);

// Hide autocomplete when clicking outside
document.addEventListener('click', (e) => {
    if (autocompleteDropdown && !autocompleteDropdown.contains(e.target) && e.target !== inputNumber && e.target !== inputName) {
        autocompleteDropdown.classList.add('hidden');
    }
});

// Entry Form Submit
entryForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const num = inputNumber.value.trim();
    const name = inputName.value.trim();
    const qtyStr = inputQty.value.trim();
    const qty = parseFloat(qtyStr);

    if (!num || isNaN(qty)) return;

    if (editingItemId) {
        // Update existing item explicitly
        const index = stockItems.findIndex(i => i.id === editingItemId);
        if (index > -1) {
            stockItems[index].number = num;
            stockItems[index].name = name;
            stockItems[index].qty = qty;
            stockItems[index].synced = false;
            
            // Move to top since it was just edited
            const editedItem = stockItems.splice(index, 1)[0];
            stockItems.unshift(editedItem);
            
            await saveItems();
            renderList();
        }
        editingItemId = null;
    } else {
        await addOrUpdateItem(num, name, qty);
    }

    // Clear form and refocus
    inputNumber.value = '';
    inputName.value = '';
    inputQty.value = '';
    inputNumber.focus();
});

// Core Logic: Add or Update Item (Aggregation)
async function addOrUpdateItem(num, name, qty) {
    // Look for exact match (case insensitive)
    const matchIndex = stockItems.findIndex(item =>
        item.number.toLowerCase() === num.toLowerCase() &&
        (item.name || "").toLowerCase() === (name || "").toLowerCase()
    );

    if (matchIndex > -1) {
        // Aggregate
        const existingItem = stockItems[matchIndex];
        existingItem.qty += qty;
        existingItem.synced = false; // Need to resync because qty changed

        // Move to top
        stockItems.splice(matchIndex, 1);
        stockItems.unshift(existingItem);
    } else {
        // Create new
        const newItem = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
            number: num,
            name: name,
            qty: qty,
            mrp: "",
            remarks: "",
            synced: false
        };
        stockItems.unshift(newItem);
    }

    await saveItems();
    renderList();
}

async function saveItems() {
    try {
        await localforage.setItem('stock_items', stockItems);
        updateSyncBadge();
    } catch (err) {
        console.error("Save error", err);
    }
}

// Update Sync Badge
function updateSyncBadge() {
    const unsynced = stockItems.filter(i => !i.synced).length;
    syncCountBadge.textContent = unsynced;
    if (unsynced > 0) {
        syncCountBadge.classList.remove('hidden');
    } else {
        syncCountBadge.classList.add('hidden');
    }
}

// Render List
function renderList() {
    itemList.innerHTML = '';

    stockItems.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `bg-white p-3 rounded-xl shadow-sm border ${item.synced ? 'item-synced border-slate-200' : 'item-unsynced border-yellow-300'}`;

        itemDiv.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-lg font-mono text-slate-800 truncate">${escapeHtml(item.number)}</span>
                        ${item.synced
                ? '<svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
                : '<svg class="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
            }
                    </div>
                    <div class="text-sm text-slate-500 truncate">${escapeHtml(item.name || '---')}</div>
                </div>
                <div class="flex">
                    <button onclick="editItem('${item.id}')" class="ml-1 p-2 text-slate-400 hover:text-green-600 active:bg-green-50 rounded-full transition-colors" title="Edit">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                        </svg>
                    </button>
                    <button onclick="duplicateItem('${escapeHtml(item.number)}', '${escapeHtml(item.name)}')" class="ml-1 p-2 text-slate-400 hover:text-blue-600 active:bg-blue-50 rounded-full transition-colors" title="Duplicate">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                        </svg>
                    </button>
                </div>
            </div>
            
            <div class="flex space-x-2">
                <input type="number" value="${item.qty}" data-id="${item.id}" class="edit-qty w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-center font-bold focus:ring-1 focus:ring-blue-400 focus:outline-none">
                <input type="text" value="${escapeHtml(item.mrp || '')}" data-id="${item.id}" placeholder="MRP" class="edit-mrp w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-blue-400 focus:outline-none text-sm">
                <input type="text" value="${escapeHtml(item.remarks)}" data-id="${item.id}" placeholder="Remarks..." class="edit-remarks flex-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-blue-400 focus:outline-none text-sm">
            </div>
        `;
        itemList.appendChild(itemDiv);
    });

    // Attach listeners for inline editing
    document.querySelectorAll('.edit-qty').forEach(input => {
        input.addEventListener('change', async (e) => {
            const id = e.target.dataset.id;
            const newQty = parseFloat(e.target.value);
            if (!isNaN(newQty)) {
                await updateItemField(id, 'qty', newQty);
            }
        });
    });

    document.querySelectorAll('.edit-mrp').forEach(input => {
        input.addEventListener('change', async (e) => {
            const id = e.target.dataset.id;
            const newMrp = e.target.value;
            await updateItemField(id, 'mrp', newMrp);
        });
    });

    document.querySelectorAll('.edit-remarks').forEach(input => {
        input.addEventListener('change', async (e) => {
            const id = e.target.dataset.id;
            const newRemarks = e.target.value;
            await updateItemField(id, 'remarks', newRemarks);
        });
    });
}

// Duplicate logic
window.duplicateItem = (num, name) => {
    inputNumber.value = num;
    inputName.value = name;
    inputQty.value = '';
    inputQty.focus();
};

// Edit logic (Pop item back to form)
window.editItem = async (id) => {
    const index = stockItems.findIndex(i => i.id === id);
    if (index > -1) {
        const item = stockItems[index];
        inputNumber.value = item.number;
        inputName.value = item.name;
        inputQty.value = item.qty;
        
        editingItemId = id; // Set global flag so submit updates it
        inputNumber.focus(); 
    }
};

async function updateItemField(id, field, value) {
    const item = stockItems.find(i => i.id === id);
    if (item) {
        if (item[field] !== value) {
            item[field] = value;
            item.synced = false; // Mark unsynced on edit
            await saveItems();
            renderList();
        }
    }
}

// Utility to escape HTML and prevent XSS
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- SYNC LOGIC (BATCHES OF 10) ---
btnSync.addEventListener('click', async () => {
    await performSync();
});

async function performSync() {
    if (isSyncing) return;

    if (GAS_URL === "YOUR_WEB_APP_URL_HERE") {
        showToast("Please configure GAS_URL in app.js");
        return;
    }

    const unsynced = stockItems.filter(i => !i.synced);
    if (unsynced.length === 0) {
        showToast("Everything is synced!");
        return;
    }

    const name = localStorage.getItem('session_name');
    const dept = localStorage.getItem('session_dept');

    isSyncing = true;
    btnSync.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Syncing...`;

    // Process in batches of 10
    await processSyncBatches(unsynced, name, dept);

    isSyncing = false;
    btnSync.innerHTML = `Sync <span id="sync-count" class="ml-1 bg-red-500 rounded-full px-1.5 py-0.5 text-xs hidden">0</span>`;
    updateSyncBadge();
}

async function processSyncBatches(unsyncedItems, name, dept) {
    const batchSize = 10;
    let successCount = 0;

    for (let i = 0; i < unsyncedItems.length; i += batchSize) {
        const batch = unsyncedItems.slice(i, i + batchSize);
        const payload = {
            name: name,
            department: dept,
            items: batch
        };

        try {
            const response = await fetch(GAS_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8',
                    // Note: GAS doPost handles plain text better for CORS without complex preflight
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("Network response was not ok");

            const result = await response.json();

            if (result.status === 'success') {
                // Mark batch as synced ONLY if data hasn't been edited during sync
                batch.forEach(bItem => {
                    const idx = stockItems.findIndex(si => si.id === bItem.id);
                    if (idx > -1) {
                        const currentItem = stockItems[idx];
                        // If the user modified any field while this fetch was in flight, leave it as unsynced
                        if (currentItem.qty === bItem.qty && 
                            currentItem.mrp === bItem.mrp && 
                            currentItem.remarks === bItem.remarks &&
                            currentItem.number === bItem.number &&
                            currentItem.name === bItem.name) {
                            currentItem.synced = true;
                        }
                    }
                });
                await saveItems();
                renderList();
                successCount += batch.length;
            } else {
                throw new Error(result.message || "Unknown GAS error");
            }

        } catch (error) {
            console.error("Sync Error:", error);
            showToast(`Sync failed at batch ${Math.floor(i / batchSize) + 1}. Retrying later.`);
            break; // Stop processing further batches if one fails
        }
    }

    if (successCount > 0) {
        showToast(`Successfully synced ${successCount} items.`);
    }
}

// --- CSV EXPORT LOGIC (NO DEPENDENCIES) ---
btnExport.addEventListener('click', async () => {
    if (stockItems.length === 0) {
        showToast("No data to export");
        return;
    }

    // CSV Headers
    const headers = ["ID", "Number/Code", "Brand/Design Name", "Qty", "MRP", "Remarks", "Synced"];

    // Convert data to CSV format
    const csvRows = [];
    csvRows.push(headers.join(',')); // Add headers

    stockItems.forEach(item => {
        // Escape quotes by doubling them, wrap in quotes if contains comma
        const row = [
            item.id,
            `"${(item.number || '').replace(/"/g, '""')}"`,
            `"${(item.name || '').replace(/"/g, '""')}"`,
            item.qty,
            `"${(item.mrp || '').replace(/"/g, '""')}"`,
            `"${(item.remarks || '').replace(/"/g, '""')}"`,
            item.synced
        ];
        csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `Stock_Export_${dateStr}.csv`;

    const file = new File([blob], fileName, { type: 'text/csv' });

    // Try Web Share API first (Mobile prompt for WhatsApp)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                title: 'Stock Export',
                text: 'Here is the latest stock export CSV file.',
                files: [file]
            });
            showToast("Shared successfully!");
            return;
        } catch (error) {
            console.log("Share cancelled or failed", error);
            // Fallthrough to manual download
        }
    }

    // Fallback: Create download link
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("Exported to CSV!");
});

// Boot
initApp();
