/**
 * histoir.es — Public historical events explorer
 * Loads events from historical-events.genealogie.app API
 */

const API_BASE = 'https://historical-events.genealogie.app';

const CATEGORIES = [
    { key: 'politics',     label: 'Politique intérieure', icon: 'bi-bank', color: '#1a5276' },
    { key: 'geopolitics',  label: 'Relations internationales', icon: 'bi-globe2', color: '#c0392b' },
    { key: 'territory',    label: 'Extension territoriale', icon: 'bi-map', color: '#6c3483' },
    { key: 'colonisation', label: 'Colonisation', icon: 'bi-globe-americas', color: '#8b4513' },
    { key: 'science',      label: 'Sciences', icon: 'bi-lightbulb', color: '#2980b9' },
    { key: 'culture',      label: 'Culture', icon: 'bi-palette', color: '#8e44ad' },
    { key: 'economy',      label: 'Économie', icon: 'bi-graph-up', color: '#27ae60' },
    { key: 'health',       label: 'Santé', icon: 'bi-heart-pulse', color: '#e67e22' },
    { key: 'society',      label: 'Société', icon: 'bi-people', color: '#16a085' },
    { key: 'technology',   label: 'Technologie', icon: 'bi-cpu', color: '#2dd4bf' },
];

const SCOPES = [
    { key: 'france', label: 'France' },
    { key: 'europe', label: 'Europe' },
    { key: 'mondial', label: 'Mondial' },
];

const CENTURY_LABELS = ['', 'Ier', 'IIe', 'IIIe', 'IVe', 'Ve', 'VIe', 'VIIe', 'VIIIe', 'IXe', 'Xe',
    'XIe', 'XIIe', 'XIIIe', 'XIVe', 'XVe', 'XVIe', 'XVIIe', 'XVIIIe', 'XIXe', 'XXe', 'XXIe'];

const DYNASTY_LABELS = {
    merovingiens: 'Mérovingiens', carolingiens: 'Carolingiens', robertiens: 'Robertiens',
    capetiens: 'Capétiens', valois: 'Valois', bourbons: 'Bourbons', orleans: 'Orléans'
};
const REGIME_LABELS = {
    republic: 'République', empire: 'Empire', revolution: 'Révolution', transitional: 'Transition'
};

// --- State ---
let allEvents = [];
let filteredEvents = [];
let activeCentury = null;
let activeCategory = null;
let activeScope = null;
let searchQuery = '';

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
    showLoading();
    try {
        const res = await fetch(`${API_BASE}/events`, { cache: 'no-store' });
        const payload = await res.json();
        allEvents = (payload.events || []).filter(e => e.subtype !== 'leader');

        document.getElementById('eventCount').textContent = allEvents.length;

        buildCenturyNav();
        buildCategoryFilters();
        buildScopeFilters();
        setupSearch();

        // Default: most populated century
        const centuries = countByCentury();
        const defaultCentury = Object.entries(centuries).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (defaultCentury) selectCentury(parseInt(defaultCentury));
        else applyFilters();
    } catch (err) {
        document.getElementById('eventsList').innerHTML =
            `<div class="loading-spinner">Erreur de chargement : ${err.message}</div>`;
    }
});

// --- Century navigation ---
function countByCentury() {
    const counts = {};
    for (const e of allEvents) {
        const c = Math.floor((e.year - 1) / 100) + 1;
        counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
}

function buildCenturyNav() {
    const counts = countByCentury();
    const nav = document.getElementById('centuryNav').querySelector('.century-nav-inner');
    const sorted = Object.keys(counts).map(Number).sort((a, b) => a - b);

    // "Tous" button
    const allBtn = document.createElement('button');
    allBtn.className = 'century-btn';
    allBtn.innerHTML = `Tous <span class="count">${allEvents.length}</span>`;
    allBtn.onclick = () => selectCentury(null);
    nav.appendChild(allBtn);

    for (const c of sorted) {
        const label = (CENTURY_LABELS[c] || c + 'e') + ' s.';
        const btn = document.createElement('button');
        btn.className = 'century-btn';
        btn.dataset.century = c;
        btn.innerHTML = `${label} <span class="count">${counts[c]}</span>`;
        btn.onclick = () => selectCentury(c);
        nav.appendChild(btn);
    }
}

function selectCentury(c) {
    activeCentury = c;
    document.querySelectorAll('.century-btn').forEach(btn => {
        btn.classList.toggle('active', c === null ? !btn.dataset.century : parseInt(btn.dataset.century) === c);
    });
    applyFilters();
}

// --- Category filters ---
function buildCategoryFilters() {
    const container = document.getElementById('categoryFilters');

    // "Toutes" button
    const allBtn = document.createElement('button');
    allBtn.className = 'filter-btn active';
    allBtn.dataset.cat = '';
    allBtn.innerHTML = '<span class="filter-dot" style="background:#999"></span> Toutes';
    allBtn.onclick = () => selectCategory(null);
    container.appendChild(allBtn);

    for (const cat of CATEGORIES) {
        const count = allEvents.filter(e => e.category === cat.key).length;
        if (count === 0) continue;
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.dataset.cat = cat.key;
        btn.innerHTML = `<span class="filter-dot" style="background:${cat.color}"></span> ${cat.label} <span class="filter-count">${count}</span>`;
        btn.onclick = () => selectCategory(cat.key);
        container.appendChild(btn);
    }
}

function selectCategory(key) {
    activeCategory = key;
    document.querySelectorAll('#categoryFilters .filter-btn').forEach(btn => {
        btn.classList.toggle('active', key === null ? !btn.dataset.cat : btn.dataset.cat === key);
    });
    applyFilters();
}

// --- Scope filters ---
function buildScopeFilters() {
    const container = document.getElementById('scopeFilters');

    const allBtn = document.createElement('button');
    allBtn.className = 'filter-btn active';
    allBtn.dataset.scope = '';
    allBtn.textContent = 'Toutes';
    allBtn.onclick = () => selectScope(null);
    container.appendChild(allBtn);

    for (const scope of SCOPES) {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.dataset.scope = scope.key;
        btn.textContent = scope.label;
        btn.onclick = () => selectScope(scope.key);
        container.appendChild(btn);
    }
}

function selectScope(key) {
    activeScope = key;
    document.querySelectorAll('#scopeFilters .filter-btn').forEach(btn => {
        btn.classList.toggle('active', key === null ? !btn.dataset.scope : btn.dataset.scope === key);
    });
    applyFilters();
}

// --- Search ---
function setupSearch() {
    let timer;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            searchQuery = e.target.value.trim().toLowerCase();
            applyFilters();
        }, 200);
    });
}

// --- Filter & render ---
function applyFilters() {
    filteredEvents = allEvents.filter(e => {
        if (activeCentury !== null) {
            const c = Math.floor((e.year - 1) / 100) + 1;
            if (c !== activeCentury) return false;
        }
        if (activeCategory && e.category !== activeCategory) return false;
        if (activeScope && e.scope !== activeScope) return false;
        if (searchQuery) {
            const haystack = `${e.title} ${e.summary || ''}`.toLowerCase();
            if (!haystack.includes(searchQuery)) return false;
        }
        return true;
    });

    // Update title
    const titleEl = document.getElementById('periodTitle');
    if (activeCentury) {
        const label = (CENTURY_LABELS[activeCentury] || activeCentury + 'e') + ' siècle';
        titleEl.textContent = label;
    } else {
        titleEl.textContent = 'Tous les événements';
    }

    document.getElementById('filteredCount').textContent = `${filteredEvents.length} événement${filteredEvents.length > 1 ? 's' : ''}`;

    renderEvents(filteredEvents);
}

function renderEvents(events) {
    const container = document.getElementById('eventsList');

    if (events.length === 0) {
        container.innerHTML = '<div class="loading-spinner">Aucun événement trouvé</div>';
        return;
    }

    // Group by year
    const byYear = {};
    for (const e of events) {
        (byYear[e.year] || (byYear[e.year] = [])).push(e);
    }

    const html = [];
    for (const year of Object.keys(byYear).sort((a, b) => a - b)) {
        for (const e of byYear[year]) {
            html.push(renderEventCard(e));
        }
    }

    container.innerHTML = html.join('');
}

function renderEventCard(e) {
    const cat = CATEGORIES.find(c => c.key === e.category);
    const catLabel = cat?.label || e.category;
    const catColor = cat?.color || '#999';

    const img = e.imageUrl
        ? `<img class="event-card-img" src="${escHtml(e.imageUrl)}" loading="lazy" alt="">`
        : `<div class="event-card-img-placeholder"><i class="bi ${cat?.icon || 'bi-clock'}"></i></div>`;

    const hasWiki = e.wikiTitle && e.summary;
    const tag = hasWiki ? 'a' : 'div';
    const href = hasWiki ? ` href="https://fr.wikipedia.org/wiki/${encodeURIComponent(e.wikiTitle)}" target="_blank" rel="noopener"` : '';

    const scopeLabel = SCOPES.find(s => s.key === e.scope)?.label || e.scope;

    const endDateHtml = e.endDate
        ? `<span class="event-card-enddate">→ ${e.endDate}</span>`
        : '';

    return `<${tag} class="event-card" data-cat="${e.category}"${href}>
        ${img}
        <div class="event-card-body">
            <div class="event-card-topline">
                <span class="event-card-date">${e.date || e.year}</span>
                ${endDateHtml}
                <div class="event-card-badges">
                    <span class="event-badge" style="background:${catColor}">${catLabel}</span>
                    <span class="event-badge" style="background:#888">${scopeLabel}</span>
                </div>
            </div>
            <div class="event-card-title">${escHtml(e.title)}</div>
            ${e.summary ? `<div class="event-card-summary">${escHtml(e.summary)}</div>` : ''}
        </div>
    </${tag}>`;
}

function showLoading() {
    document.getElementById('eventsList').innerHTML = '<div class="loading-spinner"><i class="bi bi-hourglass-split"></i> Chargement des événements...</div>';
}

function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
