// Tik's Career Board scanner - pulls GIS / mapping, project-management and
// environmental-sector management roles for Vientiane Capital from 108.jobs
// (client API) + web search (DuckDuckGo/Google index).
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const META_FILE = path.join(DATA_DIR, 'meta.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const VIENTIANE_CAPITAL_ID = '5eb8cb58f2913809f730ce9c'; // 108.jobs workingLocation _id

// ---- keyword profile (what Tik is looking for) ----
// needsContext: generic titles ("Sales Manager", "Consultant") only count when the
// posting also mentions something environmental / geospatial / development-sector.
const KEYWORD_GROUPS = {
  'GIS & Mapping': {
    needsContext: false,
    words: ['gis', 'geographic information', 'geo information', 'geospatial', 'geo spatial', 'geomatics',
      'remote sensing', 'satellite imagery', 'cartograph', 'mapping', 'map production', 'arcgis', 'qgis',
      'spatial analys', 'spatial data', 'spatial planning', 'geodatabase', 'topograph', 'geodesy',
      'land survey', 'surveyor', 'drone', 'uav', 'lidar', 'gps'],
  },
  'Project Management': {
    needsContext: false,
    words: ['project manager', 'project management', 'programme manager', 'program manager',
      'project coordinator', 'programme coordinator', 'program coordinator', 'project lead',
      'project director', 'deputy project', 'chief of party', 'project officer', 'programme officer',
      'program officer', 'project assistant', 'project support', 'pmp'],
  },
  'Management / Leadership': {
    needsContext: true,
    words: ['manager', 'management', 'head of', 'director', 'team leader', 'team lead', 'supervisor',
      'coordinator', 'country representative', 'operations manager', 'chief', 'focal point'],
  },
  'Environment & Climate': {
    needsContext: false,
    words: ['environment', 'climate', 'biodiversity', 'conservation', 'natural resource', 'esia', 'esg',
      'sustainab', 'watershed', 'water resource', 'wastewater', 'pollution', 'forest', 'land use',
      'land management', 'disaster risk', 'renewable', 'safeguard', 'ecolog', 'green growth',
      'carbon', 'protected area', 'wetland'],
  },
  'Consultant / NGO': {
    needsContext: true,
    words: ['consultant', 'consultancy', 'ngo', 'technical advisor', 'technical adviser',
      'technical specialist', 'development project', 'terms of reference'],
  },
};

// the "is this actually her sector?" gate for the generic groups above
const CONTEXT_WORDS = ['environment', 'climate', 'natural resource', 'conservation', 'biodiversity',
  'forest', 'water', 'watershed', 'agricult', 'rural development', 'irrigation', 'gis', 'geospatial',
  'remote sensing', 'mapping', 'land use', 'land management', 'esia', 'safeguard', 'sustainab',
  'renewable', 'energy', 'wash', 'sanitation', 'waste', 'ngo', 'development project', 'disaster',
  'ecolog', 'mekong', 'undp', 'unep', 'fao', 'giz', 'world bank', 'adb', 'iucn', 'wwf', 'meal',
  'monitoring and evaluation', 'infrastructure', 'urban planning', 'circular economy', 'recycl',
  'wildlife', 'nature', 'green'];

// short tokens that must match as whole words - "gis" hides inside "logistics",
// "meal" inside "mealtime", "fao" inside all sorts of things
const ACRONYMS = new Set(['gis', 'gps', 'uav', 'esg', 'esia', 'pmp', 'mis', 'meal', 'm&e', 'wash',
  'fao', 'giz', 'adb', 'iucn', 'wwf', 'undp', 'unep', 'nature', 'green', 'water', 'energy']);

// clearly-other professions: these are dropped unless the title also carries a real
// GIS / project-management / environmental keyword of its own
const OFF_TOPIC_TITLES = ['sales', 'sale', 'marketing', 'finance', 'financial', 'accountant',
  'accounting', 'audit', 'tax', 'cashier', 'teller', 'human resource', 'hr', 'recruit', 'payroll',
  'admin', 'secretary', 'logistic', 'driver', 'warehouse', 'inventory', 'maintenance', 'mechanic',
  'electrician', 'security guard', 'housekeep', 'waiter', 'waitress', 'chef', 'cook', 'barista',
  'receptionist', 'customer service', 'call cent', 'telesales', 'cleaner', 'information system',
  'software', 'graphic design', 'teacher', 'nurse', 'pharmac', 'insurance', 'loan officer',
  'branch manager', 'restaurant', 'barber', 'beauty', 'translator', 'interpreter'];

// searches run against the 108.jobs title index (their API matches title only)
const JOB108_TITLE_QUERIES = [
  'gis', 'geo', 'mapping', 'survey', 'sensing', 'spatial',
  'project', 'programme', 'program', 'manager', 'management', 'coordinator', 'director', 'head',
  'environment', 'climate', 'sustainab', 'consultant', 'forest', 'water',
];

// Web search is a best-effort extra, not the backbone: DuckDuckGo's html endpoint now
// answers with a bot-block page, and Bing answers scrapers with loosely-matched results.
// 108.jobs is the source that actually carries Vientiane postings (incl. the NGO sector).
const WEB_QUERIES = [
  '"Vientiane" GIS OR geospatial vacancy',
  '"Lao PDR" "project manager" vacancy announcement',
  '"Vientiane" environmental project manager job',
  '"Lao PDR" "land use planning" OR "natural resource" vacancy',
  '"Vientiane" "climate change" project officer vacancy',
];

// a search hit only counts if its URL looks like an actual posting
const JOB_URL_RE = /\/(job|jobs|vacanc\w*|career|careers|position|recruit\w*|opportunit\w*|employment)\b/i;

// hosts that are never job postings, plus bot-blocked aggregators that
// re-list expired jobs and can't be date-verified (the real orgs' pages are covered anyway)
const JUNK_HOSTS = ['duckduckgo.com', 'wikipedia.org', 'facebook.com', 'youtube.com', 'google.com',
  'tealhq.com', 'visaboards.com', 'jobrapido.com', 'jooble.org', 'glassdoor.com'];

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

// freshness: reject expired or clearly old postings
function isFresh(job) {
  // jobs with a closing date: expired more than 7 days ago = stale
  if (job.closingDate) {
    return new Date(job.closingDate).getTime() > Date.now() - 7 * 24 * 3600 * 1000;
  }
  // web results have no closing date - look for "Jul 2025"-style dates in title/snippet;
  // if every dated mention is from a previous year, the posting is old news
  const text = job.title + ' ' + (job.snippet || '');
  const monthYears = [...text.matchAll(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+(20\d{2})\b/gi)]
    .map(m => +m[1]);
  if (monthYears.length && Math.max(...monthYears) < new Date().getFullYear()) return false;
  return true;
}

// ---- deep verification: fetch a web result's page and judge from its real dates ----
const MONTH_RE = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*';
function extractDates(text) {
  const out = [];
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) out.push(new Date(+m[1], +m[2] - 1, +m[3]));
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_RE})\\.?,?\\s+(20\\d{2})\\b`, 'gi')))
    out.push(new Date(`${m[2].slice(0, 3)} ${m[1]} ${m[3]}`));
  for (const m of text.matchAll(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2}),?\\s+(20\\d{2})\\b`, 'gi')))
    out.push(new Date(`${m[1].slice(0, 3)} ${m[2]} ${m[3]}`));
  return out.filter(d => !isNaN(d) && d.getFullYear() > 2015 && d.getFullYear() < 2100);
}

// fetches the job page; returns {fresh, closingDate?}. Lenient: unreachable/odd pages pass.
async function verifyWebJob(job) {
  try {
    const res = await fetchWithTimeout(job.url, {}, 15000);
    if (res.status === 404 || res.status === 410) return { fresh: false }; // posting removed
    if (!res.ok) return { fresh: true }; // blocked/error - benefit of the doubt
    const html = (await res.text()).replace(/<[^>]+>/g, ' ');
    const now = Date.now();
    const dl = [], posted = [];
    // dates sitting next to deadline-ish words (incl. JSON-LD validThrough/datePosted)
    for (const m of html.matchAll(/(deadline|closing date|validThrough|apply before|apply by|expires?|close[sd]? on)/gi))
      dl.push(...extractDates(html.slice(Math.max(0, m.index - 60), m.index + 160)));
    for (const m of html.matchAll(/(datePosted|posted|published|date issued|opening date)/gi))
      posted.push(...extractDates(html.slice(Math.max(0, m.index - 60), m.index + 160)));
    if (dl.length) {
      const latest = Math.max(...dl.map(d => d.getTime()));
      if (latest < now - 7 * 24 * 3600 * 1000) return { fresh: false };
      return { fresh: true, closingDate: new Date(latest).toISOString() };
    }
    if (posted.length) {
      const latest = Math.max(...posted.map(d => d.getTime()));
      return { fresh: latest > now - 90 * 24 * 3600 * 1000 };
    }
    const all = extractDates(html);
    if (all.length && Math.max(...all.map(d => d.getTime())) < now - 120 * 24 * 3600 * 1000)
      return { fresh: false };
    return { fresh: true };
  } catch { return { fresh: true }; }
}

// punctuation -> spaces, so short tokens can be matched as whole words
function norm(text) {
  return ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9&]+/g, ' ').replace(/\s+/g, ' ') + ' ';
}
// acronyms and very short words only count as whole words; longer ones match as prefixes
// so 'sustainab' covers sustainable/sustainability and 'agricult' covers agriculture/agricultural
function hasWord(t, w) {
  return (ACRONYMS.has(w) || w.length <= 4) ? t.includes(' ' + w + ' ') : t.includes(w);
}

// Which of her fields does this posting hit?
//   roleText - the job title (plus the description snippet for web results)
//   orgText  - employer / industry, used only to establish sector context
// 108.jobs employers tag postings with dozens of unrelated jobFunctions, so those never
// decide a category - a "Sales Manager" listed under "Health/Safety/Environmental" is not
// an environmental job.
function matchCategories(roleText, orgText = '') {
  const role = norm(roleText);
  const ctx = role + norm(orgText);
  const hasContext = CONTEXT_WORDS.some(w => hasWord(ctx, w));
  const cats = [];
  for (const [cat, def] of Object.entries(KEYWORD_GROUPS)) {
    if (!def.words.some(w => hasWord(role, w))) continue;
    if (def.needsContext && !hasContext) continue; // generic title, wrong sector
    cats.push(cat);
  }
  if (!cats.length) return cats;
  // a title that is plainly another profession only survives on a field keyword of its own
  const strong = cats.some(c => !KEYWORD_GROUPS[c].needsContext);
  if (!strong && OFF_TOPIC_TITLES.some(w => hasWord(role, w))) return [];
  return cats;
}

async function fetchWithTimeout(url, opts = {}, ms = 25000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  } finally { clearTimeout(timer); }
}

// ---------- source 1: 108.jobs ----------
async function scan108() {
  const found = new Map();
  for (const q of JOB108_TITLE_QUERIES) {
    const body = {
      jobFunctionIds: [], industryIds: [],
      workingLocationIds: [VIENTIANE_CAPITAL_ID],
      jobExperienceId: [], jobLanguageId: [], jobEducationLevelId: [], jobLevelId: [],
      title: q, disabledPeople: '', token: '', page: 1, perPage: 50,
    };
    try {
      const res = await fetchWithTimeout('https://db.108.jobs/client-api/get-job-search-web?lang=EN', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const j of data.allJob || []) {
        if (!j || j.type === 'ads' || !j.title || !j._id) continue;
        // skip already-closed postings
        if (j.closingDate && new Date(j.closingDate).getTime() < Date.now()) continue;
        const cats = matchCategories(
          j.title,
          (j.companyName || '') + ' ' + (j.industryId || []).map(f => f.name).join(' ')
        );
        if (!cats.length) continue;
        found.set(j._id, {
          id: '108-' + j._id,
          source: '108.jobs',
          title: j.title.trim(),
          org: j.companyName || '',
          location: j.workingLocations || 'Vientiane Capital',
          url: 'https://108.jobs/job_detail/' + j._id,
          closingDate: j.closingDate || null,
          categories: cats,
        });
      }
    } catch (e) {
      console.error('[scan] 108.jobs query "' + q + '" failed:', e.message);
    }
    await new Promise(r => setTimeout(r, 600)); // be polite
  }
  return [...found.values()];
}

// ---------- source 2: web search (Bing html = indexed job pages) ----------
// Bing hides the real target behind /ck/a?...&u=a1<base64url of the url>&ntb=1
function decodeBingUrl(href) {
  const m = href.match(/[?&]u=a1([^&]+)/);
  if (m) {
    try {
      const u = Buffer.from(decodeURIComponent(m[1]), 'base64url').toString('utf8');
      if (u.startsWith('http')) return u;
    } catch { /* fall through */ }
  }
  if (href.startsWith('http') && !href.includes('bing.com/')) return href;
  return null;
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#x?\w+;/g, ' ').replace(/\s+/g, ' ').trim();
}

async function scanWeb() {
  const found = new Map();
  for (const q of WEB_QUERIES) {
    try {
      // filters=ex1:"ez3" = indexed in the past month, which keeps postings current
      const res = await fetchWithTimeout('https://www.bing.com/search?q=' + encodeURIComponent(q)
        + '&count=20&setlang=en&filters=' + encodeURIComponent('ex1:"ez3"'),
        { headers: { 'Accept-Language': 'en-US,en;q=0.9' } });
      if (!res.ok) continue;
      const html = await res.text();
      // each result: <li class="b_algo"> ... <h2><a href="...">title</a></h2> ... <p>snippet</p>
      const blocks = html.split('<li class="b_algo"');
      for (const block of blocks.slice(1, 21)) {
        const linkM = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        if (!linkM) continue;
        const url = decodeBingUrl(linkM[1].replace(/&amp;/g, '&'));
        if (!url) continue;
        let parsed; try { parsed = new URL(url); } catch { continue; }
        const host = parsed.hostname.replace(/^www\./, '');
        if (JUNK_HOSTS.some(h => host.includes(h))) continue;
        // search engines answer scrapers with encyclopedia/travel/aggregator pages;
        // only URLs that look like a posting are worth verifying
        if (!JOB_URL_RE.test(parsed.pathname)) continue;
        const title = stripTags(linkM[2]);
        const snipM = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
        const snippet = snipM ? stripTags(snipM[1]) : '';
        const all = title + ' ' + snippet;
        const cats = matchCategories(all, host);
        if (!cats.length) continue;
        // must look Laos/Vientiane-related
        if (!/vientiane|laos|lao pdr|lao people/i.test(all + ' ' + url)) continue;
        const key = url.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
        if (found.has(key)) continue;
        if (!isFresh({ title, snippet })) continue; // old posting from a previous year
        found.set(key, {
          id: 'web-' + Buffer.from(key).toString('base64url').slice(0, 24),
          source: host,
          title: title.slice(0, 160),
          org: host,
          location: /vientiane/i.test(all) ? 'Vientiane' : 'Laos',
          url,
          closingDate: null,
          snippet: snippet.slice(0, 300),
          categories: cats,
        });
      }
    } catch (e) {
      console.error('[scan] web query failed:', q, e.message);
    }
    await new Promise(r => setTimeout(r, 1200)); // be polite to the search engine
  }
  return [...found.values()];
}

// ---------- source 3: ReliefWeb (UN / NGO jobs) - needs an approved appname ----------
// ReliefWeb decommissioned API v1 and now rejects unregistered clients ("You are not using
// an approved appname"), and its website blocks scrapers. Request a free appname at
// https://apidoc.reliefweb.int/ and set RELIEFWEB_APPNAME to switch this source on.
// UNVERIFIED: this request shape follows ReliefWeb's documented query format but could not
// be run end-to-end without an approved appname.
async function scanReliefWeb() {
  const appname = process.env.RELIEFWEB_APPNAME;
  if (!appname) return [];
  const query = {
    limit: 100,
    profile: 'list',
    sort: ['date.created:desc'],
    filter: { field: 'country', value: 'Lao PDR' },
    fields: { include: ['title', 'url', 'date.closing', 'date.created', 'source.name', 'city.name'] },
  };
  try {
    const res = await fetchWithTimeout('https://api.reliefweb.int/v2/jobs?appname=' + encodeURIComponent(appname), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(query),
    });
    if (!res.ok) {
      console.error('[scan] ReliefWeb refused the request (' + res.status + ') - check RELIEFWEB_APPNAME');
      return [];
    }
    const data = await res.json();
    const out = [];
    for (const item of data.data || []) {
      const f = item.fields || {};
      if (!f.title || !f.url) continue;
      const org = (f.source || []).map(s => s.name).join(', ');
      const cats = matchCategories(f.title, org);
      if (!cats.length) continue;
      out.push({
        id: 'rw-' + item.id,
        source: 'reliefweb.int',
        title: String(f.title).trim().slice(0, 160),
        org: org || 'ReliefWeb',
        location: (f.city || []).map(c => c.name).join(', ') || 'Lao PDR',
        url: f.url,
        closingDate: (f.date && f.date.closing) || null,
        categories: cats,
      });
    }
    return out;
  } catch (e) {
    console.error('[scan] ReliefWeb failed:', e.message);
    return [];
  }
}

// ---------- orchestrator ----------
async function runScan(trigger = 'manual') {
  console.log('[scan] starting (' + trigger + ') at', new Date().toLocaleString());
  const store = readJson(JOBS_FILE, { jobs: {} });
  const now = new Date().toISOString();

  const results = [];
  const settled = await Promise.allSettled([scan108(), scanWeb(), scanReliefWeb()]);
  const names = ['108.jobs', 'web search', 'ReliefWeb'];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log('[scan] ' + names[i] + ': ' + r.value.length + ' matches');
      results.push(...r.value);
    } else {
      console.error('[scan] ' + names[i] + ' failed entirely:', r.reason && r.reason.message || r.reason);
    }
  });

  // stale blocklist: web URLs already verified as old postings - never re-add
  store.stale = store.stale || {};
  const nowMs = Date.now();
  for (const [id, t] of Object.entries(store.stale)) {
    if (nowMs - new Date(t).getTime() > 60 * 24 * 3600 * 1000) delete store.stale[id];
  }

  let added = 0;
  for (const job of results) {
    if (store.stale[job.id]) continue;
    if (store.jobs[job.id]) {
      Object.assign(store.jobs[job.id], job, { lastSeen: now });
    } else {
      // web results carry no closing date - fetch the page and check its real dates
      if (job.id.startsWith('web-')) {
        const v = await verifyWebJob(job);
        if (!v.fresh) {
          console.log('[scan] stale posting rejected:', job.title, '(' + job.url + ')');
          store.stale[job.id] = now;
          continue;
        }
        if (v.closingDate) job.closingDate = v.closingDate;
        job.verifiedAt = now;
        await new Promise(r => setTimeout(r, 400));
      }
      store.jobs[job.id] = { ...job, firstSeen: now, lastSeen: now, isNew: true };
      added++;
    }
  }

  // re-verify stored web jobs weekly; drop the ones that turned stale
  for (const [id, j] of Object.entries(store.jobs)) {
    if (!id.startsWith('web-') || j.fav) continue;
    if (j.verifiedAt && nowMs - new Date(j.verifiedAt).getTime() < 7 * 24 * 3600 * 1000) continue;
    const v = await verifyWebJob(j);
    if (!v.fresh) {
      console.log('[scan] stored job went stale, removing:', j.title);
      store.stale[id] = now;
      delete store.jobs[id];
    } else {
      if (v.closingDate) j.closingDate = v.closingDate;
      j.verifiedAt = now;
    }
    await new Promise(r => setTimeout(r, 400));
  }

  // prune: 60 days unseen, expired, dated last-year, or junk-host - but never favorites
  const cutoff = Date.now() - 60 * 24 * 3600 * 1000;
  for (const [id, j] of Object.entries(store.jobs)) {
    if (j.fav) continue;
    const junk = JUNK_HOSTS.some(h => (j.source || '').includes(h) || (j.url || '').includes(h));
    if (junk || new Date(j.lastSeen).getTime() < cutoff || !isFresh(j)) delete store.jobs[id];
  }

  writeJson(JOBS_FILE, store);
  const meta = readJson(META_FILE, {});
  meta.lastScan = now;
  meta.lastScanTrigger = trigger;
  meta.lastScanFound = results.length;
  meta.lastScanNew = added;
  writeJson(META_FILE, meta);
  console.log('[scan] done: ' + results.length + ' matches, ' + added + ' new');
  return { found: results.length, added };
}

module.exports = { runScan, matchCategories, scan108, scanWeb, JOBS_FILE, META_FILE, readJson, writeJson, DATA_DIR };

// CLI / GitHub Actions entry: `node scanner.js`
if (require.main === module) {
  runScan(process.env.GITHUB_ACTIONS ? 'github-actions' : 'cli')
    .then(r => console.log('[scan] result:', JSON.stringify(r)))
    .catch(e => { console.error(e); process.exit(1); });
}
