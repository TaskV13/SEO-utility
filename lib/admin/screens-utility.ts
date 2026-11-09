/**
 * Admin > Analytics & SEO > SEO Utility: run the SEO job with chosen options, and apply or undo its fixes on screen.
 * The job itself is lib/seo-weekly.ts.
 */
import { adminUrl } from '../data';
import { schemaName } from '../meta';
import { DESC_MAX, TITLE_MAX, sitemapPaths } from '../seo-audit';
import { FREQUENCIES, editLink, getSchedule, latestRun, recentChanges, type PositionRow, type Schedule, type SeoChange, type WeeklyRun } from '../seo-weekly';
import { listWords, type SearchWord, type WordRow, type WordSearch } from '../seo-words';
import { e } from '../util';
import { csrfField, miniForm } from './ui';

const fmt = (n: number) => n.toLocaleString('en-US');

function positionTable(title: string, advice: string, rows: PositionRow[]): string {
    if (!rows.length) return '';
    return '<section class="card flush"><h2 class="an-flush-title">' + e(title) + '</h2><p class="muted small an-flush-note">' + e(advice) + '</p><div class="table-wrap"><table class="table"><thead><tr><th>Search</th><th class="right">Position</th><th class="right">Last run</th><th class="right">Impressions</th><th class="right">Clicks</th></tr></thead><tbody>'
        + rows.map((r) => '<tr><td>' + e(r.query) + '</td><td class="right">' + r.position.toFixed(1) + '</td><td class="right">' + (r.was === undefined ? '<span class="muted">–</span>' : r.was.toFixed(1)) + '</td><td class="right">' + fmt(r.impressions) + '</td><td class="right">' + fmt(r.clicks) + '</td></tr>').join('')
        + '</tbody></table></div></section>';
}

function runForm(csrf: string): string {
    const box = (name: string, label: string, note: string) => '<label class="ut-option"><input type="checkbox" name="' + name + '" value="1"><span><b>' + label + '</b><small>' + note + '</small></span></label>';
    const radio = (value: string, label: string, note: string, on = false) => '<label class="ut-option"><input type="radio" name="fixes" value="' + value + '"' + (on ? ' checked' : '') + '><span><b>' + label + '</b><small>' + note + '</small></span></label>';
    return '<form class="card" method="post" action="' + e(adminUrl('do/seo-weekly-run/')) + '">' + csrfField(csrf)
        + '<h2>Run the SEO check</h2><p class="muted small">Always checks every page and compares with the last run.</p>'
        + '<div class="ut-columns"><fieldset><legend>Fixes</legend>'
        + radio('suggest', 'Suggest only', 'Nothing changes until you apply it below.', true)
        + radio('auto', 'Fix descriptions automatically', 'Up to 5 pages, each can be undone. Titles stay as suggestions.')
        + radio('none', 'Check only', 'No fixes or suggestions.')
        + '</fieldset><fieldset><legend>Also</legend>'
        + box('indexnow', 'Send to Google and Bing', 'Bing gets the pages for your search words and any changed pages through IndexNow. Google gets your sitemap. The Support and Chat sites are sent too.')
        + box('email', 'E-mail the report', 'To the administrator accounts.')
        + '</fieldset></div><button type="submit" class="btn btn-primary">Run now</button></form>';
}

function scheduleForm(csrf: string, s: Schedule): string {
    const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    const options = Object.entries(FREQUENCIES).map(([value, f]) => '<option value="' + value + '"' + (value === s.frequency ? ' selected' : '') + '>' + e(f.label) + '</option>').join('');
    return '<form class="card" method="post" action="' + e(adminUrl('do/seo-schedule-save/')) + '">' + csrfField(csrf)
        + '<h2>Schedule</h2><p class="muted small">How often the check runs by itself, at 9:00 India time, with automatic fixes (at most 5 a week), sending to Google and Bing, and e-mail switched on.</p>'
        + '<div class="ut-schedule"><select name="frequency" aria-label="How often the check runs">' + options + '</select><button type="submit" class="btn btn-primary btn-sm">Save schedule</button></div>'
        + '<p class="muted small">Next run: ' + e(day(s.next)) + '. Last scheduled run: ' + (s.lastRun ? e(day(s.lastRun)) : 'none yet') + '.</p></form>';
}

function wordPosition(s: WordSearch | undefined, was: number | undefined): string {
    if (!s) return '<span class="muted">Not connected</span>';
    if (!s.impressions) return '<span class="muted">No searches yet</span>';
    return (s.position ? s.position.toFixed(1) : '–') + '<small class="ut-sub">' + (was ? 'last run ' + was.toFixed(1) + ', ' : '') + fmt(s.impressions) + ' shown, ' + fmt(s.clicks) + ' clicks</small>';
}

function wordsSection(csrf: string, words: SearchWord[], measured: WordRow[], paths: string[]): string {
    const found = (on: boolean) => on ? '<span class="ut-yes">Yes</span>' : '<span class="ut-no">No</span>';
    const rows = words.map((w) => {
        const m = measured.find((x) => x.phrase.toLowerCase() === w.phrase.toLowerCase() && x.path === w.path);
        const remove = miniForm('seo-word-remove', csrf, { id: w.id }, '<button type="submit" class="btn btn-light btn-sm">Remove</button>', 'Remove this search word?');
        const start = '<tr><td><b>' + e(w.phrase) + '</b></td><td class="mono small">' + e(w.path) + '</td>';
        if (!m) return start + '<td colspan="5" class="muted">Checked at the next run.</td><td class="rp-actions">' + remove + '</td></tr>';
        return start + '<td>' + found(m.inTitle) + '</td><td>' + found(m.inHeading) + '</td><td>' + found(m.inDescription) + '</td><td class="right">' + wordPosition(m.google, m.wasGoogle) + '</td><td class="right">' + wordPosition(m.bing, m.wasBing) + '</td><td class="rp-actions">' + remove + '</td></tr>';
    }).join('');
    const options = paths.map((p) => '<option value="' + e(p) + '">' + e(p) + '</option>').join('');
    return '<section class="card flush"><h2 class="an-flush-title">Search words</h2><p class="muted small an-flush-note">The words you want to be found for, and the page that should win each one. Positions cover searches containing the word over 28 days, without searches for your company name. Search engines read these words from the page, so Yes in the first three columns is what counts.</p>'
        + '<form class="ut-add" method="post" action="' + e(adminUrl('do/seo-word-add/')) + '">' + csrfField(csrf) + '<input type="text" name="phrase" maxlength="60" required placeholder="New search word" aria-label="New search word"><select name="path" required aria-label="Page for this word">' + options + '</select><button type="submit" class="btn btn-primary btn-sm">Add word</button></form>'
        + '<div class="table-wrap"><table class="table"><thead><tr><th>Search word</th><th>Page</th><th>In title</th><th>In heading</th><th>In description</th><th class="right">Google</th><th class="right">Bing</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
}

function changeRow(c: SeoChange, csrf: string): string {
    const isTitle = c.field === 'meta_title';
    // The site adds its own name after every title but the home page's
    const titleRoom = c.path === '/' ? TITLE_MAX : TITLE_MAX - Array.from(' – ' + schemaName()).length;
    const label = { applied: 'Changed', suggested: 'Waiting for you', undone: 'Undone', dismissed: 'Dismissed' }[c.status] ?? c.status;
    const page = '<td class="mono">' + e(c.path) + '<br><small class="muted">' + (isTitle ? 'Title' : 'Description') + ': ' + e(c.issue) + '</small></td><td class="small">' + e(c.old_value || '(empty)') + '</td>';
    if (c.status === 'suggested') {
        const form = 'seo-fix-' + c.id;
        return '<tr>' + page + '<td><textarea form="' + form + '" name="value" rows="3" class="ut-text" data-limit="' + (isTitle ? titleRoom : DESC_MAX) + '" aria-label="New text for ' + e(c.path) + '">' + e(c.new_value) + '</textarea><small class="ut-count"></small></td><td>' + e(label) + '</td>'
            + '<td class="rp-actions"><form id="' + form + '" method="post" action="' + e(adminUrl('do/seo-change/')) + '">' + csrfField(csrf) + '<input type="hidden" name="id" value="' + c.id + '"><button type="submit" name="what" value="approve" class="btn btn-primary btn-sm">Apply fix</button> <button type="submit" name="what" value="dismiss" class="btn btn-light btn-sm">Dismiss</button></form></td></tr>';
    }
    const undo = c.status === 'applied' ? miniForm('seo-change', csrf, { id: c.id, what: 'undo' }, '<button type="submit" class="btn btn-light btn-sm">Undo</button>', 'Put the earlier text back?') : '';
    return '<tr>' + page + '<td class="small">' + e(c.new_value) + '</td><td>' + e(label) + '</td><td class="rp-actions">' + undo + '</td></tr>';
}

async function problemsHtml(run: WeeklyRun | null): Promise<string> {
    const open = run?.summary.open ?? [];
    if (!open.length) return '';
    const rows = await Promise.all(open.slice(0, 40).map(async (x) => {
        const href = await editLink(x.path).catch(() => null);
        return '<tr><td class="mono">' + e(x.path) + '</td><td>' + e(x.issue) + '</td><td class="rp-actions">' + (href ? '<a class="btn btn-light btn-sm" href="' + e(href) + '">Edit page</a>' : '') + '</td></tr>';
    }));
    return '<section class="card flush"><h2 class="an-flush-title">Open page problems</h2><p class="muted small an-flush-note">From the last run. Anything without a fix above needs a person to edit the page.</p><div class="table-wrap"><table class="table"><tbody>' + rows.join('') + '</tbody></table></div></section>';
}

export async function utilityTab(csrf: string): Promise<string> {
    let run: WeeklyRun | null;
    let changes: SeoChange[];
    let words: SearchWord[];
    let paths: string[];
    let schedule: Schedule;
    try {
        [run, changes, words, paths, schedule] = await Promise.all([latestRun(), recentChanges(), listWords(), sitemapPaths(), getSchedule()]);
    } catch (err) {
        return runForm(csrf) + '<div class="alert alert-error" role="alert">The SEO job could not be read: ' + e(err instanceof Error ? err.message : String(err)) + '</div>';
    }
    const waiting = changes.filter((c) => c.status === 'suggested');
    const others = changes.filter((c) => c.status !== 'suggested');
    const table = (title: string, note: string, list: SeoChange[], before = 'Before', after = 'After') => list.length ? '<section class="card flush"><h2 class="an-flush-title">' + title + '</h2><p class="muted small an-flush-note">' + note + '</p><div class="table-wrap"><table class="table"><thead><tr><th>Page</th><th>' + before + '</th><th>' + after + '</th><th>Status</th><th></th></tr></thead><tbody>' + list.map((c) => changeRow(c, csrf)).join('') + '</tbody></table></div></section>' : '';
    const fixes = waiting.length ? table('Suggested fixes', 'Edit the text if you like, then click Apply fix. It changes the live page straight away.', waiting, 'Now', 'Fix')
        : '<section class="card"><h2>Suggested fixes</h2><p class="muted">No suggestions are waiting.' + (run ? ' The last run found nothing it could fix by itself.' : '') + '</p></section>';
    const body = !run ? '<p class="muted">Nothing has run yet.</p>' : (() => {
        const s = run.summary;
        return '<p class="muted small">Last run ' + e(run.run_at.slice(0, 16)) + ' UTC' + (s.source === 'schedule' ? ' (scheduled)' : '') + '. Search positions are Google’s, over 28 days. No tool can promise a first-page place; these lists show where effort is most likely to pay off. Bing: ' + e(s.indexNow.note) + ' Google: ' + e(s.googleNote ?? 'Not sent on this run.') + ' E-mail: ' + e(s.emailed) + '</p>'
            + s.problems.map((p) => '<div class="alert alert-error" role="alert">' + e(p) + '</div>').join('')
            + '<div class="an-tiles"><div class="card an-tile"><b>' + s.page1.length + '</b><span>Searches on page 1</span></div><div class="card an-tile"><b>' + s.near.length + '</b><span>Close to page 1</span></div><div class="card an-tile"><b>' + s.lost.length + '</b><span>Dropped off page 1</span></div><div class="card an-tile"><b>' + s.added.length + '</b><span>New page problems</span></div></div>'
            + positionTable('Dropped off page 1', 'These were on the first page at the last run. Look first at what changed on the page, and whether it still answers the search well.', s.lost)
            + positionTable('Close to page 1', 'Positions 11 to 20: the best chances. Improve the page that ranks, and link to it from your strongest pages using these words.', s.near)
            + positionTable('On page 1 but rarely clicked', 'People see these and do not click. A clearer title and description usually help most.', s.lowCtr)
            + positionTable('On page 1', 'Keep these pages current and do not change their addresses.', s.page1);
    })();
    return runForm(csrf) + scheduleForm(csrf, schedule) + wordsSection(csrf, words, run?.summary.words ?? [], paths) + fixes + await problemsHtml(run) + table('Past changes', 'Anything marked Changed can be undone.', others) + body;
}
