/**
 * Signup and demo totals from the CATEYE apps, for Admin > Analytics & SEO. Each app answers
 * GET /api/website-stats with counts only (no names or addresses) to the bearer secret it shares
 * with this site: ERP_STATS_SECRET and SECURITY_STATS_SECRET here, WEBSITE_STATS_SECRET in the app. Support and Chat are hosted
 * on other Vercel accounts that only GitHub reaches, so they hold no secret: this site signs each request with
 * APP_STATS_SIGNING_KEY and they check it against the public key in their own api/website-stats route.
 */
import { createPrivateKey, sign } from 'crypto';
import type { Count } from './visits';

export interface AppStats { signups: number; demos: number; byStatus: Count[]; byProduct: Count[]; productLabel: string }

const SIGNING_KEY = () => process.env.APP_STATS_SIGNING_KEY;

/** Good for two minutes and only for that site; the app refuses anything else. */
function signedToken(host: string): string {
    const expires = String(Date.now() + 120_000);
    const key = createPrivateKey({ key: Buffer.from(SIGNING_KEY() ?? '', 'base64'), format: 'der', type: 'pkcs8' });
    return expires + '.' + sign(null, Buffer.from('website-stats:' + host + ':' + expires), key).toString('base64url');
}

const APPS: Record<string, { url: () => string; secret: () => string | undefined; token?: () => string; productLabel: string }> = {
    erp: { url: () => process.env.ERP_STATS_URL || 'https://erp.cateyetech.com/api/website-stats', secret: () => process.env.ERP_STATS_SECRET, productLabel: 'Signups by product' },
    security: { url: () => process.env.SECURITY_STATS_URL || 'https://security.cateyetech.com/api/website-stats', secret: () => process.env.SECURITY_STATS_SECRET, productLabel: 'Signups by module' },
    support: { url: () => process.env.SUPPORT_STATS_URL || 'https://support.cateyetech.com/api/website-stats', secret: SIGNING_KEY, token: () => signedToken('support.cateyetech.com'), productLabel: '' },
    chat: { url: () => process.env.CHAT_STATS_URL || 'https://chat.cateyetech.com/api/website-stats', secret: SIGNING_KEY, token: () => signedToken('chat.cateyetech.com'), productLabel: '' },
};

export const statsConnected = (site: string) => !!APPS[site]?.secret();

const titleCase = (s: string) => (/^(erp|crm|hrms)$/.test(s) ? s.toUpperCase() : s.charAt(0).toUpperCase() + s.slice(1));
const list = (o: unknown): Count[] => Object.entries((o ?? {}) as Record<string, number>).map(([label, value]) => ({ label: titleCase(label), value: Number(value) })).sort((a, b) => b.value - a.value);

export async function appStats(site: string, days: number): Promise<AppStats> {
    const app = APPS[site];
    const res = await fetch(app.url() + '?days=' + days, { headers: { Authorization: 'Bearer ' + (app.token ? app.token() : app.secret()) }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(res.status === 401 ? 'the app refused this site’s key.' : res.status === 503 ? 'the app does not have its secret set.' : 'the app answered ' + res.status + '.');
    const d = await res.json();
    return { signups: Number(d.signups?.total ?? 0), demos: Number(d.demos?.total ?? 0), byStatus: list(d.signups?.byStatus), byProduct: list(d.signups?.byProduct), productLabel: app.productLabel };
}
