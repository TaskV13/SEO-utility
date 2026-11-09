/** The SEO job, woken daily by Vercel Cron (vercel.json) with "Authorization: Bearer <CRON_SECRET>"; it runs when the schedule on SEO Utility says it is due. */
import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { getSchedule, ranRecently, runWeekly } from '@/lib/seo-weekly';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
    const secret = process.env.CRON_SECRET;
    const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!secret || secret.length !== given.length || !timingSafeEqual(Buffer.from(secret), Buffer.from(given))) return new NextResponse('Not found', { status: 404 });
    if (await ranRecently() || !(await getSchedule()).due) return NextResponse.json({ skipped: true });
    const s = await runWeekly();
    return NextResponse.json({ checked: s.checked, applied: s.applied, suggested: s.suggested });
}
