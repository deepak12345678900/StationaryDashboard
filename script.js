const STORAGE_KEY = 'stationaryDashboardRecords';
let currentItems = [];

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
    periodChart: document.getElementById('period-chart'),
    todayCount: document.getElementById('today-count'),
    splitCount: document.getElementById('split-count'),
    analysisBody: document.getElementById('analysis-body'),
    paymentBreakdown: document.getElementById('payment-breakdown'),
    tabButtons: document.querySelectorAll('.tab-button')
};

function getRecords() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (error) {
        console.error('Unable to load records', error);
        return [];
    }
}

function saveRecords(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function formatCurrency(value) {
    return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

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
        elements.currentItemsBody.innerHTML = '<tr class="empty-row"><td colspan="5">No items added yet.</td></tr>';
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
    const records = getRecords();
    const record = {
        id: Date.now(),
        createdAt: new Date().toISOString(),
        items: [...currentItems],
        total,
        paymentMethod: method,
        cashAmount,
        gpayAmount
    };

    records.unshift(record);
    saveRecords(records);
    clearTransactionForm();
    renderRecords();
    renderDashboard();
    alert('Transaction saved successfully.');
}

function renderRecords() {
    const records = getRecords();
    elements.recordsBody.innerHTML = '';

    if (records.length === 0) {
        elements.recordsBody.innerHTML = '<tr class="empty-row"><td colspan="6">No records available yet.</td></tr>';
        return;
    }

    records.forEach(record => {
        const row = document.createElement('tr');
        const itemsLabel = record.items.map(item => `${item.name} (${item.quantity})`).join(', ');
        row.innerHTML = `
            <td>${formatDate(record.createdAt)}</td>
            <td>${itemsLabel}</td>
            <td>${formatCurrency(record.total)}</td>
            <td>${record.paymentMethod === 'split' ? 'Split' : record.paymentMethod}</td>
            <td>${formatCurrency(record.cashAmount)}</td>
            <td>${formatCurrency(record.gpayAmount)}</td>
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
    elements.paymentBreakdown.textContent = `Cash collected: ${formatCurrency(totalCash)} · GPay collected: ${formatCurrency(totalGpay)}`;
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
            <td>${formatDate(record.createdAt)}</td>
            <td>${formatCurrency(record.total)}</td>
            <td>${record.paymentMethod === 'split' ? 'Split' : record.paymentMethod}</td>
            <td>${itemCount} items</td>
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
        dayList.push({ date, key, total: 0 });
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
        }
    });

    return dayList;
}

function renderPeriodChart(records, period) {
    const days = period === 'monthly' ? 30 : 7;
    const dailySales = getDailySales(records, days);
    const maxValue = Math.max(...dailySales.map(day => day.total), 10);

    elements.periodChart.innerHTML = '';

    dailySales.forEach(day => {
        const column = document.createElement('div');
        column.className = 'bar-column';
        const height = maxValue > 0 ? (day.total / maxValue) * 100 : 4;
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.height = `${Math.max(height, 6)}%`;

        const label = document.createElement('span');
        label.textContent = day.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        const amount = document.createElement('span');
        amount.className = 'bar-amount';
        amount.textContent = day.total > 0 ? formatCurrency(day.total) : '-';

        column.appendChild(bar);
        column.appendChild(label);
        column.appendChild(amount);
        elements.periodChart.appendChild(column);
    });
}

function renderDashboard() {
    const records = getRecords();
    updateDashboardCards(records);
    renderAnalysisTable(records);
    renderPeriodChart(records, elements.periodSelect.value);
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
    saveRecords([]);
    renderRecords();
    renderDashboard();
}

function switchTab(event) {
    const target = event.currentTarget.getAttribute('data-tab');
    elements.tabButtons.forEach(button => {
        button.classList.toggle('active', button.getAttribute('data-tab') === target);
    });
    document.querySelectorAll('.tab-content').forEach(section => {
        section.classList.toggle('active', section.id === target);
        section.classList.toggle('hidden', section.id !== target);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    updatePaymentInputs();
    renderCurrentItems();
    renderRecords();
    renderDashboard();

    elements.paymentMethod.addEventListener('change', updatePaymentInputs);
    elements.periodSelect.addEventListener('change', () => renderDashboard());
    elements.addItemButton.addEventListener('click', addItem);
    elements.saveTransactionButton.addEventListener('click', saveTransaction);
    elements.exportCsvButton.addEventListener('click', exportRecordsToCsv);
    elements.clearRecordsButton.addEventListener('click', clearAllRecords);

    elements.tabButtons.forEach(button => button.addEventListener('click', switchTab));
    elements.currentItemsBody.addEventListener('click', event => {
        if (event.target.matches('[data-remove]')) {
            const index = Number(event.target.getAttribute('data-remove'));
            removeCurrentItem(index);
        }
    });
});
