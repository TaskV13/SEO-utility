# SEO analytics and utility

Copied from the cateyetech.com website (Next.js 16, Postgres). It is the code behind Admin > Analytics & SEO: the Analytics, SEO, Reports and SEO Utility tabs.
Files keep the paths they have in that website. This is a copy of those parts, not an app that runs by itself.

## What is here

| Path | What it does |
|---|---|
| `lib/seo-weekly.ts` | The SEO job: page check, fixes, schedule, sending to Google and Bing, e-mail report |
| `lib/seo-audit.ts` | Checks every page's title, description and headings |
| `lib/seo-words.ts` | Tracked search words |
| `lib/seo-fixes.ts` | Render-time wording fixes, specific to cateyetech.com |
| `lib/visits.ts`, `app/(site)/api/collect/route.ts` | The site's own visit log, without cookies |
| `lib/google-data.ts`, `lib/bing-data.ts` | Google Analytics, Search Console and Bing Webmaster Tools |
| `lib/app-stats.ts` | Signup and demo totals from other apps |
| `lib/admin/screens-*.ts`, `lib/admin/actions-seo.ts` | The admin screens and their actions |
| `app/(admin)/admin/(panel)/analytics/page.tsx`, `app/(site)/api/seo/weekly/route.ts` | The admin page and the scheduled job's address |
| `app/(site)/layout.tsx` | Where the browser reports visits |
| `public/assets/admin/admin.css` | Admin styles |
| `examples/` | What another app adds to report its signups, demos and visits |

## What it needs from the website around it

Local modules not copied: `lib/db`, `lib/data`, `lib/auth`, `lib/util`, `lib/meta`, `lib/feeds`, `lib/mail`, `lib/render`, `lib/views`, `lib/admin/actions`, `lib/admin/ui`, `components/AdminHtml`.

Tables are created on first use: `visit_log`, `seo_weekly_runs`, `seo_changes`, `seo_search_words`. The schedule is the setting `seo_schedule`.

Environment variables (no values are in this repository): `GOOGLE_SERVICE_ACCOUNT_JSON`, `GA4_PROPERTY_ID`, `GSC_SITE_URL`, `BING_WEBMASTER_API_KEY`, `BING_SITE_URL`, `CRON_SECRET`, `APP_STATS_SIGNING_KEY`, `ERP_STATS_SECRET`, `SECURITY_STATS_SECRET`, and `ERP_STATS_URL`, `SECURITY_STATS_URL`, `SUPPORT_STATS_URL`, `CHAT_STATS_URL` for local tests.

The IndexNow key in `lib/seo-weekly.ts` and the public key in `examples/` are public by design. A site using this code should make its own: the addresses, site names and IndexNow key here are cateyetech.com's.
