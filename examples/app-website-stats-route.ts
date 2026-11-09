/**
 * GET /api/website-stats?days=28: sign-up and demo totals for cateyetech.com's analytics page. Counts only, never a name
 * or an address. Closed unless the request is signed by cateyetech.com with the private key only it holds. This file has the
 * matching public key, which is safe in the repository, so this app needs no secret in its hosting account.
 */
import { createPublicKey, verify } from 'node:crypto';
import { DB, platformOn } from '@/lib/db';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

const HOST = 'support.cateyetech.com';
const WEBSITE_PUBLIC_KEY = createPublicKey({ key: Buffer.from('MCowBQYDK2VwAyEAVZJk5meqYb8QR3hINAGAUmUIp4p2iREDbwJ3vztZowg=', 'base64'), format: 'der', type: 'spki' });

/** "Bearer <expiry in ms>.<signature>": good for at most five minutes, and only for this site. */
function signedByWebsite(authorization: string): boolean {
  const m = /^Bearer (\d+)\.([\w-]+)$/.exec(authorization);
  if (!m || Number(m[1]) < Date.now() || Number(m[1]) > Date.now() + 300_000) return false;
  return verify(null, Buffer.from(`website-stats:${HOST}:${m[1]}`), WEBSITE_PUBLIC_KEY, Buffer.from(m[2], 'base64url'));
}

export async function GET(req: Request): Promise<Response> {
  if (!signedByWebsite(req.headers.get('authorization') || '')) return json({ error: 'unauthorized' }, 401);
  const asked = Math.trunc(Number(new URL(req.url).searchParams.get('days')) || 28);
  const days = Math.min(366, Math.max(1, asked));
  if (!platformOn()) return json({ days, signups: { total: 0, byStatus: {}, byProduct: {} }, demos: { total: 0 } });
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [rows, demos] = await DB.asPlatform(() => Promise.all([
    DB.all<{ status: string; n: number | string }>('SELECT status, COUNT(*) AS n FROM signups WHERE created_at >= ? GROUP BY status', [since]),
    DB.value<number | string>("SELECT COUNT(*) FROM platform_audit WHERE action = 'demo_started' AND created_at >= ?", [since], 0),
  ]));
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  return json({ days, signups: { total: rows.reduce((sum, r) => sum + Number(r.n), 0), byStatus, byProduct: {} }, demos: { total: Number(demos) } });
}
