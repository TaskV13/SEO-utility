/**
 * The page-by-page SEO check on Admin > Analytics & SEO. Every sitemap address, and the tag and
 * author pages they link to, is built in-process the way a visitor's request builds it, so it needs
 * no requests to the live site and always follows the current sitemap.
 */
import { absUrl } from './data';
import { robotsResponse, sitemapResponse } from './feeds';
import { footerParts, headerInner } from './render';
import { htmlToText } from './util';
import { appsView, archiveView, homeView, jobView, jobsView, slugView, tallyAlternativeView, type View } from './views';

export interface SeoPage {
    path: string; inSitemap: boolean; title: string; description: string; h1: number; canonicalOk: boolean; canonical: string;
    indexable: boolean; schema: string[]; linksIn: number; inNav: boolean; words: number; issues: string[];
    /** The H1's words and the page's text, for the search words check. */
    h1Text: string; text: string;
}
export interface SiteCheck { label: string; ok: boolean; note: string }
export interface SeoAudit { pages: SeoPage[]; checks: SiteCheck[]; sitemapCount: number }

export const TITLE_MAX = 60;
export const DESC_MIN = 70;
export const DESC_MAX = 160;
const THIN_WORDS = 100;

export async function viewFor(path: string): Promise<View | null> {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return homeView(1);
    if (parts.length === 2 && (parts[0] === 'category' || parts[0] === 'tag' || parts[0] === 'author')) return archiveView(parts[0], parts[1], 1);
    if (path === '/careers/') return jobsView();
    if (parts.length === 2 && parts[0] === 'careers') return jobView(parts[1]);
    if (path === '/tally-alternative/') return tallyAlternativeView();
    if (path === '/cateye-apps/') return appsView();
    if (parts.length !== 1) return null;
    const v = await slugView(parts[0], 1);
    return v === 'home' ? homeView(1) : v;
}

/** The internal page addresses an HTML fragment links to, with trailing slashes. */
function linksIn(html: string): Set<string> {
    const site = absUrl('/').replace(/\/$/, '');
    const out = new Set<string>();
    for (const m of html.replaceAll('{{site}}', '').matchAll(/href=["']([^"'#?]*)/gi)) {
        let href = m[1].trim();
        if (href.startsWith(site)) href = href.slice(site.length) || '/';
        href = href.replace(/^https?:\/\/(www\.)?cateyetech\.com/i, '') || '/';
        if (!href.startsWith('/') || href.startsWith('//')) continue;
        if (/\.[a-z0-9]{2,5}$/i.test(href) || /^\/(uploads|assets|admin|api|feed)\b/.test(href)) continue;
        out.add(href.endsWith('/') ? href : href + '/');
    }
    return out;
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = [];
    for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
    return out;
}

/** Every page address in the sitemap. */
export async function sitemapPaths(): Promise<string[]> {
    const sitemap = await (await sitemapResponse()).text();
    return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1].replace(/&amp;/g, '&')).pathname);
}

export async function runSeoAudit(): Promise<SeoAudit> {
    const robots = await (await robotsResponse()).text();
    const paths = await sitemapPaths();
    const built = async (path: string) => ({ path, view: await viewFor(path).catch(() => null) });

    const results = await inBatches(paths, 6, built);
    const known = new Set(paths);
    const seen = new Set<string>();
    for (const r of results) if (r.view) for (const link of linksIn(r.view.shell.html)) if (/^\/(tag|author)\/[^/]+\/$/.test(link) && !known.has(link)) seen.add(link);
    results.push(...await inBatches([...seen], 6, built));

    const inbound = new Map<string, number>();
    for (const r of results) {
        if (!r.view) continue;
        for (const link of linksIn(r.view.shell.html)) if (link !== r.path) inbound.set(link, (inbound.get(link) ?? 0) + 1);
    }
    const footer = await footerParts();
    const nav = linksIn(await headerInner('/') + footer.footer + (footer.closing ?? ''));

    const pages: SeoPage[] = results.map(({ path, view }) => {
        const inSitemap = known.has(path);
        if (!view) return { path, inSitemap, title: '', description: '', h1: 0, canonicalOk: false, canonical: '', indexable: false, schema: [], linksIn: 0, inNav: false, words: 0, issues: ['The page could not be built'], h1Text: '', text: '' };
        const meta = view.meta as any;
        const html = view.shell.html;
        const canonical = String(meta.alternates?.canonical ?? '');
        const text = htmlToText(html);
        const types = (view.shell.schema ?? []).map((s) => String(s['@type']));
        for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) for (const t of m[1].matchAll(/"@type"\s*:\s*"([^"]+)"/g)) types.push(t[1]);
        return {
            path, inSitemap, title: String(meta.title?.absolute ?? ''), description: String(meta.description ?? ''),
            h1: (html.match(/<h1[\s>]/gi) ?? []).length, canonical, canonicalOk: canonical === absUrl(path), indexable: meta.robots?.index !== false,
            schema: [...new Set(types)], linksIn: inbound.get(path) ?? 0, inNav: nav.has(path),
            words: text.split(/\s+/).filter(Boolean).length, issues: [], h1Text: htmlToText(html.match(/<h1[\s>][\s\S]*?<\/h1>/i)?.[0] ?? ''), text,
        };
    });

    const tally = (key: 'title' | 'description') => {
        const n = new Map<string, number>();
        for (const p of pages) if (p[key] && p.indexable) n.set(p[key], (n.get(p[key]) ?? 0) + 1);
        return n;
    };
    const titles = tally('title');
    const descriptions = tally('description');
    for (const p of pages) {
        if (p.issues.length) continue;
        const len = (s: string) => Array.from(s).length;
        if (!p.title) p.issues.push('No title');
        else if (len(p.title) > TITLE_MAX) p.issues.push('Title too long');
        if (!p.description) p.issues.push('No description');
        else if (len(p.description) > DESC_MAX) p.issues.push('Description too long');
        else if (len(p.description) < DESC_MIN) p.issues.push('Description too short');
        if (p.h1 !== 1) p.issues.push(p.h1 === 0 ? 'No H1' : p.h1 + ' H1 headings');
        if (!p.canonicalOk) p.issues.push('Canonical differs from this address');
        // Tag and author pages are noindex on purpose; a sitemap address should not be
        if (!p.indexable && p.inSitemap) p.issues.push('In the sitemap but noindex');
        if (p.indexable && (titles.get(p.title) ?? 0) > 1) p.issues.push('Title used on another page');
        if (p.indexable && (descriptions.get(p.description) ?? 0) > 1) p.issues.push('Description used on another page');
        if (p.indexable && p.linksIn === 0 && !p.inNav) p.issues.push('No page links here');
        if (p.indexable && p.words < THIN_WORDS) p.issues.push('Thin content');
    }
    pages.sort((a, b) => b.issues.length - a.issues.length || a.path.localeCompare(b.path));

    const blockedAll = /^Disallow:\s*\/\s*$/m.test(robots);
    const unbuilt = pages.filter((p) => p.inSitemap && !p.title).length;
    const noindexed = pages.filter((p) => p.inSitemap && p.title && !p.indexable).length;
    const checks: SiteCheck[] = [
        { label: 'Search engines allowed', ok: !blockedAll, note: blockedAll ? 'robots.txt blocks the whole site (Settings > SEO).' : 'robots.txt lets search engines in and keeps them out of /admin/ and /api/.' },
        { label: 'robots.txt names the sitemap', ok: /^Sitemap:\s*\S+/m.test(robots), note: robots.match(/^Sitemap:\s*(\S+)/m)?.[1] ?? 'No Sitemap line.' },
        { label: 'Every sitemap address builds', ok: unbuilt === 0, note: unbuilt === 0 ? paths.length + ' addresses.' : unbuilt + ' of ' + paths.length + ' could not be built.' },
        { label: 'No sitemap address is noindex', ok: noindexed === 0, note: noindexed === 0 ? 'All can be indexed.' : noindexed + ' marked noindex.' },
    ];
    return { pages, checks, sitemapCount: paths.length };
}
