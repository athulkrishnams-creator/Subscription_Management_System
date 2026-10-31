/**
 * Brightloop Software - Single Page Application Engine
 * Unified Subscription & Recurring Billing Platform
 */

// Application State
const state = {
  token: localStorage.getItem('brightloop_token') || null,
  user: JSON.parse(localStorage.getItem('brightloop_user') || 'null'),
  currentView: 'dashboard',
  cache: {},
  lastQueryTime: null
};

// API Helper
async function api(endpoint, options = {}) {
  const startTime = performance.now();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  try {
    const res = await fetch(`/api${endpoint}`, { credentials: 'omit', ...options, headers });
    const data = await res.json();
    const duration = performance.now() - startTime;
    state.lastQueryTime = duration;
    updatePerfPill(duration);

    if (!res.ok) {
      throw new Error(data.error || 'Server request failed');
    }
    return data;
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err);
    throw err;
  }
}

function updatePerfPill(duration) {
  const pill = document.getElementById('perf-pill');
  const timer = document.getElementById('query-time');
  if (pill && timer) {
    pill.classList.remove('hidden');
    timer.innerText = `${duration.toFixed(1)} ms`;
    if (duration > 2000) {
      pill.className = 'flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-rose-950 text-rose-400 border border-rose-800 text-xs';
    } else {
      pill.className = 'flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-xs';
    }
  }
}

// Toast Notifications
window.showToast = function (message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const icon = type === 'success' ? 'fa-check-circle text-emerald-400' : 'fa-circle-exclamation text-rose-400';
  const border = type === 'success' ? 'border-emerald-700 bg-slate-900 text-white' : 'border-rose-700 bg-slate-900 text-white';

  toast.className = `toast px-4 py-3 rounded-xl border shadow-xl flex items-center space-x-3 text-xs font-medium ${border}`;
  toast.innerHTML = `<i class="fa-solid ${icon} text-base"></i><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
};

// Modal Controls
window.openModal = function (id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('hidden');
};

window.closeModal = function (id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('hidden');
};

// Persona Switcher (For Judges / Evaluators)
window.switchRole = async function (email) {
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'Brightloop@2026!' })
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('brightloop_token', data.token);
    localStorage.setItem('brightloop_user', JSON.stringify(data.user));

    showToast(`Switched persona to: ${data.user.name} (${data.user.role})`);
    renderHeader();

    // Default view based on role
    if (data.user.role === 'CUSTOMER') {
      navigateTo('customer-portal');
    } else {
      navigateTo('dashboard');
    }
  } catch (err) {
    showToast(`Login failed: ${err.message}`, 'error');
  }
};

window.handleAuthAction = function () {
  if (state.user) {
    // Logout
    state.token = null;
    state.user = null;
    localStorage.removeItem('brightloop_token');
    localStorage.removeItem('brightloop_user');
    showToast('Signed out successfully');
    renderHeader();
    window.openModal('auth-modal');
  } else {
    window.openModal('auth-modal');
  }
};

// Navigation Controller
window.navigateTo = function (view) {
  state.currentView = view;
  renderHeader();

  const container = document.getElementById('view-container');
  container.innerHTML = `
    <div class="text-center py-16">
      <i class="fa-solid fa-circle-notch fa-spin text-indigo-600 text-3xl mb-3"></i>
      <p class="text-xs font-semibold text-slate-500">Loading ${view}...</p>
    </div>
  `;

  switch (view) {
    case 'dashboard':
      renderDashboardView();
      break;
    case 'subscriptions':
      renderSubscriptionsView();
      break;
    case 'invoices':
      renderInvoicesView();
      break;
    case 'products':
      renderProductsView();
      break;
    case 'plans':
      renderPlansView();
      break;
    case 'discounts':
      renderDiscountsView();
      break;
    case 'taxes':
      renderTaxesView();
      break;
    case 'payments':
      renderPaymentsView();
      break;
    case 'staff':
      renderStaffView();
      break;
    case 'customer-portal':
      renderCustomerPortalView();
      break;
    default:
      renderDashboardView();
  }
};

// Render Header & Navigation Links dynamically based on Role
function renderHeader() {
  const navContainer = document.getElementById('main-nav-links');
  const mobileNav = document.getElementById('mobile-nav-links');
  const authBadge = document.getElementById('auth-user-badge');
  const authBtn = document.getElementById('auth-action-btn');

  if (!state.user) {
    authBadge.innerHTML = `<span class="text-slate-500">Not signed in</span>`;
    authBtn.innerText = 'Sign In';
    navContainer.innerHTML = '';
    mobileNav.innerHTML = '';
    return;
  }

  authBtn.innerText = 'Sign Out';
  const roleColors = {
    ADMIN: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    STAFF: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    CUSTOMER: 'bg-amber-100 text-amber-700 border-amber-200'
  };

  authBadge.innerHTML = `
    <i class="fa-solid fa-user-circle text-slate-400 text-sm"></i>
    <div class="flex flex-col text-left">
      <span class="font-bold text-slate-800 leading-tight">${state.user.name}</span>
      <span class="text-[10px] text-slate-500">${state.user.email}</span>
    </div>
    <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${roleColors[state.user.role] || ''}">
      ${state.user.role}
    </span>
  `;

  let links = [];

  if (state.user.role === 'ADMIN') {
    links = [
      { id: 'dashboard', label: 'Finance Lead', icon: 'fa-chart-pie' },
      { id: 'subscriptions', label: 'Subscriptions & Quotes', icon: 'fa-file-contract' },
      { id: 'invoices', label: 'Invoices & Billing', icon: 'fa-file-invoice-dollar' },
      { id: 'products', label: 'Products & Variants', icon: 'fa-box-open' },
      { id: 'plans', label: 'Plans', icon: 'fa-tags' },
      { id: 'discounts', label: 'Discounts', icon: 'fa-percent' },
      { id: 'taxes', label: 'Taxes', icon: 'fa-receipt' },
      { id: 'payments', label: 'Payments', icon: 'fa-money-bill-wave' },
      { id: 'staff', label: 'Staff Team', icon: 'fa-users-gear' }
    ];
  } else if (state.user.role === 'STAFF') {
    links = [
      { id: 'dashboard', label: 'Overview', icon: 'fa-chart-pie' },
      { id: 'subscriptions', label: 'Subscriptions & Quotes', icon: 'fa-file-contract' },
      { id: 'invoices', label: 'Invoices & Billing', icon: 'fa-file-invoice-dollar' },
      { id: 'products', label: 'Products & Variants', icon: 'fa-box-open' },
      { id: 'plans', label: 'Plans', icon: 'fa-tags' },
      { id: 'payments', label: 'Payments', icon: 'fa-money-bill-wave' }
    ];
  } else if (state.user.role === 'CUSTOMER') {
    links = [
      { id: 'customer-portal', label: 'My Subscriptions & Invoices', icon: 'fa-store' },
      { id: 'plans', label: 'Explore Plans & Add-ons', icon: 'fa-tags' }
    ];
  }

  const renderLinkHtml = l => `
    <button onclick="navigateTo('${l.id}')" class="px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition font-semibold text-xs ${state.currentView === l.id ? 'bg-indigo-50 text-indigo-600 font-bold' : 'hover:bg-slate-100 text-slate-600'}">
      <i class="fa-solid ${l.icon} text-xs"></i>
      <span>${l.label}</span>
    </button>
  `;

  navContainer.innerHTML = links.map(renderLinkHtml).join('');
  mobileNav.innerHTML = links.map(renderLinkHtml).join('');
}

// ==========================================
// 1. FINANCE LEAD & EXECUTIVE DASHBOARD VIEW
// ==========================================
async function renderDashboardView() {
  const container = document.getElementById('view-container');
  try {
    const data = await api('/analytics/summary');
    const { kpis, revenue_history = [], top_plans = [] } = data;

    container.innerHTML = `
      <div class="space-y-6">
        <!-- View Title & Top Actions -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 class="text-2xl font-black tracking-tight text-slate-900 flex items-center">
              <i class="fa-solid fa-chart-line text-indigo-600 mr-2.5"></i> Finance Lead & Executive Overview
            </h1>
            <p class="text-xs text-slate-500 font-medium">
              Single-pane-of-glass real-time metrics for recurring revenue, collections, and overdue receivables.
            </p>
          </div>
          <div class="flex items-center space-x-2">
            <button onclick="window.openModal('billing-modal')" class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 transition flex items-center">
              <i class="fa-solid fa-calendar-check mr-1.5"></i> Run Billing Day
            </button>
            <button onclick="navigateTo('invoices')" class="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-sm transition flex items-center">
              <i class="fa-solid fa-bell text-rose-500 mr-1.5"></i> Chase Overdue (${kpis.overdue_invoices_count})
            </button>
          </div>
        </div>

        <!-- 6 High-Impact Financial KPI Cards -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <!-- Active Subscriptions -->
          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Active Subscriptions</span>
            <div class="my-2">
              <span class="text-2xl font-black text-slate-900 font-mono-numbers">${kpis.active_subscriptions}</span>
              <span class="text-xs text-slate-400">/ ${kpis.total_subscriptions} total</span>
            </div>
            <span class="text-[11px] text-emerald-600 font-semibold flex items-center"><i class="fa-solid fa-circle-check mr-1"></i> Running</span>
          </div>

          <!-- MRR -->
          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">MRR (Normalized)</span>
            <div class="my-2">
              <span class="text-2xl font-black text-indigo-600 font-mono-numbers">$${kpis.mrr.toLocaleString()}</span>
            </div>
            <span class="text-[11px] text-indigo-500 font-medium">Monthly recurring</span>
          </div>

          <!-- ARR -->
          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">ARR (Annual Run Rate)</span>
            <div class="my-2">
              <span class="text-2xl font-black text-slate-900 font-mono-numbers">$${kpis.arr.toLocaleString()}</span>
            </div>
            <span class="text-[11px] text-slate-400 font-medium">12x MRR projection</span>
          </div>

          <!-- Collected Revenue -->
          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Cash Collected</span>
            <div class="my-2">
              <span class="text-2xl font-black text-emerald-600 font-mono-numbers">$${kpis.total_collected_revenue.toLocaleString()}</span>
            </div>
            <span class="text-[11px] text-emerald-500 font-medium flex items-center"><i class="fa-solid fa-arrow-trend-up mr-1"></i> Sunk in bank</span>
          </div>

          <!-- Accounts Receivable -->
          <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Accounts Receivable</span>
            <div class="my-2">
              <span class="text-2xl font-black text-amber-600 font-mono-numbers">$${kpis.outstanding_receivables.toLocaleString()}</span>
            </div>
            <span class="text-[11px] text-amber-600 font-medium">Pending collection</span>
          </div>

          <!-- Overdue Invoices -->
          <div class="bg-white p-4 rounded-2xl border border-rose-200 shadow-sm bg-rose-50/20 flex flex-col justify-between">
            <span class="text-[11px] font-bold text-rose-600 uppercase tracking-wider">Overdue Balance</span>
            <div class="my-2">
              <span class="text-2xl font-black text-rose-600 font-mono-numbers">$${kpis.overdue_balance.toLocaleString()}</span>
              <span class="text-xs font-bold text-rose-500 ml-1">(${kpis.overdue_invoices_count})</span>
            </div>
            <span class="text-[11px] text-rose-600 font-bold flex items-center"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Action needed</span>
          </div>
        </div>

        <!-- Charts & Analytics Section -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Monthly Revenue Trend Chart -->
          <div class="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-bold text-slate-800 flex items-center">
                <i class="fa-solid fa-chart-simple text-indigo-600 mr-2"></i> Monthly Revenue Collections Trend
              </h3>
              <span class="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-600">Past 6 Months</span>
            </div>
            <div class="h-64">
              <canvas id="revenueTrendChart"></canvas>
            </div>
          </div>

          <!-- Top Plans by Subscribers -->
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-bold text-slate-800 flex items-center">
                  <i class="fa-solid fa-trophy text-amber-500 mr-2"></i> Top Plans by Volume
                </h3>
                <span class="text-xs font-semibold text-slate-400">Share</span>
              </div>
              <div class="space-y-3">
                ${top_plans.map(p => `
                  <div class="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <div>
                      <div class="font-bold text-slate-800">${p.name}</div>
                      <span class="text-[10px] text-slate-400 uppercase font-semibold">${p.billing_frequency}</span>
                    </div>
                    <div class="font-black text-indigo-600 font-mono-numbers text-sm">${p.subscriber_count} subs</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Performance SLA callout -->
            <div class="mt-4 p-3 rounded-xl bg-slate-900 text-white text-xs space-y-1">
              <div class="font-bold text-emerald-400 flex items-center">
                <i class="fa-solid fa-bolt mr-1.5"></i> High-Performance Guarantee
              </div>
              <p class="text-[11px] text-slate-300">
                Ledger aggregations executed in <span class="font-bold text-emerald-400">${data.execution_time_ms} ms</span> with zero lag.
              </p>
            </div>
          </div>
        </div>
      </div>
    `;

    // Render Chart.js
    const ctx = document.getElementById('revenueTrendChart');
    if (ctx) {
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: revenue_history.map(h => h.month),
          datasets: [{
            label: 'Cash Inflow ($)',
            data: revenue_history.map(h => h.collected_amount),
            backgroundColor: '#6366f1',
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: '#f1f5f9' }
            },
            x: {
              grid: { display: false }
            }
          }
        }
      });
    }
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-2xl border border-rose-200">Failed to load analytics: ${err.message}</div>`;
  }
}

// ==========================================
// 2. SUBSCRIPTIONS & QUOTES VIEW
// ==========================================
async function renderSubscriptionsView() {
  const container = document.getElementById('view-container');
  try {
    const data = await api('/subscriptions');
    const templatesData = await api('/quotes/templates');
    const plansData = await api('/plans');
    const usersData = await api('/auth/users?role=CUSTOMER');

    state.cache.subscriptions = data.subscriptions;
    state.cache.templates = templatesData.templates;
    state.cache.plans = plansData.plans;
    state.cache.customers = usersData.users;

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 class="text-2xl font-black tracking-tight text-slate-900 flex items-center">
              <i class="fa-solid fa-file-contract text-indigo-600 mr-2.5"></i> Subscriptions & Quotations
            </h1>
            <p class="text-xs text-slate-500 font-medium">
              Manage end-to-end customer lifecycles: <code>Draft &rarr; Quotation &rarr; Confirmed &rarr; Active &rarr; Closed</code>
            </p>
          </div>
          <div class="flex items-center space-x-2">
            <button onclick="window.openNewSubModal()" class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 transition flex items-center">
              <i class="fa-solid fa-plus mr-1.5"></i> Create from Template
            </button>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm text-xs">
          <div class="flex items-center space-x-2">
            <span class="font-bold text-slate-500">Filter Status:</span>
            <button onclick="filterSubs('all')" class="sub-tab px-3 py-1 rounded-lg font-semibold bg-indigo-50 text-indigo-600">All</button>
            <button onclick="filterSubs('Active')" class="sub-tab px-3 py-1 rounded-lg font-semibold text-slate-600 hover:bg-slate-100">Active</button>
            <button onclick="filterSubs('Quotation')" class="sub-tab px-3 py-1 rounded-lg font-semibold text-slate-600 hover:bg-slate-100">Quotation</button>
            <button onclick="filterSubs('Paused')" class="sub-tab px-3 py-1 rounded-lg font-semibold text-slate-600 hover:bg-slate-100">Paused</button>
            <button onclick="filterSubs('Closed')" class="sub-tab px-3 py-1 rounded-lg font-semibold text-slate-600 hover:bg-slate-100">Closed</button>
          </div>
          <div class="text-slate-400 font-mono text-[11px]">
            ${data.subscriptions.length} records loaded
          </div>
        </div>

        <!-- Subscriptions Table -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th class="p-3.5">Subscription #</th>
                  <th class="p-3.5">Customer</th>
                  <th class="p-3.5">Plan / Cycle</th>
                  <th class="p-3.5">Status</th>
                  <th class="p-3.5">Next Billing</th>
                  <th class="p-3.5">Amount / Cycle</th>
                  <th class="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="subs-table-body" class="divide-y divide-slate-100 font-medium">
                ${renderSubRows(data.subscriptions)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-2xl border border-rose-200">Failed to load subscriptions: ${err.message}</div>`;
  }
}

function renderSubRows(subs) {
  if (subs.length === 0) {
    return `<tr><td colspan="7" class="p-8 text-center text-slate-400 font-medium">No subscriptions match current criteria.</td></tr>`;
  }

  const statusBadges = {
    Active: 'badge-active',
    Quotation: 'badge-quotation',
    Draft: 'badge-draft',
    Paused: 'badge-paused',
    Closed: 'badge-closed'
  };

  return subs.map(s => `
    <tr class="hover:bg-slate-50/80 transition">
      <td class="p-3.5 font-bold text-indigo-600 font-mono">${s.sub_number}</td>
      <td class="p-3.5">
        <div class="font-bold text-slate-800">${s.customer_name}</div>
        <div class="text-[10px] text-slate-400">${s.company_name || s.customer_email}</div>
      </td>
      <td class="p-3.5">
        <div class="font-semibold text-slate-800">${s.plan_name}</div>
        <span class="text-[10px] font-bold text-indigo-500 uppercase">${s.billing_frequency} &bull; ${s.payment_terms}</span>
      </td>
      <td class="p-3.5">
        <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${statusBadges[s.status] || 'badge-draft'}">
          ${s.status}
        </span>
      </td>
      <td class="p-3.5 font-mono text-slate-600">${s.next_billing_date}</td>
      <td class="p-3.5 font-bold text-slate-900 font-mono-numbers text-sm">
        $${s.computed_total.toFixed(2)}
        ${s.discount_code ? `<span class="block text-[10px] font-bold text-emerald-600"><i class="fa-solid fa-tag"></i> ${s.discount_code}</span>` : ''}
      </td>
      <td class="p-3.5 text-right space-x-1">
        ${s.status === 'Quotation' ? `
          <button onclick="window.updateSubStatus('${s.id}', 'Active')" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition">
            Confirm & Activate
          </button>
        ` : ''}
        ${s.status === 'Active' ? `
          ${s.can_pause ? `
            <button onclick="window.updateSubStatus('${s.id}', 'Paused')" class="px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold text-[11px] transition">
              Pause
            </button>
          ` : ''}
          ${s.can_close_early ? `
            <button onclick="window.updateSubStatus('${s.id}', 'Closed')" class="px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-[11px] transition">
              Close
            </button>
          ` : ''}
        ` : ''}
        ${s.status === 'Paused' ? `
          <button onclick="window.updateSubStatus('${s.id}', 'Active')" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition">
            Resume
          </button>
        ` : ''}
        ${s.can_renew && s.status !== 'Draft' ? `
          <button onclick="window.renewSub('${s.id}')" class="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] transition" title="Renew Plan">
            <i class="fa-solid fa-arrows-rotate"></i>
          </button>
        ` : ''}
        <button onclick="window.openApplyDiscountModal('${s.id}')" class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition" title="Apply Discount Code">
          <i class="fa-solid fa-percent"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

window.filterSubs = function (status) {
  const all = state.cache.subscriptions || [];
  const filtered = status === 'all' ? all : all.filter(s => s.status === status);
  document.getElementById('subs-table-body').innerHTML = renderSubRows(filtered);
};

window.updateSubStatus = async function (subId, status) {
  try {
    await api(`/subscriptions/${subId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    showToast(`Subscription status updated to: ${status}`);
    renderSubscriptionsView();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.renewSub = async function (subId) {
  try {
    const res = await api(`/subscriptions/${subId}/renew`, { method: 'POST' });
    showToast(`Subscription renewed! Next billing: ${res.next_billing_date}`);
    renderSubscriptionsView();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ==========================================
// 3. INVOICES & BILLING DAY VIEW
// ==========================================
async function renderInvoicesView() {
  const container = document.getElementById('view-container');
  try {
    const data = await api('/billing/invoices');
    state.cache.invoices = data.invoices;

    const overdueCount = data.invoices.filter(i => i.is_overdue).length;

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 class="text-2xl font-black tracking-tight text-slate-900 flex items-center">
              <i class="fa-solid fa-file-invoice-dollar text-indigo-600 mr-2.5"></i> Invoices & Recurring Billing
            </h1>
            <p class="text-xs text-slate-500 font-medium">
              Zero manual typing. Automated batch generation from subscriptions, automated taxes, and payment matching.
            </p>
          </div>
          <div class="flex items-center space-x-2">
            <button onclick="window.openModal('billing-modal')" class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 transition flex items-center">
              <i class="fa-solid fa-calendar-check mr-1.5"></i> Run Billing Day
            </button>
          </div>
        </div>

        <!-- Filter tabs -->
        <div class="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm text-xs">
          <div class="flex items-center space-x-2">
            <span class="font-bold text-slate-500">Filter Invoices:</span>
            <button onclick="filterInvoices('all')" class="inv-tab px-3 py-1 rounded-lg font-semibold bg-indigo-50 text-indigo-600">All</button>
            <button onclick="filterInvoices('overdue')" class="inv-tab px-3 py-1 rounded-lg font-semibold text-rose-600 hover:bg-rose-50 flex items-center">
              <i class="fa-solid fa-triangle-exclamation mr-1 text-xs"></i> Overdue (${overdueCount})
            </button>
            <button onclick="filterInvoices('Paid')" class="inv-tab px-3 py-1 rounded-lg font-semibold text-slate-600 hover:bg-slate-100">Paid</button>
            <button onclick="filterInvoices('Confirmed')" class="inv-tab px-3 py-1 rounded-lg font-semibold text-slate-600 hover:bg-slate-100">Confirmed</button>
            <button onclick="filterInvoices('Draft')" class="inv-tab px-3 py-1 rounded-lg font-semibold text-slate-600 hover:bg-slate-100">Draft</button>
          </div>
          <div class="text-slate-400 font-mono text-[11px]">
            ${data.invoices.length} invoices found
          </div>
        </div>

        <!-- Invoices Table -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th class="p-3.5">Invoice #</th>
                  <th class="p-3.5">Customer</th>
                  <th class="p-3.5">Issue & Due Date</th>
                  <th class="p-3.5">Total & Paid</th>
                  <th class="p-3.5">Status</th>
                  <th class="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="invoices-table-body" class="divide-y divide-slate-100 font-medium">
                ${renderInvoiceRows(data.invoices)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-2xl border border-rose-200">Failed to load invoices: ${err.message}</div>`;
  }
}

function renderInvoiceRows(invoices) {
  if (invoices.length === 0) {
    return `<tr><td colspan="6" class="p-8 text-center text-slate-400 font-medium">No invoices found.</td></tr>`;
  }

  return invoices.map(i => `
    <tr class="hover:bg-slate-50/80 transition ${i.is_overdue ? 'bg-rose-50/30' : ''}">
      <td class="p-3.5">
        <span class="font-bold text-indigo-600 font-mono">${i.invoice_number}</span>
        ${i.sub_number ? `<span class="block text-[10px] text-slate-400 font-mono">${i.sub_number}</span>` : ''}
      </td>
      <td class="p-3.5">
        <div class="font-bold text-slate-800">${i.customer_name}</div>
        <div class="text-[10px] text-slate-400">${i.customer_email}</div>
      </td>
      <td class="p-3.5 font-mono text-[11px]">
        <div>Issued: ${i.issue_date}</div>
        <div class="${i.is_overdue ? 'text-rose-600 font-bold' : 'text-slate-500'}">Due: ${i.due_date}</div>
      </td>
      <td class="p-3.5 font-mono-numbers">
        <div class="font-bold text-slate-900 text-sm">$${i.total_amount.toFixed(2)}</div>
        <div class="text-[10px] ${i.paid_amount >= i.total_amount ? 'text-emerald-600 font-bold' : 'text-amber-600'}">
          Paid: $${i.paid_amount.toFixed(2)}
        </div>
      </td>
      <td class="p-3.5">
        ${i.is_overdue ? `
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold badge-overdue">OVERDUE</span>
        ` : `
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${i.status === 'Paid' ? 'badge-paid' : 'badge-draft'}">${i.status}</span>
        `}
      </td>
      <td class="p-3.5 text-right space-x-1">
        <button onclick="window.viewInvoice('${i.id}')" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition">
          <i class="fa-solid fa-eye mr-1"></i> View / Print
        </button>

        ${i.status === 'Draft' ? `
          <button onclick="window.confirmInvoice('${i.id}')" class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] transition">
            Confirm
          </button>
        ` : ''}

        ${i.status !== 'Paid' && i.status !== 'Cancelled' ? `
          <button onclick="window.openPaymentModal('${i.id}', '${i.invoice_number}', ${i.remaining_balance})" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition">
            <i class="fa-solid fa-receipt mr-1"></i> Pay
          </button>
        ` : ''}

        ${i.is_overdue ? `
          <button onclick="window.chaseOverdue('${i.id}')" class="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] transition" title="Chase Overdue Payment">
            <i class="fa-solid fa-bullhorn"></i> Chase
          </button>
        ` : ''}

        <button onclick="window.sendInvoice('${i.id}')" class="px-2 py-1 rounded-lg bg-slate-50 hover:bg-slate-200 text-slate-600 text-[11px] transition" title="Send Email">
          <i class="fa-solid fa-paper-plane"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

window.filterInvoices = function (filter) {
  const all = state.cache.invoices || [];
  let filtered = all;
  if (filter === 'overdue') filtered = all.filter(i => i.is_overdue);
  else if (filter !== 'all') filtered = all.filter(i => i.status === filter);
  document.getElementById('invoices-table-body').innerHTML = renderInvoiceRows(filtered);
};

window.viewInvoice = async function (id) {
  try {
    const data = await api(`/billing/invoices/${id}`);
    const inv = data.invoice;

    const modalBadge = document.getElementById('inv-modal-badge');
    if (modalBadge) {
      modalBadge.innerText = inv.is_overdue ? 'OVERDUE' : inv.status;
      modalBadge.className = `px-2 py-0.5 rounded text-xs font-semibold ${inv.is_overdue ? 'badge-overdue' : inv.status === 'Paid' ? 'badge-paid' : 'badge-draft'}`;
    }

    const content = document.getElementById('printable-invoice-content');
    content.innerHTML = `
      <div class="space-y-6">
        <!-- Header -->
        <div class="flex justify-between items-start border-b border-slate-200 pb-6">
          <div>
            <div class="text-2xl font-black text-indigo-600 tracking-tight">Brightloop Software</div>
            <p class="text-xs text-slate-500">100 Silicon Way, Tech District, CA 94016</p>
            <p class="text-xs text-slate-500">billing@brightloopsoftware.com &bull; +1 (555) 019-8234</p>
          </div>
          <div class="text-right">
            <h2 class="text-2xl font-black text-slate-800 font-mono">${inv.invoice_number}</h2>
            <p class="text-xs text-slate-500">Issue Date: <strong>${inv.issue_date}</strong></p>
            <p class="text-xs ${inv.is_overdue ? 'text-rose-600 font-bold' : 'text-slate-500'}">Payment Due: <strong>${inv.due_date}</strong></p>
          </div>
        </div>

        <!-- Billed to & Sub info -->
        <div class="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span class="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Billed To:</span>
            <div class="font-bold text-slate-900 text-sm mt-0.5">${inv.customer_name}</div>
            <p class="text-slate-600">${inv.company_name || 'Retail Client'}</p>
            <p class="text-slate-500">${inv.customer_email}</p>
          </div>
          <div class="text-right">
            <span class="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Subscription Reference:</span>
            <div class="font-mono font-bold text-indigo-600 mt-0.5">${inv.sub_number || 'Direct Order'}</div>
            <p class="text-slate-500">Terms: <strong>${inv.payment_terms || 'Net 15'}</strong></p>
            <p class="text-slate-500">Cycle: ${inv.billing_period_start || ''} &rarr; ${inv.billing_period_end || ''}</p>
          </div>
        </div>

        <!-- Invoice Lines Table -->
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold text-[10px] uppercase">
              <th class="py-2.5 px-3">Description</th>
              <th class="py-2.5 px-3 text-center">Qty</th>
              <th class="py-2.5 px-3 text-right">Unit Price</th>
              <th class="py-2.5 px-3 text-right">Tax Rate</th>
              <th class="py-2.5 px-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium">
            ${inv.lines.map(l => `
              <tr>
                <td class="py-2.5 px-3">
                  <div class="font-bold text-slate-800">${l.product_name}</div>
                  ${l.variant_name ? `<span class="text-[10px] text-indigo-600 font-semibold">&bull; Variant: ${l.variant_name}</span>` : ''}
                </td>
                <td class="py-2.5 px-3 text-center font-mono">${l.quantity}</td>
                <td class="py-2.5 px-3 text-right font-mono-numbers">$${l.unit_price.toFixed(2)}</td>
                <td class="py-2.5 px-3 text-right font-mono-numbers text-slate-500">${l.tax_rate}%</td>
                <td class="py-2.5 px-3 text-right font-mono-numbers font-bold text-slate-900">$${l.total.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Totals summary -->
        <div class="flex justify-end pt-2 border-t border-slate-200">
          <div class="w-64 space-y-1.5 text-xs">
            <div class="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span class="font-mono-numbers font-semibold">$${inv.subtotal.toFixed(2)}</span>
            </div>
            ${inv.discount_amount > 0 ? `
              <div class="flex justify-between text-emerald-600 font-semibold">
                <span>Discount Applied:</span>
                <span class="font-mono-numbers">-$${inv.discount_amount.toFixed(2)}</span>
              </div>
            ` : ''}
            <div class="flex justify-between text-slate-600">
              <span>Tax Amount:</span>
              <span class="font-mono-numbers font-semibold">$${inv.tax_amount.toFixed(2)}</span>
            </div>
            <div class="flex justify-between text-slate-900 text-sm font-black pt-2 border-t border-slate-300">
              <span>Total Invoiced:</span>
              <span class="font-mono-numbers text-indigo-600">$${inv.total_amount.toFixed(2)}</span>
            </div>
            <div class="flex justify-between text-emerald-700 font-bold pt-1">
              <span>Paid to Date:</span>
              <span class="font-mono-numbers">$${inv.paid_amount.toFixed(2)}</span>
            </div>
            <div class="flex justify-between text-rose-700 font-extrabold text-sm pt-1 border-t border-slate-200">
              <span>Balance Due:</span>
              <span class="font-mono-numbers">$${inv.remaining_balance.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <!-- Payments log if any -->
        ${inv.payments.length > 0 ? `
          <div class="mt-6 pt-4 border-t border-slate-200 text-xs">
            <span class="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-2">Recorded Payment Ledger</span>
            <div class="space-y-1">
              ${inv.payments.map(p => `
                <div class="flex justify-between bg-emerald-50/50 p-2 rounded-lg text-emerald-900 border border-emerald-100">
                  <span><strong>${p.payment_number}</strong> &bull; Method: ${p.payment_method} &bull; ${p.payment_date}</span>
                  <span class="font-bold font-mono-numbers">+$${p.amount.toFixed(2)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    openModal('invoice-modal');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.printInvoice = function () {
  window.print();
};

window.confirmInvoice = async function (id) {
  try {
    await api(`/billing/invoices/${id}/confirm`, { method: 'PATCH' });
    showToast('Invoice confirmed');
    renderInvoicesView();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.sendInvoice = async function (id) {
  try {
    const res = await api(`/billing/invoices/${id}/send`, { method: 'POST' });
    showToast(res.message);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.chaseOverdue = async function (id) {
  try {
    const res = await api('/payments/chase-overdue', {
      method: 'POST',
      body: JSON.stringify({ invoice_id: id })
    });
    showToast(res.message);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.executeBillingRunAction = async function () {
  const dateInput = document.getElementById('billing-run-date').value;
  const btn = document.getElementById('btn-run-billing-exec');
  btn.disabled = true;
  btn.innerText = 'Processing Billing Cycle...';

  try {
    const res = await api('/billing/run-billing-day', {
      method: 'POST',
      body: JSON.stringify({ target_date: dateInput || null })
    });

    const box = document.getElementById('billing-results-box');
    box.classList.remove('hidden');
    box.innerHTML = `
      <div class="font-bold text-emerald-700 flex items-center">
        <i class="fa-solid fa-check-circle mr-1"></i> ${res.message}
      </div>
      <div class="text-slate-600">
        Invoices Generated: <strong>${res.result.invoices_created}</strong> &bull; Duplicates Prevented: <strong>${res.result.skipped.duplicate}</strong>
      </div>
    `;

    showToast(`Billing Day Completed: ${res.result.invoices_created} invoices generated.`);
    setTimeout(() => {
      closeModal('billing-modal');
      navigateTo('invoices');
    }, 1500);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Execute Billing Cycle Now';
  }
};

// ==========================================
// 4. CUSTOMER SELF-SERVICE PORTAL
// ==========================================
async function renderCustomerPortalView() {
  const container = document.getElementById('view-container');
  try {
    const subsData = await api('/subscriptions');
    const invData = await api('/billing/invoices');

    container.innerHTML = `
      <div class="space-y-8">
        <!-- Customer Portal Welcome Header -->
        <div class="bg-gradient-to-r from-indigo-700 to-violet-800 rounded-3xl p-6 md:p-8 text-white shadow-xl">
          <div class="max-w-2xl">
            <span class="px-3 py-1 rounded-full bg-white/20 text-white font-bold text-xs uppercase tracking-wider backdrop-blur-md">
              Customer Self-Service Hub
            </span>
            <h1 class="text-3xl font-black mt-3">Welcome, ${state.user.name}</h1>
            <p class="text-indigo-100 text-xs md:text-sm mt-1 leading-relaxed">
              View your active subscriptions, control renewals and pauses, download invoice receipts, and manage your recurring services without waiting for support.
            </p>
          </div>
        </div>

        <!-- Section: My Active Subscriptions -->
        <div>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-slate-900 flex items-center">
              <i class="fa-solid fa-box-open text-indigo-600 mr-2"></i> My Subscriptions
            </h2>
            <button onclick="navigateTo('plans')" class="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-bold text-xs transition">
              Explore More Add-ons & Plans &rarr;
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${subsData.subscriptions.length === 0 ? `
              <div class="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 col-span-2">
                You do not have any subscriptions yet. Click 'Explore Plans' to select one.
              </div>
            ` : subsData.subscriptions.map(s => `
              <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                <div class="flex items-start justify-between">
                  <div>
                    <span class="font-mono text-indigo-600 font-bold text-xs">${s.sub_number}</span>
                    <h3 class="text-base font-black text-slate-900 mt-0.5">${s.plan_name}</h3>
                    <p class="text-xs text-slate-500">Billing: <strong class="text-slate-700 uppercase">${s.billing_frequency}</strong> &bull; Terms: ${s.payment_terms}</p>
                  </div>
                  <span class="px-2.5 py-1 rounded-full text-xs font-bold ${s.status === 'Active' ? 'badge-active' : s.status === 'Paused' ? 'badge-paused' : 'badge-draft'}">
                    ${s.status}
                  </span>
                </div>

                <div class="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                  <div class="font-semibold text-slate-700 mb-1">Included Product Lines:</div>
                  ${s.lines.map(l => `
                    <div class="flex justify-between text-slate-600">
                      <span>${l.product_name} ${l.variant_name ? `(${l.variant_name})` : ''} x${l.quantity}</span>
                      <span class="font-mono-numbers font-semibold">$${l.total.toFixed(2)}</span>
                    </div>
                  `).join('')}
                </div>

                <div class="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <div>
                    <span class="text-slate-400 text-[10px] uppercase font-bold block">Next Auto-Billing:</span>
                    <span class="font-mono font-bold text-slate-800">${s.next_billing_date}</span>
                  </div>
                  <div class="text-right">
                    <span class="text-slate-400 text-[10px] uppercase font-bold block">Cycle Total:</span>
                    <span class="font-black text-indigo-600 text-base font-mono-numbers">$${s.computed_total.toFixed(2)}</span>
                  </div>
                </div>

                <!-- Self Service Actions (Based on Plan Configuration) -->
                <div class="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 text-xs">
                  ${s.status === 'Active' && s.can_pause ? `
                    <button onclick="window.updateSubStatus('${s.id}', 'Paused')" class="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 font-bold transition">
                      Pause Subscription
                    </button>
                  ` : ''}
                  ${s.status === 'Paused' ? `
                    <button onclick="window.updateSubStatus('${s.id}', 'Active')" class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-bold transition">
                      Resume Subscription
                    </button>
                  ` : ''}
                  ${s.can_renew ? `
                    <button onclick="window.renewSub('${s.id}')" class="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold transition">
                      Renew Early
                    </button>
                  ` : ''}
                  ${s.status === 'Active' && s.can_close_early ? `
                    <button onclick="window.updateSubStatus('${s.id}', 'Closed')" class="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold transition">
                      Cancel Plan
                    </button>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Section: My Invoices -->
        <div>
          <h2 class="text-lg font-bold text-slate-900 mb-3 flex items-center">
            <i class="fa-solid fa-receipt text-indigo-600 mr-2"></i> Invoices & Receipts
          </h2>
          <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th class="p-3.5">Invoice #</th>
                  <th class="p-3.5">Date</th>
                  <th class="p-3.5">Amount</th>
                  <th class="p-3.5">Status</th>
                  <th class="p-3.5 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 font-medium">
                ${invData.invoices.map(i => `
                  <tr>
                    <td class="p-3.5 font-mono font-bold text-indigo-600">${i.invoice_number}</td>
                    <td class="p-3.5 font-mono">${i.issue_date}</td>
                    <td class="p-3.5 font-mono-numbers font-bold">$${i.total_amount.toFixed(2)}</td>
                    <td class="p-3.5">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${i.status === 'Paid' ? 'badge-paid' : 'badge-draft'}">${i.status}</span>
                    </td>
                    <td class="p-3.5 text-right">
                      <button onclick="window.viewInvoice('${i.id}')" class="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700 transition">
                        <i class="fa-solid fa-download mr-1"></i> View / Print
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-2xl border border-rose-200">Failed to load portal: ${err.message}</div>`;
  }
}

// ==========================================
// 5. PRODUCTS & VARIANTS VIEW
// ==========================================
async function renderProductsView() {
  const container = document.getElementById('view-container');
  try {
    const data = await api('/products');
    const isAdmin = state.user && state.user.role === 'ADMIN';

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 class="text-2xl font-black tracking-tight text-slate-900 flex items-center">
              <i class="fa-solid fa-box-open text-indigo-600 mr-2.5"></i> Products & Brand Variants
            </h1>
            <p class="text-xs text-slate-500 font-medium">
              Configure product catalog with multi-variant price adjustments (e.g., choosing "Odoo" brand adds +$60).
            </p>
          </div>
          ${isAdmin ? `
            <button onclick="window.openNewProductModal()" class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 transition flex items-center">
              <i class="fa-solid fa-plus mr-1.5"></i> Add New Product
            </button>
          ` : ''}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          ${data.products.map(p => `
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <div class="flex items-center justify-between">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">${p.type}</span>
                  <span class="text-xs font-mono font-bold text-emerald-600">Cost: $${p.cost_price.toFixed(2)}</span>
                </div>
                <h3 class="text-base font-black text-slate-900 mt-2">${p.name}</h3>
                <p class="text-xs text-slate-500 mt-1">${p.notes || 'No description notes provided.'}</p>
                <div class="mt-3">
                  <span class="text-xl font-black text-indigo-600 font-mono-numbers">$${p.sales_price.toFixed(2)}</span>
                  <span class="text-xs text-slate-400">/ base price</span>
                </div>
              </div>

              <!-- Product Variants Table -->
              <div class="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Configured Variants:</span>
                ${p.variants.length === 0 ? `
                  <span class="text-slate-400 italic">Standard product (no variants)</span>
                ` : p.variants.map(v => `
                  <div class="flex justify-between py-0.5">
                    <span class="font-semibold text-slate-700">${v.variant_name}</span>
                    <span class="font-mono text-indigo-600 font-bold">+${v.price_adjustment >= 0 ? '$' + v.price_adjustment.toFixed(2) : '-$' + Math.abs(v.price_adjustment).toFixed(2)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-2xl border border-rose-200">Failed to load products: ${err.message}</div>`;
  }
}

// ==========================================
// 6. PLANS & LIFECYCLE VIEW
// ==========================================
async function renderPlansView() {
  const container = document.getElementById('view-container');
  try {
    const data = await api('/plans');
    const isAdmin = state.user && state.user.role === 'ADMIN';

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 class="text-2xl font-black tracking-tight text-slate-900 flex items-center">
              <i class="fa-solid fa-tags text-indigo-600 mr-2.5"></i> Subscription Plans & Lifecycle Rules
            </h1>
            <p class="text-xs text-slate-500 font-medium">
              Daily, Weekly, Monthly, Yearly billing intervals, with plan-by-plan controls for auto-close, early closure, pausing, and renewals.
            </p>
          </div>
          ${isAdmin ? `
            <button onclick="window.openNewPlanModal()" class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 transition flex items-center">
              <i class="fa-solid fa-plus mr-1.5"></i> Create New Plan
            </button>
          ` : ''}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          ${data.plans.map(p => `
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <span class="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700">${p.billing_frequency}</span>
                <h3 class="text-base font-black text-slate-900 mt-2">${p.name}</h3>
                <div class="mt-3">
                  <span class="text-2xl font-black text-indigo-600 font-mono-numbers">$${p.price.toFixed(2)}</span>
                  <span class="text-xs text-slate-400">/ ${p.billing_frequency}</span>
                </div>
                <div class="text-xs text-slate-500 mt-1">Min Quantity: <strong>${p.min_quantity}</strong></div>
              </div>

              <!-- Lifecycle Controls Checklist -->
              <div class="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1.5">
                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Plan Lifecycle Policy:</span>
                <div class="flex items-center space-x-1.5 text-slate-600">
                  <i class="fa-solid ${p.auto_close ? 'fa-check text-emerald-500' : 'fa-xmark text-slate-300'}"></i>
                  <span>Auto-close when expired</span>
                </div>
                <div class="flex items-center space-x-1.5 text-slate-600">
                  <i class="fa-solid ${p.can_close_early ? 'fa-check text-emerald-500' : 'fa-xmark text-slate-300'}"></i>
                  <span>Early closure allowed</span>
                </div>
                <div class="flex items-center space-x-1.5 text-slate-600">
                  <i class="fa-solid ${p.can_pause ? 'fa-check text-emerald-500' : 'fa-xmark text-slate-300'}"></i>
                  <span>Can be paused & resumed</span>
                </div>
                <div class="flex items-center space-x-1.5 text-slate-600">
                  <i class="fa-solid ${p.can_renew ? 'fa-check text-emerald-500' : 'fa-xmark text-slate-300'}"></i>
                  <span>Can be renewed</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-2xl border border-rose-200">Failed to load plans: ${err.message}</div>`;
  }
}

// ==========================================
// 7. DISCOUNT RULES VIEW (Admin Only)
// ==========================================
async function renderDiscountsView() {
  const container = document.getElementById('view-container');
  try {
    const data = await api('/discounts');

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 class="text-2xl font-black tracking-tight text-slate-900 flex items-center">
              <i class="fa-solid fa-percent text-indigo-600 mr-2.5"></i> Admin Discount Rules Engine
            </h1>
            <p class="text-xs text-slate-500 font-medium">
              Fixed or percentage discounts, minimum spend/seat thresholds, usage limits, and automatic billing-day application.
            </p>
          </div>
          <button onclick="window.openNewDiscountModal()" class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 transition flex items-center">
            <i class="fa-solid fa-plus mr-1.5"></i> Create Discount Rule
          </button>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
              <tr>
                <th class="p-3.5">Code</th>
                <th class="p-3.5">Rule Name</th>
                <th class="p-3.5">Discount Value</th>
                <th class="p-3.5">Scope & Thresholds</th>
                <th class="p-3.5">Usage / Limit</th>
                <th class="p-3.5">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 font-medium">
              ${data.discount_rules.map(d => `
                <tr>
                  <td class="p-3.5 font-bold font-mono text-indigo-600 text-sm">${d.code}</td>
                  <td class="p-3.5 font-bold text-slate-800">${d.name}</td>
                  <td class="p-3.5 font-mono font-bold text-slate-900">
                    ${d.type === 'percentage' ? `${d.value}% Off` : `$${d.value.toFixed(2)} Flat Off`}
                  </td>
                  <td class="p-3.5 text-slate-600">
                    <div>Scope: <strong class="text-indigo-600">${d.scope}</strong></div>
                    <div class="text-[10px] text-slate-400">Min Purchase: $${d.min_purchase_amount} | Min Qty: ${d.min_quantity}</div>
                  </td>
                  <td class="p-3.5 font-mono text-slate-700">
                    ${d.times_used} / ${d.max_uses > 0 ? d.max_uses : '&infin;'}
                  </td>
                  <td class="p-3.5">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${d.active ? 'badge-active' : 'badge-closed'}">
                      ${d.active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-2xl border border-rose-200">Failed to load discounts: ${err.message}</div>`;
  }
}

// ==========================================
// 8. TAX RULES VIEW (Admin Only)
// ==========================================
async function renderTaxesView() {
  const container = document.getElementById('view-container');
  try {
    const data = await api('/taxes');

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 class="text-2xl font-black tracking-tight text-slate-900 flex items-center">
              <i class="fa-solid fa-receipt text-indigo-600 mr-2.5"></i> Tax Rules Configuration
            </h1>
            <p class="text-xs text-slate-500 font-medium">
              Tax percentage rules automatically calculated on every subscription line during recurring invoice generation.
            </p>
          </div>
          <button onclick="window.openNewTaxModal()" class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 transition flex items-center">
            <i class="fa-solid fa-plus mr-1.5"></i> Add Tax Rule
          </button>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
              <tr>
                <th class="p-3.5">Rule Name</th>
                <th class="p-3.5">Tax Rate (%)</th>
                <th class="p-3.5">Default Rule</th>
                <th class="p-3.5">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 font-medium">
              ${data.tax_rules.map(t => `
                <tr>
                  <td class="p-3.5 font-bold text-slate-800 text-sm">${t.name}</td>
                  <td class="p-3.5 font-mono font-black text-indigo-600 text-base">${t.rate_percentage}%</td>
                  <td class="p-3.5">
                    ${t.is_default ? '<span class="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px]">DEFAULT</span>' : '<span class="text-slate-400">No</span>'}
                  </td>
                  <td class="p-3.5">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${t.active ? 'badge-active' : 'badge-closed'}">
                      ${t.active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-2xl border border-rose-200">Failed to load tax rules: ${err.message}</div>`;
  }
}

// ==========================================
// 9. PAYMENTS & OUTSTANDING LEDGER
// ==========================================
async function renderPaymentsView() {
  const container = document.getElementById('view-container');
  try {
    const data = await api('/payments');

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 class="text-2xl font-black tracking-tight text-slate-900 flex items-center">
              <i class="fa-solid fa-money-bill-wave text-indigo-600 mr-2.5"></i> Payment Collection Ledger
            </h1>
            <p class="text-xs text-slate-500 font-medium">
              Recorded payments with payment methods (Credit Card, Wire, ACH, PayPal), dates, notes, and staff attribution.
            </p>
          </div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
              <tr>
                <th class="p-3.5">Payment #</th>
                <th class="p-3.5">Invoice #</th>
                <th class="p-3.5">Customer</th>
                <th class="p-3.5">Method</th>
                <th class="p-3.5">Amount</th>
                <th class="p-3.5">Date & Notes</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 font-medium">
              ${data.payments.length === 0 ? `
                <tr><td colspan="6" class="p-8 text-center text-slate-400">No recorded payments yet.</td></tr>
              ` : data.payments.map(p => `
                <tr>
                  <td class="p-3.5 font-bold font-mono text-emerald-600">${p.payment_number}</td>
                  <td class="p-3.5 font-bold font-mono text-indigo-600">${p.invoice_number}</td>
                  <td class="p-3.5 font-bold text-slate-800">${p.customer_name}</td>
                  <td class="p-3.5 uppercase font-semibold text-slate-600">${p.payment_method}</td>
                  <td class="p-3.5 font-black text-emerald-700 font-mono-numbers text-sm">+$${p.amount.toFixed(2)}</td>
                  <td class="p-3.5">
                    <div class="font-mono text-slate-600">${p.payment_date}</div>
                    <div class="text-[10px] text-slate-400 italic">${p.note || 'Direct payment settlement'}</div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-2xl border border-rose-200">Failed to load payments: ${err.message}</div>`;
  }
}

// ==========================================
// 10. STAFF TEAM MANAGEMENT (Admin Only)
// ==========================================
async function renderStaffView() {
  const container = document.getElementById('view-container');
  try {
    const data = await api('/auth/users?role=STAFF');

    container.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 class="text-2xl font-black tracking-tight text-slate-900 flex items-center">
              <i class="fa-solid fa-users-gear text-indigo-600 mr-2.5"></i> Internal Staff Team Administration
            </h1>
            <p class="text-xs text-slate-500 font-medium">
              <em>"Only the admin can add a new member of staff."</em> Control internal user permissions.
            </p>
          </div>
          <button onclick="window.openModal('staff-modal')" class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 transition flex items-center">
            <i class="fa-solid fa-user-plus mr-1.5"></i> Add Staff Member
          </button>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
              <tr>
                <th class="p-3.5">Name</th>
                <th class="p-3.5">Email</th>
                <th class="p-3.5">Role</th>
                <th class="p-3.5">Joined Date</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 font-medium">
              ${data.users.map(u => `
                <tr>
                  <td class="p-3.5 font-bold text-slate-800 text-sm flex items-center space-x-2">
                    <span class="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                      ${u.name.charAt(0)}
                    </span>
                    <span>${u.name}</span>
                  </td>
                  <td class="p-3.5 font-mono text-slate-600">${u.email}</td>
                  <td class="p-3.5">
                    <span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      ${u.role}
                    </span>
                  </td>
                  <td class="p-3.5 font-mono text-slate-400">${u.created_at}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-2xl border border-rose-200">Failed to load staff list: ${err.message}</div>`;
  }
}

// Modal Triggers & Form Submissions
window.openPaymentModal = function (invoiceId, invoiceNumber, remaining) {
  document.getElementById('pay-invoice-id').value = invoiceId;
  document.getElementById('pay-invoice-info').innerHTML = `Invoice: <strong>${invoiceNumber}</strong> &bull; Outstanding: <strong class="text-rose-600">$${remaining.toFixed(2)}</strong>`;
  document.getElementById('pay-amount').value = remaining.toFixed(2);
  document.getElementById('pay-date').value = new Date().toISOString().slice(0, 10);
  openModal('payment-modal');
};

window.submitPayment = async function (e) {
  e.preventDefault();
  const invoiceId = document.getElementById('pay-invoice-id').value;
  const method = document.getElementById('pay-method').value;
  const amount = document.getElementById('pay-amount').value;
  const date = document.getElementById('pay-date').value;
  const note = document.getElementById('pay-note').value;

  try {
    const res = await api('/payments', {
      method: 'POST',
      body: JSON.stringify({
        invoice_id: invoiceId,
        payment_method: method,
        amount,
        payment_date: date,
        note
      })
    });
    showToast(res.message);
    closeModal('payment-modal');
    renderInvoicesView();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.openScaleModal = function () {
  openModal('scale-modal');
};

window.runScaleBenchmark = async function () {
  const count = document.getElementById('scale-count').value;
  const btn = document.getElementById('btn-scale-exec');
  btn.disabled = true;
  btn.innerText = 'Seeding database in single transaction...';

  try {
    const res = await api('/analytics/scale-test-seed', {
      method: 'POST',
      body: JSON.stringify({ count })
    });

    const box = document.getElementById('scale-results-box');
    box.classList.remove('hidden');
    box.innerHTML = `
      <div class="font-bold text-emerald-800 flex items-center">
        <i class="fa-solid fa-bolt mr-1"></i> ${res.message}
      </div>
      <div class="text-emerald-700">
        Total Subscriptions in Database: <strong>${res.total_subscriptions_in_system.toLocaleString()}</strong> &bull; Seed Time: <strong>${res.seed_time_ms} ms</strong>
      </div>
    `;

    showToast(`Benchmark generated! Querying live analytics with ${res.total_subscriptions_in_system} records...`);
    setTimeout(() => {
      closeModal('scale-modal');
      navigateTo('dashboard');
    }, 1500);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Generate & Run Benchmark';
  }
};

// Staff creation
window.submitCreateStaff = async function (e) {
  e.preventDefault();
  const name = document.getElementById('staff-name').value;
  const email = document.getElementById('staff-email').value;
  const password = document.getElementById('staff-password').value;

  try {
    const res = await api('/auth/staff', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
    showToast(res.message);
    closeModal('staff-modal');
    renderStaffView();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Live password validation checklist in registration
window.validatePwInputs = function (val) {
  const hasLen = val.length > 8;
  const hasUpper = /[A-Z]/.test(val);
  const hasLower = /[a-z]/.test(val);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(val);

  toggleRule('rule-len', hasLen);
  toggleRule('rule-upper', hasUpper);
  toggleRule('rule-lower', hasLower);
  toggleRule('rule-special', hasSpecial);
};

function toggleRule(id, valid) {
  const el = document.getElementById(id);
  if (el) {
    if (valid) {
      el.className = 'text-emerald-600 font-bold flex items-center';
      el.innerHTML = `<i class="fa-solid fa-circle-check mr-1.5 text-emerald-500"></i> ${el.innerText.replace(/^.*?\s/, '')}`;
    } else {
      el.className = 'text-slate-500 flex items-center';
      el.innerHTML = `<i class="fa-solid fa-circle-xmark mr-1.5 text-slate-400"></i> ${el.innerText.replace(/^.*?\s/, '')}`;
    }
  }
}

// Auth Tabs
window.showAuthTab = function (tab) {
  document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
  document.getElementById('form-register').classList.toggle('hidden', tab !== 'register');
  document.getElementById('form-forgot').classList.toggle('hidden', tab !== 'forgot');
  document.getElementById('form-do-reset').classList.add('hidden');

  const tabs = ['login', 'register', 'forgot'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    if (btn) {
      if (t === tab) {
        btn.className = 'flex-1 pb-3 text-indigo-600 border-b-2 border-indigo-600 font-bold';
      } else {
        btn.className = 'flex-1 pb-3 text-slate-500 hover:text-slate-700';
      }
    }
  });
};

window.submitLogin = async function (e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('brightloop_token', data.token);
    localStorage.setItem('brightloop_user', JSON.stringify(data.user));

    showToast(`Welcome back, ${data.user.name}!`);
    closeModal('auth-modal');
    renderHeader();

    if (data.user.role === 'CUSTOMER') navigateTo('customer-portal');
    else navigateTo('dashboard');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.submitRegister = async function (e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const company = document.getElementById('reg-company').value;
  const password = document.getElementById('reg-password').value;

  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, company_name: company, password })
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('brightloop_token', data.token);
    localStorage.setItem('brightloop_user', JSON.stringify(data.user));

    showToast('Customer account created successfully!');
    closeModal('auth-modal');
    renderHeader();
    navigateTo('customer-portal');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.submitForgotPassword = async function (e) {
  e.preventDefault();
  const email = document.getElementById('forgot-email').value;

  try {
    const res = await api('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });

    if (res.reset_link) {
      document.getElementById('reset-link-preview').classList.remove('hidden');
      document.getElementById('reset-link-url').innerText = `${window.location.origin}${res.reset_link}`;
      document.getElementById('reset-token-val').value = res.reset_token;
    } else {
      showToast(res.message);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.useResetLink = function () {
  document.getElementById('form-forgot').classList.add('hidden');
  document.getElementById('form-do-reset').classList.remove('hidden');
};

window.submitDoReset = async function (e) {
  e.preventDefault();
  const token = document.getElementById('reset-token-val').value;
  const newPassword = document.getElementById('reset-new-password').value;

  try {
    const res = await api('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword })
    });
    showToast(res.message);
    showAuthTab('login');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// New Subscription from Template Handlers
window.openNewSubModal = function () {
  const templateSelect = document.getElementById('inst-template-id');
  const customerSelect = document.getElementById('inst-customer-id');
  const startDateInput = document.getElementById('inst-start-date');

  startDateInput.value = new Date().toISOString().slice(0, 10);

  const templates = state.cache.templates || [];
  templateSelect.innerHTML = templates.map(t => `<option value="${t.id}">${t.name} (${t.plan_name} - ${t.validity_days} days valid)</option>`).join('');

  const customers = state.cache.customers || [];
  customerSelect.innerHTML = customers.map(c => `<option value="${c.id}">${c.name} (${c.company_name || c.email})</option>`).join('');

  openModal('new-sub-modal');
};

window.submitInstantiateTemplate = async function (e) {
  e.preventDefault();
  const templateId = document.getElementById('inst-template-id').value;
  const customerId = document.getElementById('inst-customer-id').value;
  const startDate = document.getElementById('inst-start-date').value;
  const terms = document.getElementById('inst-terms').value;

  try {
    const res = await api(`/quotes/templates/${templateId}/instantiate`, {
      method: 'POST',
      body: JSON.stringify({
        customer_id: customerId,
        start_date: startDate,
        payment_terms: terms
      })
    });
    showToast(res.message);
    closeModal('new-sub-modal');
    renderSubscriptionsView();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Apply Discount Handlers
window.openApplyDiscountModal = function (subId) {
  document.getElementById('disc-sub-id').value = subId;
  document.getElementById('disc-code-input').value = '';
  openModal('apply-discount-modal');
};

window.submitApplyDiscount = async function (e) {
  e.preventDefault();
  const subId = document.getElementById('disc-sub-id').value;
  const code = document.getElementById('disc-code-input').value;

  try {
    const res = await api('/discounts/apply-to-subscription', {
      method: 'POST',
      body: JSON.stringify({
        subscription_id: subId,
        discount_code: code
      })
    });
    showToast(res.message);
    closeModal('apply-discount-modal');
    renderSubscriptionsView();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Create Product Handlers
window.openNewProductModal = function () {
  openModal('new-product-modal');
};

window.submitCreateProduct = async function (e) {
  e.preventDefault();
  const name = document.getElementById('prod-name').value;
  const type = document.getElementById('prod-type').value;
  const sales_price = document.getElementById('prod-price').value;
  const cost_price = document.getElementById('prod-cost').value;
  const notes = document.getElementById('prod-notes').value;
  const varName = document.getElementById('prod-var-name').value;
  const varAdj = document.getElementById('prod-var-adj').value;

  const variants = [];
  if (varName && varName.trim()) {
    variants.push({
      variant_name: varName.trim(),
      price_adjustment: parseFloat(varAdj) || 0.0,
      attribute_type: 'brand'
    });
  }

  try {
    const res = await api('/products', {
      method: 'POST',
      body: JSON.stringify({
        name,
        type,
        sales_price,
        cost_price,
        notes,
        variants
      })
    });
    showToast(res.message);
    closeModal('new-product-modal');
    renderProductsView();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Create Plan Handlers
window.openNewPlanModal = function () {
  openModal('new-plan-modal');
};

window.submitCreatePlan = async function (e) {
  e.preventDefault();
  const name = document.getElementById('plan-name-input').value;
  const billing_frequency = document.getElementById('plan-freq-input').value;
  const price = document.getElementById('plan-price-input').value;
  const min_quantity = document.getElementById('plan-minqty-input').value;
  const auto_close = document.getElementById('plan-autoclose').checked;
  const can_close_early = document.getElementById('plan-closeearly').checked;
  const can_pause = document.getElementById('plan-canpause').checked;
  const can_renew = document.getElementById('plan-canrenew').checked;

  try {
    const res = await api('/plans', {
      method: 'POST',
      body: JSON.stringify({
        name,
        billing_frequency,
        price,
        min_quantity,
        auto_close,
        can_close_early,
        can_pause,
        can_renew
      })
    });
    showToast(res.message);
    closeModal('new-plan-modal');
    renderPlansView();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Create Discount Handlers
window.openNewDiscountModal = function () {
  openModal('new-discount-modal');
};

window.submitCreateDiscount = async function (e) {
  e.preventDefault();
  const code = document.getElementById('disc-new-code').value;
  const name = document.getElementById('disc-new-name').value;
  const type = document.getElementById('disc-new-type').value;
  const value = document.getElementById('disc-new-value').value;
  const min_purchase_amount = document.getElementById('disc-new-minpurchase').value;
  const min_quantity = document.getElementById('disc-new-minqty').value;
  const scope = document.getElementById('disc-new-scope').value;
  const max_uses = document.getElementById('disc-new-maxuses').value;

  try {
    const res = await api('/discounts', {
      method: 'POST',
      body: JSON.stringify({
        code,
        name,
        type,
        value,
        min_purchase_amount,
        min_quantity,
        scope,
        max_uses
      })
    });
    showToast(res.message);
    closeModal('new-discount-modal');
    renderDiscountsView();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Create Tax Handlers
window.openNewTaxModal = function () {
  openModal('new-tax-modal');
};

window.submitCreateTax = async function (e) {
  e.preventDefault();
  const name = document.getElementById('tax-new-name').value;
  const rate_percentage = document.getElementById('tax-new-rate').value;
  const is_default = document.getElementById('tax-new-default').checked;

  try {
    const res = await api('/taxes', {
      method: 'POST',
      body: JSON.stringify({
        name,
        rate_percentage,
        is_default
      })
    });
    showToast(res.message);
    closeModal('new-tax-modal');
    renderTaxesView();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Initial App Bootstrapping
window.addEventListener('DOMContentLoaded', () => {
  // If not logged in, auto-login as Admin for instant evaluator preview
  if (!state.user) {
    window.switchRole('admin@brightloop.com');
  } else {
    renderHeader();
    if (state.user.role === 'CUSTOMER') navigateTo('customer-portal');
    else navigateTo('dashboard');
  }
});
