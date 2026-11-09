/**
 * SEO fixes applied when a page renders, so the database stays as it is: better search titles and
 * descriptions on the product pages, and one H1 per page. Each fix only applies while the stored value
 * is still the old one, so an edit in the admin wins. To retire this file, make the same changes in the
 * live admin and in a seed pack, then remove it.
 */
import type { Row } from './data';

const META: Record<string, { oldTitle?: string; title?: string; oldDescription?: string; description?: string }> = {
    erp: {
        oldTitle: 'CATEYE ERP',
        title: 'ERP software for Indian businesses',
        oldDescription: 'CATEYE ERP runs the whole company on one platform: accounting, GST, inventory, sales, purchasing, manufacturing, projects, payroll, HR and CRM, with migration from Tally, QuickBooks and Zoho Books. Hosted by CATEYE.',
        description: 'ERP software for accounting, GST, inventory, sales, purchasing, manufacturing, payroll, HR and CRM, with migration from Tally and QuickBooks. Hosted by CATEYE.',
    },
    accounting: {
        oldTitle: 'CATEYE Accounting',
        title: 'GST accounting software for India',
        oldDescription: 'CATEYE Accounting keeps double-entry books, inventory and GST for Indian businesses, with e-invoicing, GSTR filing, bank feeds and one-step migration from Tally or QuickBooks. Hosted by CATEYE.',
        description: 'Double-entry books, inventory and GST for Indian businesses, with e-invoicing, GSTR filing, bank feeds and one-step migration from Tally or QuickBooks.',
    },
    'expense-manager': {
        oldTitle: 'CATEYE Expense Manager',
        title: 'Expense manager software for Indian companies',
        oldDescription: 'CATEYE Expense Manager handles employee expense reports for Indian companies: claims, approvals, policy checks, GST input credit, reimbursements by bank file and posting to the books.',
        description: 'Expense management for Indian companies: claims, approvals, policy checks, GST input credit, reimbursements by bank file and posting to the books.',
    },
    'payroll-manager': {
        oldTitle: 'CATEYE Payroll Manager',
        title: 'Payroll management software for India',
        oldDescription: 'CATEYE Payroll Manager runs monthly payroll for Indian companies: salary structures, attendance and leave, PF, ESI, professional tax and TDS, payslips, bank files, ECR, Form 16 and full and final settlements.',
        description: 'Payroll management for Indian companies: salary structures, attendance, PF, ESI, professional tax, TDS, payslips, bank files, ECR, Form 16 and settlements.',
    },
    'hr-manager': {
        oldTitle: 'CATEYE HR Manager',
        title: 'HRMS: HR management software, hire to exit',
        oldDescription: 'CATEYE HR Manager keeps every employee record from hire to exit: organisation and positions, leave and holidays, onboarding checklists, documents and letters, an HR helpdesk, recruiting with a careers page, reviews, learning and surveys. Hosted by CATEYE with Payroll Manager.',
        description: 'HRMS for every employee record from hire to exit: org chart, leave, onboarding, documents, an HR helpdesk, recruiting, reviews, learning and surveys.',
    },
    crm: {
        oldTitle: 'CATEYE CRM: sales, billing and projects',
        title: 'CRM software for sales, billing and support',
    },
    products: {
        oldTitle: 'Products: ERP, CRM, Support Desk, Chat, Accounting, Expenses, Payroll and HR',
        title: 'ERP, CRM, payroll and HR software',
        oldDescription: 'CATEYE ERP, CRM, Support Desk, Chat, Accounting, Expense Manager, Payroll Manager and HR Manager are business software built by CATEYE Technology, hosted and set up for you.',
        description: 'ERP, CRM, Support Desk, Chat, Accounting, Expense Manager, Payroll and HR software built by CATEYE Technology, hosted and set up for you.',
    },
    // Search results cut descriptions at about 160 characters and titles at about 60 (8 Nov)
    home: {
        oldDescription: 'On-demand CIO, CTO and CISO, cybersecurity audits and VAPT, digital transformation, plus our own CRM, help desk and live chat software. Offices in the US and India.',
        description: 'On-demand CIO, CTO and CISO, cybersecurity services, digital transformation, and our own ERP, CRM and help desk software. Offices in the US and India.',
    },
    'cyber-security-services': {
        oldTitle: 'Cybersecurity services: compliance, MDR, incident response and pentesting',
        title: 'Cybersecurity services: GRC, MDR, DFIR and VAPT',
        oldDescription: 'Cybersecurity services from CATEYE: compliance and vCISO, identity and access, managed detection and response, incident response, cloud security and penetration testing, delivered by our team on our hosted security platform.',
        description: 'Cybersecurity services: compliance and vCISO, identity and access, MDR, incident response, cloud security and penetration testing, delivered by CATEYE.',
    },
    'cateye-grc': {
        oldTitle: 'SOC 2, ISO 27001 and HIPAA compliance with a vCISO',
        title: 'GRC software: SOC 2, ISO 27001, HIPAA compliance',
        oldDescription: 'CATEYE GRC: SOC 2, ISO 27001, HIPAA, PCI DSS and NIST CSF readiness with controls, evidence, policies, risks, vendor reviews and audits, hosted and run with a virtual CISO from CATEYE.',
        description: 'Governance, risk and compliance (GRC) for SOC 2, ISO 27001, HIPAA, PCI DSS and NIST CSF: controls, evidence, policies, vendors and audits, with a vCISO.',
    },
    'cateye-iam': {
        oldTitle: 'Single sign-on, MFA and identity access management',
        title: 'IAM: single sign-on, MFA and identity management',
        oldDescription: 'CATEYE IAM: single sign-on, MFA and passkeys, joiner-mover-leaver automation, SCIM provisioning and access reviews for your company, hosted and managed by CATEYE.',
        description: 'Single sign-on, MFA and passkeys, joiner-mover-leaver automation, SCIM provisioning and access reviews, hosted and managed by CATEYE.',
    },
    'cateye-mdr': {
        oldDescription: 'CATEYE MDR: managed detection and response with log collection, Sigma detections, analyst triage with AI assistance and response actions run with your approval, from CATEYE.',
        description: 'Managed detection and response: log collection, Sigma detections, analyst triage and response actions run with your approval, from CATEYE.',
    },
    'cateye-dfir': {
        oldDescription: 'CATEYE DFIR: incident response and digital forensics with cases, evidence hashed on collection, chain of custody, timeline analysis and reports, from CATEYE’s responders.',
        description: 'Incident response and digital forensics: cases, evidence hashed on collection, chain of custody, timeline analysis and reports from our responders.',
    },
    'cateye-cloudsec': {
        oldDescription: 'CATEYE CloudSec: external attack surface, AWS, Azure and Google Cloud posture, Microsoft 365 and Google Workspace settings and firewall configuration review, hosted by CATEYE.',
        description: 'External attack surface, AWS, Azure and Google Cloud posture, Microsoft 365 and Google Workspace settings and firewall review, hosted by CATEYE.',
    },
    'cateye-vapt': {
        oldTitle: 'Penetration testing with a live findings portal',
        title: 'VAPT: penetration testing with a live portal',
        oldDescription: 'CATEYE VAPT: penetration testing of web apps, APIs, mobile apps, networks and cloud with a live portal for findings, CVSS scores, retests and reports, from CATEYE.',
        description: 'Penetration testing of web apps, APIs, mobile apps, networks and cloud, with a live portal for findings, CVSS scores, retests and reports.',
    },
};

/** Pages that stay reachable but should not be in search results or the sitemap: nothing links to the demo form now that Try Demo opens each app. */
export const NOINDEX_PAGES = ['demo-request'];

/** What each page is, for structured data. */
export const SERVICE_PAGES: Record<string, string> = {
    'cateye-grc': 'Governance, risk and compliance', 'cateye-iam': 'Identity and access management', 'cateye-mdr': 'Managed detection and response',
    'cateye-dfir': 'Digital forensics and incident response', 'cateye-cloudsec': 'Cloud security', 'cateye-vapt': 'Penetration testing',
    'cyber-security-services': 'Cybersecurity services', 'it-security-strategy': 'IT security strategy consulting', 'va-pt-services': 'Penetration testing',
    'it-security-audit': 'IT security audit', 'digital-transformation-services': 'Digital transformation consulting', 'on-demand-it-leadership': 'IT leadership as a service',
    'cio-on-demand-as-a-service': 'Virtual CIO', 'cto-on-demand-as-a-service': 'Virtual CTO', 'ciso-on-demand-as-service': 'Virtual CISO',
};
export const SOFTWARE_PAGES = ['erp', 'crm', 'chat', 'support-desk', 'accounting', 'expense-manager', 'payroll-manager', 'hr-manager'];

/** The home page slider's button still held the old address, which only redirects. */
export function fixLink(href: string): string {
    return href.replace(/\/it-security-services\/?$/, '/cyber-security-services/');
}

/** The H1 stays the product's name; these words, shown smaller under it, say what the page is in the terms people search for. An edited heading in the admin no longer matches and is left alone. */
const HEADING_WORDS: Record<string, [string, string]> = {
    home: ['DIGITAL TRANSFORMATION', 'IT consulting, cybersecurity and ERP software'],
    erp: ['CATEYE ERP', 'ERP software for Indian businesses'],
    crm: ['CATEYE CRM', 'CRM software for sales, billing and support'],
    accounting: ['CATEYE Accounting', 'GST accounting software for India'],
    'expense-manager': ['CATEYE Expense Manager', 'Expense management software for India'],
    'payroll-manager': ['CATEYE Payroll Manager', 'Payroll management software for India'],
    'hr-manager': ['CATEYE HR Manager', 'HRMS and HR management software'],
    'support-desk': ['CATEYE Support Desk', 'Help desk and ticketing software'],
    chat: ['CATEYE Chat', 'Live chat software for your website'],
    'cateye-grc': ['CATEYE GRC', 'Governance, risk and compliance (GRC) software'],
    'cateye-iam': ['CATEYE IAM', 'Identity and access management (IAM)'],
    'cateye-mdr': ['CATEYE MDR', 'Managed detection and response (MDR) service'],
    'cateye-dfir': ['CATEYE DFIR', 'Digital forensics and incident response (DFIR)'],
    'cateye-cloudsec': ['CATEYE CloudSec', 'Cloud security posture and attack surface management'],
    'cateye-vapt': ['CATEYE VAPT', 'Vulnerability assessment and penetration testing (VAPT)'],
};

export function addHeadingWords(slug: string, html: string): string {
    const words = HEADING_WORDS[slug];
    return words ? html.replace('>' + words[0] + '</h1>', '>' + words[0] + ' <span class="ce-h1-words">' + words[1] + '</span></h1>') : html;
}

/** Pages with no H1 of their own: the header band gives them one. */
const SHOW_TITLE = ['privacy-policy', 'terms-conditions'];

/** The hero slide is these pages' H1, so their section headlines become H2s. */
const SECOND_HEADLINES: Record<string, string[]> = {
    'cio-on-demand-as-a-service': ['<strong>CIO</strong> ON DEMAND - AS A SERVICE', 'What to <strong>EXPECT</strong>'],
    'cto-on-demand-as-a-service': ['<strong>CTO</strong> On-Demand - As A Service ...', 'What to EXPECT'],
    'ciso-on-demand-as-service': ['<strong>CISO</strong> On-Demand - As A Service', 'What to <strong>EXPECT</strong>'],
    'want-to-join-the-team': ['<strong>BENEFITS </strong> for Professionals', 'LETS START THE DIALOGUE TO EXPLORE THE POSSIBILITIES'],
};

/** Link to the Tally landing page, added to the paragraph about moving from Tally. */
const TALLY_LINK = ' <a href="/tally-alternative/">Moving from Tally? See how the move works.</a>';
const TALLY_PARAGRAPHS: Record<string, string> = {
    erp: 'Migrate from Tally, QuickBooks or Zoho Books and check the result against your old reports. Your accountant keeps the groups, vouchers and reports they already know.',
    accounting: 'Migrate from Tally or QuickBooks in one step: masters, opening balances and vouchers come over, and the import can be checked against your old reports.',
};

/** Claims matched to the ERP handoff: customers choose a workspace on the shared platform or a dedicated installation; e-invoices, e-way bills and GST returns go by file until the Vayana link is live; WhatsApp and bank feeds aren't connected yet. */
const OWN_WORKSPACE = 'You can choose a private workspace on our shared platform, where each organisation sees only its own data, or a dedicated installation of your own.';
const OWN_INSTALLATION = 'Every customer has their own installation, with the database in Singapore.';
const PRODUCT_WORDING: Record<string, [string, string][]> = {
    erp: [
        ['GSTR-2B matching, e-invoices, e-way bills and TDS.', 'GSTR-2B matching, TDS, and e-invoice and e-way bill files to upload on the government portals.'],
        ['Yes. GST, e-invoices, e-way bills, TDS, PF, ESI and professional tax are built in, and statutory', 'Yes. GST, TDS, PF, ESI and professional tax are built in, e-invoice and e-way bill files are ready to upload on the government portals, and statutory'],
        ['Any number of companies in one installation, each', 'Any number of companies in one organisation, each'],
        [OWN_INSTALLATION, OWN_WORKSPACE],
    ],
    accounting: [
        ['amounts in words, e-invoices and e-way bills generated and cancelled from the voucher.', 'amounts in words, and e-invoice and e-way bill files ready to upload from the voucher.'],
        ['GSTR-1 and GSTR-3B prepared from the books, validated, and filed from the app with an OTP; GSTR-9', 'GSTR-1 and GSTR-3B prepared from the books and validated, with guided filing on the GST portal; GSTR-9'],
        ['E-invoices and e-way bills generated for the IRP and the e-way bill portal, with their responses kept on the voucher', 'E-invoice and e-way bill files to upload on the IRP and the e-way bill portal, with the IRN and e-way bill number kept on the voucher'],
        ['Any number of companies in one installation, each', 'Any number of companies in one organisation, each'],
        ['One installation, any number of companies', 'One organisation, any number of companies'],
        ['GSTR-1 and GSTR-3B are prepared from your entries, validated and filed from the app. GSTR-2B reconciliation, e-invoices and e-way bills are included too.', 'GSTR-1 and GSTR-3B are prepared from your entries and validated, and the app guides you through filing them on the GST portal. GSTR-2B reconciliation is included too, and e-invoice and e-way bill files are ready to upload.'],
        [OWN_INSTALLATION, OWN_WORKSPACE],
    ],
    'payroll-manager': [
        ['Any number of companies in one installation.', 'Any number of companies in one organisation.'],
        [OWN_INSTALLATION, OWN_WORKSPACE],
    ],
    'hr-manager': [
        ['With Payroll Manager on the same installation,', 'With Payroll Manager in the same organisation,'],
        [OWN_INSTALLATION, OWN_WORKSPACE],
    ],
    crm: [
        ['E-mail, SMS and WhatsApp campaigns to hand-picked or rule-based lists, with open and click tracking and one-click unsubscribe.', 'E-mail and SMS campaigns to hand-picked or rule-based lists, with open and click tracking and one-click unsubscribe. WhatsApp is coming soon.'],
        ['GST, financial years and WhatsApp are part of the CRM', 'GST and financial years are part of the CRM'],
        ['<span>WhatsApp campaigns with approved templates,', '<span>Coming soon: WhatsApp campaigns with approved templates,'],
        ['<span>Sign-in codes and website-form checks by WhatsApp</span>', '<span>Coming soon: website-form checks by WhatsApp</span>'],
        ['SMS through MSG91, Textlocal, Twilio or any HTTP gateway', 'SMS through MSG91, Twilio or any HTTP gateway'],
        ['Every customer has their own CRM installation. Users can sign in with two-step verification through an authenticator app or a WhatsApp code, and', OWN_WORKSPACE + ' Users can sign in with two-step verification through an authenticator app, and'],
        ['Yes. WhatsApp messages go through Meta’s official WhatsApp Cloud API, so you need a WhatsApp Business account and message templates approved by Meta. We help you set it up.', 'Not today. WhatsApp is coming soon, through Meta’s official WhatsApp Cloud API, and we will tell you what is needed when it is ready.'],
    ],
    products: [
        ['GSTR-1, GSTR-3B, e-invoices and e-way bills', 'GSTR-1, GSTR-3B, and e-invoice and e-way bill files'],
        ['Each customer gets their own installation or workspace,', 'Each customer chooses a private workspace on our shared platform or a dedicated installation,'],
        ['Books, inventory, GST filing and bank feeds', 'Books, inventory, GST returns and bank reconciliation'],
        ['Bank feeds and reconciliation', 'Bank reconciliation'],
        ['E-mail, SMS and WhatsApp campaigns', 'E-mail and SMS campaigns, with WhatsApp coming soon'],
        ['CATEYE CRM sends WhatsApp messages through Meta’s official Cloud API, and SMS through Twilio, MSG91, Textlocal or any HTTP gateway.', 'CATEYE CRM sends SMS through Twilio, MSG91 or any HTTP gateway. WhatsApp, through Meta’s official Cloud API, is coming soon.'],
        ['WhatsApp and Indian SMS gateways are supported.', 'Indian SMS gateways are supported, and WhatsApp is coming soon.'],
    ],
};

/** Privacy policy: Google Analytics, added after the Cookies section unless the admin text already has this heading. */
const PRIVACY_NEXT_HEADING = '<h2>Embedded content from other websites</h2>';
const PRIVACY_ANALYTICS = '<h2>Analytics</h2>\n<p>We use Google Analytics to understand how visitors use this website, such as which pages they view and which buttons they click. It uses cookies and shares this usage data with Google. It does not receive what you type into our forms.</p>\n<p>This website, and the public pages of erp.cateyetech.com and security.cateyetech.com (home, demo, sign-up and sign-in pages), also keep our own record of visits: the page viewed, the site that sent you here, your type of device and browser, your country, and which buttons you click. This record uses no cookies and does not store your IP address. To count visitors, it stores a code made from your IP address and browser details, which changes every day. Forms and what you type into them are not part of this record. We delete this record after 13 months.</p>\n';

/** A heading nested in a heading: browsers already drop the outer one. */
const NESTED_BLOGS_H1 = '<h1 class="ce-title ce-title-center" style="font-size:1em;color:#0162a3"><h1 style="text-align:center"><strong>BLOGS</strong></h1></h1>';
/** The header band now shows this heading. */
const TERMS_HEADING = '<h2><strong><span style="color:#0dc5e7"><span style="font-size:large">Terms &amp; Conditions</span></span></strong></h2>';

export function fixPage(page: Row): Row {
    const slug = String(page.slug);
    const fixed = { ...page };
    const m = META[slug];
    if (m) {
        if (m.title && ['', m.oldTitle].includes(String(page.meta_title ?? ''))) fixed.meta_title = m.title;
        if (m.description && ['', m.oldDescription].includes(String(page.meta_description ?? ''))) fixed.meta_description = m.description;
    }
    if (SHOW_TITLE.includes(slug)) fixed.show_title = 1;
    // The stored /products/ share image names three products; another image chosen in the admin wins
    if (slug === 'products' && /(^|\/)og-products\.jpg$/.test(String(page.og_image ?? ''))) fixed.og_image = '/assets/social/og-products-eight.jpg';
    return fixed;
}

/** The overview page had no links to it, so each role's page points back to it, after its "What to expect" section. */
const LEADERSHIP_PAGES = ['cio-on-demand-as-a-service', 'cto-on-demand-as-a-service', 'ciso-on-demand-as-service'];
const LEADERSHIP_LINK = '\n<p><a class="ce-more" href="/on-demand-it-leadership/">See all on-demand IT leadership services</a></p>';

export function fixSectionHtml(slug: string, html: string): string {
    if (LEADERSHIP_PAGES.includes(slug) && html.includes(SECOND_HEADLINES[slug][1])) html += LEADERSHIP_LINK;
    for (const inner of SECOND_HEADLINES[slug] ?? []) {
        html = html.replaceAll(`<h1 class="ce-headline">${inner}</h1>`, `<h2 class="ce-headline">${inner}</h2>`);
    }
    html = addHeadingWords(slug, html);
    if (slug === 'blogs') html = html.replaceAll(NESTED_BLOGS_H1, '<h1 style="text-align:center"><strong>BLOGS</strong></h1>');
    if (slug === 'terms-conditions') html = html.replaceAll(TERMS_HEADING, '');
    for (const [from, to] of PRODUCT_WORDING[slug] ?? []) html = html.replaceAll(from, to);
    if (slug === 'privacy-policy' && !html.includes('<h2>Analytics</h2>')) html = html.replace(PRIVACY_NEXT_HEADING, PRIVACY_ANALYTICS + PRIVACY_NEXT_HEADING);
    if (TALLY_PARAGRAPHS[slug]) html = html.replaceAll(TALLY_PARAGRAPHS[slug] + '</p>', TALLY_PARAGRAPHS[slug] + TALLY_LINK + '</p>');
    return html;
}
