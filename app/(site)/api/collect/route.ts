/** Receives a page view or an action for the site's own visit log, from this site or a listed app. Always answers 204. */
import { currentUser } from '@/lib/auth';
import { APP_SITES, recordVisit } from '@/lib/visits';

export async function POST(req: Request) {
    const origin = req.headers.get('origin') ?? '';
    let originHost = '';
    try { originHost = new URL(origin).host.toLowerCase(); } catch { /* no usable origin: not stored */ }
    const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').toLowerCase();
    const site = originHost !== '' && originHost === host ? 'main' : APP_SITES[originHost];
    const done = new Response(null, { status: 204, headers: site && site !== 'main' ? { 'Access-Control-Allow-Origin': origin } : {} });
    if (!site) return done;
    try {
        const text = await req.text();
        if (text.length > 2000) return done;
        // The people running the site are not visitors
        if (site === 'main' && await currentUser()) return done;
        const body = JSON.parse(text);
        if (body && typeof body === 'object') await recordVisit(body, req.headers, site, originHost.split(':')[0]);
    } catch (err) {
        console.error('visit log:', err instanceof Error ? err.message : err);
    }
    return done;
}
