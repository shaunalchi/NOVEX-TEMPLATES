# Novex sites

Templates and client websites for Novex. One template per industry, one settings file per client.

## How it fits together

```
core/site.js            shared behaviour for every site (menus, slideshow, popup, form)
templates/cafe/         café and restaurant template: layout (index.html) and look (styles.css)
clients/morrow/         one client: site.json (all their details) and images/
build.js                turns a client's site.json + template into a finished website
dist/morrow/            the finished website, ready to host (generated, don't edit by hand)
```

A client never gets new code. They get a `site.json`: name, address, phone, hours, menu, photos, popup, booking link. Change a line, rebuild, and the site updates.

## New client

Ask Claude: "New café client: [name], [suburb]. Here are their details and photos." Claude copies `clients/morrow`, fills in a new `site.json`, adds the photos and builds it.

Doing it by hand:
1. Copy the `clients/morrow` folder and rename it, for example `clients/salt-and-co`.
2. Edit `site.json`. Put photos in its `images/` folder and reference them like `"photo": "images/hero1.jpg"`.
3. Update the client name in its `netlify.toml`.

## SEO basics per client

- Set `"url"` in site.json to the live address (for example `https://morrowcafe.com.au`). The build then adds a sitemap, robots.txt and canonical link.
- Add the Google Search Console verification code to `seo.searchConsole`, then submit `/sitemap.xml` in Search Console.
- `openingHoursSpec` and `cuisine` feed Google's business details.
- The client's Google Business Profile matters more for local search than anything on the site. Keep its hours, photos and website link in sync.

Client intake checklist: `docs/intake-checklist.md`.

## Photos

Every photo slot has a `note` describing the shot it needs. Leave `photo` empty and the slot shows a tonal placeholder with that note. Use JPGs around 2400px wide for the hero and 1600px elsewhere, under about 400KB each. `position` sets the focal point, for example `"50% 30%"` keeps the top third in frame.

## Going live on Netlify

1. In Netlify, choose Add new site, then Import from Git, and pick this repo.
2. Set Base directory to `clients/<client>`. Netlify reads the rest from that folder's `netlify.toml`.
3. Deploy, then add the client's domain under Domain management.

Every change pushed to this repo redeploys the site automatically.

## Forms and bookings

- `"form": { "endpoint": "netlify" }` sends enquiries through Netlify Forms. Turn on email notifications for the form in the Netlify dashboard. Leave it empty and the site tells visitors the form isn't connected.
- `"booking": { "url": "" }` takes the venue's booking page link. Empty means Reserve buttons take people to the enquiry form with "Table booking" selected.

## Building locally (optional)

Needs Node 18 or newer: `node build.js` builds every client, `node build.js morrow` builds one.
