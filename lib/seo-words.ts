/**
 * The search words the company wants to be found for (Admin > Analytics & SEO > SEO Utility). Each word has one
 * target page. Every SEO run checks whether the page uses the word, and how searches containing it do on Google and Bing.
 */
import * as db from './db';
import type { SeoPage } from './seo-audit';
import type { SearchReport } from './google-data';

export interface SearchWord { id: number; phrase: string; path: string }
export interface WordSearch { position: number; impressions: number; clicks: number }
export interface WordRow {
    phrase: string; path: string; inTitle: boolean; inHeading: boolean; inDescription: boolean; inPage: boolean;
    google?: WordSearch; bing?: WordSearch; wasGoogle?: number; wasBing?: number;
}

const STARTING_WORDS: [string, string][] = [
    ['ERP', '/erp/'], ['ERP Software', '/erp/'], ['CRM', '/crm/'], ['CRM Software', '/crm/'],
    ['HRMS', '/hr-manager/'], ['HR Management', '/hr-manager/'],
    ['Payroll Management', '/payroll-manager/'], ['Payroll Software', '/payroll-manager/'],
    ['Expense Manager', '/expense-manager/'], ['Expense Management', '/expense-manager/'],
    ['Accounting Software', '/accounting/'], ['GST Accounting', '/accounting/'], ['Tally Alternative', '/tally-alternative/'],
    ['Help Desk', '/support-desk/'], ['Live Chat', '/chat/'],
    ['Cyber Security', '/cyber-security-services/'], ['GRC', '/cateye-grc/'], ['SOC 2', '/cateye-grc/'], ['ISO 27001', '/cateye-grc/'],
    ['IAM', '/cateye-iam/'], ['MDR', '/cateye-mdr/'], ['DFIR', '/cateye-dfir/'], ['Incident Response', '/cateye-dfir/'],
    ['Cloud Security', '/cateye-cloudsec/'], ['VAPT', '/cateye-vapt/'], ['Penetration Testing', '/cateye-vapt/'],
    ['Digital Transformation', '/digital-transformation-services/'],
    ['CIO on Demand', '/cio-on-demand-as-a-service/'], ['CTO on Demand', '/cto-on-demand-as-a-service/'], ['CISO on Demand', '/ciso-on-demand-as-service/'], ['Virtual CISO', '/ciso-on-demand-as-service/'],
];

const g = globalThis as unknown as { __cateyeSeoWords?: Promise<void> };
function ensure(): Promise<void> {
    return (g.__cateyeSeoWords ??= (async () => {
        // The starting list goes in only when the table is first made, so a word removed later stays removed
        const had = await db.value<string>("SELECT to_regclass('seo_search_words')::text");
        await db.exec('CREATE TABLE IF NOT EXISTS seo_search_words (id SERIAL PRIMARY KEY, phrase VARCHAR(80) NOT NULL UNIQUE, path VARCHAR(300) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())');
        if (!had) for (const [phrase, path] of STARTING_WORDS) await db.exec('INSERT INTO seo_search_words (phrase, path) VALUES (?, ?) ON CONFLICT (phrase) DO NOTHING', [phrase, path]);
    })().catch((err) => { g.__cateyeSeoWords = undefined; throw err; }));
}

export async function listWords(): Promise<SearchWord[]> {
    await ensure();
    return (await db.query('SELECT id, phrase, path FROM seo_search_words ORDER BY id')).map((r) => ({ id: Number(r.id), phrase: String(r.phrase), path: String(r.path) }));
}

/** Returns an error message, or null when the word was added. */
export async function addWord(phrase: string, path: string, allowed: string[]): Promise<string | null> {
    await ensure();
    const clean = phrase.replace(/\s+/g, ' ').trim();
    if (clean.length < 2 || clean.length > 60) return 'A search word needs 2 to 60 characters.';
    if (!allowed.includes(path)) return 'Choose a page from the list.';
    if (await db.exists('seo_search_words', 'lower(phrase) = lower(?)', [clean])) return '“' + clean + '” is already on the list.';
    await db.insert('seo_search_words', { phrase: clean, path });
    return null;
}

export async function removeWord(id: number): Promise<void> {
    await ensure();
    await db.del('seo_search_words', 'id = ?', [id]);
}

/** Whole words only, so ERP does not match "interpret"; "Cyber Security" also matches "cybersecurity" and "cyber-security". */
export function wordPattern(phrase: string): RegExp {
    const words = phrase.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp('(?<![a-z0-9])' + words.join('[\\s-]*') + '(?![a-z0-9])', 'i');
}

/** People searching for the company by name say nothing about how a word ranks. */
const OWN_NAME = /\b(cat\s?eye|kat\s?eye|cataye|kataye|cteye)/i;

function figures(report: SearchReport | undefined, pattern: RegExp): WordSearch | undefined {
    if (!report) return undefined;
    const rows = report.queries.filter((q) => pattern.test(q.key) && !OWN_NAME.test(q.key));
    const seen = rows.filter((q) => q.position > 0);
    const weight = seen.reduce((n, q) => n + q.impressions, 0);
    return {
        position: weight ? Math.round(seen.reduce((n, q) => n + q.position * q.impressions, 0) / weight * 10) / 10 : 0,
        impressions: rows.reduce((n, q) => n + q.impressions, 0), clicks: rows.reduce((n, q) => n + q.clicks, 0),
    };
}

export async function measureWords(pages: SeoPage[], google: SearchReport | undefined, bing: SearchReport | undefined, before: WordRow[]): Promise<WordRow[]> {
    const was = new Map(before.map((w) => [w.phrase.toLowerCase(), w]));
    return (await listWords()).map(({ phrase, path }) => {
        const page = pages.find((p) => p.path === path);
        const pattern = wordPattern(phrase);
        const last = was.get(phrase.toLowerCase());
        return {
            phrase, path, inTitle: pattern.test(page?.title ?? ''), inHeading: pattern.test(page?.h1Text ?? ''), inDescription: pattern.test(page?.description ?? ''), inPage: pattern.test(page?.text ?? ''),
            google: figures(google, pattern), bing: figures(bing, pattern), wasGoogle: last?.google?.position || undefined, wasBing: last?.bing?.position || undefined,
        };
    });
}
