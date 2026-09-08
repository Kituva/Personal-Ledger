# Income and expense categories

Design, 8 September 2026.

## Why

The app has one flat list of fourteen categories (`CATS` in `src/App.jsx`).
Every one of them is an expense: Dining Out, Groceries, Transportation, and so
on down to Miscellaneous. The entry sheet lets you mark an entry **Received**
instead of **Spent**, but the category grid does not change when you do, so
money coming in has to be filed under an expense category. The app's own sample
data files a monthly salary under Miscellaneous, which is as good as it gets
today.

This came up because a real salary arrived and there was nowhere sensible to put
it.

Two things follow from fixing it. Money in needs its own categories, which means
a category now belongs to one side or the other. And once the list is no longer
one hardcoded set of fourteen, you need somewhere to manage it — which is the
custom-categories feature parked on 2 September. This design merges the two so
they get built once.

## What changes for you

**A Categories page**, reached from Settings. One scrolling page with two
sections, Income first and then Expenses, each listing its categories as rows:
icon, name, and a `⋯` on the right. Each section header carries a count of how
many categories are in it. At the end of each section is an "Add income
category" / "Add expense category" row.

**You can add, rename, re-icon and delete.** `⋯` opens Rename, Change icon and
Delete. Adding opens a sheet built from the entry sheet's own header — ✕ on the
left, an Income/Expense control in the middle, ✓ on the right — with a name
field, a scrolling grid of emoji to tap, and a field under it for typing any
emoji the grid doesn't have. The colour is assigned for you.

**The entry sheet shows the right categories.** Tap **Spent** and you get
expense categories; tap **Received** and you get income categories. This is the
change that started all of this.

**Five income categories to begin with:** Salary 💼, Interest 🏦, Refunds ↩️,
Gifts 🎁, Other income 💰. The existing fourteen become the expense side,
unchanged.

**Nothing you already have moves.** All fourteen expense categories keep their
id, name, icon, colour and position, so every entry you have stays where it is
and the grid you pick from every day looks the same. You confirmed you have not
marked anything as Received yet, so there are no income entries to re-file.

## Decisions already settled

From 2 September, carried forward unchanged:

1. The fourteen prefilled categories stay as defaults — not a blank slate.
2. You can add new categories, rename and re-icon any category including the
   original fourteen, and delete ones you don't want.
3. **Deleting a category that has entries is blocked**, with a message saying
   why ("14 entries use this category. Move or remove them first."). Nothing is
   orphaned and there is no forced reassignment flow.
4. Management lives in one place — this page — with no quick-add from the entry
   sheet's category grid.
5. Colour is auto-assigned from a preset palette. No colour picker.

From 8 September:

6. **Icon input is an emoji grid plus a type-your-own field** — this replaces
   2 September's "text field only" decision. The grid is emoji, not artwork:
   every category in this app is an emoji today and there is no icon set to draw
   from.
7. **The Categories page lives in Settings, not the bottom bar.** A fourth tab
   was mocked up and rejected: the bar is the app's most valuable space and this
   is a page used heavily for a week and then rarely, unlike Summary and Entries.
8. **A category belongs to one side only.** There is no category usable by both
   income and expenses.
9. **Ordering is positional, not alphabetical.** Existing categories keep
   today's order; anything new is appended to the end of its section. Same order
   on the Categories page and in the entry grid, so daily muscle memory survives.
10. **Income defaults are the five above** — a starter set, not an exhaustive one,
    since you can now add your own.

## Rules

**Deleting.** Blocked while any entry points at the category. Also blocked when
it is the last category on its side — import and manual entry always need
somewhere to land.

**Changing a category's type.** Locked once the category has entries. Flipping
Income→Expense on a category with entries would silently turn money received
into money spent and corrupt every total on the Summary screen. The control is
shown disabled with the reason, matching how Delete behaves. On a category with
no entries it is free to change.

**Flipping Spent/Received mid-entry.** The chosen category is cleared, because
it belongs to the side you just left. The sheet returns to its "Pick a category"
state, which is a state it already has and already handles.

**Names.** Must be unique within a side, and blank names are rejected. The same
name on both sides is allowed — "Gifts" as both something you give and something
you receive is legitimate.

**Filtering.** The category filter on Summary and Entries lists only categories
matching the kind currently being viewed, since the other side's categories can
never match anything.

## CSV

The format does not change: `Date, Amount, Category, Description, Month, Year`,
with a negative amount meaning income. Export keeps writing the category's
**name**, which is what makes the rest of this work.

**Import gets one real behaviour change: an unrecognised category name creates
that category** rather than collapsing into a fallback.

This is the one decision made without asking, so it is the thing to check
hardest at review. The reasoning: the README states plainly that the exported
CSV "is also the only backup there is". The moment categories are yours to
define, an import that cannot restore them makes the backup lossy — export ten
custom categories, reinstall, and get them all back as Miscellaneous. Creating
them on the way in keeps export→import a true round trip. The cost is that a
typo in a hand-edited spreadsheet becomes a category you have to delete.

Import resolves each row like this:

1. The amount's sign picks the side — negative is income, positive is expense.
2. Match the name against that side's categories, case-insensitively.
3. No match and the name is non-empty → create it on that side, with a default
   icon and an auto-assigned colour.
4. Name blank or unusable → Miscellaneous for expenses, Other income for income;
   if that category has been deleted, the first remaining one on that side.

The import result already reports rows added and rows skipped. It gains a line
for categories created, so a spreadsheet typo is visible rather than silent.

## Sample data

The demo generator is keyed to the original fourteen ids and files its monthly
salary under `misc`. It moves to `salary`, and filters its pool to categories
that currently exist so it cannot produce entries pointing at a category you
deleted.

## How it gets built

You don't need to weigh in on this section — it's here so the plan has
something to work from.

Categories become data rather than a constant: a second store alongside
`transactions` in the existing database, seeded with the nineteen defaults on
upgrade so nothing changes for the current install. Each record holds an id,
name, emoji, colour, side, and position. Transactions are untouched — they still
reference a category by id.

`CATS`, `CAT` and `BY_NAME` are module-level constants today, read directly at
nine sites across `src/App.jsx` (the importer, the exporter, `CatRow`, `TxnRow`,
`CategoryDetail`, `Filters`, `EntrySheet`, and the filter picker). They become a
small React context so those callers don't each need new props threaded through.

`src/App.jsx` is 1475 lines and this adds a screen, a sheet and the category
state. Three pieces come out into their own files — the category defaults and
palette, the Categories screen, and the add/edit sheet — leaving the rest of
App.jsx where it is. This is scoped to what this feature touches, not a general
reorganisation.

## Verifying it

The project has no test framework — no runner, no test files, nothing in
`package.json`. So this design cannot assume tests exist.

The recommendation is to add a minimal one (Vitest, which needs no extra
configuration on top of Vite) and cover only the pure logic, where the risk
actually is: the delete and type-change rules, name uniqueness, and the CSV
import resolution above with its four branches. That's a small amount of setup
for the parts most likely to be got quietly wrong.

The UI itself is checked by hand in the browser: add a category on each side,
rename one, re-icon one, try to delete one that has entries, flip Spent/Received
in the entry sheet, export and re-import a CSV containing a custom category, and
confirm an existing install upgrades with all fourteen expense categories intact.

If you'd rather not add a test framework, say so at review and everything moves
to the manual list.

## Out of scope

Sub-categories nested below these (Food → Restaurants), reordering categories by
hand, merging two categories, per-category budget targets (parked separately),
and bulk-reassigning entries from one category to another. Deleting is blocked
rather than offering to move entries, which is decision 3 above.
