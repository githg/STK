// app.js

const GAS_URL = "https://script.google.com/macros/s/AKfycbwWAQkT-9QVAAPiehDYeU3jIEDRGO4XlvFgBmg9cpyoGGUM1xYwUO0BhbDAYR7K-orQ/exec"; // User to replace this

// DOM Elements
const viewInit = document.getElementById('view-init');
const viewMain = document.getElementById('view-main');
const initForm = document.getElementById('init-form');
const initName = document.getElementById('init-name');
const initDept = document.getElementById('init-dept');
const headerSession = document.getElementById('header-session');
const btnSync = document.getElementById('btn-sync');
const btnClose = document.getElementById('btn-close') || document.getElementById('btn-exit');
const btnExport = document.getElementById('btn-export');
const syncCountBadge = document.getElementById('sync-count');
const entryForm = document.getElementById('entry-form');
const inputNumber = document.getElementById('input-number');
const inputName = document.getElementById('input-name');
const inputQty = document.getElementById('input-qty');
const itemList = document.getElementById('item-list');
const toastEl = document.getElementById('toast');

// State
let stockItems = [];
let isSyncing = false;

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
    });
}

// Init Form Submit
initForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = initName.value.trim();
    const dept = initDept.value.trim();
    if (name && dept) {
        localStorage.setItem('session_name', name);
        localStorage.setItem('session_dept', dept);
        showMainApp(name, dept);
    }
});

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

// Entry Form Submit
entryForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const num = inputNumber.value.trim();
    const name = inputName.value.trim();
    const qtyStr = inputQty.value.trim();
    const qty = parseFloat(qtyStr);

    if (!num || isNaN(qty)) return;

    await addOrUpdateItem(num, name, qty);

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
            ui_sn: stockItems.length + 1,
            number: num,
            name: name,
            qty: qty,
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
        
        // Remove item from list
        stockItems.splice(index, 1);
        await saveItems();
        renderList();
        inputQty.focus(); // Focus qty to let them finish editing quickly
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
                // Mark batch as synced
                batch.forEach(bItem => {
                    const idx = stockItems.findIndex(si => si.id === bItem.id);
                    if (idx > -1) stockItems[idx].synced = true;
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
    const headers = ["ID", "SN", "Number", "Name", "Qty", "Remarks", "Synced"];

    // Convert data to CSV format
    const csvRows = [];
    csvRows.push(headers.join(',')); // Add headers

    stockItems.forEach(item => {
        // Escape quotes by doubling them, wrap in quotes if contains comma
        const row = [
            item.id,
            item.ui_sn,
            `"${(item.number || '').replace(/"/g, '""')}"`,
            `"${(item.name || '').replace(/"/g, '""')}"`,
            item.qty,
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
