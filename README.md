# Ledger

A manual expense tracker that installs to the iPhone home screen. No account,
no server, no network. Everything lives in IndexedDB on the device.

```bash
npm install
npm run dev        # http://localhost:5173/Personal-Ledger/
npm run build      # -> dist/
npm test           # the category rules and the CSV importer
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
| `src/App.jsx` | Most screens — Summary, Entries, Settings, category detail, entry sheet. |
| `src/categories.js` | Categories as data: the defaults, and the rules about what may be renamed, deleted or re-sided. |
| `src/CategoriesScreen.jsx` | The Categories screen, reached from Settings. |
| `src/CategorySheet.jsx` | Add or edit one category. |
| `src/icons.jsx` | The drawn icons, shared by every screen. |
| `src/db.js` | IndexedDB wrapper. Two stores, no dependencies. |
| `src/styles.css` | All styling. |
| `vite.config.js` | Manifest and service worker via `vite-plugin-pwa`. |

## The CSV format

Six columns, both directions: **Date, Amount, Category, Description, Month,
Year**. Only the first four are read on the way in — Month and Year exist for
the spreadsheet's benefit and are recomputed from the date.

Dates in `DD-MM-YYYY`, `DD/MM/YYYY` or `YYYY-MM-DD` all work. A negative amount
imports as income, and that sign also decides which half of the category list
the name is matched against — an income row never matches an expense category.

A name that matches nothing on its side is **created** as a new category, and
the import summary says how many it made. That is deliberate: an export is the
only backup there is, so an import that couldn't restore your own categories
would quietly lose them. The cost is that a typo in a hand-edited sheet becomes
a category you have to go and delete. A blank category cell falls back to
Miscellaneous, or Other income on a negative amount.

Import **adds** to what's already there. It doesn't replace and it doesn't
deduplicate, so importing the same file twice leaves you with two of
everything. Settings → **Start fresh** is the way back.

## Bringing in a spreadsheet

Columns are read **positionally** — first Date, second Amount, third Category,
fourth Description. That's the catch: it only works when the table starts in
the very first column.

`Expenses001.xlsx` doesn't. Column A is an empty spacer, the table starts at
B, the header sits on row 2, and a stray month list lives out in column AD.
Excel writes the whole used range, so a plain Save As → CSV shifts every value
one place to the right — the importer reads column one, finds an empty cell,
and skips all 3,091 rows without saying why. That failure is silent and looks
exactly like a corrupt file.

So flatten it first: those four columns, in that order, starting at column A,
header on line 1, nothing else in the sheet.

Done once, September 2026 — 1,167 entries spanning January 2025 to August 2026.
Six of them carry the description *Not Known*, which the spreadsheet had left
blank; three of those six had no category either and sit in Miscellaneous.

## Keeping the spreadsheet up to date

The app is the record now and the spreadsheet is the archive, so the traffic
runs the other way. Settings → **Export CSV** writes `Expenses-YYYY-MM-DD.csv`.
That file is also the only backup there is, which is reason enough to do it
regularly.

Three things to watch when pasting an export back into `Expenses001.xlsx`:

**It's always the whole ledger.** Export writes every entry, oldest first —
not what changed since last time. You are replacing the sheet's contents, not
appending to them. Clear from row 3 down before pasting, or keep each dated
export as its own file and treat the newest as the truth.

**Paste into B–E only.** Month and Year are formulas in that sheet. The export
carries them as plain text, and pasting all six columns would overwrite
working formulas with dead values. Leave F and G to recalculate.

**Check the dates on the first paste.** The export writes day first, so
`08-04-2025` is the 8th of April. An Excel reading dates US-style turns that
into the 4th of August and won't mention it. Confirm against a row you
recognise; if it's wrong, paste through Data → Text to Columns with the date
format set to DMY.

## Categories

A category belongs to one side or the other. Expenses ship as:

Dining Out · Groceries · Transportation · Subscriptions · Utilities · Home ·
Entertainment · Health/medical · Travel · Personal · Gifts/Donations ·
Investments · Debt · Miscellaneous

and income as Salary · Interest · Refunds · Gifts · Other income.

Those nineteen are a starting point, not the set. Settings → **Categories** is
where you add your own, rename or re-icon any of them, and delete the ones you
don't want; the ⋯ on each row holds all three. The entry sheet shows one side
or the other depending on whether you tapped Spent or Received.

Deleting is blocked while entries still point at a category, and says how many
rather than orphaning them. A category's side is fixed for the same reason once
it has entries — flipping it would turn money received into money spent without
touching a single entry.

Order is the order you see, never alphabetical. The original fourteen keep the
positions they have always had and anything you add goes to the end of its
section, so the grid you pick from every day doesn't rearrange itself under you.

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
never touches `indexedDB` directly. Swapping its exported functions for `fetch`
calls against an API is the whole migration.
