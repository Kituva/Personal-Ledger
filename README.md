# Ledger

A manual expense tracker that installs to the iPhone home screen. No account,
no server, no network. Everything lives in IndexedDB on the device.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # -> dist/
```

## Deploy

Any static host. Vercel and Netlify both give you HTTPS free, which the service
worker requires.

```bash
npx vercel --prod          # or: npx netlify deploy --prod --dir=dist
```

No environment variables. No database. It's four files and some icons.

## Install on a phone

Open the URL in **Safari** → Share → **Add to Home Screen**.

Safari specifically — Chrome on iOS can't install PWAs. And it has to be Add to
Home Screen, not a bookmark: only the installed version gets its own window,
persistent storage, and the safe-area handling around the notch.

## Files

| | |
|---|---|
| `src/App.jsx` | Every screen. Month, Insights, Log, entry sheet, settings. |
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

## The daily rhythm strip

The bar chart on the month screen is one bar per day, weekends in brass. It's
there instead of a pie chart because the shape of a month — the rent spike, the
weekend clusters, the quiet Tuesdays — is the thing a spreadsheet can't show
you. Tap any bar for that day's entries.

## Data, honestly

It's on the device and nowhere else. That means no account to create, nothing
of yours on anyone's server, and it works on a plane.

It also means: **deleting the app deletes the data.** There is no sync and no
backup. Export a CSV every month or so and keep it somewhere real — that
habit is the entire disaster recovery plan.

`navigator.storage.persist()` is requested at startup, which on an installed
iOS PWA marks the data as persistent and protects it from routine eviction. It
does not protect it from someone deleting the icon.

## If you outgrow local-only

The seam is `src/db.js`. Every read and write goes through it, and `App.jsx`
never touches `indexedDB` directly. Swapping the five exported functions for
`fetch` calls against an API is the whole migration.
