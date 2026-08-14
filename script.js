const STORAGE_KEY = 'stationaryDashboardRecords';
let currentItems = [];

// Firebase / multi-user state
let useFirebase = false;
let firebaseMode = 'unknown'; // unknown, pending, cloud, local
let firebaseRecordsLoaded = false;
let db = null;
let remoteRecordsCache = [];
let recordsListener = null;
let usersListener = null;
let userPresenceDoc = null;

const elements = {
    productName: document.getElementById('product-name'),
    productPrice: document.getElementById('product-price'),
    productQuantity: document.getElementById('product-quantity'),
    paymentMethod: document.getElementById('payment-method'),
    splitFields: document.getElementById('split-payment-fields'),
    splitCash: document.getElementById('split-cash'),
    splitGpay: document.getElementById('split-gpay'),
    addItemButton: document.getElementById('add-item-button'),
    saveTransactionButton: document.getElementById('save-transaction-button'),
    currentItemsBody: document.getElementById('current-items-body'),
    itemCount: document.getElementById('item-count'),
    transactionTotal: document.getElementById('transaction-total'),
    recordsBody: document.getElementById('records-body'),
    exportCsvButton: document.getElementById('export-csv-button'),
    clearRecordsButton: document.getElementById('clear-records-button'),
    todayRevenue: document.getElementById('today-revenue'),
    periodRevenue: document.getElementById('period-revenue'),
    periodSelect: document.getElementById('period-select'),
    todaySparkline: document.getElementById('today-sparkline'),
    periodChart: document.getElementById('period-chart'),
    todayCount: document.getElementById('today-count'),
    splitCount: document.getElementById('split-count'),
    analysisBody: document.getElementById('analysis-body'),
    paymentBreakdown: document.getElementById('payment-breakdown'),
    chartTooltip: document.getElementById('chart-tooltip'),
    themeToggleButton: document.getElementById('theme-toggle-btn'),
    tabButtons: document.querySelectorAll('.tab-button')
};

function getClientId() {
    let id = window.localStorage.getItem('stationaryClientId');
    if (!id) {
        id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `client-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        window.localStorage.setItem('stationaryClientId', id);
    }
    return id;
}

function getRecords() {
    if (firebaseMode === 'cloud') {
        return remoteRecordsCache.slice();
    }
    if (firebaseMode === 'pending') {
        return [];
    }
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (error) {
        console.error('Unable to load records', error);
        return [];
    }
}

function isFirebaseReady() {
    return useFirebase && firebaseRecordsLoaded;
}

function saveRecords(records) {
    if (useFirebase) {
        // not used when Firebase is enabled; records are stored remotely
        return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function formatCurrency(value) {
    return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function applyTheme(theme) {
    document.body.classList.toggle('dark-mode', theme === 'dark');
    if (elements.themeToggleButton) {
        elements.themeToggleButton.textContent = theme === 'dark' ? '🌙' : '☀️';
        elements.themeToggleButton.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
    window.localStorage.setItem('stationaryTheme', theme);
}

function toggleTheme() {
    const current = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

function initTheme() {
    const savedTheme = window.localStorage.getItem('stationaryTheme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
        applyTheme(savedTheme);
        return;
    }

    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
}
window.initTheme = initTheme;
window.toggleTheme = toggleTheme;

function updatePaymentInputs() {
    const isSplit = elements.paymentMethod.value === 'split';
    elements.splitFields.classList.toggle('hidden', !isSplit);
}

function calculateTransactionTotal() {
    return currentItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function renderCurrentItems() {
    elements.currentItemsBody.innerHTML = '';

    if (currentItems.length === 0) {
        elements.currentItemsBody.innerHTML = '<tr><td class="table-light" colspan="5">No items added yet.</td></tr>';
        elements.itemCount.textContent = '0';
        elements.transactionTotal.textContent = formatCurrency(0);
        return;
    }

    currentItems.forEach((item, index) => {
        const row = document.createElement('tr');
        const itemTotal = item.price * item.quantity;
        row.innerHTML = `
            <td>${item.name}</td>
            <td>${item.quantity}</td>
            <td>${formatCurrency(item.price)}</td>
            <td>${formatCurrency(itemTotal)}</td>
            <td><button class="secondary-button" data-remove="${index}">Remove</button></td>
        `;
        elements.currentItemsBody.appendChild(row);
    });

    elements.itemCount.textContent = currentItems.length.toString();
    elements.transactionTotal.textContent = formatCurrency(calculateTransactionTotal());
}

function clearTransactionForm() {
    elements.productName.value = '';
    elements.productPrice.value = '';
    elements.productQuantity.value = '1';
    elements.paymentMethod.value = 'cash';
    elements.splitCash.value = '';
    elements.splitGpay.value = '';
    updatePaymentInputs();
    currentItems = [];
    renderCurrentItems();
}

function addItem(event) {
    event.preventDefault();
    const name = elements.productName.value.trim();
    const price = Number(elements.productPrice.value);
    const quantity = Number(elements.productQuantity.value);

    if (!name) {
        alert('Enter a product name before adding.');
        return;
    }
    if (!price || price <= 0) {
        alert('Enter a valid price greater than 0.');
        return;
    }
    if (!quantity || quantity < 1) {
        alert('Enter a valid quantity of at least 1.');
        return;
    }

    currentItems.push({ name, price, quantity });
    renderCurrentItems();
    elements.productName.value = '';
    elements.productPrice.value = '';
    elements.productQuantity.value = '1';
}

function removeCurrentItem(index) {
    currentItems.splice(index, 1);
    renderCurrentItems();
}

function buildPaymentData(total) {
    const method = elements.paymentMethod.value;
    let cashAmount = 0;
    let gpayAmount = 0;

    if (method === 'cash') {
        cashAmount = total;
    } else if (method === 'gpay') {
        gpayAmount = total;
    } else {
        cashAmount = Number(elements.splitCash.value);
        gpayAmount = Number(elements.splitGpay.value);
    }

    return { method, cashAmount, gpayAmount };
}

function validatePayment(total) {
    const { method, cashAmount, gpayAmount } = buildPaymentData(total);

    if (method === 'split') {
        if (cashAmount <= 0 || gpayAmount <= 0) {
            alert('For split payments, enter both cash and GPay amounts.');
            return false;
        }
        if (Math.abs(cashAmount + gpayAmount - total) > 0.009) {
            alert('Split amounts must add up to the transaction total.');
            return false;
        }
    }
    return true;
}

function saveTransaction(event) {
    event.preventDefault();

    if (currentItems.length === 0) {
        alert('Add at least one item before saving the transaction.');
        return;
    }

    const total = calculateTransactionTotal();
    if (!validatePayment(total)) {
        return;
    }

    const { method, cashAmount, gpayAmount } = buildPaymentData(total);
    const record = {
        // client id; server will also add timestamp if using Firestore
        id: Date.now().toString() + Math.floor(Math.random() * 9999).toString(),
        createdAt: new Date().toISOString(),
        items: [...currentItems],
        total,
        paymentMethod: method,
        cashAmount,
        gpayAmount,
        createdBy: window.localStorage.getItem('stationaryUserName') || null
    };

    if (useFirebase && db) {
        db.collection('records').add(record).then(() => {
            clearTransactionForm();
            alert('Transaction saved to cloud successfully.');
        }).catch(err => {
            console.error('Failed to save remote record', err);
            const message = err && err.message ? err.message : String(err);
            alert('Failed to save remotely: ' + message + '. Saving locally instead.');

            const isPermissionError = err && (err.code === 'permission-denied' || err.code === 'auth/permission-denied');
            if (isPermissionError) {
                useFirebase = false;
                firebaseMode = 'local';
                db = null;
                updateFirebaseStatus('Local mode (cloud write denied)', 'status-local');
            } else {
                updateFirebaseStatus('Write failed', 'status-error');
            }

            const records = getRecords();
            records.unshift(record);
            saveRecords(records);
            clearTransactionForm();
            renderRecords();
            renderDashboard();
        });
    } else {
        const records = getRecords();
        records.unshift(record);
        saveRecords(records);
        clearTransactionForm();
        renderRecords();
        renderDashboard();
        alert('Transaction saved locally.');
    }
}

function renderRecords() {
    if (firebaseMode === 'pending') {
        elements.recordsBody.innerHTML = '<tr class="empty-row"><td colspan="6">Waiting for cloud sync...</td></tr>';
        return;
    }

    const records = getRecords();
    elements.recordsBody.innerHTML = '';

    if (records.length === 0) {
        elements.recordsBody.innerHTML = '<tr class="table-light"><td class= "table-light"colspan="6">No records available yet.</td></tr>';
        return;
    }

    records.forEach(record => {
        const row = document.createElement('tr');
        const itemsLabel = (record.items || []).map(item => `${item.name} (${item.quantity})`).join(', ');
        const createdBy = record.createdBy ? ` • ${record.createdBy}` : '';
        row.innerHTML = `
            <td class="table-light">${formatDate(record.createdAt)}${createdBy}</td>
            <td class="table-light">${itemsLabel}</td>
            <td class="table-light">${formatCurrency(record.total)}</td>
            <td class="table-light">${record.paymentMethod === 'split' ? 'Split' : record.paymentMethod}</td>
            <td class="table-light">${formatCurrency(record.cashAmount)}</td>
            <td class="table-light">${formatCurrency(record.gpayAmount)}</td>
        `;
        elements.recordsBody.appendChild(row);
    });
}

function calculatePeriodTotals(records, period) {
    const now = new Date();
    const periodMillis = period === 'monthly' ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    const threshold = new Date(now.getTime() - periodMillis);
    const result = {
        revenue: 0,
        count: 0
    };

    records.forEach(record => {
        const recordDate = new Date(record.createdAt);
        if (recordDate >= threshold && recordDate <= now) {
            result.revenue += record.total;
            result.count += 1;
        }
    });

    return result;
}

function updateDashboardCards(records) {
    const today = new Date();

    const isSameDay = (dateA, dateB) => {
        return dateA.getFullYear() === dateB.getFullYear() &&
            dateA.getMonth() === dateB.getMonth() &&
            dateA.getDate() === dateB.getDate();
    };

    let todayRevenue = 0;
    let todayTransactions = 0;
    let splitPayments = 0;
    let totalCash = 0;
    let totalGpay = 0;

    records.forEach(record => {
        const recordDate = new Date(record.createdAt);
        if (isSameDay(recordDate, today)) {
            todayRevenue += record.total;
            todayTransactions += 1;
        }
        if (record.paymentMethod === 'split') {
            splitPayments += 1;
        }
        totalCash += record.cashAmount;
        totalGpay += record.gpayAmount;
    });

    const selectedPeriod = elements.periodSelect.value;
    const periodTotals = calculatePeriodTotals(records, selectedPeriod);

    elements.todayRevenue.textContent = formatCurrency(todayRevenue);
    elements.periodRevenue.textContent = formatCurrency(periodTotals.revenue);
    elements.todayCount.textContent = todayTransactions.toString();
    elements.splitCount.textContent = splitPayments.toString();
    if (elements.paymentBreakdown) {
        elements.paymentBreakdown.textContent = `Cash collected: ${formatCurrency(totalCash)} · GPay collected: ${formatCurrency(totalGpay)}`;
    }
}

function renderAnalysisTable(records) {
    elements.analysisBody.innerHTML = '';

    if (records.length === 0) {
        elements.analysisBody.innerHTML = '<tr class="empty-row"><td colspan="4">No records available yet.</td></tr>';
        return;
    }

    records.slice(0, 10).forEach(record => {
        const row = document.createElement('tr');
        const itemCount = record.items.reduce((sum, item) => sum + item.quantity, 0);
        row.innerHTML = `
            <td class = "table-light">${formatDate(record.createdAt)}</td>
            <td class = "table-light">${formatCurrency(record.total)}</td>
            <td class = "table-light">${record.paymentMethod === 'split' ? 'Split' : record.paymentMethod}</td>
            <td class = "table-light">${itemCount} items</td>
        `;
        elements.analysisBody.appendChild(row);
    });
}

function getDailySales(records, days) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayList = [];

    for (let index = days - 1; index >= 0; index -= 1) {
        const date = new Date(today);
        date.setDate(today.getDate() - index);
        const key = date.toISOString().slice(0, 10);
        dayList.push({ date, key, total: 0, transactions: 0, itemCount: 0 });
    }

    const totalsByDate = dayList.reduce((acc, item) => {
        acc[item.key] = item;
        return acc;
    }, {});

    records.forEach(record => {
        const recordDate = new Date(record.createdAt);
        const key = recordDate.toISOString().slice(0, 10);
        if (totalsByDate[key]) {
            totalsByDate[key].total += record.total;
            totalsByDate[key].transactions += 1;
            totalsByDate[key].itemCount += (record.items || []).reduce((sum, item) => sum + item.quantity, 0);
        }
    });

    return dayList;
}

function renderPeriodChart(records, period) {
    const days = period === 'monthly' ? 30 : 7;
    const dailySales = getDailySales(records, days);
    const maxValue = Math.max(...dailySales.map(day => day.total), 10);
    const tickCount = 5;

    elements.periodChart.innerHTML = '';
    const tooltip = elements.chartTooltip;
    const todayKey = new Date().toISOString().slice(0, 10);

    if (tooltip) {
        tooltip.className = 'chart-tooltip hidden';
        tooltip.innerHTML = '';
    }

    const chartPlot = document.createElement('div');
    chartPlot.className = 'chart-plot';

    const yAxis = document.createElement('div');
    yAxis.className = 'chart-y-axis';
    const yAxisTitle = document.createElement('span');
    yAxisTitle.className = 'chart-axis-title';
    yAxisTitle.textContent = 'Price';
    yAxis.appendChild(yAxisTitle);
    for (let index = tickCount; index >= 0; index -= 1) {
        const tickValue = Math.round((maxValue / tickCount) * index);
        const tickLabel = document.createElement('span');
        tickLabel.textContent = formatCurrency(tickValue);
        yAxis.appendChild(tickLabel);
    }

    const columnsWrapper = document.createElement('div');
    columnsWrapper.className = 'chart-columns';

    dailySales.forEach(day => {
        const column = document.createElement('div');
        column.className = 'bar-column';
        const height = maxValue > 0 ? (day.total / maxValue) * 100 : 4;
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.height = '0%';

        if (day.key === todayKey) {
            column.classList.add('today');
        }

        const hoverValue = document.createElement('span');
        hoverValue.className = 'bar-value';
        hoverValue.textContent = day.total > 0 ? formatCurrency(day.total) : '-';

        const label = document.createElement('span');
        label.className = 'bar-label';
        label.textContent = day.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        const amount = document.createElement('span');
        amount.className = 'bar-amount';
        amount.textContent = day.total > 0 ? formatCurrency(day.total) : '-';

        column.appendChild(hoverValue);
        column.appendChild(bar);
        column.appendChild(label);
        column.appendChild(amount);

        requestAnimationFrame(() => {
            bar.style.height = `${Math.max(height, 6)}%`;
        });

        if (tooltip) {
            column.addEventListener('mouseenter', (event) => {
                tooltip.innerHTML = `
                    <strong>${label.textContent}</strong><br>
                    ${day.total > 0 ? formatCurrency(day.total) : 'No sales'}<br>
                    <span style="color:rgba(255,255,255,0.7);font-size:0.82rem;">${day.transactions} transaction${day.transactions === 1 ? '' : 's'} · ${day.itemCount} item${day.itemCount === 1 ? '' : 's'}</span>
                `;
                tooltip.className = 'chart-tooltip visible';
                const rect = elements.periodChart.getBoundingClientRect();
                tooltip.style.left = `${Math.min(Math.max(event.clientX - rect.left, 70), rect.width - 70)}px`;
                tooltip.style.top = `${event.clientY - rect.top - 18}px`;
            });
            column.addEventListener('mousemove', (event) => {
                const rect = elements.periodChart.getBoundingClientRect();
                tooltip.style.left = `${event.clientX - rect.left}px`;
                tooltip.style.top = `${event.clientY - rect.top - 12}px`;
            });
            column.addEventListener('mouseleave', () => {
                tooltip.className = 'chart-tooltip hidden';
            });
        }

        columnsWrapper.appendChild(column);
    });

    const gridLines = document.createElement('div');
    gridLines.className = 'chart-grid-lines';
    chartPlot.appendChild(gridLines);
    chartPlot.appendChild(yAxis);
    chartPlot.appendChild(columnsWrapper);

    const xAxis = document.createElement('div');
    xAxis.className = 'chart-x-axis';
    xAxis.textContent = 'Date';
    chartPlot.appendChild(xAxis);

    elements.periodChart.appendChild(chartPlot);
}

// Firebase init and listeners
function updateFirebaseStatus(text, klass) {
    const statusEl = document.getElementById('firebase-status');
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.className = klass || '';
    }
}

function initFirebaseIfConfigured() {
    if (!document.getElementById('firebase-status')) {
        return;
    }

    if (!window.FIREBASE_CONFIG) {
        console.warn('Firebase config not found. Running in local-only mode.');
        updateFirebaseStatus('Local only', 'status-local');
        return;
    }
    if (!window.firebase) {
        console.error('Firebase SDK not loaded.');
        updateFirebaseStatus('SDK missing', 'status-error');
        return;
    }
    if (useFirebase) {
        return;
    }

    try {
        firebase.initializeApp(window.FIREBASE_CONFIG);
        updateFirebaseStatus('Initializing...', 'status-loading');
        firebaseMode = 'pending';
        firebase.auth().signInAnonymously().then(() => {
            db = firebase.firestore();
            useFirebase = true;
            firebaseMode = 'cloud';
            firebaseRecordsLoaded = false;
            console.info('Firebase initialized and signed in anonymously - real-time sync enabled');
            updateFirebaseStatus('Connected', 'status-ok');
            listenForRemoteRecords();
            setupPresence();
        }).catch(err => {
            console.warn('Firebase anonymous auth unavailable, continuing without auth.', err);
            if (err && err.code === 'auth/configuration-not-found') {
                db = firebase.firestore();
                useFirebase = true;
                firebaseMode = 'cloud';
                firebaseRecordsLoaded = false;
                updateFirebaseStatus('Connected (no auth)', 'status-ok');
                listenForRemoteRecords();
                setupPresence();
            } else {
                console.error('Firebase anonymous auth failed', err);
                updateFirebaseStatus('Auth failed', 'status-error');
                firebaseMode = 'local';
                firebaseRecordsLoaded = true;
                renderRecords();
                renderDashboard();
                alert('Firebase auth failed: ' + (err.message || err) + '\nCheck Firebase console rules and make sure anonymous auth is enabled.');
            }
        });
    } catch (err) {
        console.error('Firebase init failed', err);
        updateFirebaseStatus('Init failed', 'status-error');
        alert('Firebase initialization failed: ' + (err.message || err));
    }
}

function listenForRemoteRecords() {
    if (!useFirebase || !db) return;
    if (recordsListener) recordsListener();
    recordsListener = db.collection('records').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        const records = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // ensure createdAt is ISO string
            if (data.createdAt && data.createdAt.toDate) {
                data.createdAt = data.createdAt.toDate().toISOString();
            }
            records.push(data);
        });
        remoteRecordsCache = records;
        firebaseRecordsLoaded = true;
        renderRecords();
        renderDashboard();
    }, err => console.error('records listener error', err));
}

function setupPresence() {
    if (!useFirebase || !db) return;
    const storedName = window.localStorage.getItem('stationaryUserName');
    const name = storedName || (document.getElementById('user-name') && document.getElementById('user-name').value) || 'anonymous';
    window.localStorage.setItem('stationaryUserName', name);

    const clientId = getClientId();
    const userDocRef = db.collection('users').doc(clientId);

    userDocRef.set({ name, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).then(() => {
        userPresenceDoc = userDocRef;
        setInterval(() => {
            userDocRef.update({ lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
        }, 25000);

        const usersCol = db.collection('users');
        usersListener = usersCol.orderBy('lastSeen', 'desc').onSnapshot(snapshot => {
            const cutoff = new Date(Date.now() - 1000 * 60 * 5);
            const active = [];
            const seenNames = new Set();
            snapshot.forEach(d => {
                const data = d.data();
                if (data.lastSeen && data.lastSeen.toDate) {
                    const last = data.lastSeen.toDate();
                    const userName = data.name || 'anon';
                    if (last >= cutoff && !seenNames.has(userName)) {
                        seenNames.add(userName);
                        active.push(userName);
                    }
                }
            });
            document.getElementById('active-users').textContent = active.length ? active.join(', ') : '—';
        });
    }).catch(err => console.error('presence failed', err));
}

function renderSparkline(records) {
    if (!elements.todaySparkline) return;
    const days = 7;
    const daily = getDailySales(records, days);
    const values = daily.map(d => d.total);
    const w = 120, h = 36, pad = 4;
    const max = Math.max(...values, 1);
    const step = (w - pad * 2) / Math.max(values.length - 1, 1);
    const points = values.map((v, i) => {
        const x = pad + i * step;
        const y = h - pad - ((v / max) * (h - pad * 2));
        return [x, y];
    });

    const path = points.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
    const areaPath = `${path} L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`;

    const svg = `
        <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="rgba(68,120,255,0.16)" />
                    <stop offset="100%" stop-color="rgba(68,120,255,0)" />
                </linearGradient>
            </defs>
            <path d="${areaPath}" fill="url(#g1)" stroke="none" />
            <path d="${path}" fill="none" stroke="#2f5ace" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        </svg>
    `;

    elements.todaySparkline.innerHTML = svg;
}

function renderDashboard() {
    if (firebaseMode === 'pending') {
        updateDashboardCards([]);
        renderAnalysisTable([]);
        renderPeriodChart([], elements.periodSelect.value);
        renderSparkline([]);
        return;
    }
    const records = getRecords();
    updateDashboardCards(records);
    renderAnalysisTable(records);
    renderPeriodChart(records, elements.periodSelect.value);
    renderSparkline(records);
}

function exportRecordsToCsv() {
    const records = getRecords();
    if (records.length === 0) {
        alert('No records to export.');
        return;
    }

    const header = ['Date', 'Product', 'Quantity', 'Price', 'Item Total', 'Payment Method', 'Cash Amount', 'GPay Amount'];
    const rows = [header];

    records.forEach(record => {
        record.items.forEach(item => {
            rows.push([
                formatDate(record.createdAt),
                item.name,
                item.quantity,
                item.price.toFixed(2),
                (item.price * item.quantity).toFixed(2),
                record.paymentMethod,
                record.cashAmount.toFixed(2),
                record.gpayAmount.toFixed(2)
            ]);
        });
    });

    const csvContent = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'stationary-records.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function clearAllRecords() {
    if (!confirm('Clear all saved records? This cannot be undone.')) {
        return;
    }

    if (useFirebase && db && firebaseMode === 'cloud') {
        db.collection('records').get().then(snapshot => {
            const batch = db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            return batch.commit();
        }).then(() => {
            saveRecords([]);
            renderRecords();
            renderDashboard();
            alert('All cloud records cleared.');
        }).catch(err => {
            console.error('Failed to clear remote records', err);
            const message = err && err.message ? err.message : String(err);
            alert('Failed to clear cloud records: ' + message + '. Switching to local-only mode and clearing local records.');

            useFirebase = false;
            firebaseMode = 'local';
            db = null;
            updateFirebaseStatus('Local mode (cloud clear denied)', 'status-local');

            saveRecords([]);
            renderRecords();
            renderDashboard();
        });
    } else {
        saveRecords([]);
        renderRecords();
        renderDashboard();
    }
}

function switchTab(event) {
    event.preventDefault();
    const target = event.currentTarget.getAttribute('data-tab');
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.classList.toggle('active', button.getAttribute('data-tab') === target);
    });
    document.querySelectorAll('.tab-content').forEach(section => {
        section.classList.toggle('active', section.id === target);
    });
}

function initializeTabs() {
    const activeTab = document.querySelector('.tab-button.active');
    const target = activeTab ? activeTab.getAttribute('data-tab') : 'transactions-tab';
    document.querySelectorAll('.tab-content').forEach(section => {
        section.classList.toggle('active', section.id === target);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initFirebaseIfConfigured();
    updatePaymentInputs();
    renderCurrentItems();
    renderRecords();
    renderDashboard();

    initTheme();
    elements.paymentMethod.addEventListener('change', updatePaymentInputs);
    elements.periodSelect.addEventListener('change', () => renderDashboard());
    elements.addItemButton.addEventListener('click', addItem);
    elements.saveTransactionButton.addEventListener('click', saveTransaction);
    elements.exportCsvButton.addEventListener('click', exportRecordsToCsv);
    elements.clearRecordsButton.addEventListener('click', clearAllRecords);

    if (!elements.themeToggleButton) {
        elements.themeToggleButton = document.getElementById('theme-toggle-btn');
    }
    if (elements.themeToggleButton) {
        elements.themeToggleButton.addEventListener('click', toggleTheme);
    }

    elements.tabButtons.forEach(button => button.addEventListener('click', switchTab));
    elements.currentItemsBody.addEventListener('click', event => {
        if (event.target.matches('[data-remove]')) {
            const index = Number(event.target.getAttribute('data-remove'));
            removeCurrentItem(index);
        }
    });
    // save user name when changed
    const nameInput = document.getElementById('user-name');
    if (nameInput) {
        nameInput.value = window.localStorage.getItem('stationaryUserName') || '';
        nameInput.addEventListener('change', () => {
            window.localStorage.setItem('stationaryUserName', nameInput.value.trim());
            if (useFirebase && userPresenceDoc) {
                userPresenceDoc.update({ name: nameInput.value.trim() }).catch(() => {});
            }
        });
    }
});
