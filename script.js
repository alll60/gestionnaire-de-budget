// Gestionnaire de Budget - JavaScript

let currentDate = new Date();
let viewMode = 'monthly'; // 'monthly' ou 'yearly'
let budgetData = loadData();
let pieChart = null;
let barChart = null;

const CATEGORIES = ['Logement', 'Nourriture', 'Transport', 'Services',
                    'Divertissement', 'Santé', 'Magasinage', 'Autre'];

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                     'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const FREQUENCIES = ['once', 'monthly', 'annual'];
const FREQUENCY_LABELS = { once: 'Une fois', monthly: 'Mensuelle', annual: 'Annuelle' };

function frequencyLabel(freq) {
    return FREQUENCY_LABELS[freq] || FREQUENCY_LABELS.once;
}

// Palette sourde accordée au thème sombre
const categoryColors = {
    'Logement': '#D6A96A',
    'Nourriture': '#6FB79A',
    'Transport': '#6E8FC4',
    'Services': '#B57BA6',
    'Divertissement': '#C9705C',
    'Santé': '#9AA45C',
    'Magasinage': '#8C7BC4',
    'Autre': '#7E8A92'
};

// Accord des graphiques avec le fond sombre
Chart.defaults.color = '#8B8F94';
Chart.defaults.font.family = "'IBM Plex Sans', sans-serif";
Chart.defaults.font.size = 12;

document.addEventListener('DOMContentLoaded', function () {
    refreshAll();

    document.getElementById('prevPeriod').addEventListener('click', () => changePeriod(-1));
    document.getElementById('nextPeriod').addEventListener('click', () => changePeriod(1));
    document.getElementById('viewMonthly').addEventListener('click', () => setView('monthly'));
    document.getElementById('viewYearly').addEventListener('click', () => setView('yearly'));
    document.getElementById('setIncome').addEventListener('click', setIncome);
    document.getElementById('addExpense').addEventListener('click', addExpense);
    document.getElementById('exportCSV').addEventListener('click', exportCSV);
    document.getElementById('exportPDF').addEventListener('click', exportPDF);
    document.getElementById('exportData').addEventListener('click', exportData);
    document.getElementById('importData').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', importData);
    document.getElementById('clearMonth').addEventListener('click', clearPeriod);

    document.getElementById('incomeAmount').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') setIncome();
    });
    document.getElementById('expenseAmount').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addExpense();
    });
});

/* ---------- Helpers ---------- */

function getMonthKey(d = currentDate) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getYearKeys() {
    const year = currentDate.getFullYear();
    return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

function money(v) {
    return `${v.toFixed(2)} $`;
}

/** Clé "AAAA-MM" à partir d'une année et d'un index de mois (0-11). */
function ymKey(year, monthIdx) {
    return `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
}

function parseKey(key) {
    const [y, m] = key.split('-').map(Number);
    return { year: y, month: m - 1 };
}

/**
 * Toutes les dépenses applicables à un mois donné, y compris les récurrentes :
 * - 'once'     : seulement le mois de saisie
 * - 'monthly'  : chaque mois depuis la saisie
 * - 'annual'   : chaque année au mois anniversaire
 */
function getMonthExpenses(year, monthIdx) {
    const key = ymKey(year, monthIdx);
    const result = [];
    const push = (e) => result.push(Object.assign({}, e, {
        month: key,
        frequency: e.frequency || 'once'
    }));

    // dépenses uniques + annuelles saisies directement ce mois-ci
    const d = budgetData[key];
    ((d && d.expenses) || []).forEach(e => {
        if ((e.frequency || 'once') !== 'monthly') push(e);
    });

    // dépenses récurrentes, de cette année ou des années précédentes
    Object.keys(budgetData).forEach(k => {
        const p = parseKey(k);
        if (isNaN(p.year) || isNaN(p.month) || p.year > year) return;
        ((budgetData[k].expenses) || []).forEach(e => {
            const freq = e.frequency || 'once';
            if (freq === 'monthly') {
                push(e); // chaque mois
            } else if (freq === 'annual' && p.month === monthIdx && k !== key) {
                push(e); // mois anniversaire (les annuelles de ce mois sont déjà ajoutées)
            }
        });
    });
    return result;
}

function getMonthIncome(year, monthIdx) {
    const d = budgetData[ymKey(year, monthIdx)];
    return (d && d.income) || 0;
}

function getMonthData(year, monthIdx) {
    return { income: getMonthIncome(year, monthIdx), expenses: getMonthExpenses(year, monthIdx) };
}

/**
 * Dépenses annuelles applicables à une année donnée (saisies cette année-là ou avant),
 * chacune retournée une seule fois quel que soit son mois anniversaire.
 */
function getYearAnnuals(year) {
    const annuals = [];
    Object.keys(budgetData).forEach(k => {
        const p = parseKey(k);
        if (isNaN(p.year) || p.year > year) return;
        ((budgetData[k].expenses) || []).forEach(e => {
            if ((e.frequency || 'once') === 'annual') annuals.push(e);
        });
    });
    return annuals;
}

/**
 * Données d'un mois pour la VUE ANNUELLE : dépenses uniques et mensuelles en entier,
 * plus chaque dépense annuelle répartie uniformément (montant/12) sous sa catégorie.
 * Les coûts annuels ne s'empilent plus sur un seul mois.
 */
function getYearlyMonthData(year, monthIdx) {
    const key = ymKey(year, monthIdx);
    const md = getMonthData(year, monthIdx);
    const expenses = md.expenses
        .filter(e => (e.frequency || 'once') !== 'annual')
        .map(e => Object.assign({}, e));
    getYearAnnuals(year).forEach(e => {
        expenses.push(Object.assign({}, e, {
            amount: e.amount / 12,
            month: key,
            frequency: 'annual',
            prorated: true
        }));
    });
    return { income: md.income, expenses };
}

function findExpense(id) {
    for (const key of Object.keys(budgetData)) {
        const expense = ((budgetData[key].expenses) || []).find(e => e.id === id);
        if (expense) return { key, expense };
    }
    return null;
}

// Retourne { income, expenses } pour la période courante
function getPeriodData() {
    const year = currentDate.getFullYear();
    if (viewMode === 'monthly') {
        return getMonthData(year, currentDate.getMonth());
    }
    let income = 0;
    let expenses = [];
    for (let i = 0; i < 12; i++) {
        const md = getYearlyMonthData(year, i);
        income += md.income;
        expenses = expenses.concat(md.expenses);
    }
    return { income, expenses };
}

function isYearly() {
    return viewMode === 'yearly';
}

/* ---------- Vue / navigation ---------- */

function setView(mode) {
    viewMode = mode;
    document.getElementById('viewMonthly').classList.toggle('active', mode === 'monthly');
    document.getElementById('viewYearly').classList.toggle('active', mode === 'yearly');

    const yearly = isYearly();
    document.getElementById('incomeSection').style.display = yearly ? 'none' : 'block';
    document.getElementById('expenseSection').style.display = yearly ? 'none' : 'block';
    document.getElementById('incomeLabel').textContent = yearly ? 'Revenu Annuel' : 'Revenu Mensuel';
    document.getElementById('listTitle').innerHTML = yearly
        ? '&#128203; R&eacute;sum&eacute; par Mois'
        : '&#128203; Liste des D&eacute;penses';
    document.getElementById('barTitle').innerHTML = yearly
        ? 'D&eacute;penses par Mois'
        : 'R&eacute;partition par Cat&eacute;gorie';

    refreshAll();
}

function changePeriod(delta) {
    if (isYearly()) {
        currentDate.setFullYear(currentDate.getFullYear() + delta);
    } else {
        currentDate.setMonth(currentDate.getMonth() + delta);
    }
    refreshAll();
}

function updatePeriodDisplay() {
    const year = currentDate.getFullYear();
    document.getElementById('currentPeriod').textContent = isYearly()
        ? `${year}`
        : `${MONTH_NAMES[currentDate.getMonth()]} ${year}`;
}

function refreshAll() {
    updatePeriodDisplay();
    syncExpenseMonthInput();
    updateSummary();
    displayExpenses();
    updateCharts();
}

/* ---------- Sélecteur de mois du formulaire ---------- */

/** Clé du mois choisi dans le formulaire (validée), ou le mois affiché. */
function getExpenseMonthKey() {
    const el = document.getElementById('expenseMonth');
    if (el && /^\d{4}-(0[1-9]|1[0-2])$/.test(el.value)) return el.value;
    return getMonthKey();
}

/** Le sélecteur suit par défaut le mois affiché. */
function syncExpenseMonthInput() {
    const el = document.getElementById('expenseMonth');
    if (el && document.activeElement !== el) el.value = getMonthKey();
}

/* ---------- Saisie ---------- */

function setIncome() {
    const amount = parseFloat(document.getElementById('incomeAmount').value);
    if (!amount || amount <= 0) {
        alert('Veuillez entrer un montant de revenu valide');
        return;
    }
    const monthKey = getMonthKey();
    if (!budgetData[monthKey]) budgetData[monthKey] = { income: 0, expenses: [] };
    budgetData[monthKey].income = amount;
    saveData();
    refreshAll();
    document.getElementById('incomeAmount').value = '';
}

function addExpense() {
    const name = document.getElementById('expenseName').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const category = document.getElementById('expenseCategory').value;

    if (!name) { alert('Veuillez entrer un nom de dépense'); return; }
    if (!amount || amount <= 0) { alert('Veuillez entrer un montant valide'); return; }

    const freqEl = document.getElementById('expenseFrequency');
    const frequency = (freqEl && FREQUENCIES.includes(freqEl.value)) ? freqEl.value : 'once';

    const monthKey = getExpenseMonthKey();
    if (!budgetData[monthKey]) budgetData[monthKey] = { income: 0, expenses: [] };

    budgetData[monthKey].expenses.push({
        id: Date.now(),
        name: name,
        amount: amount,
        category: category,
        frequency: frequency,
        date: new Date().toISOString()
    });

    saveData();
    refreshAll();
    document.getElementById('expenseName').value = '';
    document.getElementById('expenseAmount').value = '';
}

function editExpense(id) {
    const found = findExpense(id);
    if (!found) return;
    const expense = found.expense;

    const newName = prompt('Nouveau nom de la dépense:', expense.name);
    if (newName === null) return;

    const newAmount = prompt('Nouveau montant:', expense.amount);
    if (newAmount === null) return;

    const parsedAmount = parseFloat(newAmount);
    if (!parsedAmount || parsedAmount <= 0) { alert('Montant invalide'); return; }

    const categoryChoice = prompt(
        'Choisir une catégorie (entrer le numéro):\n' +
        CATEGORIES.map((cat, i) => `${i + 1}. ${cat}`).join('\n'),
        CATEGORIES.indexOf(expense.category) + 1
    );
    if (categoryChoice === null) return;

    const categoryIndex = parseInt(categoryChoice) - 1;
    if (categoryIndex < 0 || categoryIndex >= CATEGORIES.length) { alert('Catégorie invalide'); return; }

    const freqChoice = prompt(
        'Choisir une fréquence (entrer le numéro):\n' +
        FREQUENCIES.map((f, i) => `${i + 1}. ${FREQUENCY_LABELS[f]}`).join('\n'),
        FREQUENCIES.indexOf(expense.frequency || 'once') + 1
    );
    if (freqChoice === null) return;

    const freqIndex = parseInt(freqChoice) - 1;
    if (freqIndex < 0 || freqIndex >= FREQUENCIES.length) { alert('Fréquence invalide'); return; }

    expense.name = newName.trim();
    expense.amount = parsedAmount;
    expense.category = CATEGORIES[categoryIndex];
    expense.frequency = FREQUENCIES[freqIndex];

    saveData();
    refreshAll();
}

function deleteExpense(id) {
    if (!confirm('Supprimer cette dépense?')) return;
    const found = findExpense(id);
    if (found) {
        budgetData[found.key].expenses = budgetData[found.key].expenses.filter(e => e.id !== id);
        saveData();
        refreshAll();
    }
}

/* ---------- Affichage ---------- */

function displayExpenses() {
    const expensesList = document.getElementById('expensesList');
    const year = currentDate.getFullYear();

    if (isYearly()) {
        // Résumé par mois (dépenses annuelles réparties sur les 12 mois)
        const rows = [];
        for (let i = 0; i < 12; i++) {
            const md = getYearlyMonthData(year, i);
            const total = md.expenses.reduce((s, e) => s + e.amount, 0);
            const income = md.income;
            if (total === 0 && income === 0) continue;
            const solde = income - total;
            rows.push(`
                <div class="expense-item">
                    <div class="expense-info">
                        <div class="expense-name">${MONTH_NAMES[i]}</div>
                        <div class="expense-category">Revenu: ${money(income)} &bull; Solde: ${money(solde)}</div>
                    </div>
                    <span class="expense-amount">${money(total)}</span>
                </div>`);
        }
        expensesList.innerHTML = rows.length
            ? rows.join('')
            : '<p style="text-align: center; color: #999; padding: 20px;">Aucune dépense pour le moment</p>';
        return;
    }

    const { expenses } = getPeriodData();

    if (expenses.length === 0) {
        expensesList.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Aucune dépense pour le moment</p>';
        return;
    }

    expensesList.innerHTML = expenses.map(expense => `
        <div class="expense-item">
            <div class="expense-info">
                <div class="expense-name">${expense.name}</div>
                <div class="expense-category">${expense.category} &bull; ${frequencyLabel(expense.frequency)}</div>
            </div>
            <span class="expense-amount">${money(expense.amount)}</span>
            <button class="edit-btn" onclick="editExpense(${expense.id})">Modifier</button>
            <button class="delete-btn" onclick="deleteExpense(${expense.id})">Supprimer</button>
        </div>
    `).join('');
}

function updateSummary() {
    const { income, expenses } = getPeriodData();
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const remaining = income - totalExpenses;

    document.getElementById('totalIncome').textContent = money(income);
    document.getElementById('totalExpenses').textContent = money(totalExpenses);
    document.getElementById('remaining').textContent = money(remaining);

    const remainingCard = document.querySelector('.balance-card');
    remainingCard.classList.toggle('negative', remaining < 0);
}

function getCategoryTotals() {
    const { expenses } = getPeriodData();
    const totals = {};
    expenses.forEach(e => {
        totals[e.category] = (totals[e.category] || 0) + e.amount;
    });
    return totals;
}

function updateCharts() {
    const categoryTotals = getCategoryTotals();
    const categories = Object.keys(categoryTotals);
    const amounts = Object.values(categoryTotals);
    const colors = categories.map(cat => categoryColors[cat] || '#7E8A92');

    if (pieChart) pieChart.destroy();
    if (barChart) barChart.destroy();

    const pieCtx = document.getElementById('pieChart').getContext('2d');
    pieChart = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: categories,
            datasets: [{ data: amounts, backgroundColor: colors, borderWidth: 2, borderColor: '#0E0F11' }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'bottom', labels: { padding: 15, font: { size: 12 } } },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total ? ((value / total) * 100).toFixed(1) : 0;
                            return `${context.label}: ${money(value)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    // Barres : par mois en vue annuelle, par catégorie en vue mensuelle
    let barLabels, barValues, barColors;
    if (isYearly()) {
        barLabels = MONTH_NAMES.map(m => m.substring(0, 3));
        barValues = [];
        for (let i = 0; i < 12; i++) {
            barValues.push(getYearlyMonthData(currentDate.getFullYear(), i)
                .expenses.reduce((s, e) => s + e.amount, 0));
        }
        barColors = barValues.map(() => '#D6A96A');
    } else {
        barLabels = categories;
        barValues = amounts;
        barColors = colors;
    }

    const barCtx = document.getElementById('barChart').getContext('2d');
    barChart = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: barLabels,
            datasets: [{
                label: 'Montant Dépensé',
                data: barValues,
                backgroundColor: barColors,
                borderColor: barColors,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => money(c.parsed.y) } }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#1F2327' }, ticks: { callback: (v) => v.toFixed(0) + ' $' } },
                x: { grid: { display: false } }
            }
        }
    });
}

/* ---------- Effacer ---------- */

function clearPeriod() {
    if (isYearly()) {
        if (!confirm(`Effacer toutes les données de ${currentDate.getFullYear()}? Cette action ne peut pas être annulée.`)) return;
        getYearKeys().forEach(key => delete budgetData[key]);
    } else {
        if (!confirm('Effacer toutes les données de ce mois? Cette action ne peut pas être annulée.')) return;
        delete budgetData[getMonthKey()];
    }
    saveData();
    refreshAll();
}

/* ---------- Exports ---------- */

function periodLabel() {
    return isYearly()
        ? `${currentDate.getFullYear()}`
        : `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
}

function periodSlug() {
    return isYearly() ? `${currentDate.getFullYear()}` : getMonthKey();
}

function exportCSV() {
    const { income, expenses } = getPeriodData();
    if (expenses.length === 0 && income === 0) {
        alert('Aucune donnée à exporter pour cette période');
        return;
    }

    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [];

    lines.push(esc('Période') + ',' + esc(periodLabel()));
    lines.push('');
    lines.push(['Mois', 'Nom', 'Catégorie', 'Montant'].map(esc).join(','));

    if (isYearly()) {
        expenses.forEach(e => {
            const idx = parseInt(e.month.split('-')[1], 10) - 1;
            lines.push([MONTH_NAMES[idx], e.name, e.category, e.amount.toFixed(2)].map(esc).join(','));
        });
    } else {
        expenses.forEach(e => {
            lines.push([periodLabel(), e.name, e.category, e.amount.toFixed(2)].map(esc).join(','));
        });
    }

    const totals = getCategoryTotals();
    lines.push('');
    lines.push(['Catégorie', 'Total'].map(esc).join(','));
    Object.entries(totals).forEach(([cat, tot]) => {
        lines.push([cat, tot.toFixed(2)].map(esc).join(','));
    });

    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    lines.push('');
    lines.push([esc('Revenu'), esc(income.toFixed(2))].join(','));
    lines.push([esc('Dépenses'), esc(totalExpenses.toFixed(2))].join(','));
    lines.push([esc('Reste'), esc((income - totalExpenses).toFixed(2))].join(','));

    // BOM pour qu'Excel lise les accents correctement
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `budget-${periodSlug()}.csv`);
}

function exportPDF() {
    const { income, expenses } = getPeriodData();
    if (expenses.length === 0 && income === 0) {
        alert('Aucune donnée à exporter pour cette période');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const remaining = income - totalExpenses;

    let y = 20;
    doc.setFontSize(18);
    doc.text('Gestionnaire de Budget', 14, y);
    y += 8;
    doc.setFontSize(12);
    doc.text(periodLabel(), 14, y);
    y += 10;

    doc.setFontSize(11);
    doc.text(`Revenu: ${money(income)}`, 14, y); y += 6;
    doc.text(`Dépenses: ${money(totalExpenses)}`, 14, y); y += 6;
    doc.text(`Reste: ${money(remaining)}`, 14, y); y += 10;

    doc.setFontSize(13);
    doc.text('Par catégorie', 14, y); y += 7;
    doc.setFontSize(10);
    Object.entries(getCategoryTotals()).forEach(([cat, tot]) => {
        const pct = totalExpenses ? ((tot / totalExpenses) * 100).toFixed(1) : '0.0';
        doc.text(`${cat}`, 16, y);
        doc.text(`${money(tot)}  (${pct}%)`, 120, y);
        y += 6;
        if (y > 275) { doc.addPage(); y = 20; }
    });

    y += 6;
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.text(isYearly() ? 'Détail par mois' : 'Détail des dépenses', 14, y);
    y += 7;
    doc.setFontSize(10);

    if (isYearly()) {
        const year = currentDate.getFullYear();
        for (let i = 0; i < 12; i++) {
            const md = getYearlyMonthData(year, i);
            const tot = md.expenses.reduce((s, e) => s + e.amount, 0);
            const inc = md.income;
            if (tot === 0 && !inc) continue;
            doc.text(MONTH_NAMES[i], 16, y);
            doc.text(`Revenu ${money(inc)}`, 70, y);
            doc.text(`Dépenses ${money(tot)}`, 130, y);
            y += 6;
            if (y > 275) { doc.addPage(); y = 20; }
        }
    } else {
        expenses.forEach(e => {
            doc.text(e.name.substring(0, 30), 16, y);
            doc.text(e.category, 90, y);
            doc.text(money(e.amount), 150, y);
            y += 6;
            if (y > 275) { doc.addPage(); y = 20; }
        });
    }

    doc.save(`budget-${periodSlug()}.pdf`);
}

function exportData() {
    const dataStr = JSON.stringify(budgetData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    downloadBlob(blob, `donnees-budget-${new Date().toISOString().split('T')[0]}.json`);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        try {
            const importedData = JSON.parse(text);
            if (confirm('Importer ces donnees JSON? Les donnees actuelles seront remplacees.')) {
                budgetData = importedData;
                saveData(); refreshAll();
                alert('Donnees importees avec succes!');
            }
        } catch (_) { importCSV(text); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function importCSV(text) {
    function parseRow(line) {
        const result = []; let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
            else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
            else cur += c;
        }
        result.push(cur.trim());
        return result;
    }
    try {
        const BOM = '\uFEFF';
        const lines = text.replace(BOM,'').replace(/\r/g,'').split('\n');

        let year = null;
        for (const line of lines) {
            if (!line.trim()) continue;
            const r = parseRow(line);
            const k0 = r[0].trim();
            if (k0 === 'P\u00e9riode' || k0 === 'Period') {
                year = parseInt((r[1] || '').trim().split(' ').pop());
                break;
            }
        }
        if (!year || isNaN(year)) throw new Error('Ann\u00e9e introuvable dans le fichier');

        const FR_MONTHS = MONTH_NAMES; // already defined globally
        const imported = {};
        let counter = 0;

        for (const line of lines) {
            if (!line.trim()) continue;
            const row = parseRow(line);
            if (row.length < 4) continue;
            const amount = parseFloat(row[3]);
            if (isNaN(amount) || amount <= 0) continue;
            if (!row[1] || !row[2]) continue;
            const monthIdx = FR_MONTHS.findIndex(m => row[0].startsWith(m));
            if (monthIdx === -1) continue;
            const mKey = year + '-' + String(monthIdx + 1).padStart(2, '0');
            if (!imported[mKey]) imported[mKey] = { income: 0, expenses: [] };
            imported[mKey].expenses.push({
                id: Date.now() * 1000 + counter++,
                name: row[1], amount: amount, category: row[2],
                date: new Date().toISOString()
            });
        }

        const total = Object.values(imported).reduce((s, d) => s + d.expenses.length, 0);
        if (total === 0) throw new Error('Aucune d\u00e9pense valide trouv\u00e9e dans le fichier');

        if (confirm('Importer ' + total + ' d\u00e9pense(s) depuis le CSV ?\nFusion avec les donn\u00e9es existantes.')) {
            Object.entries(imported).forEach(([k, d]) => {
                if (!budgetData[k]) budgetData[k] = { income: 0, expenses: [] };
                budgetData[k].expenses = [...budgetData[k].expenses, ...d.expenses];
            });
            saveData(); refreshAll();
            alert('\u2713 ' + total + ' d\u00e9pense(s) import\u00e9e(s) avec succ\u00e8s !');
        }
    } catch (err) {
        alert('Erreur import CSV :\n' + err.message);
    }
}

function saveData() {
    localStorage.setItem('budgetData_fr', JSON.stringify(budgetData));
}

function loadData() {
    const saved = localStorage.getItem('budgetData_fr');
    return saved ? JSON.parse(saved) : {};
}
