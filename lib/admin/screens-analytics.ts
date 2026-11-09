/**
 * Admin > Analytics & SEO: two tabs, administrators only. Analytics shows the site's own log or
 * Google Analytics in one layout; SEO shows the page-by-page check and Search Console.
 */
import { appStats, statsConnected, type AppStats } from '../app-stats';
import { adminUrl } from '../data';
import { bingConnected, bingReport } from '../bing-data';
import { analyticsReport, googleConnected, sampleSearch, sampleUsage, searchReport, type SearchReport, type SearchRow } from '../google-data';
import { DESC_MAX, DESC_MIN, TITLE_MAX, runSeoAudit, type SeoPage } from '../seo-audit';
import { e } from '../util';
import { ownReport, type Count, type UsageReport } from '../visits';
import { reportsTab } from './screens-reports';
import { utilityTab } from './screens-utility';
import { badge } from './ui';

export interface AnalyticsQuery { tab: string; days: number; source: string; site: string }

const fmt = (n: number) => n.toLocaleString('en-US');
const pct = (n: number) => (n * 100).toFixed(1) + '%';
const shortDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function link(q: AnalyticsQuery, change: Partial<AnalyticsQuery>): string {
    const n = { ...q, ...change };
    return adminUrl('analytics/', { tab: n.tab === 'analytics' ? null : n.tab, days: n.days === 28 ? null : n.days, source: n.source === 'own' ? null : n.source, site: n.site === 'main' ? null : n.site });
}

function pills(items: [string, string, boolean][], label: string): string {
    return '<div class="an-pills" role="group" aria-label="' + e(label) + '">' + items.map(([text, href, on]) =>
        '<a href="' + e(href) + '"' + (on ? ' class="is-on" aria-current="true"' : '') + '>' + e(text) + '</a>').join('') + '</div>';
}

const rangePills = (q: AnalyticsQuery) => pills([7, 28, 90].map((d) => ['Last ' + d + ' days', link(q, { days: d }), q.days === d] as [string, string, boolean]), 'Period');

const tile = (value: string, label: string, note = '') => '<div class="card an-tile"><b>' + e(value) + '</b><span>' + e(label) + '</span>' + (note ? '<small>' + e(note) + '</small>' : '') + '</div>';

function niceMax(v: number): number {
    if (v <= 4) return 4;
    const unit = 10 ** Math.floor(Math.log10(v));
    const step = [1, 2, 2.5, 5, 10].find((s) => s * unit >= v / 4)! * unit;
    return Math.ceil(v / step) * step;
}

/** A line chart. The SVG stretches to the card; labels are HTML so they stay readable on a phone. admin.js adds the hover read-out. */
function lineChart(title: string, dates: string[], series: { name: string; values: number[]; color: string }[]): string {
    const top = niceMax(Math.max(...series.flatMap((s) => s.values), 0));
    const x = (i: number) => (dates.length > 1 ? (i / (dates.length - 1)) * 100 : 50);
    const y = (v: number) => 100 - (v / top) * 100;
    const ticks = [0, 1, 2, 3, 4].map((i) => (top * i) / 4);
    const every = Math.ceil(dates.length / 7);
    const shown = dates.map((_, i) => i).filter((i) => (dates.length - 1 - i) % every === 0);
    const data = { labels: dates.map(shortDate), series: series.map((s) => ({ name: s.name, color: s.color, values: s.values })) };
    return '<figure class="an-chart" data-chart="' + e(JSON.stringify(data)) + '">'
        + '<figcaption><h2>' + e(title) + '</h2>' + (series.length > 1 ? '<span class="an-legend">' + series.map((s) => '<span><i style="background:' + s.color + '"></i>' + e(s.name) + '</span>').join('') + '</span>' : '') + '</figcaption>'
        + '<div class="an-plot-wrap"><div class="an-y">' + ticks.map((t) => '<span style="bottom:' + (t / top) * 100 + '%">' + fmt(t) + '</span>').join('') + '</div>'
        + '<div class="an-plot"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">'
        + ticks.map((t) => '<line x1="0" x2="100" y1="' + y(t) + '" y2="' + y(t) + '" class="an-grid"/>').join('')
        + series.map((s, n) => (n === 0 ? '<polygon fill="' + s.color + '" opacity=".1" points="0,100 ' + s.values.map((v, i) => x(i) + ',' + y(v)).join(' ') + ' 100,100"/>' : '')
            + '<polyline fill="none" stroke="' + s.color + '" points="' + s.values.map((v, i) => x(i) + ',' + y(v)).join(' ') + '" class="an-line"/>').join('')
        + '</svg>'
        + series.map((s) => '<i class="an-dot" style="left:' + x(s.values.length - 1) + '%;top:' + y(s.values[s.values.length - 1]) + '%;background:' + s.color + '"></i>').join('')
        + '<div class="an-cross" hidden></div><div class="an-tip" hidden></div></div>'
        + '<div class="an-x">' + shown.map((i) => '<span style="left:' + x(i) + '%">' + e(shortDate(dates[i])) + '</span>').join('') + '</div></div>'
        + '<details class="an-table"><summary>Show as a table</summary><div class="table-wrap"><table class="table"><thead><tr><th>Day</th>' + series.map((s) => '<th class="right">' + e(s.name) + '</th>').join('') + '</tr></thead><tbody>'
        + dates.map((d, i) => '<tr><td>' + e(shortDate(d)) + '</td>' + series.map((s) => '<td class="right">' + fmt(s.values[i]) + '</td>').join('') + '</tr>').join('')
        + '</tbody></table></div></details></figure>';
}

function barList(title: string, rows: Count[], unit: string, opts: { hint?: string; extra?: string; mono?: boolean } = {}): string {
    const max = Math.max(...rows.map((r) => r.value), 1);
    const body = rows.length
        ? '<ul class="an-bars">' + rows.map((r) => '<li title="' + e(r.label + ': ' + fmt(r.value) + ' ' + unit + (r.extra !== undefined && opts.extra ? ', ' + fmt(r.extra) + ' ' + opts.extra : '')) + '"><div><span' + (opts.mono ? ' class="mono"' : '') + '>' + e(r.label) + '</span><b>' + fmt(r.value) + '</b></div><i style="width:' + Math.max((r.value / max) * 100, 1) + '%"></i></li>').join('') + '</ul>'
        : '<p class="muted">Nothing recorded in this period.</p>';
    return '<section class="card"><h2>' + e(title) + '</h2>' + '<p class="muted small an-hint">' + e(opts.hint ?? 'By ' + unit) + '</p>' + body + '</section>';
}

const SAMPLE_NOTICE = (what: string) => '<div class="alert alert-warning an-sample" role="status"><b>Sample numbers, not real.</b> ' + e(what) + ' is not connected yet, so this shows made-up figures to preview the layout. See the steps below.</div>';

function googleSetup(): string {
    return '<details class="card an-setup"><summary>How to connect Google (about 15 minutes)</summary><ol>'
        + '<li>In <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud Console</a>, signed in as the owner of the Analytics property, create a project and enable <b>Google Analytics Data API</b> and <b>Google Search Console API</b>.</li>'
        + '<li>Under IAM &amp; Admin &gt; Service Accounts, create a service account, then add a key of type JSON. A file downloads; keep it private.</li>'
        + '<li>In Google Analytics, Admin &gt; Property access management: add the service account’s e-mail address as <b>Viewer</b>. Note the numeric <b>Property ID</b> under Property details (it is not the G- number).</li>'
        + '<li>In Search Console, Settings &gt; Users and permissions: add the same address with <b>Restricted</b> permission.</li>'
        + '<li>In Vercel, project <code>cateyetech-web-js</code>, Settings &gt; Environment Variables (Production, Sensitive): <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> = the whole file; <code>GA4_PROPERTY_ID</code> = the number; <code>GSC_SITE_URL</code> = <code>sc-domain:cateyetech.com</code> for a Domain property, or <code>https://cateyetech.com/</code> for a URL-prefix property. Then redeploy.</li>'
        + '</ol></details>';
}

function usageHtml(r: UsageReport, showActions = true, afterChart = ''): string {
    const perVisit = r.totals.visits ? (r.totals.pageviews / r.totals.visits).toFixed(1) : '0';
    const dates = r.days.map((d) => d.date);
    return '<div class="an-tiles">' + tile(fmt(r.totals.visitors), 'Visitors') + tile(fmt(r.totals.visits), 'Visits') + tile(fmt(r.totals.pageviews), 'Page views') + tile(perVisit, 'Pages per visit') + '</div>'
        + '<section class="card">' + lineChart('Visitors and page views', dates, [
            { name: 'Visitors', values: r.days.map((d) => d.visitors), color: 'var(--an-1)' },
            { name: 'Page views', values: r.days.map((d) => d.pageviews), color: 'var(--an-2)' },
        ]) + '</section>' + afterChart
        + (showActions ? '<h2 class="an-section">What visitors did</h2>'
            + '<div class="an-tiles">' + tile(fmt(r.actions.tryDemo), 'Try Demo clicks') + tile(fmt(r.actions.signUp), 'SignUp Here clicks') + tile(fmt(r.actions.leads), 'Forms sent') + tile(fmt(r.actions.jobs), 'Job applications') + '</div>'
            + (r.details.length ? barList('By product or form', r.details, 'clicks or forms', { hint: 'Clicks and forms sent' }) : '') : '')
        + '<div class="grid grid-2 an-grid-2">'
        + barList('Top pages', r.pages, 'page views', { extra: 'visitors', hint: 'By page views', mono: true })
        + barList('Where visitors come from', r.sources, 'visits', { hint: 'By visits' })
        + barList('Device', r.devices, 'visitors') + barList('Browser', r.browsers, 'visitors') + barList('Country', r.countries, 'visitors')
        + '</div>';
}

const SITE_NAMES: Record<string, string> = { main: 'cateyetech.com', erp: 'erp.cateyetech.com', security: 'security.cateyetech.com', support: 'support.cateyetech.com', chat: 'chat.cateyetech.com', all: 'All sites' };

function appStatsHtml(s: AppStats): string {
    return '<h2 class="an-section">Signups and demos</h2><div class="an-tiles">' + tile(fmt(s.signups), 'Signup requests') + tile(fmt(s.demos), 'Demos started') + '</div>'
        + (s.productLabel ? '<div class="grid grid-2 an-grid-2">' + barList('Signups by status', s.byStatus, 'signups') + barList(s.productLabel, s.byProduct, 'signups', { hint: 'A signup can ask for more than one' }) + '</div>' : barList('Signups by status', s.byStatus, 'signups'));
}

async function appSiteHtml(q: AnalyticsQuery): Promise<string> {
    let stats: string;
    if (!statsConnected(q.site)) {
        stats = '<div class="alert alert-info" role="status">Signups and demos are not connected yet. They appear once this app and the website share a secret (see “Analytics” in the handoff).</div>';
    } else {
        try { stats = appStatsHtml(await appStats(q.site, q.days)); } catch (err) { stats = '<div class="alert alert-error" role="alert">' + e(SITE_NAMES[q.site]) + ' could not be read: ' + e(errorText(err)) + '</div>'; }
    }
    const note = '<p class="muted small">Public pages only: home, demo, signup and sign-in. Nothing is recorded once someone is signed in. Days are in India time.</p>';
    let usage: string;
    try { usage = usageHtml(await ownReport(q.days, q.site), false); } catch (err) { usage = '<div class="alert alert-error" role="alert">The visit log could not be read: ' + e(errorText(err)) + '</div>'; }
    return note + stats + '<h2 class="an-section">Visits</h2>' + usage;
}

/** Bing's search totals for the Analytics tab; the full lists are on the SEO tab. Empty until Bing is connected. */
async function bingSummary(q: AnalyticsQuery): Promise<string> {
    if (!bingConnected()) return '';
    let body: string;
    try {
        const t = (await bingReport(q.days)).totals;
        body = '<div class="an-tiles">' + tile(fmt(t.clicks), 'Clicks') + tile(fmt(t.impressions), 'Impressions') + tile(pct(t.ctr), 'Click-through rate') + tile(t.position.toFixed(1), 'Average position') + '</div>';
    } catch (err) {
        body = '<div class="alert alert-error" role="alert">Bing could not be read: ' + e(errorText(err)) + '</div>';
    }
    return '<div class="an-bar an-section-bar"><h2 class="an-section">Bing search</h2><a href="' + e(link(q, { tab: 'seo' })) + '">Top searches and pages on the SEO tab</a></div>' + body;
}

const searchNote = (engine: string) => '<p class="muted small">How often this site appeared in ' + engine + ' searches and was clicked, for this address only. A new site can take weeks to show figures.</p>';

async function googleSearchHtml(q: AnalyticsQuery): Promise<string> {
    if (!googleConnected().search) return '<div class="alert alert-info" role="status">Search Console is not connected yet (see “Analytics” in the handoff).</div>';
    try { return searchNote('Google') + searchHtml(await searchReport(q.days, 20, SITE_NAMES[q.site])); } catch (err) { return '<div class="alert alert-error" role="alert">Search Console could not be read: ' + e(errorText(err)) + '</div>'; }
}

async function siteBingHtml(q: AnalyticsQuery): Promise<string> {
    if (!bingConnected()) return '<div class="alert alert-info" role="status">Bing is not connected yet. Set BING_WEBMASTER_API_KEY (see “Analytics” in the handoff).</div>';
    try { return searchNote('Bing') + searchHtml(await bingReport(q.days, 20, 'https://' + SITE_NAMES[q.site] + '/')); } catch (err) { return '<div class="alert alert-info" role="status">Bing has no figures for ' + e(SITE_NAMES[q.site]) + ' yet. It appears here once the site is added to Bing Webmaster Tools. (' + e(errorText(err)) + ')</div>'; }
}

async function analyticsTab(q: AnalyticsQuery): Promise<string> {
    const sites = pills(Object.entries(SITE_NAMES).map(([k, name]) => [name, link(q, { site: k }), q.site === k] as [string, string, boolean]), 'Site');
    if (['erp', 'security', 'support', 'chat'].includes(q.site)) {
        const body = q.source === 'search' ? await googleSearchHtml(q) : q.source === 'bing' ? await siteBingHtml(q) : await appSiteHtml(q);
        return '<div class="an-bar">' + sites + '</div><div class="an-bar">' + pills([['Website’s own log', link(q, { source: 'own' }), q.source !== 'search' && q.source !== 'bing'], ['Google search', link(q, { source: 'search' }), q.source === 'search'], ['Bing', link(q, { source: 'bing' }), q.source === 'bing']], 'Source') + rangePills(q) + '</div>' + body;
    }
    if (q.site === 'all') {
        let all: string;
        try { all = usageHtml(await ownReport(q.days, 'all')); } catch (err) { all = '<div class="alert alert-error" role="alert">The visit log could not be read: ' + e(errorText(err)) + '</div>'; }
        return '<div class="an-bar">' + sites + rangePills(q) + '</div><p class="muted small">From the website’s own log. The apps count public pages only.</p>' + all;
    }
    const connected = googleConnected().analytics;
    const bing = q.source === 'bing' || q.source === 'search' ? '' : await bingSummary(q);
    let body: string;
    if (q.source === 'search') body = await googleSearchHtml(q);
    else if (q.source === 'bing') {
        const intro = '<p class="muted small">Bing reports search only: how often the site appeared and was clicked. It has no visitor, device or country figures. It groups searches and pages by week, so those two lists follow the period only roughly.</p>';
        if (!bingConnected()) body = '<div class="alert alert-info" role="status">Bing is not connected yet. Set BING_WEBMASTER_API_KEY (see “Analytics” in the handoff).</div>';
        else {
            try { body = intro + searchHtml(await bingReport(q.days)); } catch (err) { body = '<div class="alert alert-error" role="alert">Bing could not be read: ' + e(errorText(err)) + '</div>'; }
        }
    } else if (q.source === 'google') {
        if (connected) {
            try { body = usageHtml(await analyticsReport(q.days), true, bing); } catch (err) { body = '<div class="alert alert-error" role="alert">Google Analytics could not be read: ' + e(errorText(err)) + '</div>'; }
        } else {
            body = SAMPLE_NOTICE('Google Analytics') + googleSetup() + usageHtml(sampleUsage(q.days), true, bing);
        }
    } else {
        let note = '<p class="muted small">Counted by this website, without cookies. Days are in India time. A visitor is counted once per day, so someone returning on another day counts again. Your own visits while signed in to the admin are not counted.</p>';
        try { body = usageHtml(await ownReport(q.days), true, bing); } catch (err) { note = ''; body = '<div class="alert alert-error" role="alert">The visit log could not be read: ' + e(errorText(err)) + '</div>'; }
        body = note + body;
    }
    return '<div class="an-bar">' + sites + '</div><div class="an-bar">' + pills([['Website’s own log', link(q, { source: 'own' }), q.source === 'own'], ['Google Analytics' + (connected ? '' : ' (sample)'), link(q, { source: 'google' }), q.source === 'google'], ['Google search', link(q, { source: 'search' }), q.source === 'search'], ['Bing', link(q, { source: 'bing' }), q.source === 'bing']], 'Source') + rangePills(q) + '</div>' + body;
}

function searchRows(title: string, first: string, rows: SearchRow[], mono: boolean): string {
    return '<section class="card flush"><h2 class="an-flush-title">' + e(title) + '</h2><div class="table-wrap"><table class="table"><thead><tr><th>' + e(first) + '</th><th class="right">Clicks</th><th class="right">Impressions</th><th class="right">CTR</th><th class="right">Position</th></tr></thead><tbody>'
        + (rows.length ? rows.map((r) => '<tr><td' + (mono ? ' class="mono"' : '') + '>' + e(r.key) + '</td><td class="right">' + fmt(r.clicks) + '</td><td class="right">' + fmt(r.impressions) + '</td><td class="right">' + pct(r.ctr) + '</td><td class="right">' + r.position.toFixed(1) + '</td></tr>').join('') : '<tr><td colspan="5" class="muted">No search data in this period.</td></tr>')
        + '</tbody></table></div></section>';
}

function searchHtml(r: SearchReport): string {
    const dates = r.days.map((d) => d.date);
    return '<div class="an-tiles">' + tile(fmt(r.totals.clicks), 'Clicks') + tile(fmt(r.totals.impressions), 'Impressions') + tile(pct(r.totals.ctr), 'Click-through rate') + tile(r.totals.position.toFixed(1), 'Average position') + '</div>'
        + '<div class="grid grid-2 an-grid-2"><section class="card">' + lineChart('Clicks', dates, [{ name: 'Clicks', values: r.days.map((d) => d.clicks), color: 'var(--an-1)' }]) + '</section>'
        + '<section class="card">' + lineChart('Impressions', dates, [{ name: 'Impressions', values: r.days.map((d) => d.impressions), color: 'var(--an-1)' }]) + '</section></div>'
        + '<div class="grid grid-2 an-grid-2">' + searchRows('Top searches', 'Search', r.queries, false) + searchRows('Top pages in search', 'Page', r.pages, true) + '</div>';
}

function lengthCell(text: string, ok: boolean): string {
    if (!text) return '<td class="right">' + badge('none').replace('None', 'None') + '</td>';
    const n = Array.from(text).length;
    return '<td class="right" title="' + e(text) + '"><span class="' + (ok ? '' : 'an-bad') + '">' + (ok ? '' : '<i class="fa-solid fa-triangle-exclamation" aria-label="Out of range"></i> ') + n + '</span></td>';
}

function seoRow(p: SeoPage): string {
    const titleLen = Array.from(p.title).length;
    const descLen = Array.from(p.description).length;
    const yesNo = (ok: boolean, yes: string, no: string) => '<span class="badge badge-' + (ok ? 'green' : 'red') + '">' + e(ok ? yes : no) + '</span>';
    return '<tr><td class="an-page"><a href="' + e(p.path) + '" target="_blank" rel="noopener" class="mono">' + e(p.path) + '</a><small title="' + e(p.title) + '">' + e(p.title || 'No title') + '</small>' + (p.inSitemap ? '' : '<small>Not in the sitemap</small>') + '</td>'
        + lengthCell(p.title, titleLen <= TITLE_MAX) + lengthCell(p.description, descLen >= DESC_MIN && descLen <= DESC_MAX)
        + '<td class="right"><span class="' + (p.h1 === 1 ? '' : 'an-bad') + '">' + p.h1 + '</span></td>'
        + '<td title="' + e(p.canonical) + '">' + yesNo(p.canonicalOk, 'Matches', 'Differs') + '</td>'
        + '<td>' + yesNo(p.indexable, 'Yes', 'No') + '</td>'
        + '<td class="small">' + e(p.schema.join(', ') || 'Site-wide only') + '</td>'
        + '<td class="right nowrap">' + p.linksIn + (p.inNav ? ' <small class="muted">+ menu</small>' : '') + '</td>'
        + '<td class="small">' + (p.issues.length ? e(p.issues.join('; ')) : '<span class="muted">None</span>') + '</td></tr>';
}

async function seoTab(q: AnalyticsQuery): Promise<string> {
    const audit = await runSeoAudit();
    const has = (s: string) => audit.pages.filter((p) => p.issues.some((i) => i.includes(s))).length;
    const clean = audit.pages.filter((p) => !p.issues.length).length;
    const connected = googleConnected().search;
    let search: string;
    if (connected) {
        try { search = searchHtml(await searchReport(q.days)); } catch (err) { search = '<div class="alert alert-error" role="alert">Search Console could not be read: ' + e(errorText(err)) + '</div>'; }
    } else {
        search = SAMPLE_NOTICE('Search Console') + googleSetup() + searchHtml(sampleSearch(q.days));
    }
    let bing: string;
    if (!bingConnected()) {
        bing = '<div class="alert alert-info" role="status">Bing is not connected yet. Set BING_WEBMASTER_API_KEY (see “Analytics” in the handoff).</div>';
    } else {
        try { bing = '<p class="muted small">Bing groups searches and pages by week, so these two lists follow the period only roughly.</p>' + searchHtml(await bingReport(q.days)); } catch (err) { bing = '<div class="alert alert-error" role="alert">Bing could not be read: ' + e(errorText(err)) + '</div>'; }
    }
    return '<div class="an-tiles">' + tile(fmt(audit.pages.length), 'Pages checked', audit.sitemapCount + ' in the sitemap') + tile(fmt(clean), 'Pages with no issues')
        + tile(fmt(has('Title too long')), 'Titles over ' + TITLE_MAX) + tile(fmt(has('Description too')), 'Descriptions outside ' + DESC_MIN + '–' + DESC_MAX)
        + tile(fmt(has('H1')), 'Pages without one H1') + tile(fmt(has('No page links')), 'Pages nothing links to') + '</div>'
        + '<section class="card"><h2>Sitemap and robots.txt</h2><ul class="an-checks">' + audit.checks.map((c) => '<li><span class="badge badge-' + (c.ok ? 'green' : 'red') + '"><i class="fa-solid ' + (c.ok ? 'fa-check' : 'fa-xmark') + '" aria-hidden="true"></i> ' + (c.ok ? 'OK' : 'Problem') + '</span> <b>' + e(c.label) + '</b> <span class="muted">' + e(c.note) + '</span></li>').join('') + '</ul></section>'
        + '<section class="card flush"><h2 class="an-flush-title">Every page</h2><p class="muted small an-flush-note">Pages with the most issues first. Hover a length to read the text. Links in counts other pages that link here from their content; “+ menu” means the menu or footer does too.</p><div class="table-wrap"><table class="table an-seo"><thead><tr><th>Page</th><th class="right">Title</th><th class="right">Descr.</th><th class="right">H1</th><th>Canonical</th><th>Indexable</th><th>Structured data</th><th class="right">Links in</th><th>Issues</th></tr></thead><tbody>'
        + audit.pages.map(seoRow).join('') + '</tbody></table></div></section>'
        + '<div class="an-bar an-section-bar"><h2 class="an-section">Search Console</h2>' + rangePills(q) + '</div>' + search
        + '<h2 class="an-section">Bing</h2>' + bing;
}

export async function analyticsScreen(q: AnalyticsQuery, csrf: string): Promise<string> {
    const tabs = '<nav class="tabs" aria-label="Analytics and SEO">' + [['analytics', 'Analytics'], ['seo', 'SEO'], ['reports', 'Reports'], ['utility', 'SEO Utility']].map(([k, label]) =>
        '<a href="' + e(link(q, { tab: k })) + '"' + (q.tab === k ? ' class="is-active" aria-current="page"' : '') + '>' + label + '</a>').join('') + '</nav>';
    return tabs + (q.tab === 'seo' ? await seoTab(q) : q.tab === 'reports' ? await reportsTab(q, rangePills(q), (change) => link(q, change)) : q.tab === 'utility' ? await utilityTab(csrf) : await analyticsTab(q));
}
