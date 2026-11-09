/**
 * Reads Bing Webmaster Tools for Admin > Analytics & SEO. Set BING_WEBMASTER_API_KEY;
 * BING_SITE_URL is the site as registered with Bing. Daily totals, but searches and pages come in weekly groups.
 */
import type { SearchReport, SearchRow } from './google-data';
import { dayList } from './visits';

const BASE = 'https://ssl.bing.com/webmaster/api.svc/json/';

export const bingConnected = () => !!process.env.BING_WEBMASTER_API_KEY;

async function call(method: string, siteUrl?: string): Promise<any[]> {
    const q = new URLSearchParams({ siteUrl: siteUrl ?? (process.env.BING_SITE_URL || 'https://cateyetech.com/'), apikey: process.env.BING_WEBMASTER_API_KEY ?? '' });
    const res = await fetch(BASE + method + '?' + q, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ErrorCode) throw new Error(data.Message ?? 'Bing answered ' + res.status);
    return data.d ?? [];
}

/** "/Date(1316156400000-0700)/" as YYYY-MM-DD in India time, or '' */
function day(value: unknown): string {
    const ms = /\/Date\((\d+)/.exec(String(value))?.[1];
    return ms ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Number(ms))) : '';
}

/** One row per search or page across the period, its position weighted by impressions. */
function group(rows: any[], from: string, key: (k: string) => string): SearchRow[] {
    const all = new Map<string, { clicks: number; impressions: number; weighted: number; counted: number }>();
    for (const r of rows) {
        if (day(r.Date) < from) continue;
        const k = key(String(r.Query ?? ''));
        const a = all.get(k) ?? { clicks: 0, impressions: 0, weighted: 0, counted: 0 };
        const shown = Number(r.Impressions ?? 0);
        const position = Number(r.AvgImpressionPosition ?? -1);
        a.clicks += Number(r.Clicks ?? 0);
        a.impressions += shown;
        if (position > 0) { a.weighted += position * shown; a.counted += shown; }
        all.set(k, a);
    }
    return [...all].map(([k, a]) => ({ key: k, clicks: a.clicks, impressions: a.impressions, ctr: a.impressions ? a.clicks / a.impressions : 0, position: a.counted ? a.weighted / a.counted : 0 }))
        .sort((x, y) => y.clicks - x.clicks || y.impressions - x.impressions);
}

/** A siteUrl other than the main site's works only once that site is added to Bing Webmaster Tools under the same account. */
export async function bingReport(days: number, queryLimit = 20, siteUrl?: string): Promise<SearchReport> {
    const list = dayList(days);
    const [traffic, queries, pages] = await Promise.all([call('GetRankAndTrafficStats', siteUrl), call('GetQueryStats', siteUrl), call('GetPageStats', siteUrl)]);
    const byDay = new Map<string, { clicks: number; impressions: number }>();
    for (const r of traffic) byDay.set(day(r.Date), { clicks: Number(r.Clicks ?? 0), impressions: Number(r.Impressions ?? 0) });
    const dayRows = list.map((date) => ({ date, clicks: byDay.get(date)?.clicks ?? 0, impressions: byDay.get(date)?.impressions ?? 0 }));
    const clicks = dayRows.reduce((n, d) => n + d.clicks, 0);
    const impressions = dayRows.reduce((n, d) => n + d.impressions, 0);
    const allQueries = group(queries, list[0], (k) => k);
    const seen = allQueries.filter((q) => q.position > 0);
    const weight = seen.reduce((n, q) => n + q.impressions, 0);
    return {
        totals: { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: weight ? seen.reduce((n, q) => n + q.position * q.impressions, 0) / weight : 0 },
        days: dayRows,
        queries: allQueries.slice(0, queryLimit),
        pages: group(pages, list[0], (k) => k.replace(/^https?:\/\/[^/]+/, '') || '/').slice(0, 20),
    };
}
