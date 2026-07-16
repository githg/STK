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
const initRolls = document.getElementById('init-rolls');
const rollsContainer = document.getElementById('rolls-container');
const inputRolls = document.getElementById('input-rolls');

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

    const activeName = localStorage.getItem('session_name');
    const activeDept = localStorage.getItem('session_dept');
    const activeRolls = localStorage.getItem('session_rolls') === 'true';
    if (activeName && activeDept) {
        if (activeRolls) {
            initRolls.checked = true;
            rollsContainer.classList.remove('hidden');
        }
        showMainApp(activeName, activeDept);
    } else {
        viewInit.classList.remove('hidden');
        viewMain.classList.add('hidden');
        renderRecentSessions();
    }

    // Load data from IndexedDB
    try {
        const storedItems = await localforage.getItem('stock_items');
        if (storedItems) {
            // Backfill schema for old data
            stockItems = storedItems.map(item => {
                if (!item.session_name) item.session_name = localStorage.getItem('session_name') || "";
                if (!item.session_dept) item.session_dept = localStorage.getItem('session_dept') || "";
                return item;
            });
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

// Close Session (syncs in background, instantly closes UI)
if (btnClose) {
    btnClose.addEventListener('click', () => {
        localStorage.removeItem('session_name');
        localStorage.removeItem('session_dept');
        localStorage.removeItem('session_rolls');
        viewInit.classList.remove('hidden');
        viewMain.classList.add('hidden');
        initName.value = '';
        initDept.value = '';
        initRolls.checked = false;
        renderRecentSessions();
        // Trigger background sync without awaiting
        performSync();
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
                <div class="flex items-center">
                    <div class="sync-indicator"></div>
                    <svg class="w-5 h-5 text-slate-400 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </div>
            `;
            
            const pendingCount = stockItems.filter(i => !i.synced && i.session_name === session.name && i.session_dept === session.dept).length;
            const indicatorContainer = btn.querySelector('.sync-indicator');
            
            if (pendingCount > 0) {
                indicatorContainer.innerHTML = `<span class="px-2 py-1 bg-red-100 text-red-600 rounded-lg text-xs font-bold border border-red-200 animate-pulse hover:bg-red-200 transition-colors">Sync (${pendingCount})</span>`;
                indicatorContainer.onclick = (e) => {
                    e.stopPropagation();
                    indicatorContainer.innerHTML = `<span class="px-2 py-1 bg-green-500 text-white rounded-lg text-xs font-bold animate-pulse">Syncing...</span>`;
                    performSync(session.name, session.dept);
                };
            }
            
            btn.onclick = () => {
                initName.value = session.name;
                initDept.value = session.dept;
                // Crucial fix: restore rolls setting from history
                initRolls.checked = session.rolls === true;
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
        localStorage.setItem('session_rolls', initRolls.checked ? 'true' : 'false');
        
        if (initRolls.checked) {
            rollsContainer.classList.remove('hidden');
        } else {
            rollsContainer.classList.add('hidden');
            inputRolls.value = '';
        }
        
        // Save to history
        const historyJson = localStorage.getItem('session_history');
        let history = historyJson ? JSON.parse(historyJson) : [];
        const existingIdx = history.findIndex(s => s.name === name && s.dept === dept);
        if (existingIdx > -1) history.splice(existingIdx, 1);
        history.unshift({ name, dept, rolls: initRolls.checked }); // Save rolls state
        if (history.length > 5) history.pop();
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
        if (localStorage.getItem('session_rolls') === 'true') {
            inputRolls.focus();
        } else {
            inputQty.focus();
        }
    }
});
inputRolls.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        inputQty.focus();
    }
});
// inputQty enter key is naturally handled by the form submit

// Autocomplete Logic
function updateAutocomplete() {
    if (!autocompleteDropdown) return;
    if (editingItemId) {
        autocompleteDropdown.classList.add('hidden');
        return;
    }
    
    const activeEl = document.activeElement;
    const numQuery = inputNumber.value.trim().toLowerCase();
    const nameQuery = inputName.value.trim().toLowerCase();

    autocompleteDropdown.innerHTML = '';

    if (activeEl === inputNumber) {
        // Suggest ONLY Numbers
        if (!numQuery) {
            autocompleteDropdown.classList.add('hidden');
            return;
        }
        
        const uniqueNums = new Map();
        for (const item of stockItems) {
            const nl = String(item.number).toLowerCase();
            if (!uniqueNums.has(nl)) uniqueNums.set(nl, String(item.number));
        }
        
        const matchedNums = Array.from(uniqueNums.values()).filter(n => 
            n.toLowerCase().includes(numQuery) && n.toLowerCase() !== numQuery
        );
        
        if (matchedNums.length === 0) {
            autocompleteDropdown.classList.add('hidden');
            return;
        }

        matchedNums.slice(0, 8).forEach(numStr => {
            const div = document.createElement('div');
            div.className = "px-4 py-3 cursor-pointer hover:bg-slate-200 active:bg-slate-300 transition-colors flex items-center";
            div.innerHTML = `<span class="px-2 py-1 bg-slate-200 text-slate-800 font-mono font-bold rounded text-sm shadow-sm border border-slate-300"># ${escapeHtml(numStr)}</span>`;
            
            const applyVal = (e) => {
                e.preventDefault(); 
                inputNumber.value = numStr;
                autocompleteDropdown.classList.add('hidden');
                inputName.focus();
            };
            div.addEventListener('mousedown', applyVal);
            div.addEventListener('touchstart', applyVal, {passive: false});
            autocompleteDropdown.appendChild(div);
        });
        autocompleteDropdown.classList.remove('hidden');

    } else if (activeEl === inputName) {
        // Suggest ONLY Names
        if (!nameQuery) {
            autocompleteDropdown.classList.add('hidden');
            return;
        }

        const nameMap = new Map(); // lowercase name -> { original, relatedNumbers }
        for (const item of stockItems) {
            if (!item.name) continue;
            const nameLower = String(item.name).toLowerCase();
            if (!nameMap.has(nameLower)) {
                nameMap.set(nameLower, { name: String(item.name), numbers: new Set() });
            }
            nameMap.get(nameLower).numbers.add(String(item.number).toLowerCase());
        }

        let matchedNames = Array.from(nameMap.values()).filter(obj => 
            obj.name.toLowerCase().includes(nameQuery) && obj.name.toLowerCase() !== nameQuery
        );

        // Sort prioritizing names associated with the CURRENTLY entered number
        matchedNames.sort((a, b) => {
            const aHas = numQuery && a.numbers.has(numQuery) ? 1 : 0;
            const bHas = numQuery && b.numbers.has(numQuery) ? 1 : 0;
            return bHas - aHas;
        });

        if (matchedNames.length === 0) {
            autocompleteDropdown.classList.add('hidden');
            return;
        }

        matchedNames.slice(0, 8).forEach(obj => {
            const div = document.createElement('div');
            // If it's a prioritized match, give it a slightly different background highlight
            const isPriority = numQuery && obj.numbers.has(numQuery);
            const bgClass = isPriority ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-blue-50";
            
            div.className = `px-4 py-3 cursor-pointer active:bg-blue-200 transition-colors flex items-center ${bgClass}`;
            div.innerHTML = `<span class="text-blue-700 font-semibold truncate">${escapeHtml(obj.name)}</span>`;
            if (isPriority) {
                div.innerHTML += `<span class="ml-auto text-xs text-blue-500 font-bold bg-blue-100 px-2 py-0.5 rounded-full">Suggested</span>`;
            }
            
            const applyVal = (e) => {
                e.preventDefault(); 
                inputName.value = obj.name;
                autocompleteDropdown.classList.add('hidden');
                if (localStorage.getItem('session_rolls') === 'true') {
                    inputRolls.focus();
                } else {
                    inputQty.focus();
                }
            };
            div.addEventListener('mousedown', applyVal);
            div.addEventListener('touchstart', applyVal, {passive: false});
            autocompleteDropdown.appendChild(div);
        });
        autocompleteDropdown.classList.remove('hidden');

    } else {
        autocompleteDropdown.classList.add('hidden');
    }
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
    const qty = parseFloat(inputQty.value);
    
    let rolls = 0;
    const isRollsEnabled = localStorage.getItem('session_rolls') === 'true';
    if (isRollsEnabled) {
        rolls = parseFloat(inputRolls.value);
        if (isNaN(rolls)) {
            rolls = qty > 0 ? 1 : 0;
        }
    }

    if (num && !isNaN(qty)) {
        if (editingItemId) {
            // Update existing item explicitly
            const index = stockItems.findIndex(i => i.id === editingItemId);
            if (index > -1) {
                stockItems[index].number = num;
                stockItems[index].name = name;
                stockItems[index].qty = qty;
                if (isRollsEnabled) stockItems[index].rolls = rolls;
                stockItems[index].synced = false;
                
                // Move to top since it was just edited
                const editedItem = stockItems.splice(index, 1)[0];
                stockItems.unshift(editedItem);
                
                await saveItems();
                renderList();
            }
            editingItemId = null;
        } else {
            await addOrUpdateItem(num, name, qty, rolls);
        }

        // Reset form
        inputNumber.value = '';
        inputName.value = '';
        inputQty.value = '';
        if (isRollsEnabled) inputRolls.value = '';
        inputNumber.focus();
    }
});

// Core Logic: Add or Update Item (Aggregation)
async function addOrUpdateItem(num, name, qty, rolls = 0) {
    // Look for exact match (case insensitive)
    const matchIndex = stockItems.findIndex(item =>
        String(item.number).toLowerCase() === String(num).toLowerCase() &&
        String(item.name || "").toLowerCase() === String(name || "").toLowerCase()
    );

    const isRollsEnabled = localStorage.getItem('session_rolls') === 'true';

    if (matchIndex > -1) {
        // Aggregate
        const existingItem = stockItems[matchIndex];
        existingItem.qty += qty;
        if (isRollsEnabled) {
            existingItem.rolls = (parseFloat(existingItem.rolls) || 0) + rolls;
        }
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
            rolls: isRollsEnabled ? rolls : "",
            mrp: "",
            remarks: "",
            synced: false,
            session_name: localStorage.getItem('session_name') || "",
            session_dept: localStorage.getItem('session_dept') || ""
        };
        stockItems.unshift(newItem);
    }

    await saveItems();
    renderList();

    // Auto-sync every 10th unsynced item
    const unsyncedCount = stockItems.filter(i => !i.synced).length;
    if (unsyncedCount > 0 && unsyncedCount % 10 === 0 && !isSyncing) {
        performSync();
    }
}

async function saveItems() {
    try {
        await localforage.setItem('stock_items', stockItems);
        updateSyncBadge();
    } catch (err) {
        console.error("Save error", err);
    }
}

// Update Sync Badge (Internal span in the sync button)
function updateSyncBadge() {
    const syncCountBadge = document.getElementById('sync-count');
    if (!syncCountBadge) return;
    const unsynced = stockItems.filter(i => !i.synced).length;
    syncCountBadge.textContent = unsynced;
    if (unsynced > 0) {
        syncCountBadge.classList.remove('hidden');
    } else {
        syncCountBadge.classList.hidden = true;
        syncCountBadge.classList.add('hidden');
    }
}

// Render List
function renderList() {
    itemList.innerHTML = '';

    stockItems.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = "bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 transition-all hover:shadow-md relative overflow-hidden";
        if (editingItemId === item.id) {
            itemDiv.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50');
        }
        
        const isRollsEnabled = localStorage.getItem('session_rolls') === 'true';
        let rollsHtml = '';
        if (isRollsEnabled) {
            rollsHtml = `
            <div class="w-16 shrink-0">
                <input type="number" class="w-full text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400 focus:bg-white transition-colors text-center" placeholder="Rolls" value="${escapeHtml(item.rolls || '')}" onchange="updateItemField('${item.id}', 'rolls', this.value)">
            </div>
            `;
        }

        itemDiv.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div class="flex flex-col min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                        <span class="font-mono font-bold text-slate-800 text-lg sm:text-xl truncate"># ${escapeHtml(item.number)}</span>
                        ${item.synced
                ? '<svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
                : '<svg class="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
            }
                    </div>
                    <span class="text-blue-700 font-semibold truncate text-sm sm:text-base">${escapeHtml(item.name || '---')}</span>
                </div>
                <div class="flex items-center space-x-3 ml-2 shrink-0">
                    <div class="text-right">
                        <span class="block text-2xl sm:text-3xl font-black text-slate-800 tracking-tight leading-none">${item.qty}</span>
                        <span class="block text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">Qty</span>
                    </div>
                    <button class="p-2 text-blue-600 hover:bg-blue-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400" onclick="editItem('${item.id}')" title="Edit Item">
                        <svg class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                </div>
            </div>
            <div class="flex space-x-2 mt-3 pt-3 border-t border-slate-100">
                ${rollsHtml}
                <div class="w-24 shrink-0">
                    <input type="text" class="w-full text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors" placeholder="MRP" value="${escapeHtml(item.mrp || '')}" onchange="updateItemField('${item.id}', 'mrp', this.value)">
                </div>
                <div class="flex-1 min-w-0">
                    <input type="text" class="w-full text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors" placeholder="Remarks..." value="${escapeHtml(item.remarks || '')}" onchange="updateItemField('${item.id}', 'remarks', this.value)">
                </div>
            </div>
        `;
        itemList.appendChild(itemDiv);
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
        const itemToEdit = stockItems[index];
        inputNumber.value = itemToEdit.number;
        inputName.value = itemToEdit.name || "";
        inputQty.value = itemToEdit.qty;
        
        if (localStorage.getItem('session_rolls') === 'true') {
            inputRolls.value = itemToEdit.rolls || "";
        }
        
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

// --- SYNC LOGIC ---
btnSync.addEventListener('click', async () => {
    await performSync();
});

// Update Sync Button State (Colors & Animation)
function updateSyncButtonState(state) {
    if (!btnSync) return;
    
    // Reset classes
    btnSync.className = "flex items-center font-bold px-3 py-1.5 rounded-lg border border-transparent transition-all shadow-sm";
    
    if (state === 'syncing') {
        btnSync.classList.add('bg-green-500', 'text-white', 'animate-pulse');
        btnSync.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Syncing`;
    } else if (state === 'synced') {
        btnSync.classList.add('bg-green-600', 'text-white');
        btnSync.innerHTML = `Synced <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
    } else if (state === 'failed') {
        btnSync.classList.add('bg-red-500', 'text-white', 'animate-pulse');
        btnSync.innerHTML = `Sync <span id="sync-count" class="ml-1 bg-red-700 rounded-full px-1.5 py-0.5 text-xs hidden"></span>`;
        updateSyncBadge(); // Populates count
    } else {
        // default (unsynced items exist but not failed yet)
        btnSync.classList.add('bg-yellow-500', 'text-slate-900', 'hover:bg-yellow-400');
        btnSync.innerHTML = `Sync <span id="sync-count" class="ml-1 bg-yellow-700 text-white rounded-full px-1.5 py-0.5 text-xs hidden"></span>`;
        updateSyncBadge();
    }
}

async function performSync(specificSessionName = null, specificSessionDept = null) {
    if (isSyncing) return;

    if (GAS_URL === "YOUR_WEB_APP_URL_HERE") {
        showToast("Please configure GAS_URL in app.js");
        return;
    }

    let unsynced = stockItems.filter(i => !i.synced);
    
    // If we only want to sync a specific session (from login screen)
    if (specificSessionName !== null && specificSessionDept !== null) {
        unsynced = unsynced.filter(i => i.session_name === specificSessionName && i.session_dept === specificSessionDept);
    }

    if (unsynced.length === 0) {
        updateSyncButtonState('synced');
        return;
    }

    isSyncing = true;
    updateSyncButtonState('syncing');

    // Group unsynced items by their explicit session tags to prevent cross-session leakage
    const groups = {};
    unsynced.forEach(item => {
        const sName = item.session_name || "Unknown";
        const sDept = item.session_dept || "Unknown";
        const key = `${sName}|${sDept}`;
        if (!groups[key]) groups[key] = { name: sName, dept: sDept, items: [] };
        groups[key].items.push(item);
    });

    let hasError = false;

    // Process each session's batch separately
    for (const key in groups) {
        const group = groups[key];
        try {
            await processSyncBatches(group.items, group.name, group.dept);
        } catch (error) {
            console.error("Sync Error for group:", key, error);
            hasError = true;
        }
    }

    isSyncing = false;
    
    // After attempting, check if there are still global unsynced items
    const remainingUnsynced = stockItems.filter(i => !i.synced).length;
    if (hasError || remainingUnsynced > 0) {
        updateSyncButtonState('failed');
    } else {
        updateSyncButtonState('synced');
    }
    
    // Re-render recent sessions to update any sync badges on the login screen
    if (viewInit && !viewInit.classList.contains('hidden')) {
        renderRecentSessions();
    }
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

        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
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
                        String(currentItem.number) === String(bItem.number) &&
                        String(currentItem.name) === String(bItem.name)) {
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
    }

    if (successCount > 0) {
        showToast(`Successfully synced ${successCount} items for ${name}.`);
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
