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
let centuryDescriptions = {};

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

        // Load century descriptions
        try {
            const cRes = await fetch(`${API}/centuries`, { cache: 'no-store' });
            centuryDescriptions = await cRes.json();
        } catch { centuryDescriptions = {}; }

        buildCenturyBar();
        buildFilters();
        setupSearch();
        setupDragScroll();
        setupTimelineNav();
        setupKeyboardNav();
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
    // Period grid: aligned to 5-year boundaries
    const periodStarts = [];
    const rawStart = (activeCentury - 1) * 100 + 1;
    const rawEnd = activeCentury * 100;
    const gridStart = Math.floor(rawStart / YEARS_GROUP) * YEARS_GROUP; // e.g. 1700
    for (let y = gridStart; y <= rawEnd; y += YEARS_GROUP) {
        periodStarts.push(y);
    }
    const gridEnd = periodStarts[periodStarts.length - 1] + YEARS_GROUP; // e.g. 1805

    const PX_PER_PERIOD = 140;
    const totalWidth = periodStarts.length * PX_PER_PERIOD;

    const scroll = document.getElementById('timelineScroll');
    scroll.style.width = totalWidth + 'px';

    // Period markers
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

    // Bands use the same grid range so they align with period markers
    renderBand('leadersBand', leaders, gridStart, gridEnd, totalWidth, l =>
        l.dynasty ? `dy-${l.dynasty}` : `rg-${l.regime}`
    );
    renderBand('warsBand', wars, gridStart, gridEnd, totalWidth, () => 'tl-war');

    // Auto-select first period with events
    const firstWithEvents = periodStarts.find(ps =>
        allEvents.some(e => e.year >= ps && e.year < ps + YEARS_GROUP)
    );
    if (firstWithEvents !== undefined) selectPeriodFromBar(firstWithEvents);
}

function renderBand(elId, items, gridStart, gridEnd, totalWidth, classFn) {
    const band = document.getElementById(elId);
    band.innerHTML = '';
    band.style.width = totalWidth + 'px';

    const span = gridEnd - gridStart;
    for (const item of items) {
        const iStart = parseDateToFrac(item.date || `01/01/${item.year}`);
        const iEnd = parseDateToFrac(item.endDate || item.date || `01/01/${item.year}`);
        if (iEnd < gridStart || iStart > gridEnd) continue;

        const cs = Math.max(iStart, gridStart);
        const ce = Math.min(iEnd, gridEnd);

        const leftPx = ((cs - gridStart) / span) * totalWidth;
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

    // Scroll period into view within the timeline viewport
    const el = document.querySelector(`.tl-period[data-start="${ps}"]`);
    if (el) {
        const vp = document.getElementById('timelineViewport');
        const elLeft = el.offsetLeft;
        const vpWidth = vp.clientWidth;
        vp.scrollLeft = elLeft - vpWidth / 2 + el.offsetWidth / 2;
    }

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
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', 'false');
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
    document.querySelectorAll('.yr-pill').forEach(p => {
        const isActive = Number(p.dataset.year) === y;
        p.classList.toggle('active', isActive);
        p.setAttribute('aria-selected', String(isActive));
    });
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

    // Century description: title always visible, content in accordion
    const descEl = document.getElementById('centuryDesc');
    const raw = activeCentury ? centuryDescriptions[String(activeCentury)] : null;
    // Support legacy string and new {title, content} format
    const descData = typeof raw === 'string' ? { title: raw, content: '' } : raw;

    if (descData?.title) {
        const centuryLabel = (C_LABELS[activeCentury] || activeCentury + 'e') + ' siècle';
        const hasContent = !!descData.content;
        if (hasContent) {
            descEl.innerHTML =
                `<details class="century-details"><summary><strong>${esc(centuryLabel)}\u00a0:</strong> ${esc(descData.title)}</summary><p>${esc(descData.content)}</p></details>`;
        } else {
            descEl.innerHTML = `<strong>${esc(centuryLabel)}\u00a0:</strong> ${esc(descData.title)}`;
        }
    } else {
        descEl.textContent = '';
    }
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

        // Find parent bars:
        // 1. Parents referenced by child events in this year
        // 2. Events that ARE parents themselves (isParent + endDate) in this year
        const parentIds = new Set(catEvents.filter(e => e.parentId).map(e => e.parentId));
        const candidates = [...parentIds].map(id => eventIndex.get(id)).filter(e => e?.endDate);

        // Also include events in this year that are parents with duration
        for (const e of catEvents) {
            if (e.isParent && e.endDate && !candidates.some(c => c.id === e.id)) {
                candidates.push(e);
            }
        }

        // Keep only lowest-level parents (remove grandparents)
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
                const hasSummary = !!p.summary;
                const chevron = hasSummary ? '<i class="bi bi-chevron-down parent-bar-chevron"></i>' : '';
                const summaryHtml = hasSummary
                    ? `<div class="parent-bar-summary">${esc(p.summary)}</div>`
                    : '';
                const wikiLink = p.wikiTitle && p.summary
                    ? ` <a href="https://fr.wikipedia.org/wiki/${encodeURIComponent(p.wikiTitle)}" target="_blank" rel="noopener" class="parent-bar-wiki" onclick="event.stopPropagation()"><i class="bi bi-box-arrow-up-right"></i></a>`
                    : '';
                return `<div class="parent-bar${hasSummary ? ' has-summary' : ''}" style="background:${bg}" onclick="this.classList.toggle('expanded')">${chevron}<span class="parent-bar-title">${esc(p.title)}</span>${wikiLink}<span class="parent-bar-dates">${p.year}–${endYear}</span>${summaryHtml}</div>`;
            }).join('') + '</div>';
        }

        // Cards — built from <template> via cloneNode
        const sorted = [...filtered].sort((a, b) => dateSortKey(a) - dateSortKey(b));
        const cardTemplate = document.getElementById('evCardTemplate');
        const cardsFragment = document.createDocumentFragment();

        for (const e of sorted) {
            const colorIdx = e.parentId ? pColorMap.get(e.parentId) : undefined;
            const pColor = colorIdx !== undefined ? PARENT_COLORS[colorIdx % PARENT_COLORS.length] : null;

            const clone = cardTemplate.content.firstElementChild.cloneNode(true);

            // Border color for parent grouping
            if (pColor) clone.style.borderLeft = `3px solid ${pColor}`;

            // If wiki link, convert article to anchor
            const isLink = e.wikiTitle && e.summary;
            let card;
            if (isLink) {
                card = document.createElement('a');
                for (const attr of clone.attributes) card.setAttribute(attr.name, attr.value);
                card.innerHTML = clone.innerHTML;
                card.href = `https://fr.wikipedia.org/wiki/${encodeURIComponent(e.wikiTitle)}`;
                card.target = '_blank';
                card.rel = 'noopener';
                if (pColor) card.style.borderLeft = `3px solid ${pColor}`;
            } else {
                card = clone;
            }

            // Image
            const imgSlot = card.querySelector('.ev-img-ph');
            if (e.imageUrl) {
                const img = document.createElement('img');
                img.className = 'ev-img';
                img.src = e.imageUrl;
                img.loading = 'lazy';
                img.alt = e.title || 'Événement historique';
                imgSlot.replaceWith(img);
            } else {
                imgSlot.querySelector('i').className = `bi ${cat.icon}`;
            }

            // Date
            const timeEl = card.querySelector('.ev-date');
            const dateDisplay = e.date || String(e.year);
            const isoDate = toIsoDate(e.date, e.year);
            if (isoDate) timeEl.setAttribute('datetime', isoDate);
            timeEl.textContent = dateDisplay;

            // Title
            const titleEl = card.querySelector('.ev-title');
            titleEl.textContent = e.title;
            if (pColor) titleEl.style.color = pColor;

            // Scope
            const scopeLabel = SCOPES.find(s => s.key === e.scope)?.label || '';
            card.querySelector('.ev-scope').textContent = scopeLabel;

            // Summary
            const summaryEl = card.querySelector('.ev-summary');
            if (e.summary) {
                summaryEl.textContent = e.summary;
            } else {
                summaryEl.remove();
            }

            cardsFragment.appendChild(card);
        }

        // Serialize fragment to HTML for insertion into the grid
        const cardsDiv = document.createElement('div');
        cardsDiv.appendChild(cardsFragment);
        const cardsHtml = cardsDiv.innerHTML;

        html.push(`<div class="cat-row">
            <div class="cat-header">
                <div class="cat-label" style="background:${cat.color}"><i class="bi ${cat.icon}"></i><span>${cat.label}</span></div>
                ${barsHtml}
            </div>
            <div class="cards-scroll">${cardsHtml}</div>
        </div>`);
    }

    grid.innerHTML = html.join('');
}

// ===================================================================
// Timeline scroll navigation (arrows + keyboard)
// ===================================================================
function setupTimelineNav() {
    const vp = document.getElementById('timelineViewport');
    document.getElementById('tlNavLeft').onclick = () => { vp.scrollLeft -= 300; };
    document.getElementById('tlNavRight').onclick = () => { vp.scrollLeft += 300; };
}

function setupKeyboardNav() {
    document.addEventListener('keydown', (e) => {
        // Don't capture if typing in search
        if (e.target.tagName === 'INPUT') return;

        const vp = document.getElementById('timelineViewport');
        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                if (e.shiftKey) {
                    // Shift+Left: previous period
                    navigatePeriod(-1);
                } else {
                    // Left: previous year
                    navigateYear(-1);
                }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (e.shiftKey) {
                    // Shift+Right: next period
                    navigatePeriod(1);
                } else {
                    // Right: next year
                    navigateYear(1);
                }
                break;
            case 'Home':
                e.preventDefault();
                vp.scrollLeft = 0;
                break;
            case 'End':
                e.preventDefault();
                vp.scrollLeft = vp.scrollWidth;
                break;
        }
    });
}

function navigateYear(direction) {
    if (activeYear === null) return;
    const pills = [...document.querySelectorAll('.yr-pill:not(:disabled)')];
    const years = pills.map(p => Number(p.dataset.year));
    const idx = years.indexOf(activeYear);
    const next = idx + direction;
    if (next >= 0 && next < years.length) {
        selectYear(years[next]);
    } else if (direction > 0) {
        // Move to next period
        navigatePeriod(1);
    } else {
        // Move to previous period
        navigatePeriod(-1);
    }
}

function navigatePeriod(direction) {
    const periodEls = [...document.querySelectorAll('.tl-period[data-start]')];
    const starts = periodEls.filter(p => p.style.opacity !== '0.35').map(p => Number(p.dataset.start));
    const idx = starts.indexOf(activePeriodStart);
    const next = idx + direction;
    if (next >= 0 && next < starts.length) {
        selectPeriodFromBar(starts[next]);
    } else {
        // Cross century boundary
        const centuries = [...document.querySelectorAll('.c-btn[data-c]')]
            .map(b => Number(b.dataset.c)).sort((a, b) => a - b);
        const cIdx = centuries.indexOf(activeCentury);
        const nextC = cIdx + direction;
        if (nextC >= 0 && nextC < centuries.length) {
            selectCentury(centuries[nextC]);
            // After century switch, select last or first period
            setTimeout(() => {
                const newPeriods = [...document.querySelectorAll('.tl-period[data-start]')]
                    .filter(p => p.style.opacity !== '0.35').map(p => Number(p.dataset.start));
                if (newPeriods.length > 0) {
                    selectPeriodFromBar(direction > 0 ? newPeriods[0] : newPeriods[newPeriods.length - 1]);
                }
            }, 50);
        }
    }
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

function toIsoDate(dateStr, year) {
    if (!dateStr) return year ? String(year) : null;
    const p = dateStr.split('/');
    if (p.length === 3) return `${p[2]}-${p[1]}-${p[0]}`;
    if (p.length === 2) return `${p[1]}-${p[0]}`;
    return null;
}

function esc(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
