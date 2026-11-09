/**
 * The SEO job (vercel.json "crons" wakes it daily and it runs when the schedule on SEO Utility says so, or Run now there).
 * It re-runs the page check, compares with the last run, watches which searches are on or near Google's first page,
 * tells IndexNow about changed pages and e-mails the administrators. It may change one thing by itself: a page's or post's
 * search description, at most MAX_AUTO a week on the schedule, each one undoable. Titles are only suggested. Addresses and content are never touched.
 */
import { Pages, Posts, Settings, absUrl, adminUrl } from './data';
import * as db from './db';
import { sitemapResponse } from './feeds';
import { bingConnected, bingReport } from './bing-data';
import { googleConnected, searchReport, submitSitemap, type SearchReport } from './google-data';
import { Mailer } from './mail';
import { schemaName } from './meta';
import { DESC_MAX, DESC_MIN, TITLE_MAX, runSeoAudit, viewFor, type SeoPage } from './seo-audit';
import { measureWords, type WordRow } from './seo-words';
import { htmlToText, now } from './util';

/** IndexNow's key is public by design: the same value is the file of that name in public/. */
const INDEXNOW_KEY = 'ad387cf490bffbf0dbf9a0681824c824';
/** The company's other public sites; each serves its own sitemap.xml and a copy of the key file. */
const OTHER_SITES = ['support.cateyetech.com', 'chat.cateyetech.com'];
const MAX_AUTO = 5;
const NEAR_MIN_IMPRESSIONS = 5;
const LOW_CTR = 0.02;
const LOW_CTR_MIN_IMPRESSIONS = 20;

/** How often the scheduled run happens; the order here is the order on screen. */
export const FREQUENCIES = {
    daily: { label: 'Daily', days: 1 },
    alternate: { label: 'Alternate days', days: 2 },
    weekly: { label: 'Weekly', days: 7 },
    biweekly: { label: 'Bi-weekly (every 2 weeks)', days: 14 },
    monthly: { label: 'Monthly', months: 1 },
    bimonthly: { label: 'Bi-monthly (every 2 months)', months: 2 },
} as const;
export type Frequency = keyof typeof FREQUENCIES;
export interface Schedule { frequency: Frequency; lastRun: string | null; next: string; due: boolean }

export interface PositionRow { query: string; position: number; impressions: number; clicks: number; ctr: number; was?: number }
type Totals = SearchReport['totals'];
export interface WeeklySummary {
    checked: number; clean: number; open: { path: string; issue: string }[]; added: { path: string; issue: string }[]; resolved: { path: string; issue: string }[];
    google?: Totals; googleBefore?: Totals; bing?: Totals; bingBefore?: Totals;
    page1: PositionRow[]; near: PositionRow[]; lost: PositionRow[]; lowCtr: PositionRow[]; positions: Record<string, number>;
    indexNow: { sent: number; note: string }; googleNote?: string; words?: WordRow[]; applied: number; suggested: number; emailed: string; problems: string[]; source: string;
}
export interface RunOptions { source: 'schedule' | 'manual'; fixes: 'auto' | 'suggest' | 'none'; indexNow: boolean; email: boolean }
export interface WeeklyRun { id: number; run_at: string; summary: WeeklySummary }
export interface SeoChange { id: number; item_type: string; item_id: number; path: string; field: string; old_value: string; new_value: string; status: string; issue: string; created_at: string }

const g = globalThis as unknown as { __cateyeSeoWeekly?: Promise<void> };
function ensure(): Promise<void> {
    return (g.__cateyeSeoWeekly ??= (async () => {
        await db.exec('CREATE TABLE IF NOT EXISTS seo_weekly_runs (id SERIAL PRIMARY KEY, run_at TIMESTAMPTZ NOT NULL DEFAULT now(), summary TEXT NOT NULL)');
        await db.exec(`CREATE TABLE IF NOT EXISTS seo_changes (id SERIAL PRIMARY KEY, run_id INT NOT NULL, item_type VARCHAR(8) NOT NULL, item_id INT NOT NULL, path VARCHAR(300) NOT NULL,
  field VARCHAR(20) NOT NULL, old_value TEXT NOT NULL, new_value TEXT NOT NULL, status VARCHAR(12) NOT NULL, issue VARCHAR(120) NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    })().catch((err) => { g.__cateyeSeoWeekly = undefined; throw err; }));
}

export async function latestRun(): Promise<WeeklyRun | null> {
    await ensure();
    const r = await db.row("SELECT id, run_at::text AS run_at, summary FROM seo_weekly_runs WHERE summary <> '' ORDER BY id DESC LIMIT 1");
    return r ? { id: Number(r.id), run_at: String(r.run_at), summary: JSON.parse(String(r.summary)) } : null;
}

export async function recentChanges(): Promise<SeoChange[]> {
    await ensure();
    const rows = await db.query('SELECT *, created_at::text AS created_at FROM seo_changes ORDER BY id DESC LIMIT 40');
    return rows as SeoChange[];
}

const chars = (s: string) => Array.from(s).length;

/** Cut to a limit at a sentence end when one is close, else at a word; null when too little is left. */
function shorten(text: string, min: number, max: number): string | null {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (chars(clean) <= max) return chars(clean) >= min ? clean : null;
    const cut = Array.from(clean).slice(0, max).join('');
    const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    if (sentence + 1 >= min) return cut.slice(0, sentence + 1);
    const word = cut.lastIndexOf(' ');
    return word >= min ? cut.slice(0, word).replace(/[\s,;:–—-]+$/, '') + '…' : null;
}

async function draftDescription(path: string, stored: string): Promise<string | null> {
    const view = await viewFor(path).catch(() => null);
    if (!view) return null;
    if (chars(stored) > DESC_MAX) return shorten(stored, DESC_MIN, DESC_MAX - 5);
    let text = '';
    for (const m of view.shell.html.matchAll(/<p[\s>][^]*?<\/p>/gi)) {
        const p = htmlToText(m[0]).trim();
        if (chars(p) < 40) continue;
        text += (text ? ' ' : '') + p;
        if (chars(text) > DESC_MAX) break;
    }
    return shorten(text, DESC_MIN, DESC_MAX - 5);
}

function draftTitle(base: string, isHome: boolean): string | null {
    const room = isHome ? TITLE_MAX : TITLE_MAX - chars(' – ' + schemaName());
    const parts = base.split(/\s[|:–—-]\s/);
    let kept = '';
    for (const part of parts) {
        const next = kept ? kept + ' – ' + part : part;
        if (chars(next) > room) break;
        kept = next;
    }
    if (chars(kept) >= 15) return kept;
    return shorten(base, 15, room - 1)?.replace(/…$/, '') ?? null;
}

async function itemFor(path: string): Promise<{ type: 'page' | 'post'; row: db.Row } | null> {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) { const row = await Pages.find(Pages.homeId()); return row ? { type: 'page', row } : null; }
    if (parts.length !== 1) return null;
    const page = await Pages.findBySlug(parts[0]);
    if (page) return { type: 'page', row: page };
    const post = await Posts.findBySlug(parts[0]);
    return post ? { type: 'post', row: post } : null;
}

/** Page and post search fields only; the values kept in seo_changes make every change reversible. */
async function setField(type: string, id: number, field: string, value: string): Promise<void> {
    if (!['meta_title', 'meta_description'].includes(field)) throw new Error('Unknown field');
    await db.update(type === 'post' ? 'posts' : 'pages', { [field]: value, updated_at: now() }, 'id = ?', [id]);
}

async function makeChanges(runId: number, pages: SeoPage[], automatic: boolean, limit: number): Promise<{ applied: number; suggested: number; paths: string[] }> {
    const done = new Set((await db.query('SELECT item_type, item_id, field FROM seo_changes')).map((r) => r.item_type + ':' + r.item_id + ':' + r.field));
    let applied = 0;
    let suggested = 0;
    const paths: string[] = [];
    for (const p of pages) {
        if (!p.inSitemap || !p.indexable) continue;
        const descIssue = p.issues.find((i) => i === 'No description' || i.startsWith('Description too'));
        const titleIssue = p.issues.find((i) => i === 'Title too long');
        if (!descIssue && !titleIssue) continue;
        const item = await itemFor(p.path);
        if (!item) continue;
        const id = Number(item.row.id);
        const record = (field: string, oldValue: string, value: string, status: string, issue: string) =>
            db.insert('seo_changes', { run_id: runId, item_type: item.type, item_id: id, path: p.path, field, old_value: oldValue, new_value: value, status, issue });
        if (descIssue && !done.has(item.type + ':' + id + ':meta_description')) {
            const stored = String(item.row.meta_description ?? '');
            const draft = await draftDescription(p.path, stored || p.description);
            if (draft && automatic && applied < limit) {
                await setField(item.type, id, 'meta_description', draft);
                await record('meta_description', stored, draft, 'applied', descIssue);
                applied++;
                paths.push(p.path);
            } else if (draft) {
                await record('meta_description', stored, draft, 'suggested', descIssue);
                suggested++;
            }
        }
        if (titleIssue && !done.has(item.type + ':' + id + ':meta_title')) {
            const stored = String(item.row.meta_title ?? '');
            const draft = draftTitle(stored || String(item.row.title ?? ''), p.path === '/');
            if (draft && draft !== stored) { await record('meta_title', stored, draft, 'suggested', titleIssue); suggested++; }
        }
    }
    return { applied, suggested, paths };
}

/** Approve a suggestion, dismiss it, or undo an applied change. Refuses if someone has since edited the field. */
export async function decideChange(id: number, what: string, edited = ''): Promise<string> {
    await ensure();
    const c = await db.row('SELECT * FROM seo_changes WHERE id = ?', [id]);
    if (!c) return 'That change no longer exists.';
    const current = await db.value<string>('SELECT ' + (c.field === 'meta_title' ? 'meta_title' : 'meta_description') + ' FROM ' + (c.item_type === 'post' ? 'posts' : 'pages') + ' WHERE id = ?', [c.item_id], '');
    if (what === 'approve' && c.status === 'suggested') {
        if (current !== c.old_value) return 'This field was edited since the suggestion was made, so it was left alone.';
        const value = edited.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || c.new_value;
        if (chars(value) > (c.field === 'meta_title' ? 255 : 500)) return 'That text is too long to save.';
        await setField(c.item_type, c.item_id, c.field, value);
        await db.update('seo_changes', { status: 'applied', new_value: value }, 'id = ?', [id]);
        return 'Applied to ' + c.path;
    }
    if (what === 'dismiss' && c.status === 'suggested') {
        await db.update('seo_changes', { status: 'dismissed' }, 'id = ?', [id]);
        return 'Dismissed.';
    }
    if (what === 'undo' && c.status === 'applied') {
        if (current !== c.new_value) return 'This field was edited since the change was made, so it was left alone.';
        await setField(c.item_type, c.item_id, c.field, c.old_value);
        await db.update('seo_changes', { status: 'undone' }, 'id = ?', [id]);
        return 'Undone on ' + c.path;
    }
    return 'Nothing to do.';
}

function sendIndexNow(host: string, urlList: string[]): Promise<Response> {
    return fetch('https://api.indexnow.org/indexnow', {
        method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: 'https://' + host + '/' + INDEXNOW_KEY + '.txt', urlList }),
    });
}

/** One note per site for each engine, added after the main site's; a site that fails does not stop the others. */
async function tellOtherSites(): Promise<{ bing: string; google: string }> {
    const bing: string[] = [];
    const google: string[] = [];
    for (const host of OTHER_SITES) {
        const sitemap = 'https://' + host + '/sitemap.xml';
        try {
            const res = await fetch(sitemap, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
            const urls = res.ok ? [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]) : [];
            if (!urls.length) throw new Error('no sitemap found.');
            const sent = await sendIndexNow(host, urls);
            bing.push(host + ': ' + (sent.ok ? urls.length + ' pages sent.' : 'IndexNow answered ' + sent.status + '.'));
            if (googleConnected().search) google.push(host + ': ' + await submitSitemap(sitemap).catch((e: Error) => 'Not sent: ' + e.message));
        } catch (e) {
            const note = host + ': ' + (e instanceof Error ? e.message : String(e));
            bing.push(note);
            google.push(note);
        }
    }
    return { bing: bing.join(' '), google: google.join(' ') };
}

async function tellIndexNow(lastRun: string | null, fixed: string[], wordPages: string[]): Promise<{ sent: number; note: string }> {
    const site = new URL(absUrl('/'));
    if (site.hostname !== 'cateyetech.com') return { sent: 0, note: 'Not sent: this is not the live site.' };
    const since = lastRun?.slice(0, 10) ?? '';
    const sitemap = await (await sitemapResponse()).text();
    const urls = new Set([...fixed, ...wordPages].map((p) => absUrl(p)));
    for (const m of sitemap.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)) if (!since || (m[2] && m[2] >= since)) urls.add(m[1].replace(/&amp;/g, '&'));
    if (!urls.size) return { sent: 0, note: 'No pages changed since the last run.' };
    const res = await sendIndexNow(site.hostname, [...urls]);
    return res.ok ? { sent: urls.size, note: urls.size + ' pages sent.' } : { sent: 0, note: 'IndexNow answered ' + res.status + '.' };
}

function watch(report: SearchReport | undefined, before: Record<string, number>) {
    const rows: PositionRow[] = (report?.queries ?? []).map((q) => ({ query: q.key, position: q.position, impressions: q.impressions, clicks: q.clicks, ctr: q.ctr, was: before[q.key] }));
    const byShown = (a: PositionRow, b: PositionRow) => b.impressions - a.impressions;
    return {
        page1: rows.filter((r) => r.position <= 10).sort(byShown).slice(0, 15),
        near: rows.filter((r) => r.position > 10 && r.position <= 20 && r.impressions >= NEAR_MIN_IMPRESSIONS).sort(byShown).slice(0, 15),
        lost: rows.filter((r) => r.position > 10 && r.was !== undefined && r.was <= 10).sort(byShown).slice(0, 15),
        lowCtr: rows.filter((r) => r.position <= 10 && r.impressions >= LOW_CTR_MIN_IMPRESSIONS && r.ctr < LOW_CTR).sort(byShown).slice(0, 15),
        positions: Object.fromEntries(rows.map((r) => [r.query, Math.round(r.position * 10) / 10])),
    };
}

const signed = (now: number, before?: number) => now.toLocaleString('en-US') + (before === undefined ? '' : ' (last run ' + before.toLocaleString('en-US') + ')');

async function emailReport(s: WeeklySummary): Promise<string> {
    const to = (await db.query("SELECT email FROM users WHERE role = 'admin' AND status = 'active' AND email <> ''")).map((r) => String(r.email));
    if (!to.length) return 'No administrator e-mail address.';
    if (!(await Mailer.configured())) return 'E-mail is not set up.';
    const site = Settings.get('site_name');
    const details: [string, string][] = [['Pages checked', String(s.checked)], ['Pages with no issues', String(s.clean)], ['New problems', String(s.added.length)], ['Problems fixed', String(s.resolved.length)]];
    if (s.google) details.push(['Google clicks (28 days)', signed(s.google.clicks, s.googleBefore?.clicks)], ['Google impressions (28 days)', signed(s.google.impressions, s.googleBefore?.impressions)]);
    if (s.bing) details.push(['Bing clicks (28 days)', signed(s.bing.clicks, s.bingBefore?.clicks)], ['Bing impressions (28 days)', signed(s.bing.impressions, s.bingBefore?.impressions)]);
    if (s.words?.length) details.push(['Search words with Google searches', s.words.filter((w) => w.google?.impressions).length + ' of ' + s.words.length], ['Search words on Google page 1', String(s.words.filter((w) => w.google?.position && w.google.position <= 10).length)]);
    details.push(['On Google page 1', String(s.page1.length) + ' searches'], ['Close to page 1', String(s.near.length) + ' searches'], ['Dropped off page 1', String(s.lost.length) + ' searches'], ['Descriptions changed automatically', String(s.applied)], ['Suggestions waiting for you', String(s.suggested)], ['Bing', s.indexNow.note], ['Google', s.googleNote ?? 'Switched off for this run.']);
    const error = await Mailer.sendContent(to, {
        subject: '[' + site + '] SEO report', heading: 'SEO report', paragraphs: ['Here is what changed on your website in search since the last run.'], details,
        button: { label: 'Open the report', url: absUrl(adminUrl('analytics/', { tab: 'utility' })) },
    }, { template: 'seo-weekly' });
    return error ? 'Could not send: ' + error : 'Sent to ' + to.length + ' administrator' + (to.length === 1 ? '' : 's') + '.';
}

export async function runWeekly(options: RunOptions = { source: 'schedule', fixes: 'auto', indexNow: true, email: true }): Promise<WeeklySummary> {
    await ensure();
    await Settings.load();
    const previous = await latestRun();
    const runId = await db.insert('seo_weekly_runs', { summary: '' });
    const problems: string[] = [];
    const google = googleConnected().search ? await searchReport(28, 1000).catch((e: Error) => { problems.push('Search Console: ' + e.message); return undefined; }) : undefined;
    const bing = bingConnected() ? await bingReport(28, 1000).catch((e: Error) => { problems.push('Bing: ' + e.message); return undefined; }) : undefined;
    const audit = await runSeoAudit();
    const open = audit.pages.flatMap((p) => p.issues.map((issue) => ({ path: p.path, issue })));
    const key = (x: { path: string; issue: string }) => x.path + '|' + x.issue;
    const was = new Set((previous?.summary.open ?? []).map(key));
    const is = new Set(open.map(key));
    // On the schedule the limit is per week however often it runs; an undone change still counts, so undoing does not invite another
    const usedThisWeek = options.source === 'schedule' ? Number(await db.value("SELECT count(*) FROM seo_changes WHERE status IN ('applied', 'undone') AND created_at > now() - interval '7 days'", [], 0)) : 0;
    const changes = options.fixes === 'none' ? { applied: 0, suggested: 0, paths: [] } : await makeChanges(runId, audit.pages, options.fixes === 'auto', Math.max(0, MAX_AUTO - usedThisWeek));
    const words = await measureWords(audit.pages, google, bing, previous?.summary.words ?? []);
    const indexNow = options.indexNow ? await tellIndexNow(previous?.run_at ?? null, changes.paths, words.map((w) => w.path)).catch((e: Error) => ({ sent: 0, note: 'Could not reach IndexNow: ' + e.message })) : { sent: 0, note: 'Switched off for this run.' };
    const mainGoogleNote = !options.indexNow ? 'Switched off for this run.' : new URL(absUrl('/')).hostname !== 'cateyetech.com' ? 'Not sent: this is not the live site.' : !googleConnected().search ? 'Not sent: Search Console is not connected.'
        : await submitSitemap(absUrl('/sitemap.xml')).catch((e: Error) => 'Not sent: ' + e.message);
    const others = options.indexNow && new URL(absUrl('/')).hostname === 'cateyetech.com' ? await tellOtherSites() : null;
    if (others) indexNow.note += ' ' + others.bing;
    const googleNote = others?.google ? mainGoogleNote + ' ' + others.google : mainGoogleNote;
    const summary: WeeklySummary = {
        checked: audit.pages.length, clean: audit.pages.filter((p) => !p.issues.length).length, open,
        added: previous ? open.filter((x) => !was.has(key(x))) : [], resolved: (previous?.summary.open ?? []).filter((x) => !is.has(key(x))),
        google: google?.totals, googleBefore: previous?.summary.google, bing: bing?.totals, bingBefore: previous?.summary.bing,
        ...watch(google, previous?.summary.positions ?? {}), indexNow, googleNote, words, applied: changes.applied, suggested: changes.suggested, emailed: '', problems, source: options.source,
    };
    summary.emailed = options.email ? await emailReport(summary).catch((e: Error) => 'Could not send: ' + e.message) : 'Switched off for this run.';
    await db.update('seo_weekly_runs', { summary: JSON.stringify(summary) }, 'id = ?', [runId]);
    return summary;
}

/** Where an open problem can be edited by hand. */
export async function editLink(path: string): Promise<string | null> {
    const item = await itemFor(path);
    return item ? adminUrl(item.type === 'post' ? 'posts/edit/' : 'pages/edit/', { id: Number(item.row.id) }) : null;
}

function nextAfter(frequency: Frequency, last: string): string {
    const [y, m, d] = last.split('-').map(Number);
    const f = FREQUENCIES[frequency];
    if ('days' in f) return new Date(Date.UTC(y, m - 1, d + f.days)).toISOString().slice(0, 10);
    // 31 January plus a month is the last day of February, not 3 March
    const longest = new Date(Date.UTC(y, m + f.months, 0)).getUTCDate();
    return new Date(Date.UTC(y, m - 1 + f.months, Math.min(d, longest))).toISOString().slice(0, 10);
}

/** Dates are UTC, the clock of the cron. Run now does not move the schedule; a run that crashed has no summary, so the next day tries again. */
export async function getSchedule(): Promise<Schedule> {
    await ensure();
    await Settings.load(true);
    const saved = Settings.get('seo_schedule', 'weekly');
    const frequency: Frequency = saved in FREQUENCIES ? saved as Frequency : 'weekly';
    const lastRun = await db.value<string>("SELECT (max(run_at) AT TIME ZONE 'UTC')::date::text FROM seo_weekly_runs WHERE summary LIKE '%\"source\":\"schedule\"%'");
    const clock = new Date();
    const today = clock.toISOString().slice(0, 10);
    const dueOn = lastRun ? nextAfter(frequency, lastRun) : today;
    // Vercel's free plan may start the 03:30 job at any minute of that hour, so only after 04:00 is today's chance gone
    const nextWake = clock.getUTCHours() < 4 ? today : nextAfter('daily', today);
    return { frequency, lastRun, next: dueOn > nextWake ? dueOn : nextWake, due: dueOn <= today };
}

export async function setSchedule(frequency: string): Promise<boolean> {
    if (!(frequency in FREQUENCIES)) return false;
    await Settings.set('seo_schedule', frequency);
    return true;
}

/** A second scheduled call within six hours does nothing; Run now does not count. */
export async function ranRecently(): Promise<boolean> {
    await ensure();
    return db.exists('seo_weekly_runs', "summary LIKE '%\"source\":\"schedule\"%' AND run_at > now() - interval '6 hours'");
}
