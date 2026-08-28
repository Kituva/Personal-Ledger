# Ledger

A manual expense tracker that installs to the iPhone home screen. No account,
no server, no network. Everything lives in IndexedDB on the device.

```bash
npm install
npm run dev        # http://localhost:5173/Personal-Ledger/
npm run build      # -> dist/
```

## Deploy

Pushing to `main` builds and publishes to GitHub Pages —
`.github/workflows/deploy.yml` does the whole thing, with nothing to configure.

Pages serves a project repo from a subpath, so `vite.config.js` sets
`base = "/Personal-Ledger/"` and every asset the PWA references carries that
prefix. Any other static host works too; one that serves from the domain root
needs that line changed to `"/"`, and the manifest's `start_url` and `scope`
follow it automatically.

```bash
npx vercel --prod          # or: npx netlify deploy --prod --dir=dist
```

Whatever you pick has to be HTTPS — the service worker won't register without
it. No environment variables. No database. It's four files and some icons.

## Install on a phone

Open the URL in **Safari** → Share → **Add to Home Screen**.

Safari specifically — Chrome on iOS can't install PWAs. And it has to be Add to
Home Screen, not a bookmark: only the installed version gets its own window,
persistent storage, and the safe-area handling around the notch.

## Files

| | |
|---|---|
| `src/App.jsx` | Every screen — Summary, Entries, Settings, category detail, entry sheet. |
| `src/db.js` | IndexedDB wrapper. One store, no dependencies. |
| `src/styles.css` | All styling. |
| `vite.config.js` | Manifest and service worker via `vite-plugin-pwa`. |

## Bringing in Expenses001.xlsx

Save the Expense List sheet as CSV, then Settings → **Import CSV**.

Columns are read positionally as **Date, Amount, Category, Description**. Dates
in `DD-MM-YYYY`, `DD/MM/YYYY` or `YYYY-MM-DD` all work. A negative amount
imports as income. Category names are matched against the fourteen below;
anything unrecognised lands in Miscellaneous.

Export writes the same six columns back, so a round trip through CSV loses
nothing.

## Categories

Dining Out · Groceries · Transportation · Subscriptions · Utilities · Home ·
Entertainment · Health/medical · Travel · Personal · Gifts/Donations ·
Investments · Debt · Miscellaneous

Fixed set, defined at the top of `App.jsx`. The picker orders them by how often
you've used them, so after a couple of weeks your usual three or four sit at
the front and most entries are one tap.

## The two charts

**Summary** is a donut, one arc per category, largest first, with the exact
figures ranked underneath it. It answers where the money went. Tap an arc or a
row to drill into that category. Slices too thin to read as arcs fold into a
single grey remainder, because below a certain length an arc's two round caps
meet and it paints a dot instead.

**Entries** is a bar chart over the same window, one bar per grain — a day in
week and month view, a week in quarter view, a month in year view. That's the
shape a spreadsheet can't show you: the rent spike, the weekend clusters, the
quiet Tuesdays. Tap any bar to filter the list underneath to that stretch. The
ghost track behind each bar keeps a half-spent month from reading as a ragged
skyline with no sense of how much is still to come.

Both charts read from the same period window as the totals, so Summary and
Entries can never disagree.

## Data, honestly

It's on the device and nowhere else. That means no account to create, nothing
of yours on anyone's server, and it works on a plane.

It also means: **deleting the app deletes the data.** There is no sync and no
backup. Export a CSV every month or so and keep it somewhere real — that
habit is the entire disaster recovery plan.

`navigator.storage.persist()` is requested at startup, which on an installed
iOS PWA marks the data as persistent and protects it from routine eviction. It
does not protect it from someone deleting the icon.

One trap worth knowing: **Safari and the home-screen app keep separate
storage.** Entries you log in a Safari tab are not in the installed app and
never migrate to it. Install first, then start logging. It matters beyond
tidiness — Safari clears script-writable storage, IndexedDB included, after
seven days without a visit, and only the installed app is exempt from that
sweep. A fortnight away can empty the tab; it can't empty the icon.

## If you outgrow local-only

The seam is `src/db.js`. Every read and write goes through it, and `App.jsx`
never touches `indexedDB` directly. Swapping the five exported functions for
`fetch` calls against an API is the whole migration.
