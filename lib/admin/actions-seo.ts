/** Admin actions for Analytics & SEO > SEO Utility. */
import { can, flash } from '../auth';
import { adminUrl } from '../data';
import { sitemapPaths } from '../seo-audit';
import { decideChange, runWeekly, setSchedule } from '../seo-weekly';
import { addWord, removeWord } from '../seo-words';
import { Redirect, bool, input, int, type Action } from './actions';

const back = () => new Redirect(adminUrl('analytics/', { tab: 'utility' }));

export const seoActions: Record<string, Action> = {
    async 'seo-weekly-run'(form, u) {
        if (!can(u, 'analytics')) return new Redirect(adminUrl(''));
        const choice = input(form, 'fixes');
        const s = await runWeekly({ source: 'manual', fixes: choice === 'auto' || choice === 'none' ? choice : 'suggest', indexNow: bool(form, 'indexnow'), email: bool(form, 'email') });
        await flash('success', 'SEO check finished: ' + s.applied + ' fixed automatically, ' + s.suggested + ' new suggestions.');
        return back();
    },
    async 'seo-schedule-save'(form, u) {
        if (!can(u, 'analytics')) return new Redirect(adminUrl(''));
        const saved = await setSchedule(input(form, 'frequency'));
        await flash(saved ? 'success' : 'error', saved ? 'Schedule saved.' : 'Choose a schedule from the list.');
        return back();
    },
    async 'seo-word-add'(form, u) {
        if (!can(u, 'analytics')) return new Redirect(adminUrl(''));
        const error = await addWord(input(form, 'phrase'), input(form, 'path'), await sitemapPaths());
        await flash(error ? 'error' : 'success', error ?? 'Added. The next run will check it.');
        return back();
    },
    async 'seo-word-remove'(form, u) {
        if (!can(u, 'analytics')) return new Redirect(adminUrl(''));
        await removeWord(int(form, 'id', 0));
        await flash('success', 'Search word removed.');
        return back();
    },
    async 'seo-change'(form, u) {
        if (!can(u, 'analytics')) return new Redirect(adminUrl(''));
        await flash('success', await decideChange(int(form, 'id', 0), input(form, 'what'), input(form, 'value')));
        return back();
    },
};
