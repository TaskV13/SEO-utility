import type { Viewport } from 'next';
import { Fragment } from 'react';
import { Settings } from '@/lib/data';

// Every page reads the database when it is requested, so edits in the admin show at once
export const dynamic = 'force-dynamic';

const FONTS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,300..800&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Geist:wght@300..600&family=Geist+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,300;9..144,400&family=Manrope:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap';

/**
 * The design the site ships with: "modern", "dark", "crm", "labs" or "navy". Settings > General > Website design
 * decides; SITE_DESIGN in .env is the fallback for a database that has no setting yet.
 */
const DESIGNS = ['modern', 'dark', 'crm', 'labs', 'navy'];
const DESIGN = DESIGNS.includes(process.env.SITE_DESIGN ?? '') ? process.env.SITE_DESIGN! : 'modern';
const siteDesign = () => (DESIGNS.includes(Settings.get('theme')) ? Settings.get('theme') : DESIGN);

/**
 * Runs before the page paints: ?design=dark, ?design=crm, ?design=labs or ?design=modern in the address
 * switches the design for this browser (kept in localStorage) so both can be
 * compared on the live pages. No parameter and nothing stored keeps the default.
 */
// A ?design= preview is remembered in that browser for a day, then the live setting applies again
const DESIGN_SWITCH = `(function(){try{var ok=['dark','modern','crm','labs','navy'],q=new URLSearchParams(location.search).get('design'),now=Date.now();
if(ok.indexOf(q)>-1){localStorage.setItem('design',q);localStorage.setItem('designAt',String(now))}else if(q==='default'){localStorage.removeItem('design');localStorage.removeItem('designAt')}
var d=localStorage.getItem('design'),at=Number(localStorage.getItem('designAt')||0);
if(d&&(!at||now-at>864e5)){localStorage.removeItem('design');localStorage.removeItem('designAt');d=null}
if(ok.indexOf(d)>-1){document.documentElement.dataset.design=d}}catch(e){}})();`;

/** Google Analytics, only on the live site, so previews and local work are not counted. */
const GA_ID = process.env.VERCEL_ENV === 'production' ? 'G-333W08THT4' : '';
/** The site's own visit log (lib/visits.ts): the live site, and local work so it can be tried; previews are not counted. */
const VISIT_LOG = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'development' ? '/api/collect/' : '';

const THEME_COLORS: Record<string, string> = { dark: '#0d0a1f', crm: '#07080b', labs: '#000000', navy: '#080c14' };
export function generateViewport(): Viewport {
    return { width: 'device-width', initialScale: 1, themeColor: THEME_COLORS[siteDesign()] ?? '#191433' };
}

/** <script src="..."> tags from Settings > Footer code, with their data-* attributes (the chat tab's data-key and data-guests). */
function footerScripts(code: string) {
    const tags = [...code.matchAll(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi)].map((m, i) => {
        const attrs = m[1] + ' ' + m[3];
        const data = Object.fromEntries([...attrs.matchAll(/\b(data-[a-z0-9-]+)=(?:"([^"]*)"|'([^']*)')/gi)].map((d) => [d[1].toLowerCase(), d[2] ?? d[3] ?? '']));
        // data-color sets the CATEYE Chat tab's colour for this site alone: the widget reads it from CatEyeChatConfig
        const color = /^#[0-9a-f]{6}$/i.test(data['data-color'] ?? '') ? data['data-color'] : '';
        return (
            <Fragment key={i}>
                {color !== '' && <script dangerouslySetInnerHTML={{ __html: 'window.CatEyeChatConfig=Object.assign({},window.CatEyeChatConfig,{color:"' + color + '"});' }} />}
                <script src={m[2]} async={/\basync\b/i.test(attrs)} defer={/\bdefer\b/i.test(attrs)} {...data} />
            </Fragment>
        );
    });
    return tags;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    await Settings.load();
    const head = Settings.get('head_code').trim();
    return (
        <html lang="en" data-design={siteDesign()} suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: DESIGN_SWITCH }} />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
                <link rel="stylesheet" href={FONTS} />
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" crossOrigin="anonymous" referrerPolicy="no-referrer" />
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/v4-shims.min.css" crossOrigin="anonymous" referrerPolicy="no-referrer" />
                <link rel="stylesheet" href="/assets/css/site.css" />
                <link rel="stylesheet" href="/assets/css/polish-site.css" />
                <link rel="stylesheet" href="/assets/css/modern.css" />
                <link rel="stylesheet" href="/assets/css/dark.css" />
                <link rel="stylesheet" href="/assets/css/crm.css" />
                <link rel="stylesheet" href="/assets/css/labs.css" />
                <link rel="stylesheet" href="/assets/css/navy.css" />
                <link rel="stylesheet" href="/assets/css/polish.css" />
                {head !== '' && <meta name="ce-head-code" content="see Settings > SEO & code" />}
            </head>
            <body className="theme-modern" suppressHydrationWarning>
                <a className="skip-link" href="#main">Skip to content</a>
                {children}
                <a href="#main" className="to-top" aria-label="Back to top"><i className="fa-solid fa-angle-up" aria-hidden="true"></i></a>
                <script src="/assets/js/site.js" defer />
                <script src="/assets/js/forms.js" defer />
                {GA_ID !== '' && <script src={'https://www.googletagmanager.com/gtag/js?id=' + GA_ID} async />}
                {(GA_ID !== '' || VISIT_LOG !== '') && <script src="/assets/js/analytics.js" data-id={GA_ID} data-log={VISIT_LOG} defer />}
                {footerScripts(Settings.get('footer_code'))}
            </body>
        </html>
    );
}
