/**
 * Admin > Analytics & SEO > Reports: the sources side by side, and pie charts that compare them.
 * Figures are never added across sources, as they count the same people. Clicking a slice is handled in admin.js.
 */
import { appStats, statsConnected, type AppStats } from '../app-stats';
import { bingConnected, bingReport } from '../bing-data';
import { analyticsReport, googleConnected, searchReport, type SearchReport } from '../google-data';
import { e } from '../util';
import { ownReport, type Count, type UsageReport } from '../visits';
import type { AnalyticsQuery } from './screens-analytics';

type Link = (change: Partial<AnalyticsQuery>) => string;
interface Slice { label: string; value: number; share: number; color: string; link?: string }
interface Pie { name: string; unit: string; total: number; href?: string; slices: Slice[] }
interface Series { name: string; unit: string; href?: string; rows: Count[] }

const COLORS = ['#6239bd', '#0e8f7e', '#d97706', '#2563eb', '#db2777', '#65a30d'];
const OTHER = '#9ca3af';
const MAX_NAMED = 5;
const fmt = (n: number) => n.toLocaleString('en-US');
const pct = (share: number) => (share * 100).toFixed(share > 0 && share < 0.1 ? 1 : 0) + '%';

function merge(rows: Count[], name: (s: string) => string): Count[] {
    const all = new Map<string, number>();
    for (const r of rows) all.set(name(r.label), (all.get(name(r.label)) ?? 0) + r.value);
    return [...all].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

/** The same site can be "google" in one source and "Google" in another. */
function sourceName(s: string): string {
    const known: [RegExp, string][] = [[/^direct$/i, 'Direct'], [/google/i, 'Google'], [/bing/i, 'Bing'], [/linkedin|lnkd/i, 'LinkedIn'], [/facebook/i, 'Facebook'],
        [/instagram/i, 'Instagram'], [/duckduckgo/i, 'DuckDuckGo'], [/^t\.co$|twitter|^x\.com$/i, 'X'], [/cateyetech\.com/i, 'CATEYE sites']];
    return known.find(([re]) => re.test(s))?.[1] ?? s;
}

/** One colour per item across a group's pies; the biggest items by combined share are named, the rest are Other. */
function pies(series: Series[], linkOf?: (label: string) => string | undefined): Pie[] {
    const totals = series.map((s) => s.rows.reduce((n, r) => n + r.value, 0));
    const weight = new Map<string, number>();
    series.forEach((s, i) => s.rows.forEach((r) => weight.set(r.label, (weight.get(r.label) ?? 0) + (totals[i] ? r.value / totals[i] : 0))));
    const named = [...weight].sort((a, b) => b[1] - a[1]).slice(0, MAX_NAMED).map(([label]) => label);
    const color = new Map(named.map((label, i) => [label, COLORS[i]]));
    return series.map((s, i) => {
        const total = totals[i];
        const slices: Slice[] = named.map((label) => {
            const value = s.rows.find((r) => r.label === label)?.value ?? 0;
            return { label, value, share: total ? value / total : 0, color: color.get(label)!, link: linkOf?.(label) };
        });
        const rest = total - slices.reduce((n, x) => n + x.value, 0);
        if (rest > 0) slices.push({ label: 'Other', value: rest, share: rest / total, color: OTHER });
        return { name: s.name, unit: s.unit, total, href: s.href, slices };
    });
}

function arc(from: number, to: number): string {
    const point = (radius: number, a: number) => (60 + radius * Math.cos(a)).toFixed(3) + ' ' + (60 + radius * Math.sin(a)).toFixed(3);
    const large = to - from > Math.PI ? 1 : 0;
    return 'M' + point(56, from) + 'A56 56 0 ' + large + ' 1 ' + point(56, to) + 'L' + point(33, to) + 'A33 33 0 ' + large + ' 0 ' + point(33, from) + 'Z';
}

function pieHtml(p: Pie): string {
    let angle = -Math.PI / 2;
    const shown = p.slices.filter((s) => s.value > 0);
    const marks = !shown.length
        ? '<circle cx="60" cy="60" r="44.5" fill="none" stroke="#e3e5ea" stroke-width="23"/>'
        : shown.map((s) => {
            const describe = s.label + ': ' + fmt(s.value) + ' ' + p.unit + ', ' + pct(s.share);
            const attrs = ' data-label="' + e(s.label) + '" tabindex="0" role="button" aria-label="' + e(describe) + '"';
            if (s.share > 0.9999) return '<circle cx="60" cy="60" r="44.5" fill="none" style="stroke:' + s.color + '" class="rp-slice"' + attrs + '/>';
            const from = angle;
            angle += s.share * Math.PI * 2;
            return '<path d="' + arc(from, angle) + '" fill="' + s.color + '" class="rp-slice"' + attrs + '/>';
        }).join('');
    const legend = p.slices.filter((s) => s.value > 0).map((s) => '<li><button type="button" data-label="' + e(s.label) + '"><i style="background:' + s.color + '"></i><span>' + e(s.label) + '</span><b>' + pct(s.share) + '</b></button></li>').join('');
    return '<figure class="rp-pie"><figcaption>' + (p.href ? '<a href="' + e(p.href) + '">' + e(p.name) + '</a>' : e(p.name)) + '</figcaption>'
        + '<div class="rp-ring"><svg viewBox="0 0 120 120" aria-hidden="false" role="group" aria-label="' + e(p.name) + '">' + marks + '</svg><div class="rp-centre"><b>' + fmt(p.total) + '</b><span>' + e(p.unit) + '</span></div></div>'
        + (legend ? '<ul class="rp-legend">' + legend + '</ul>' : '<p class="muted small">Nothing recorded in this period.</p>') + '</figure>';
}

function group(title: string, hint: string, list: Pie[]): string {
    const data = list.map((p) => ({ name: p.name, unit: p.unit, slices: p.slices.map((s) => ({ label: s.label, value: s.value, share: s.share, link: s.link })) }));
    return '<section class="card rp-group" data-report="' + e(JSON.stringify(data)) + '"><h2>' + e(title) + '</h2><p class="muted small an-hint">' + e(hint) + '</p>'
        + '<div class="rp-pies">' + list.map(pieHtml).join('') + '</div><div class="rp-detail" hidden aria-live="polite"></div></section>';
}

const cell = (n: number | undefined, format: (v: number) => string = fmt) => '<td class="right">' + (n === undefined ? '<span class="muted">–</span>' : format(n)) + '</td>';

function sideBySide(own?: UsageReport, ga?: UsageReport, gsc?: SearchReport, bing?: SearchReport): string {
    const row = (label: string, a?: number, b?: number, c?: number, d?: number, format?: (v: number) => string) => '<tr><td>' + label + '</td>' + cell(a, format) + cell(b, format) + cell(c, format) + cell(d, format) + '</tr>';
    const position = (v: number) => v.toFixed(1);
    const ratio = (v: number) => (v * 100).toFixed(1) + '%';
    return '<section class="card flush"><h2 class="an-flush-title">Side by side</h2><div class="table-wrap"><table class="table"><thead><tr><th></th><th class="right">Website’s own log</th><th class="right">Google Analytics</th><th class="right">Search Console</th><th class="right">Bing</th></tr></thead><tbody>'
        + row('Visitors', own?.totals.visitors, ga?.totals.visitors) + row('Visits', own?.totals.visits, ga?.totals.visits) + row('Page views', own?.totals.pageviews, ga?.totals.pageviews)
        + row('Try Demo clicks', own?.actions.tryDemo, ga?.actions.tryDemo) + row('SignUp Here clicks', own?.actions.signUp, ga?.actions.signUp) + row('Forms sent', own?.actions.leads, ga?.actions.leads)
        + row('Search clicks', undefined, undefined, gsc?.totals.clicks, bing?.totals.clicks) + row('Search impressions', undefined, undefined, gsc?.totals.impressions, bing?.totals.impressions)
        + row('Click-through rate', undefined, undefined, gsc?.totals.ctr, bing?.totals.ctr, ratio) + row('Average position', undefined, undefined, gsc?.totals.position, bing?.totals.position, position)
        + '</tbody></table></div></section>';
}

export async function reportsTab(q: AnalyticsQuery, range: string, link: Link): Promise<string> {
    const google = googleConnected();
    const none = Promise.resolve(undefined);
    const results = await Promise.allSettled([
        ownReport(q.days, 'main'), ownReport(q.days, 'erp'), ownReport(q.days, 'security'),
        google.analytics ? analyticsReport(q.days) : none,
        google.search ? searchReport(q.days) : none,
        bingConnected() ? bingReport(q.days) : none,
        statsConnected('erp') ? appStats('erp', q.days) : none,
        statsConnected('security') ? appStats('security', q.days) : none,
        ownReport(q.days, 'support'), ownReport(q.days, 'chat'),
        statsConnected('support') ? appStats('support', q.days) : none,
        statsConnected('chat') ? appStats('chat', q.days) : none,
    ]);
    const names = ['Website’s own log', 'ERP visits', 'Security visits', 'Google Analytics', 'Search Console', 'Bing', 'ERP signups', 'Security signups', 'Support visits', 'Chat visits', 'Support signups', 'Chat signups'];
    const problems = results.flatMap((r, i) => (r.status === 'rejected' ? [names[i] + ': ' + (r.reason instanceof Error ? r.reason.message : String(r.reason))] : []));
    const value = <T,>(i: number) => (results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<unknown>).value as T | undefined : undefined);
    const own = value<UsageReport>(0);
    const erp = value<UsageReport>(1);
    const security = value<UsageReport>(2);
    const ga = value<UsageReport>(3);
    const gsc = value<SearchReport>(4);
    const bing = value<SearchReport>(5);
    const erpStats = value<AppStats>(6);
    const securityStats = value<AppStats>(7);
    const support = value<UsageReport>(8);
    const chat = value<UsageReport>(9);
    const supportStats = value<AppStats>(10);
    const chatStats = value<AppStats>(11);

    const ownHref = link({ tab: 'analytics', site: 'main', source: 'own' });
    const gaHref = link({ tab: 'analytics', site: 'main', source: 'google' });
    const both = (unit: string, pick: (r: UsageReport) => Count[]): Series[] => [
        ...(own ? [{ name: 'Website’s own log', unit, href: ownHref, rows: pick(own) }] : []),
        ...(ga ? [{ name: 'Google Analytics', unit, href: gaHref, rows: pick(ga) }] : []),
    ];
    const siteLink = (label: string) => ({ 'cateyetech.com': link({ tab: 'analytics', site: 'main', source: 'own' }), 'erp.cateyetech.com': link({ tab: 'analytics', site: 'erp', source: 'own' }), 'security.cateyetech.com': link({ tab: 'analytics', site: 'security', source: 'own' }), 'support.cateyetech.com': link({ tab: 'analytics', site: 'support', source: 'own' }), 'chat.cateyetech.com': link({ tab: 'analytics', site: 'chat', source: 'own' }) } as Record<string, string>)[label];
    const appLink = (label: string) => link({ tab: 'analytics', site: label.toLowerCase(), source: 'own' });
    const engineLink = (label: string) => (label === 'Google' ? link({ tab: 'seo' }) : link({ tab: 'analytics', site: 'main', source: 'bing' }));
    const pageLink = (label: string) => (/^\/(?!\/)/.test(label) ? label : undefined);
    const actions = (r: UsageReport): Count[] => [{ label: 'Try Demo', value: r.actions.tryDemo }, { label: 'SignUp Here', value: r.actions.signUp }, { label: 'Forms sent', value: r.actions.leads }, { label: 'Job applications', value: r.actions.jobs }];

    const sections: string[] = [];
    if (own || erp || security || support || chat) {
        sections.push(group('Visits by site', 'From the website’s own log. Click a slice to compare it, then open that site’s figures.', pies([{ name: 'All sites', unit: 'visits', rows: [
            { label: 'cateyetech.com', value: own?.totals.visits ?? 0 }, { label: 'erp.cateyetech.com', value: erp?.totals.visits ?? 0 }, { label: 'security.cateyetech.com', value: security?.totals.visits ?? 0 }, { label: 'support.cateyetech.com', value: support?.totals.visits ?? 0 }, { label: 'chat.cateyetech.com', value: chat?.totals.visits ?? 0 }] }], siteLink)));
    }
    if (own || ga) {
        sections.push(group('Where visitors come from', 'Share of visits by source.', pies(both('visits', (r) => merge(r.sources, sourceName)))));
        sections.push(group('Devices', 'Share of visitors by device.', pies(both('visitors', (r) => r.devices))));
        sections.push(group('Browsers', 'Share of visitors by browser.', pies(both('visitors', (r) => r.browsers))));
        sections.push(group('Countries', 'Share of visitors by country.', pies(both('visitors', (r) => r.countries))));
        sections.push(group('Top pages', 'Share of page views. Click a slice to open the page.', pies(both('page views', (r) => r.pages), pageLink)));
        sections.push(group('What visitors did', 'Share of clicks and forms.', pies(both('actions', actions))));
    }
    if (gsc || bing) {
        const engines = (pick: (r: SearchReport) => number): Count[] => [...(gsc ? [{ label: 'Google', value: pick(gsc) }] : []), ...(bing ? [{ label: 'Bing', value: pick(bing) }] : [])];
        sections.push(group('Search engines', 'Google against Bing. Click a slice to open its search figures.', pies([{ name: 'Clicks', unit: 'clicks', rows: engines((r) => r.totals.clicks) }, { name: 'Impressions', unit: 'impressions', rows: engines((r) => r.totals.impressions) }], engineLink)));
    }
    if (erpStats || securityStats || supportStats || chatStats) {
        const apps = (pick: (s: AppStats) => number): Count[] => [...(erpStats ? [{ label: 'ERP', value: pick(erpStats) }] : []), ...(securityStats ? [{ label: 'Security', value: pick(securityStats) }] : []), ...(supportStats ? [{ label: 'Support', value: pick(supportStats) }] : []), ...(chatStats ? [{ label: 'Chat', value: pick(chatStats) }] : [])];
        sections.push(group('Signups and demos', 'The apps side by side. Click a slice to open that app’s figures.', pies([{ name: 'Signup requests', unit: 'signups', rows: apps((s) => s.signups) }, { name: 'Demos started', unit: 'demos', rows: apps((s) => s.demos) }], appLink)));
    }

    return '<div class="an-bar">' + range + '</div>'
        + '<p class="muted small">Compare shares more than counts: the sources started on different dates and count people differently, so they are never added together. Click a slice or a name in any chart to compare it.</p>'
        + problems.map((p) => '<div class="alert alert-error" role="alert">' + e(p) + '</div>').join('')
        + sideBySide(own, ga, gsc, bing) + '<div class="rp-groups">' + sections.join('') + '</div>';
}
