/**
 * histoir.es — French history timeline explorer
 * Two-level navigation: 5-year periods on horizontal bar → year pills → event cards
 */

const API = 'https://historical-events.genealogie.app';
const YEARS_GROUP = 5;

const CATS = [
    { key: 'politics',     label: 'Politique',      icon: 'bi-bank',            color: '#1a5276' },
    { key: 'geopolitics',  label: 'Relations int.',  icon: 'bi-globe2',          color: '#c0392b' },
    { key: 'territory',    label: 'Territoire',      icon: 'bi-map',             color: '#6c3483' },
    { key: 'colonisation', label: 'Colonisation',    icon: 'bi-globe-americas',  color: '#8b4513' },
    { key: 'science',      label: 'Sciences',        icon: 'bi-lightbulb',       color: '#2980b9' },
    { key: 'culture',      label: 'Culture',         icon: 'bi-palette',         color: '#8e44ad' },
    { key: 'economy',      label: 'Économie',        icon: 'bi-graph-up',        color: '#27ae60' },
    { key: 'health',       label: 'Santé',           icon: 'bi-heart-pulse',     color: '#e67e22' },
    { key: 'society',      label: 'Société',         icon: 'bi-people',          color: '#16a085' },
    { key: 'technology',   label: 'Technologie',     icon: 'bi-cpu',             color: '#2dd4bf' },
];
const SCOPES = [
    { key: 'france', label: 'France' },
    { key: 'europe', label: 'Europe' },
    { key: 'mondial', label: 'Mondial' },
];
const C_LABELS = ['','Ier','IIe','IIIe','IVe','Ve','VIe','VIIe','VIIIe','IXe','Xe',
    'XIe','XIIe','XIIIe','XIVe','XVe','XVIe','XVIIe','XVIIIe','XIXe','XXe','XXIe'];

const PARENT_COLORS = ['#e74c3c', '#2980b9', '#27ae60', '#8e44ad', '#f39c12'];

// --- State ---
let allEvents = [];
let leaders = [];
let wars = [];
let activeCentury = null;
let activePeriodStart = null;
let activeYear = null;
let activeCategory = null;
let activeScope = null;
let searchQuery = '';

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('eventsGrid').innerHTML = '<div class="loading">Chargement...</div>';
    try {
        const res = await fetch(`${API}/events`, { cache: 'no-store' });
        const payload = await res.json();
        const raw = payload.events || [];

        allEvents = raw.filter(e => e.subtype !== 'leader');
        leaders = raw.filter(e => e.subtype === 'leader');
        wars = raw.filter(e => e.subtype === 'war' && e.isParent && !e.parentId);

        document.getElementById('eventCount').textContent = `${allEvents.length} événements`;

        buildCenturyBar();
        buildFilters();
        setupSearch();
        setupDragScroll();
        setupOffcanvas();

        selectCentury(18);
    } catch (err) {
        document.getElementById('eventsGrid').innerHTML = `<div class="loading">Erreur : ${err.message}</div>`;
    }
});

// ===================================================================
// Century bar
// ===================================================================
function centuryOf(year) { return Math.floor((year - 1) / 100) + 1; }

function buildCenturyBar() {
    const counts = {};
    for (const e of allEvents) { const c = centuryOf(e.year); counts[c] = (counts[c] || 0) + 1; }
    const bar = document.getElementById('centuryBar');
    for (const c of Object.keys(counts).map(Number).sort((a, b) => a - b)) {
        const btn = document.createElement('button');
        btn.className = 'c-btn';
        btn.dataset.c = c;
        btn.innerHTML = `${C_LABELS[c] || c + 'e'} s. <span class="cnt">${counts[c]}</span>`;
        btn.onclick = () => selectCentury(c);
        bar.appendChild(btn);
    }
}

function selectCentury(c) {
    activeCentury = c;
    activePeriodStart = null;
    activeYear = null;
    document.querySelectorAll('.c-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.c) === c));
    buildTimeline();
}

// ===================================================================
// Horizontal timeline with 5-year periods
// ===================================================================
function buildTimeline() {
    const yearStart = (activeCentury - 1) * 100 + 1;
    const yearEnd = activeCentury * 100;

    // Count events per 5-year period
    const periodStarts = [];
    for (let y = Math.floor(yearStart / YEARS_GROUP) * YEARS_GROUP; y <= yearEnd; y += YEARS_GROUP) {
        periodStarts.push(y);
    }

    const PX_PER_PERIOD = Math.max(80, Math.min(120, Math.floor(window.innerWidth / periodStarts.length)));
    const totalWidth = periodStarts.length * PX_PER_PERIOD;

    const scroll = document.getElementById('timelineScroll');
    scroll.style.width = totalWidth + 'px';

    // Period markers (the bar with date links)
    const markersEl = document.getElementById('periodMarkers');
    markersEl.innerHTML = '';
    for (const ps of periodStarts) {
        const count = allEvents.filter(e => e.year >= ps && e.year < ps + YEARS_GROUP).length;
        const div = document.createElement('div');
        div.className = 'tl-period';
        div.style.width = PX_PER_PERIOD + 'px';
        div.dataset.start = ps;
        div.innerHTML = `<span class="tl-period-year">${ps}</span>`;
        if (count > 0) {
            const dot = document.createElement('span');
            dot.className = 'tl-dot';
            div.appendChild(dot);
            const badge = document.createElement('span');
            badge.className = 'tl-count';
            badge.textContent = count;
            div.appendChild(badge);
        } else {
            div.style.opacity = '0.35';
        }
        div.onclick = () => { if (count > 0) selectPeriodFromBar(ps); };
        markersEl.appendChild(div);
    }

    // Leaders band
    renderBand('leadersBand', leaders, yearStart, yearEnd, totalWidth, l =>
        l.dynasty ? `dy-${l.dynasty}` : `rg-${l.regime}`
    );

    // Wars band
    renderBand('warsBand', wars, yearStart, yearEnd, totalWidth, () => 'tl-war');

    // Auto-select first period with events
    const firstWithEvents = periodStarts.find(ps =>
        allEvents.some(e => e.year >= ps && e.year < ps + YEARS_GROUP)
    );
    if (firstWithEvents !== undefined) selectPeriodFromBar(firstWithEvents);
}

function renderBand(elId, items, yearStart, yearEnd, totalWidth, classFn) {
    const band = document.getElementById(elId);
    band.innerHTML = '';
    band.style.width = totalWidth + 'px';

    const span = yearEnd + 1 - yearStart;
    for (const item of items) {
        const iStart = parseDateToFrac(item.date || `01/01/${item.year}`);
        const iEnd = parseDateToFrac(item.endDate || item.date || `01/01/${item.year}`);
        if (iEnd < yearStart || iStart > yearEnd + 1) continue;

        const cs = Math.max(iStart, yearStart);
        const ce = Math.min(iEnd, yearEnd + 1);

        const leftPx = ((cs - yearStart) / span) * totalWidth;
        const widthPx = Math.max(((ce - cs) / span) * totalWidth, 2);

        const seg = document.createElement('div');
        seg.className = `tl-segment ${classFn(item)}`;
        seg.style.left = leftPx + 'px';
        seg.style.width = widthPx + 'px';
        seg.title = `${item.title} (${item.year})`;
        seg.innerHTML = `<span>${esc(item.title)}</span>`;
        band.appendChild(seg);
    }
}

function parseDateToFrac(d) {
    if (!d) return 0;
    const p = d.split('/');
    if (p.length === 3) return parseInt(p[2]) + (parseInt(p[1]) - 1) / 12 + (parseInt(p[0]) - 1) / 365;
    if (p.length === 2) return parseInt(p[1]) + (parseInt(p[0]) - 1) / 12;
    return parseInt(p[0]) || 0;
}

// ===================================================================
// Period selection → year pills
// ===================================================================
function selectPeriodFromBar(ps) {
    activePeriodStart = ps;
    activeYear = null;

    // Highlight period on bar
    document.querySelectorAll('.tl-period').forEach(p =>
        p.classList.toggle('active', Number(p.dataset.start) === ps)
    );

    // Scroll into view
    const el = document.querySelector(`.tl-period[data-start="${ps}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

    // Build year pills
    buildYearPills(ps);
}

function buildYearPills(periodStart) {
    const container = document.getElementById('yearPills');
    container.innerHTML = '';

    let firstYearWithEvents = null;
    for (let y = periodStart; y < periodStart + YEARS_GROUP; y++) {
        const count = allEvents.filter(e => e.year === y).length;
        const btn = document.createElement('button');
        btn.className = 'yr-pill' + (count === 0 ? ' empty' : '');
        btn.dataset.year = y;
        btn.disabled = count === 0;
        btn.innerHTML = `${y}${count ? ` <span class="yr-cnt">${count}</span>` : ''}`;
        btn.onclick = () => selectYear(y);
        container.appendChild(btn);

        if (count > 0 && firstYearWithEvents === null) firstYearWithEvents = y;
    }

    // Auto-select first year with events
    if (firstYearWithEvents !== null) selectYear(firstYearWithEvents);
}

function selectYear(y) {
    activeYear = y;
    document.querySelectorAll('.yr-pill').forEach(p =>
        p.classList.toggle('active', Number(p.dataset.year) === y)
    );
    applyFilters();
}

// ===================================================================
// Sidebar filters
// ===================================================================
function buildFilters() {
    const catContainer = document.getElementById('categoryFilters');
    addFilterBtn(catContainer, '', 'Toutes', '#999', null, () => { activeCategory = null; updateFilterToggle(); applyFilters(); });
    for (const cat of CATS) {
        const count = allEvents.filter(e => e.category === cat.key).length;
        if (!count) continue;
        addFilterBtn(catContainer, cat.key, cat.label, cat.color, count, () => { activeCategory = cat.key; updateFilterToggle(); applyFilters(); });
    }
    const scopeContainer = document.getElementById('scopeFilters');
    addFilterBtn(scopeContainer, '', 'Toutes', null, null, () => { activeScope = null; updateFilterToggle(); applyFilters(); });
    for (const s of SCOPES) addFilterBtn(scopeContainer, s.key, s.label, null, null, () => { activeScope = s.key; updateFilterToggle(); applyFilters(); });
}

function addFilterBtn(container, key, label, color, count, onClick) {
    const btn = document.createElement('button');
    btn.className = `f-btn${!key ? ' active' : ''}`;
    btn.dataset.key = key;
    const dot = color ? `<span class="f-dot" style="background:${color}"></span>` : '';
    const cnt = count ? `<span class="f-cnt">${count}</span>` : '';
    btn.innerHTML = `${dot}${label}${cnt}`;
    btn.onclick = () => {
        container.querySelectorAll('.f-btn').forEach(b => b.classList.toggle('active', b === btn));
        onClick();
    };
    container.appendChild(btn);
}

function setupSearch() {
    let t;
    document.getElementById('searchInput').addEventListener('input', e => {
        clearTimeout(t);
        t = setTimeout(() => { searchQuery = e.target.value.trim().toLowerCase(); applyFilters(); }, 200);
    });
}

// ===================================================================
// Filter & render
// ===================================================================
function applyFilters() {
    let events = allEvents.filter(e => {
        if (activeYear !== null) { if (e.year !== activeYear) return false; }
        else if (activePeriodStart !== null) { if (e.year < activePeriodStart || e.year >= activePeriodStart + YEARS_GROUP) return false; }
        else if (activeCentury) { if (centuryOf(e.year) !== activeCentury) return false; }
        if (activeCategory && e.category !== activeCategory) return false;
        if (activeScope && e.scope !== activeScope) return false;
        if (searchQuery && !`${e.title} ${e.summary || ''}`.toLowerCase().includes(searchQuery)) return false;
        return true;
    });

    const title = document.getElementById('periodTitle');
    if (activeYear) title.textContent = String(activeYear);
    else if (activePeriodStart) title.textContent = `${activePeriodStart} – ${activePeriodStart + YEARS_GROUP - 1}`;
    else if (activeCentury) title.textContent = `${C_LABELS[activeCentury] || activeCentury + 'e'} siècle`;
    else title.textContent = 'Tous les événements';

    document.getElementById('filteredCount').textContent = `${events.length} événement${events.length > 1 ? 's' : ''}`;
    renderEvents(events);
}

function renderEvents(events) {
    const grid = document.getElementById('eventsGrid');
    if (!events.length) { grid.innerHTML = '<div class="loading">Aucun événement</div>'; return; }

    const byCategory = {};
    for (const e of events) (byCategory[e.category] || (byCategory[e.category] = [])).push(e);

    const eventIndex = new Map(allEvents.map(e => [e.id, e]));
    const html = [];

    for (const cat of CATS) {
        const catEvents = byCategory[cat.key];
        if (!catEvents) continue;

        // Find parent bars
        const parentIds = new Set(catEvents.filter(e => e.parentId).map(e => e.parentId));
        const candidates = [...parentIds].map(id => eventIndex.get(id)).filter(e => e?.endDate);
        const candidateIds = new Set(candidates.map(e => e.id));
        for (const e of candidates) {
            if (e.parentId && candidateIds.has(e.parentId)) candidateIds.delete(e.parentId);
        }
        const parents = candidates.filter(e => candidateIds.has(e.id));

        const pColorMap = new Map();
        if (parents.length > 0) parents.forEach((p, i) => pColorMap.set(p.id, i));

        const barIds = new Set(parents.map(p => p.id));
        const filtered = catEvents.filter(e => !barIds.has(e.id));
        if (!filtered.length && !parents.length) continue;

        // Parent bars
        let barsHtml = '';
        if (parents.length) {
            barsHtml = '<div class="parent-bar-container">' + parents.map((p, i) => {
                const endParts = p.endDate.split('/');
                const endYear = endParts[endParts.length - 1];
                const bg = PARENT_COLORS[i % PARENT_COLORS.length];
                return `<div class="parent-bar" style="background:${bg}">${esc(p.title)}<span class="parent-bar-dates">${p.year}–${endYear}</span></div>`;
            }).join('') + '</div>';
        }

        // Cards
        const sorted = [...filtered].sort((a, b) => dateSortKey(a) - dateSortKey(b));
        const cardsHtml = sorted.map(e => {
            const colorIdx = e.parentId ? pColorMap.get(e.parentId) : undefined;
            const pColor = colorIdx !== undefined ? PARENT_COLORS[colorIdx % PARENT_COLORS.length] : null;
            const borderStyle = pColor ? `border-left:3px solid ${pColor}` : '';
            const titleStyle = pColor ? `color:${pColor}` : '';

            const img = e.imageUrl
                ? `<img class="ev-img" src="${esc(e.imageUrl)}" loading="lazy" alt="">`
                : `<div class="ev-img-ph"><i class="bi ${cat.icon}"></i></div>`;

            const tag = e.wikiTitle && e.summary ? 'a' : 'div';
            const href = e.wikiTitle && e.summary
                ? ` href="https://fr.wikipedia.org/wiki/${encodeURIComponent(e.wikiTitle)}" target="_blank" rel="noopener"` : '';
            const scopeLabel = SCOPES.find(s => s.key === e.scope)?.label || '';
            const summaryHtml = e.summary ? `<div class="ev-summary">${esc(e.summary)}</div>` : '';

            return `<${tag} class="ev-card" style="${borderStyle}"${href}>
                ${img}
                <div class="ev-body">
                    <span class="ev-date">${e.date || e.year}</span>
                    <span class="ev-title" style="${titleStyle}">${esc(e.title)}</span>
                    <span class="ev-scope">${scopeLabel}</span>
                    ${summaryHtml}
                </div>
            </${tag}>`;
        }).join('');

        html.push(`<div class="cat-row">
            <div class="cat-label" style="background:${cat.color}"><i class="bi ${cat.icon}"></i><span>${cat.label}</span></div>
            <div class="cat-content">${barsHtml}<div class="cards-scroll">${cardsHtml}</div></div>
        </div>`);
    }

    grid.innerHTML = html.join('');
}

// ===================================================================
// Offcanvas
// ===================================================================
function setupOffcanvas() {
    const toggle = document.getElementById('filterToggle');
    const overlay = document.getElementById('offcanvasOverlay');
    const panel = document.getElementById('offcanvasPanel');
    const close = document.getElementById('offcanvasClose');

    const open = () => { overlay.classList.add('open'); panel.classList.add('open'); };
    const shut = () => { overlay.classList.remove('open'); panel.classList.remove('open'); };

    toggle.onclick = open;
    overlay.onclick = shut;
    close.onclick = shut;
}

function updateFilterToggle() {
    const btn = document.getElementById('filterToggle');
    btn.classList.toggle('has-filter', !!(activeCategory || activeScope));
}

// ===================================================================
// Drag scroll
// ===================================================================
function setupDragScroll() {
    const vp = document.querySelector('.timeline-viewport');
    let isDown = false, startX, scrollLeft;
    vp.addEventListener('mousedown', e => { isDown = true; startX = e.pageX - vp.offsetLeft; scrollLeft = vp.scrollLeft; });
    vp.addEventListener('mouseleave', () => isDown = false);
    vp.addEventListener('mouseup', () => isDown = false);
    vp.addEventListener('mousemove', e => {
        if (!isDown) return; e.preventDefault();
        vp.scrollLeft = scrollLeft - (e.pageX - vp.offsetLeft - startX);
    });
}

// ===================================================================
// Helpers
// ===================================================================
function dateSortKey(evt) {
    const d = evt.date;
    if (!d) return (evt.year || 0) * 10000 + 101;
    const p = d.split('/');
    if (p.length === 3) return parseInt(p[2]) * 10000 + parseInt(p[1]) * 100 + parseInt(p[0]);
    if (p.length === 2) return parseInt(p[1]) * 10000 + parseInt(p[0]) * 100 + 1;
    return (evt.year || 0) * 10000 + 101;
}

function esc(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
