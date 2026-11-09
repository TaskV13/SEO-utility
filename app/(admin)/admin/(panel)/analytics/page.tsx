import AdminHtml from '@/components/AdminHtml';
import { analyticsScreen } from '@/lib/admin/screens-analytics';
import { adminContext, adminShell, adminTitle } from '@/lib/admin/ui';
import { Settings } from '@/lib/data';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export const maxDuration = 60;

export async function generateMetadata() {
    await Settings.load();
    return adminTitle('Analytics & SEO');
}

export default async function Page({ searchParams }: Props) {
    const ctx = await adminContext('analytics');
    const sp = await searchParams;
    const days = Number(sp.days);
    const html = await analyticsScreen({
        tab: sp.tab === 'seo' || sp.tab === 'reports' || sp.tab === 'utility' ? sp.tab : 'analytics',
        days: [7, 90].includes(days) ? days : 28,
        source: sp.source === 'google' || sp.source === 'search' || sp.source === 'bing' ? sp.source : 'own',
        site: ['erp', 'security', 'support', 'chat', 'all'].includes(String(sp.site)) ? String(sp.site) : 'main',
    }, ctx.csrf);
    return <AdminHtml html={await adminShell(ctx, { title: 'Analytics & SEO', active: 'analytics', html })} />;
}
