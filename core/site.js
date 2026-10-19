/* Novex shared site behaviour. Reads window.SITE, written by build.js from the client's site.json.
   Handles: announcement bar, dropdowns, mobile nav, hero slideshow, modals (popup and menu), menu tabs, booking links, enquiry form. */
const CONFIG = window.SITE || {};
const MENU = CONFIG.menu || [];
const KEY = CONFIG.slug || 'site';
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) {} }
  };

  /* Dated content: hide anything outside its from/until dates (Sydney time), so specials and events lapse on their own */
  const today = (() => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } })();
  const inWindow = (el) => !((el.dataset.from && el.dataset.from > today) || (el.dataset.until && el.dataset.until < today));
  $$('.listing[data-from], .listing[data-until]').forEach(el => { if (!inWindow(el)) el.hidden = true; });
  const whatsOn = $('#whats-on');
  if (whatsOn && !$$('.listing', whatsOn).some(el => !el.hidden)) {
    whatsOn.hidden = true;
    $$('a[href="#whats-on"]').forEach(a => { a.hidden = true; });
  }

  /* Announcement */
  const announce = $('#announce');
  if (announce) {
    if (!inWindow(announce)) announce.hidden = true;
    if (store.get(KEY + '-announce-closed')) announce.hidden = true;
    $('#announce-close').addEventListener('click', () => { announce.hidden = true; store.set(KEY + '-announce-closed', '1'); });
  }

  /* Desktop dropdowns */
  const triggers = $$('.nav__trigger');
  function closeDropdowns(except) {
    triggers.forEach(t => {
      if (t === except) return;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      t.setAttribute('aria-expanded', 'false');
      panel.classList.remove('is-open');
      panel.hidden = true;
    });
  }
  triggers.forEach(t => {
    const panel = document.getElementById(t.getAttribute('aria-controls'));
    t.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = t.getAttribute('aria-expanded') === 'true';
      closeDropdowns(t);
      t.setAttribute('aria-expanded', String(!open));
      if (!open) { panel.hidden = false; requestAnimationFrame(() => panel.classList.add('is-open')); }
      else { panel.classList.remove('is-open'); panel.hidden = true; }
    });
    panel.addEventListener('click', () => closeDropdowns());
  });
  document.addEventListener('click', () => closeDropdowns());

  /* Mobile nav */
  const toggle = $('#menu-toggle');
  const mnav = $('#mobile-nav');
  function setMobile(open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (open) { mnav.hidden = false; requestAnimationFrame(() => mnav.classList.add('is-open')); }
    else { mnav.classList.remove('is-open'); mnav.hidden = true; }
  }
  toggle.addEventListener('click', () => setMobile(toggle.getAttribute('aria-expanded') !== 'true'));
  mnav.addEventListener('click', (e) => { if (e.target.closest('a,button')) setMobile(false); });

  /* Hero slideshow */
  const slides = $$('.hero__slide');
  if (slides.length < 2) { const c = $('.hero__controls'); if (c) c.hidden = true; }
  const count = $('#hero-count');
  const pauseBtn = $('#hero-pause');
  const pauseIcon = $('#hero-pause-icon');
  let current = 0, timer = null, paused = reduceMotion;
  function show(n) {
    slides[current].classList.remove('is-active');
    slides[current].setAttribute('aria-hidden', 'true');
    current = (n + slides.length) % slides.length;
    slides[current].classList.add('is-active');
    slides[current].removeAttribute('aria-hidden');
    count.textContent = (current + 1) + ' / ' + slides.length;
    const nextImg = slides[(current + 1) % slides.length].querySelector('img');
    if (nextImg) nextImg.loading = 'eager';
  }
  function schedule() {
    clearInterval(timer);
    if (!paused) timer = setInterval(() => show(current + 1), CONFIG.slideMs || 5600);
  }
  function setPaused(p) {
    paused = p;
    pauseBtn.setAttribute('aria-pressed', String(p));
    pauseBtn.setAttribute('aria-label', p ? 'Play slideshow' : 'Pause slideshow');
    pauseIcon.innerHTML = p ? '<path d="M5 3l8 5-8 5z"/>' : '<path d="M5.5 3v10M10.5 3v10"/>';
    schedule();
  }
  $('#hero-prev').addEventListener('click', () => { show(current - 1); schedule(); });
  $('#hero-next').addEventListener('click', () => { show(current + 1); schedule(); });
  pauseBtn.addEventListener('click', () => setPaused(!paused));
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearInterval(timer); else schedule(); });
  if (slides.length > 1) setPaused(paused);

  /* Modals */
  let openModalEl = null, lastFocus = null;
  const focusables = (el) => $$('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])', el).filter(n => !n.closest('[hidden]') && n.offsetParent !== null);
  function openModal(m, opener) {
    if (openModalEl === m) return;
    if (openModalEl) closeModal(true);
    lastFocus = opener || document.activeElement;
    m.hidden = false;
    document.documentElement.classList.add('is-locked');
    requestAnimationFrame(() => {
      m.classList.add('is-open');
      const f = focusables(m);
      (f[0] || m).focus();
    });
    openModalEl = m;
  }
  function closeModal(silent) {
    const m = openModalEl;
    if (!m) return;
    m.classList.remove('is-open');
    openModalEl = null;
    const done = () => { m.hidden = true; };
    if (reduceMotion || silent) done(); else setTimeout(done, 380);
    document.documentElement.classList.remove('is-locked');
    if (!silent && lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  $$('.modal').forEach(m => m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (openModalEl) { closeModal(); return; }
      closeDropdowns();
      if (toggle.getAttribute('aria-expanded') === 'true') { setMobile(false); toggle.focus(); }
    }
    if (e.key === 'Tab' && openModalEl) {
      const f = focusables(openModalEl);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* Menu dialog */
  const menuDialog = $('#menu-dialog');
  const list = $('#panel-menu');
  const tabs = $$('.tab', menuDialog);
  function renderMenu(key) {
    tabs.forEach(t => {
      const on = t.dataset.tab === key;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on) list.setAttribute('aria-labelledby', t.id);
    });
    list.innerHTML = '';
    const sec = MENU.find(s => s.id === key) || MENU[0];
    if (!sec) return;
    sec.items.forEach(({ name, price, desc }) => {
      const li = document.createElement('li');
      const n = document.createElement('strong'); n.textContent = name;
      const p = document.createElement('span'); p.className = 'price'; p.textContent = price;
      const d = document.createElement('span'); d.className = 'desc'; d.textContent = desc;
      li.append(n, p, d);
      list.append(li);
    });
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => renderMenu(t.dataset.tab));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      next.focus(); renderMenu(next.dataset.tab);
    });
  });
  $$('[data-open-menu]').forEach(b => b.addEventListener('click', (e) => {
    e.preventDefault();
    closeDropdowns();
    renderMenu(b.dataset.openMenu);
    openModal(menuDialog, b.closest('.modal') ? null : b);
  }));
  if (MENU[0]) renderMenu(MENU[0].id);

  /* Booking and enquiry shortcuts */
  const typeSel = $('#f-type');
  const bookingNote = $('#booking-note');
  $$('[data-book]').forEach(a => a.addEventListener('click', (e) => {
    if (CONFIG.bookingUrl) { a.href = CONFIG.bookingUrl; a.target = '_blank'; a.rel = 'noopener'; return; }
    typeSel.value = 'Table booking';
    bookingNote.hidden = false;
  }));
  $$('[data-enquiry]').forEach(a => a.addEventListener('click', () => { typeSel.value = a.dataset.enquiry; bookingNote.hidden = true; }));

  /* Form */
  const form = $('#enquiry');
  const status = $('#form-status');
  const rules = {
    'f-first': v => v.trim().length > 0,
    'f-last': v => v.trim().length > 0,
    'f-email': v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
    'f-phone': v => v.trim() === '' || /^[0-9 ()+-]{6,20}$/.test(v.trim()),
    'f-message': v => v.trim().length > 1
  };
  function check(id) {
    const input = document.getElementById(id);
    const ok = rules[id](input.value);
    input.setAttribute('aria-invalid', String(!ok));
    document.getElementById('e-' + id.slice(2)).hidden = ok;
    return ok;
  }
  Object.keys(rules).forEach(id => document.getElementById(id).addEventListener('blur', () => { if (document.getElementById(id).value) check(id); }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const results = Object.keys(rules).map(check);
    if (results.includes(false)) {
      const firstBad = Object.keys(rules).find(id => document.getElementById(id).getAttribute('aria-invalid') === 'true');
      document.getElementById(firstBad).focus();
      status.hidden = true;
      return;
    }
    status.hidden = false;
    if (!CONFIG.formEndpoint) {
      status.textContent = 'This form is not connected to an inbox yet, so your enquiry has not been sent. Please email ' + CONFIG.contactEmail + ' or call ' + CONFIG.phone + '.';
      return;
    }
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true; btn.textContent = 'Sending';
    try {
      const res = CONFIG.formEndpoint === 'netlify'
        ? await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(new FormData(form)).toString() })
        : await fetch(CONFIG.formEndpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      status.textContent = 'Enquiry sent. The team usually replies within one business day.';
      form.reset();
    } catch (err) {
      status.textContent = 'Your enquiry could not be sent. Check your connection and try again, or email ' + CONFIG.contactEmail + '.';
    } finally {
      btn.disabled = false; btn.textContent = 'Send enquiry';
    }
  });

  /* Promotional popup: once per session */
  const promo = $('#promo');
  if (promo && inWindow(promo) && !store.get(KEY + '-promo-seen')) {
    setTimeout(() => {
      if (openModalEl) return;
      store.set(KEY + '-promo-seen', '1');
      openModal(promo, document.activeElement);
    }, CONFIG.promoDelayMs || 2000);
  }
})();
