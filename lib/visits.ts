/**
 * The website's own record of visits, read on Admin > Analytics & SEO next to Google's figures.
 * No cookies and no IP addresses: a visitor is a code made from the IP address and browser that
 * changes every day, so one person on two days counts twice. Rows older than 13 months are deleted.
 */
import { createHmac } from 'crypto';
import * as db from './db';

export interface Count { label: string; value: number; extra?: number }
export interface DayFigures { date: string; visitors: number; visits: number; pageviews: number }
export interface UsageReport {
    totals: { visitors: number; visits: number; pageviews: number };
    days: DayFigures[];
    pages: Count[];
    sources: Count[];
    devices: Count[];
    browsers: Count[];
    countries: Count[];
    actions: { tryDemo: number; signUp: number; leads: number; jobs: number };
    /** Clicks and forms by product or form name; only the site's own log has this. */
    details: Count[];
}

const TIME_ZONE = 'Asia/Kolkata';
const KEEP_DAYS = 400;
const MAX_PER_MINUTE = 60;
export const ACTION_KINDS = ['try_demo', 'sign_up_click', 'generate_lead', 'job_application'];
const KINDS = ['pageview', ...ACTION_KINDS];
/** Other sites allowed to report here, and the only addresses they may report: public pages, never a signed-in screen. */
export const APP_SITES: Record<string, string> = { 'erp.cateyetech.com': 'erp', 'security.cateyetech.com': 'security', 'support.cateyetech.com': 'support', 'chat.cateyetech.com': 'chat' };
const APP_PUBLIC_PATHS = ['/', '/home', '/signup', '/signin', '/try', '/apps', '/forgot-password', '/exposure-report'];
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http|java\//i;

const g = globalThis as unknown as { __cateyeVisitLog?: Promise<void> };
/** The table is created on first use, so a hosted database needs no migration step. */
function ensure(): Promise<void> {
    return (g.__cateyeVisitLog ??= (async () => {
        await db.exec(`CREATE TABLE IF NOT EXISTS visit_log (
  id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), kind VARCHAR(20) NOT NULL, path VARCHAR(300) NOT NULL DEFAULT '',
  detail VARCHAR(60) NOT NULL DEFAULT '', visitor VARCHAR(16) NOT NULL DEFAULT '', source VARCHAR(120) NOT NULL DEFAULT '',
  device VARCHAR(10) NOT NULL DEFAULT '', browser VARCHAR(20) NOT NULL DEFAULT '', country VARCHAR(2) NOT NULL DEFAULT '',
  site VARCHAR(10) NOT NULL DEFAULT 'main')`);
        await db.exec('CREATE INDEX IF NOT EXISTS visit_log_kind_at ON visit_log (kind, at)');
        await db.exec('CREATE INDEX IF NOT EXISTS visit_log_visitor_at ON visit_log (visitor, at)');
    })().catch((err) => { g.__cateyeVisitLog = undefined; throw err; }));
}

const localDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(d);

/** The last `days` calendar days in India time, oldest first, as YYYY-MM-DD. */
export function dayList(days: number): string[] {
    const today = Date.parse(localDate(new Date()) + 'T00:00:00Z');
    return Array.from({ length: days }, (_, i) => new Date(today - (days - 1 - i) * 86400000).toISOString().slice(0, 10));
}

function deviceOf(ua: string): string {
    if (/ipad|tablet|kindle|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return 'tablet';
    return /mobi|iphone|ipod|android/i.test(ua) ? 'mobile' : 'desktop';
}

function browserOf(ua: string): string {
    const known: [RegExp, string][] = [[/edg(e|a|ios)?\//i, 'Edge'], [/opr\/|opera/i, 'Opera'], [/samsungbrowser/i, 'Samsung Internet'],
        [/firefox|fxios/i, 'Firefox'], [/chrome|chromium|crios/i, 'Chrome'], [/safari/i, 'Safari']];
    return known.find(([re]) => re.test(ua))?.[1] ?? 'Other';
}

/** Where a visit came from: its utm_source, or the other site's name; nothing for the site itself or a typed address. */
function sourceOf(referrer: string, utm: string, siteHost: string): string {
    if (utm !== '') return utm.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 120);
    let host: string;
    try { host = new URL(referrer).hostname.replace(/^www\./, ''); } catch { return ''; }
    if (host === siteHost.replace(/^www\./, '')) return '';
    const known: [RegExp, string][] = [[/(^|\.)google\./, 'Google'], [/(^|\.)bing\.com$/, 'Bing'], [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
        [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn'], [/(^|\.)facebook\.com$/, 'Facebook'], [/(^|\.)instagram\.com$/, 'Instagram'], [/^t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, 'X']];
    return (known.find(([re]) => re.test(host))?.[1] ?? host).slice(0, 120);
}

/** Stores one page view or action sent by the page; quietly ignores robots and anything malformed. */
export async function recordVisit(body: Record<string, unknown>, headers: Headers, site: string, siteHost: string): Promise<void> {
    const text = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '');
    const ua = headers.get('user-agent') ?? '';
    const kind = text('k');
    const path = text('p');
    if (!KINDS.includes(kind) || !path.startsWith('/') || path.startsWith('/admin') || path.length > 300 || ua === '' || BOTS.test(ua)) return;
    if (site !== 'main' && (kind !== 'pageview' || !APP_PUBLIC_PATHS.includes(path))) return;
    await ensure();
    const ip = (headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || headers.get('x-real-ip') || '';
    const visitor = createHmac('sha256', process.env.SESSION_SECRET || 'cateye').update(localDate(new Date()) + '|' + ip + '|' + ua).digest('hex').slice(0, 16);
    const country = (headers.get('x-vercel-ip-country') ?? '').toUpperCase();
    const detail = text('d').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 60);
    // A runaway script cannot fill the table: one visitor is held to 60 rows a minute
    await db.exec(`INSERT INTO visit_log (kind, path, detail, visitor, source, device, browser, country, site)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM visit_log WHERE visitor = ? AND at > now() - interval '1 minute') < ?`,
    [kind, path, detail, visitor, sourceOf(text('r'), text('u'), siteHost), deviceOf(ua), browserOf(ua), /^[A-Z]{2}$/.test(country) ? country : '', site, visitor, MAX_PER_MINUTE]);
    if (Math.random() < 0.01) await db.exec("DELETE FROM visit_log WHERE at < now() - (? * interval '1 day')", [KEEP_DAYS]);
}

const DETAIL_LABEL: Record<string, string> = { try_demo: 'Try Demo', sign_up_click: 'SignUp Here', generate_lead: 'Form', job_application: 'Job application' };

function countryName(code: string): string {
    if (code === '') return 'Unknown';
    try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code; } catch { return code; }
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The site's own figures for the last `days` days: 'main', 'erp', 'security', 'support', 'chat' or 'all'. */
export async function ownReport(days: number, site = 'main'): Promise<UsageReport> {
    await ensure();
    const list = dayList(days);
    const start = list[0] + 'T00:00:00+05:30';
    const onSite = site === 'all' ? '' : ' AND site = ?';
    const args = site === 'all' ? [start] : [start, site];
    // A visit is a run of page views by one visitor with no gap over 30 minutes
    const withVisits = (select: string) => db.query(`WITH v AS (SELECT *, (at AT TIME ZONE '${TIME_ZONE}')::date::text AS day,
        lag(at) OVER (PARTITION BY visitor ORDER BY at) AS prev FROM visit_log WHERE kind = 'pageview' AND at >= ?::timestamptz${onSite}),
        s AS (SELECT *, (prev IS NULL OR at - prev > interval '30 minutes') AS starts FROM v) ${select}`, args);
    const counts = (rows: db.Row[], label: (v: string) => string = (v) => v): Count[] => rows.map((r) => ({ label: label(String(r.label)), value: Number(r.value), extra: r.extra === undefined ? undefined : Number(r.extra) }));
    const [perDay, pages, sources, devices, browsers, countries, actions, details] = await Promise.all([
        withVisits("SELECT day, count(DISTINCT visitor)::int AS visitors, count(*) FILTER (WHERE starts)::int AS visits, count(*)::int AS pageviews FROM s GROUP BY day"),
        withVisits('SELECT path AS label, count(*)::int AS value, count(DISTINCT visitor)::int AS extra FROM s GROUP BY path ORDER BY value DESC, path LIMIT 15'),
        withVisits("SELECT coalesce(nullif(source, ''), 'Direct') AS label, count(*)::int AS value FROM s WHERE starts GROUP BY 1 ORDER BY value DESC, 1 LIMIT 10"),
        withVisits('SELECT device AS label, count(DISTINCT visitor)::int AS value FROM s GROUP BY device ORDER BY value DESC'),
        withVisits('SELECT browser AS label, count(DISTINCT visitor)::int AS value FROM s GROUP BY browser ORDER BY value DESC'),
        withVisits('SELECT country AS label, count(DISTINCT visitor)::int AS value FROM s GROUP BY country ORDER BY value DESC, country LIMIT 10'),
        db.query(`SELECT kind, count(*)::int AS value FROM visit_log WHERE kind <> 'pageview' AND at >= ?::timestamptz${onSite} GROUP BY kind`, args),
        db.query(`SELECT kind, detail, count(*)::int AS value FROM visit_log WHERE kind <> 'pageview' AND at >= ?::timestamptz${onSite} GROUP BY kind, detail ORDER BY value DESC, kind, detail LIMIT 15`, args),
    ]);
    const byDay = new Map(perDay.map((r) => [String(r.day), r]));
    const action = (kind: string) => Number(actions.find((a) => a.kind === kind)?.value ?? 0);
    const dayRows = list.map((date) => ({ date, visitors: Number(byDay.get(date)?.visitors ?? 0), visits: Number(byDay.get(date)?.visits ?? 0), pageviews: Number(byDay.get(date)?.pageviews ?? 0) }));
    return {
        totals: { visitors: dayRows.reduce((n, d) => n + d.visitors, 0), visits: dayRows.reduce((n, d) => n + d.visits, 0), pageviews: dayRows.reduce((n, d) => n + d.pageviews, 0) },
        days: dayRows,
        pages: counts(pages), sources: counts(sources), devices: counts(devices, titleCase), browsers: counts(browsers), countries: counts(countries, countryName),
        actions: { tryDemo: action('try_demo'), signUp: action('sign_up_click'), leads: action('generate_lead'), jobs: action('job_application') },
        details: details.map((r) => ({ label: (DETAIL_LABEL[String(r.kind)] ?? String(r.kind)) + (r.detail ? ' · ' + r.detail : ''), value: Number(r.value) })),
    };
}
