#!/usr/bin/env node
/*
  Novex site builder. No installs needed, just Node.

  node build.js            builds every client in /clients
  node build.js morrow     builds one client

  Each client folder holds a site.json (the settings) and an images/ folder.
  site.json names a template in /templates. Output goes to dist/<client>/.
*/
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

/* ---------- tiny template engine ----------
   {{path}}            escaped value          {{{path}}}       raw value
   {{br path}}         escaped, new lines become <br>
   {{json path}}       JSON, safe inside <script>
   {{#each list}}...{{/each}}   inside: {{this}}, {{field}}, {{@first}}, {{@num}}, {{@count}}
   {{#if x}}...{{else}}...{{/if}}   {{#unless x}}...{{/unless}}   {{#with obj}}...{{/with}}
*/
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function lookup(expr, scopes) {
  expr = expr.trim();
  const top = scopes[scopes.length - 1];
  if (expr === 'this' || expr === '.') return top.data;
  if (expr.startsWith('@')) {
    for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].meta && expr in scopes[i].meta) return scopes[i].meta[expr];
    return undefined;
  }
  const parts = expr.split('.');
  for (let i = scopes.length - 1; i >= 0; i--) {
    let v = scopes[i].data;
    if (v == null || typeof v !== 'object' || !(parts[0] in v)) continue;
    for (const p of parts) { v = v == null ? undefined : v[p]; }
    return v;
  }
  return undefined;
}

const truthy = (v) => Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v);

function findClose(tpl, from, name) {
  const re = /\{\{(#(each|if|unless|with)\b[^}]*|\/(each|if|unless|with)|else)\}\}/g;
  re.lastIndex = from;
  let depth = 0, elseAt = -1, m;
  while ((m = re.exec(tpl))) {
    if (m[1].startsWith('#')) depth++;
    else if (m[1] === 'else') { if (depth === 0 && elseAt < 0) elseAt = m.index; }
    else if (depth === 0) {
      if (m[3] !== name) throw new Error('Template: expected {{/' + name + '}} but found {{/' + m[3] + '}}');
      return { start: m.index, end: re.lastIndex, elseAt };
    } else depth--;
  }
  throw new Error('Template: missing {{/' + name + '}}');
}

function render(tpl, scopes) {
  let out = '', i = 0;
  const open = /\{\{\{([^}]+)\}\}\}|\{\{#(each|if|unless|with)\s+([^}]+)\}\}|\{\{([^#/}][^}]*)\}\}/g;
  let m;
  while ((m = open.exec(tpl))) {
    out += tpl.slice(i, m.index);
    if (m[1]) { // raw
      const v = lookup(m[1], scopes); out += v == null ? '' : String(v);
      i = open.lastIndex;
    } else if (m[2]) { // block
      const name = m[2], expr = m[3];
      const close = findClose(tpl, open.lastIndex, name);
      const inner = tpl.slice(open.lastIndex, close.start);
      const yes = close.elseAt >= 0 ? tpl.slice(open.lastIndex, close.elseAt) : inner;
      const no = close.elseAt >= 0 ? tpl.slice(close.elseAt + 8, close.start) : '';
      const val = lookup(expr, scopes);
      if (name === 'each') {
        const list = Array.isArray(val) ? val : [];
        list.forEach((item, idx) => {
          out += render(yes, scopes.concat({ data: item, meta: { '@first': idx === 0, '@last': idx === list.length - 1, '@index': idx, '@num': idx + 1, '@count': list.length } }));
        });
        if (!list.length) out += render(no, scopes);
      } else if (name === 'with') {
        out += truthy(val) ? render(yes, scopes.concat({ data: val })) : render(no, scopes);
      } else {
        const ok = name === 'if' ? truthy(val) : !truthy(val);
        out += render(ok ? yes : no, scopes);
      }
      i = close.end; open.lastIndex = close.end;
    } else { // value or helper
      const expr = m[4].trim();
      if (expr === 'else') { i = open.lastIndex; continue; }
      if (expr.startsWith('br ')) out += esc(lookup(expr.slice(3), scopes)).replace(/\n/g, '<br>');
      else if (expr.startsWith('json ')) out += JSON.stringify(lookup(expr.slice(5), scopes) ?? null).replace(/</g, '\\u003c');
      else { const v = lookup(expr, scopes); out += esc(v); }
      i = open.lastIndex;
    }
  }
  return out + tpl.slice(i);
}

/* ---------- build ---------- */
function photoDefaults(p) {
  if (!p) return p;
  return Object.assign({ photo: '', alt: '', position: '50% 50%', tone: 'olive', note: '' }, p);
}

/* A look is a palette and font pairing from the template's looks.json, picked with "look" in site.json. */
function pickLook(tplDir, name, slug) {
  const file = path.join(tplDir, 'looks.json');
  if (!fs.existsSync(file)) return { name: '', fonts: '', paper: '#FFFFFF', css: '' };
  const looks = JSON.parse(fs.readFileSync(file, 'utf8'));
  const key = name || looks.default;
  const look = looks.looks[key];
  if (!look) throw new Error(slug + ': look "' + key + '" not found. Options: ' + Object.keys(looks.looks).join(', '));
  const vars = Object.entries(look.vars || {});
  return {
    name: key,
    fonts: look.fonts || '',
    paper: (look.vars && look.vars['--paper']) || '#FFFFFF',
    css: vars.length ? '\n/* Look: ' + key + ' */\n:root{' + vars.map(([k, v]) => k + ':' + v).join(';') + '}\n' : ''
  };
}

/* Dated content: events, the announcement and the promo can carry "from" and/or "until" (YYYY-MM-DD, Sydney time).
   Anything already past its "until" is left out at build time; site.js also hides items on the day they lapse,
   so nothing stale shows between rebuilds. */
const sydneyToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
const notExpired = (item, today) => !(item && item.until && item.until < today);

function buildClient(slug) {
  const dir = path.join(ROOT, 'clients', slug);
  const site = JSON.parse(fs.readFileSync(path.join(dir, 'site.json'), 'utf8'));
  const tplDir = path.join(ROOT, 'templates', site.template);
  if (!fs.existsSync(tplDir)) throw new Error(slug + ': template "' + site.template + '" not found');

  site.hero = (site.hero || []).map(photoDefaults);
  site.gallery = (site.gallery || []).map(photoDefaults);
  if (site.menuFeature) site.menuFeature.photo = photoDefaults(site.menuFeature.photo);
  if (site.functions) site.functions.photo = photoDefaults(site.functions.photo);
  if (site.promo) site.promo.photo = photoDefaults(site.promo.photo);
  if (site.promo && !site.promo.menuTab && site.menu && site.menu[0]) site.promo.menuTab = site.menu[0].id;
  if (site.announcement && !site.announcement.menuTab && site.menu && site.menu[0]) site.announcement.menuTab = site.menu[0].id;

  const today = sydneyToday();
  site.events = (site.events || []).filter(e => notExpired(e, today));
  if (site.announcement && !notExpired(site.announcement, today)) delete site.announcement;
  if (site.promo && !notExpired(site.promo, today)) site.promo.enabled = false;

  site.look = pickLook(tplDir, site.look, slug);
  /* Names with a long single word ("Backstreet") get smaller display type on phones so they don't run off screen. */
  site.brand.longWord = Math.max(...String(site.brand.name).split(/\s+/).map(w => w.length)) > 8;

  if (site.url) site.url = site.url.replace(/\/+$/, '');
  site.runtime = {
    slug,
    phone: site.contact.phone,
    contactEmail: site.contact.email,
    bookingUrl: (site.booking && site.booking.url) || '',
    formEndpoint: (site.form && site.form.endpoint) || '',
    slideMs: site.slideMs || 5600,
    promoDelayMs: (site.promo && site.promo.delayMs) || 2000,
    menu: site.menu || []
  };
  site.schema = {
    '@context': 'https://schema.org',
    '@type': 'CafeOrCoffeeShop',
    name: site.brand.legalName || site.brand.name,
    telephone: site.contact.phoneIntl,
    email: site.contact.email,
    address: { '@type': 'PostalAddress', streetAddress: site.contact.street, addressLocality: site.contact.suburb, addressRegion: site.contact.state, postalCode: site.contact.postcode, addressCountry: 'AU' },
    sameAs: Object.values(site.social || {}).filter(Boolean),
    url: site.url || undefined,
    servesCuisine: site.cuisine || undefined,
    openingHours: (site.openingHoursSpec || undefined)
  };

  const html = render(fs.readFileSync(path.join(tplDir, 'index.html'), 'utf8'), [{ data: site }]);
  const out = path.join(ROOT, 'dist', slug);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.writeFileSync(path.join(out, 'styles.css'), fs.readFileSync(path.join(tplDir, 'styles.css'), 'utf8') + site.look.css);
  fs.copyFileSync(path.join(ROOT, 'core', 'site.js'), path.join(out, 'site.js'));
  if (site.url) {
    const base = site.url.replace(/\/+$/, '');
    fs.writeFileSync(path.join(out, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: ' + base + '/sitemap.xml\n');
    fs.writeFileSync(path.join(out, 'sitemap.xml'),
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>' + base + '/</loc><lastmod>' + today + '</lastmod></url>\n</urlset>\n');
  } else {
    console.warn('  ' + slug + ': no "url" in site.json yet, so no sitemap.xml or canonical link');
  }
  const imgs = path.join(dir, 'images');
  if (fs.existsSync(imgs)) fs.cpSync(imgs, path.join(out, 'images'), { recursive: true });
  console.log('Built ' + slug + ' -> dist/' + slug + '/');
}

const only = process.argv[2];
const clients = only ? [only] : fs.readdirSync(path.join(ROOT, 'clients')).filter(d => fs.existsSync(path.join(ROOT, 'clients', d, 'site.json')));
clients.forEach(buildClient);
