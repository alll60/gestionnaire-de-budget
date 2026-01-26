// Gestionnaire de Budget - JavaScript

let currentDate = new Date();
let budgetData = loadData();
let pieChart = null;
let barChart = null;

// Couleurs des catégories pour les graphiques
const categoryColors = {
    'Logement': '#FF6384',
    'Nourriture': '#36A2EB',
    'Transport': '#FFCE56',
    'Services': '#4BC0C0',
    'Divertissement': '#9966FF',
    'Santé': '#FF9F40',
    'Magasinage': '#FF6384',
    'Autre': '#C9CBCF'
};

// Initialiser l'application
document.addEventListener('DOMContentLoaded', function() {
    updateMonthDisplay();
    updateSummary();
    displayExpenses();
    updateCharts();
    
    // Écouteurs d'événements
    document.getElementById('prevMonth').addEventListener('click', () => changeMonth(-1));
    document.getElementById('nextMonth').addEventListener('click', () => changeMonth(1));
    document.getElementById('setIncome').addEventListener('click', setIncome);
    document.getElementById('addExpense').addEventListener('click', addExpense);
    document.getElementById('exportData').addEventListener('click', exportData);
    document.getElementById('importData').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', importData);
    document.getElementById('clearMonth').addEventListener('click', clearMonth);
    
    // Support de la touche Entrée
    document.getElementById('incomeAmount').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') setIncome();
    });
    
    document.getElementById('expenseAmount').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addExpense();
    });
});

function getMonthKey() {
    return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
}

function updateMonthDisplay() {
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                       'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const monthName = monthNames[currentDate.getMonth()];
    const year = currentDate.getFullYear();
    document.getElementById('currentMonth').textContent = `${monthName} ${year}`;
}

function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    updateMonthDisplay();
    updateSummary();
    displayExpenses();
    updateCharts();
}

function setIncome() {
    const amount = parseFloat(document.getElementById('incomeAmount').value);
    if (!amount || amount <= 0) {
        alert('Veuillez entrer un montant de revenu valide');
        return;
    }
    
    const monthKey = getMonthKey();
    if (!budgetData[monthKey]) {
        budgetData[monthKey] = { income: 0, expenses: [] };
    }
    
    budgetData[monthKey].income = amount;
    saveData();
    updateSummary();
    updateCharts();
    document.getElementById('incomeAmount').value = '';
}

function addExpense() {
    const name = document.getElementById('expenseName').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const category = document.getElementById('expenseCategory').value;
    
    if (!name) {
        alert('Veuillez entrer un nom de dépense');
        return;
    }
    
    if (!amount || amount <= 0) {
        alert('Veuillez entrer un montant valide');
        return;
    }
    
    const monthKey = getMonthKey();
    if (!budgetData[monthKey]) {
        budgetData[monthKey] = { income: 0, expenses: [] };
    }
    
    budgetData[monthKey].expenses.push({
        id: Date.now(),
        name: name,
        amount: amount,
        category: category,
        date: new Date().toISOString()
    });
    
    saveData();
    updateSummary();
    displayExpenses();
    updateCharts();
    
    // Effacer les champs
    document.getElementById('expenseName').value = '';
    document.getElementById('expenseAmount').value = '';
}

function deleteExpense(id) {
    if (!confirm('Supprimer cette dépense?')) return;
    
    const monthKey = getMonthKey();
    if (budgetData[monthKey]) {
        budgetData[monthKey].expenses = budgetData[monthKey].expenses.filter(e => e.id !== id);
        saveData();
        updateSummary();
        displayExpenses();
        updateCharts();
    }
}

function displayExpenses() {
    const monthKey = getMonthKey();
    const expensesList = document.getElementById('expensesList');
    
    if (!budgetData[monthKey] || budgetData[monthKey].expenses.length === 0) {
        expensesList.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Aucune dépense pour le moment</p>';
        return;
    }
    
    const expenses = budgetData[monthKey].expenses;
    expensesList.innerHTML = expenses.map(expense => `
        <div class="expense-item">
            <div class="expense-info">
                <div class="expense-name">${expense.name}</div>
                <div class="expense-category">${expense.category}</div>
            </div>
            <span class="expense-amount">${expense.amount.toFixed(2)} $</span>
            <button class="delete-btn" onclick="deleteExpense(${expense.id})">Supprimer</button>
        </div>
    `).join('');
}

function updateSummary() {
    const monthKey = getMonthKey();
    const monthData = budgetData[monthKey] || { income: 0, expenses: [] };
    
    const income = monthData.income;
    const totalExpenses = monthData.expenses.reduce((sum, e) => sum + e.amount, 0);
    const remaining = income - totalExpenses;
    
    document.getElementById('totalIncome').textContent = `${income.toFixed(2)} $`;
    document.getElementById('totalExpenses').textContent = `${totalExpenses.toFixed(2)} $`;
    document.getElementById('remaining').textContent = `${remaining.toFixed(2)} $`;
    
    // Changer la couleur selon le solde restant
    const remainingCard = document.querySelector('.balance-card');
    if (remaining < 0) {
        remainingCard.style.background = 'linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)';
    } else {
        remainingCard.style.background = 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)';
    }
}

function updateCharts() {
    const monthKey = getMonthKey();
    const monthData = budgetData[monthKey] || { income: 0, expenses: [] };
    
    // Regrouper les dépenses par catégorie
    const categoryTotals = {};
    monthData.expenses.forEach(expense => {
        if (!categoryTotals[expense.category]) {
            categoryTotals[expense.category] = 0;
        }
        categoryTotals[expense.category] += expense.amount;
    });
    
    const categories = Object.keys(categoryTotals);
    const amounts = Object.values(categoryTotals);
    const colors = categories.map(cat => categoryColors[cat]);
    
    // Détruire les graphiques existants
    if (pieChart) pieChart.destroy();
    if (barChart) barChart.destroy();
    
    // Créer le graphique circulaire
    const pieCtx = document.getElementById('pieChart').getContext('2d');
    pieChart = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: categories,
            datasets: [{
                data: amounts,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value.toFixed(2)} $ (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
    
    // Créer le graphique à barres
    const barCtx = document.getElementById('barChart').getContext('2d');
    barChart = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: categories,
            datasets: [{
                label: 'Montant Dépensé',
                data: amounts,
                backgroundColor: colors,
                borderColor: colors.map(c => c),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.y.toFixed(2)} $`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toFixed(0) + ' $';
                        }
                    }
                }
            }
        }
    });
}

function clearMonth() {
    if (!confirm('Effacer toutes les données de ce mois? Cette action ne peut pas être annulée.')) return;
    
    const monthKey = getMonthKey();
    delete budgetData[monthKey];
    saveData();
    updateSummary();
    displayExpenses();
    updateCharts();
}

function exportData() {
    const dataStr = JSON.stringify(budgetData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `donnees-budget-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (confirm('Importer ces données? Les données actuelles seront remplacées.')) {
                budgetData = importedData;
                saveData();
                updateSummary();
                displayExpenses();
                updateCharts();
                alert('Données importées avec succès!');
            }
        } catch (error) {
            alert('Erreur lors de l\'importation des données. Veuillez vérifier le format du fichier.');
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Réinitialiser l'input de fichier
}

function saveData() {
    localStorage.setItem('budgetData', JSON.stringify(budgetData));
}

function loadData() {
    const saved = localStorage.getItem('budgetData');
    return saved ? JSON.parse(saved) : {};
}
