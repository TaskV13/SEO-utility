/**
 * Reads Google Analytics 4 and Search Console for Admin > Analytics & SEO with a service account
 * that has read access to both. Set GOOGLE_SERVICE_ACCOUNT_JSON, GA4_PROPERTY_ID and GSC_SITE_URL.
 * While they are missing the screen shows the sample figures at the end of this file, labelled as samples.
 */
import { createSign } from 'crypto';
import { dayList, type Count, type UsageReport } from './visits';

export interface SearchRow { key: string; clicks: number; impressions: number; ctr: number; position: number }
export interface SearchReport {
    totals: { clicks: number; impressions: number; ctr: number; position: number };
    days: { date: string; clicks: number; impressions: number }[];
    queries: SearchRow[];
    pages: SearchRow[];
}

// webmasters, not webmasters.readonly: the SEO run also submits the sitemap
const SCOPES = 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters';
const TIMEOUT = 15000;

function account(): { client_email: string; private_key: string } | null {
    try {
        const a = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '');
        return a.client_email && a.private_key ? a : null;
    } catch {
        return null;
    }
}

export const googleConnected = () => ({
    analytics: !!account() && /^\d+$/.test(process.env.GA4_PROPERTY_ID ?? ''),
    search: !!account() && (process.env.GSC_SITE_URL ?? '') !== '',
});

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const g = globalThis as unknown as { __cateyeGoogleToken?: { token: string; expires: number } };

async function accessToken(): Promise<string> {
    if (g.__cateyeGoogleToken && g.__cateyeGoogleToken.expires > Date.now() + 60000) return g.__cateyeGoogleToken.token;
    const a = account();
    if (!a) throw new Error('The Google service account is not set.');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64(JSON.stringify({ iss: a.client_email, scope: SCOPES, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
    const assertion = unsigned + '.' + createSign('RSA-SHA256').update(unsigned).sign(a.private_key).toString('base64url');
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(TIMEOUT),
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw new Error('Google refused the service account: ' + (data.error_description ?? data.error ?? res.status));
    g.__cateyeGoogleToken = { token: data.access_token, expires: Date.now() + Number(data.expires_in ?? 3600) * 1000 };
    return data.access_token;
}

async function post(url: string, body: unknown): Promise<any> {
    const res = await fetch(url, {
        method: 'POST', headers: { Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT), cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message ?? 'Google answered ' + res.status);
    return data;
}

const toCounts = (rows: { d: string[]; m: number[] }[], label: (v: string) => string = (v) => v): Count[] => rows.map((r) => ({ label: label(r.d[0]), value: r.m[0], extra: r.m[1] }));
const notSet = (v: string) => (v === '(not set)' || v === '' ? 'Unknown' : v);

/** Google Analytics for the last `days` days, in the same shape as the site's own log. */
export async function analyticsReport(days: number): Promise<UsageReport> {
    const list = dayList(days);
    const run = async (dimensions: string[], metrics: string[], extra: Record<string, unknown> = {}) => {
        const data = await post('https://analyticsdata.googleapis.com/v1beta/properties/' + process.env.GA4_PROPERTY_ID + ':runReport', {
            dateRanges: [{ startDate: (days - 1) + 'daysAgo', endDate: 'today' }],
            dimensions: dimensions.map((name) => ({ name })), metrics: metrics.map((name) => ({ name })), ...extra,
        });
        return ((data.rows ?? []) as any[]).map((r) => ({ d: (r.dimensionValues ?? []).map((v: any) => v.value as string), m: r.metricValues.map((v: any) => Number(v.value)) }));
    };
    const top = (metric: string, limit: number) => ({ orderBys: [{ metric: { metricName: metric }, desc: true }], limit });
    const events = { tryDemo: 'try_demo', signUp: 'sign_up_click', leads: 'generate_lead', jobs: 'job_application' };
    const [totals, perDay, pages, sources, devices, browsers, countries, actions] = await Promise.all([
        run([], ['totalUsers', 'sessions', 'screenPageViews']),
        run(['date'], ['totalUsers', 'sessions', 'screenPageViews']),
        run(['pagePath'], ['screenPageViews', 'totalUsers'], top('screenPageViews', 15)),
        run(['sessionSource'], ['sessions'], top('sessions', 10)),
        run(['deviceCategory'], ['totalUsers'], top('totalUsers', 5)),
        run(['browser'], ['totalUsers'], top('totalUsers', 8)),
        run(['country'], ['totalUsers'], top('totalUsers', 10)),
        run(['eventName'], ['eventCount'], { dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: Object.values(events) } } } }),
    ]);
    const byDay = new Map(perDay.map((r) => [r.d[0].replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'), r.m]));
    const action = (name: string) => actions.find((a) => a.d[0] === name)?.m[0] ?? 0;
    return {
        totals: { visitors: totals[0]?.m[0] ?? 0, visits: totals[0]?.m[1] ?? 0, pageviews: totals[0]?.m[2] ?? 0 },
        days: list.map((date) => ({ date, visitors: byDay.get(date)?.[0] ?? 0, visits: byDay.get(date)?.[1] ?? 0, pageviews: byDay.get(date)?.[2] ?? 0 })),
        pages: toCounts(pages),
        sources: toCounts(sources, (v) => (v === '(direct)' ? 'Direct' : notSet(v))),
        devices: toCounts(devices, (v) => v.charAt(0).toUpperCase() + v.slice(1)),
        browsers: toCounts(browsers, notSet),
        countries: toCounts(countries, notSet),
        actions: { tryDemo: action(events.tryDemo), signUp: action(events.signUp), leads: action(events.leads), jobs: action(events.jobs) },
        details: [],
    };
}

/** Search Console for the last `days` days. Its newest two or three days are usually still empty. */
/** The property covers every cateyetech.com address, so a host narrows it to one site; without one it is all of them. */
export async function searchReport(days: number, queryLimit = 20, host?: string): Promise<SearchReport> {
    const list = dayList(days);
    const endpoint = 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(process.env.GSC_SITE_URL ?? '') + '/searchAnalytics/query';
    const run = async (dimensions: string[], rowLimit: number): Promise<SearchRow[]> => {
        const data = await post(endpoint, { startDate: list[0], endDate: list[list.length - 1], dimensions, rowLimit, ...(host ? { dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'contains', expression: 'https://' + host + '/' }] }] } : {}) });
        return ((data.rows ?? []) as any[]).map((r) => ({ key: r.keys?.[0] ?? '', clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
    };
    const [totals, perDay, queries, pages] = await Promise.all([run([], 1), run(['date'], days), run(['query'], queryLimit), run(['page'], 20)]);
    const byDay = new Map(perDay.map((r) => [r.key, r]));
    return {
        totals: { clicks: totals[0]?.clicks ?? 0, impressions: totals[0]?.impressions ?? 0, ctr: totals[0]?.ctr ?? 0, position: totals[0]?.position ?? 0 },
        days: list.map((date) => ({ date, clicks: byDay.get(date)?.clicks ?? 0, impressions: byDay.get(date)?.impressions ?? 0 })),
        queries,
        pages: pages.map((p) => ({ ...p, key: p.key.replace(/^https?:\/\/[^/]+/, '') })),
    };
}

/** Asks Google to read the sitemap again. Google has no way to submit single pages of this kind, and needs Full permission for this call. */
export async function submitSitemap(sitemapUrl: string): Promise<string> {
    const res = await fetch('https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(process.env.GSC_SITE_URL ?? '') + '/sitemaps/' + encodeURIComponent(sitemapUrl), {
        method: 'PUT', headers: { Authorization: 'Bearer ' + await accessToken() }, signal: AbortSignal.timeout(TIMEOUT), cache: 'no-store',
    });
    if (res.ok) return 'Sitemap submitted.';
    if (res.status === 403) return 'Not sent: in Search Console, give the service account Full permission.';
    const data = await res.json().catch(() => ({}));
    return 'Not sent: ' + (data.error?.message ?? 'Google answered ' + res.status) + '.';
}

// --- Sample figures, shown under a "Sample numbers" notice until Google is connected ------------

const wave = (i: number, base: number) => Math.round(base * (1 + 0.35 * Math.sin(i / 1.3) + 0.15 * Math.cos(i / 3.1)));

export function sampleUsage(days: number): UsageReport {
    const dayRows = dayList(days).map((date, i) => ({ date, visitors: wave(i, 40), visits: wave(i, 48), pageviews: wave(i, 110) }));
    const sum = (k: 'visitors' | 'visits' | 'pageviews') => dayRows.reduce((n, d) => n + d[k], 0);
    const scale = days / 28;
    const c = (label: string, value: number, extra?: number): Count => ({ label, value: Math.round(value * scale), extra: extra === undefined ? undefined : Math.round(extra * scale) });
    return {
        totals: { visitors: sum('visitors'), visits: sum('visits'), pageviews: sum('pageviews') },
        days: dayRows,
        pages: [c('/', 900, 620), c('/erp/', 410, 300), c('/crm/', 240, 190), c('/cyber-security-services/', 210, 160), c('/tally-alternative/', 150, 130)],
        sources: [c('Direct', 520), c('google', 480), c('linkedin.com', 150), c('bing', 40)],
        devices: [c('Desktop', 610), c('Mobile', 450), c('Tablet', 30)],
        browsers: [c('Chrome', 810), c('Safari', 170), c('Edge', 80), c('Firefox', 30)],
        countries: [c('India', 780), c('United States', 120), c('Singapore', 70), c('United Arab Emirates', 40)],
        actions: { tryDemo: Math.round(64 * scale), signUp: Math.round(22 * scale), leads: Math.round(9 * scale), jobs: Math.round(5 * scale) },
        details: [],
    };
}

export function sampleSearch(days: number): SearchReport {
    const dayRows = dayList(days).map((date, i) => ({ date, clicks: wave(i, 6), impressions: wave(i, 150) }));
    const clicks = dayRows.reduce((n, d) => n + d.clicks, 0);
    const impressions = dayRows.reduce((n, d) => n + d.impressions, 0);
    return {
        totals: { clicks, impressions, ctr: clicks / impressions, position: 24.6 },
        days: dayRows,
        queries: [['sample erp query', 30, 700, 12.1], ['sample crm query', 18, 520, 18.4], ['sample security query', 9, 410, 27.2]].map(([key, c, i, position]) => ({ key: String(key), clicks: Number(c), impressions: Number(i), ctr: Number(c) / Number(i), position: Number(position) })),
        pages: [['/erp/', 40, 900, 14.2], ['/', 25, 760, 9.8], ['/tally-alternative/', 12, 430, 21.6]].map(([key, c, i, position]) => ({ key: String(key), clicks: Number(c), impressions: Number(i), ctr: Number(c) / Number(i), position: Number(position) })),
    };
}
