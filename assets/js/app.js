/**
 * histoir.es — French history timeline explorer
 */

const API = 'https://historical-events.genealogie.app';
const PERIOD = 25; // years per period marker
const PX_PER_PERIOD = 120; // pixel width of each period in the timeline

const CATS = [
    { key: 'politics',     label: 'Politique',   icon: 'bi-bank',           color: '#1a5276' },
    { key: 'geopolitics',  label: 'Relations int.', icon: 'bi-globe2',      color: '#c0392b' },
    { key: 'territory',    label: 'Territoire',  icon: 'bi-map',            color: '#6c3483' },
    { key: 'colonisation', label: 'Colonisation', icon: 'bi-globe-americas', color: '#8b4513' },
    { key: 'science',      label: 'Sciences',    icon: 'bi-lightbulb',      color: '#2980b9' },
    { key: 'culture',      label: 'Culture',     icon: 'bi-palette',        color: '#8e44ad' },
    { key: 'economy',      label: 'Économie',    icon: 'bi-graph-up',       color: '#27ae60' },
    { key: 'health',       label: 'Santé',       icon: 'bi-heart-pulse',    color: '#e67e22' },
    { key: 'society',      label: 'Société',     icon: 'bi-people',         color: '#16a085' },
    { key: 'technology',   label: 'Technologie', icon: 'bi-cpu',            color: '#2dd4bf' },
];
const SCOPES = [
    { key: 'france', label: 'France' },
    { key: 'europe', label: 'Europe' },
    { key: 'mondial', label: 'Mondial' },
];
const C_LABELS = ['','Ier','IIe','IIIe','IVe','Ve','VIe','VIIe','VIIIe','IXe','Xe',
    'XIe','XIIe','XIIIe','XIVe','XVe','XVIe','XVIIe','XVIIIe','XIXe','XXe','XXIe'];

// --- State ---
let allEvents = [];
let leaders = [];
let wars = [];
let activeCentury = null;
let activePeriodStart = null;
let activeCategory = null;
let activeScope = null;
let searchQuery = '';
let periods = []; // [{start, end, count}]

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

        // Default: XVIIIe siècle (most genealogy interest)
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
    document.querySelectorAll('.c-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.c) === c));
    buildTimeline();
    // Select first period with events
    const firstWithEvents = periods.find(p => p.count > 0);
    if (firstWithEvents) selectPeriod(firstWithEvents.start);
    else applyFilters();
}

// ===================================================================
// Horizontal timeline
// ===================================================================
function buildTimeline() {
    const yearStart = (activeCentury - 1) * 100 + 1;
    const yearEnd = activeCentury * 100;

    // Build periods
    periods = [];
    const pStart = Math.floor(yearStart / PERIOD) * PERIOD;
    for (let y = pStart; y <= yearEnd; y += PERIOD) {
        const count = allEvents.filter(e => e.year >= y && e.year < y + PERIOD).length;
        periods.push({ start: y, end: y + PERIOD - 1, count });
    }

    const totalWidth = periods.length * PX_PER_PERIOD;
    const scroll = document.getElementById('timelineScroll');
    scroll.style.width = totalWidth + 'px';

    // Period markers
    const markersEl = document.getElementById('periodMarkers');
    markersEl.innerHTML = '';
    for (const p of periods) {
        const div = document.createElement('div');
        div.className = 'tl-period';
        div.style.width = PX_PER_PERIOD + 'px';
        div.dataset.start = p.start;
        div.innerHTML = `${p.start}${p.count ? `<span class="p-count">${p.count}</span>` : ''}`;
        if (p.count === 0) div.style.opacity = '0.4';
        div.onclick = () => selectPeriod(p.start);
        markersEl.appendChild(div);
    }

    // Leaders band
    renderBand('leadersBand', leaders, yearStart, yearEnd, totalWidth, (l) => {
        const cls = l.dynasty ? `dy-${l.dynasty}` : `rg-${l.regime}`;
        return cls;
    });

    // Wars band
    renderBand('warsBand', wars, yearStart, yearEnd, totalWidth, () => 'tl-war');
}

function renderBand(elId, items, yearStart, yearEnd, totalWidth, classFn) {
    const band = document.getElementById(elId);
    band.innerHTML = '';
    band.style.width = totalWidth + 'px';

    for (const item of items) {
        const iStart = parseYear(item.date || `01/01/${item.year}`);
        const iEnd = parseYear(item.endDate || item.date || `01/01/${item.year}`);
        if (iEnd < yearStart || iStart > yearEnd) continue;

        const clampedStart = Math.max(iStart, yearStart);
        const clampedEnd = Math.min(iEnd, yearEnd + 1);

        const leftPct = (clampedStart - yearStart) / (yearEnd + 1 - yearStart);
        const widthPct = (clampedEnd - clampedStart) / (yearEnd + 1 - yearStart);

        const seg = document.createElement('div');
        seg.className = `tl-segment ${classFn(item)}`;
        seg.style.left = (leftPct * totalWidth) + 'px';
        seg.style.width = Math.max(widthPct * totalWidth, 2) + 'px';
        seg.title = `${item.title || item.name} (${item.year})`;
        seg.innerHTML = `<span>${esc(item.title || item.name)}</span>`;
        band.appendChild(seg);
    }
}

function parseYear(dateStr) {
    if (!dateStr) return 0;
    const parts = dateStr.split('/');
    return parseFloat(parts[parts.length - 1]);
}

function selectPeriod(start) {
    activePeriodStart = start;
    document.querySelectorAll('.tl-period').forEach(p =>
        p.classList.toggle('active', Number(p.dataset.start) === start)
    );
    // Scroll period into view
    const el = document.querySelector(`.tl-period[data-start="${start}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    applyFilters();
}

// ===================================================================
// Sidebar filters
// ===================================================================
function buildFilters() {
    // Categories
    const catContainer = document.getElementById('categoryFilters');
    addFilterBtn(catContainer, '', 'Toutes', '#999', null, () => { activeCategory = null; applyFilters(); });
    for (const cat of CATS) {
        const count = allEvents.filter(e => e.category === cat.key).length;
        if (!count) continue;
        addFilterBtn(catContainer, cat.key, cat.label, cat.color, count, () => { activeCategory = cat.key; applyFilters(); });
    }

    // Scopes
    const scopeContainer = document.getElementById('scopeFilters');
    addFilterBtn(scopeContainer, '', 'Toutes', null, null, () => { activeScope = null; applyFilters(); });
    for (const s of SCOPES) {
        addFilterBtn(scopeContainer, s.key, s.label, null, null, () => { activeScope = s.key; applyFilters(); });
    }
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
// Filter & render events
// ===================================================================
function applyFilters() {
    let events = allEvents.filter(e => {
        if (activePeriodStart !== null) {
            if (e.year < activePeriodStart || e.year >= activePeriodStart + PERIOD) return false;
        } else if (activeCentury) {
            if (centuryOf(e.year) !== activeCentury) return false;
        }
        if (activeCategory && e.category !== activeCategory) return false;
        if (activeScope && e.scope !== activeScope) return false;
        if (searchQuery && !`${e.title} ${e.summary || ''}`.toLowerCase().includes(searchQuery)) return false;
        return true;
    });

    // Title
    const title = document.getElementById('periodTitle');
    if (activePeriodStart) {
        title.textContent = `${activePeriodStart} – ${activePeriodStart + PERIOD - 1}`;
    } else if (activeCentury) {
        title.textContent = `${C_LABELS[activeCentury] || activeCentury + 'e'} siècle`;
    } else {
        title.textContent = 'Tous les événements';
    }
    document.getElementById('filteredCount').textContent = `${events.length} événement${events.length > 1 ? 's' : ''}`;

    renderEvents(events);
}

function renderEvents(events) {
    const grid = document.getElementById('eventsGrid');
    if (!events.length) { grid.innerHTML = '<div class="loading">Aucun événement pour cette période</div>'; return; }

    // Group by category
    const byCategory = {};
    for (const e of events) (byCategory[e.category] || (byCategory[e.category] = [])).push(e);

    // Find parent bars (same logic as geneafan)
    const eventIndex = new Map(allEvents.map(e => [e.id, e]));

    const html = [];
    for (const cat of CATS) {
        const catEvents = byCategory[cat.key];
        if (!catEvents) continue;

        // Find parents for this category
        const parentIds = new Set(catEvents.filter(e => e.parentId).map(e => e.parentId));
        const candidates = [...parentIds].map(id => eventIndex.get(id)).filter(e => e?.endDate);
        // Keep only closest parents
        const candidateIds = new Set(candidates.map(e => e.id));
        for (const e of candidates) {
            if (e.parentId && candidateIds.has(e.parentId)) candidateIds.delete(e.parentId);
        }
        const parents = candidates.filter(e => candidateIds.has(e.id));

        // Parent color map
        const PCOLORS = ['#e74c3c', '#2980b9', '#27ae60', '#8e44ad', '#f39c12'];
        const pColorMap = new Map();
        parents.forEach((p, i) => pColorMap.set(p.id, i));

        // Exclude parent cards shown as bars
        const barIds = new Set(parents.map(p => p.id));
        const filtered = catEvents.filter(e => !barIds.has(e.id));
        if (!filtered.length && !parents.length) continue;

        // Parent bars HTML
        let barsHtml = '';
        if (parents.length) {
            barsHtml = '<div class="parent-bar-container">' + parents.map((p, i) => {
                const endParts = p.endDate.split('/');
                const endYear = endParts[endParts.length - 1];
                const bg = PCOLORS[i % PCOLORS.length];
                return `<div class="parent-bar" style="background:${bg}">${esc(p.title)}<span class="parent-bar-dates">${p.year}–${endYear}</span></div>`;
            }).join('') + '</div>';
        }

        // Cards
        const sorted = [...filtered].sort((a, b) => dateSortKey(a) - dateSortKey(b));
        const cardsHtml = sorted.map(e => {
            const colorIdx = e.parentId ? pColorMap.get(e.parentId) : undefined;
            const pColor = colorIdx !== undefined ? PCOLORS[colorIdx % PCOLORS.length] : null;
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
// Drag scroll for timeline
// ===================================================================
function setupDragScroll() {
    const vp = document.querySelector('.timeline-viewport');
    let isDown = false, startX, scrollLeft;
    vp.addEventListener('mousedown', e => { isDown = true; startX = e.pageX - vp.offsetLeft; scrollLeft = vp.scrollLeft; });
    vp.addEventListener('mouseleave', () => isDown = false);
    vp.addEventListener('mouseup', () => isDown = false);
    vp.addEventListener('mousemove', e => {
        if (!isDown) return;
        e.preventDefault();
        vp.scrollLeft = scrollLeft - (e.pageX - vp.offsetLeft - startX);
    });
}

// ===================================================================
// Helpers
// ===================================================================
function dateSortKey(evt) {
    const d = evt.date;
    if (!d) return (evt.year || 0) * 10000 + 101;
    const parts = d.split('/');
    if (parts.length === 3) return parseInt(parts[2]) * 10000 + parseInt(parts[1]) * 100 + parseInt(parts[0]);
    if (parts.length === 2) return parseInt(parts[1]) * 10000 + parseInt(parts[0]) * 100 + 1;
    return (evt.year || 0) * 10000 + 101;
}

function esc(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
