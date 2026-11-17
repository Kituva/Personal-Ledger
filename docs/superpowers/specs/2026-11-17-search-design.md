# Search

Design, 17 November 2026. A small change: one new state of the Entries screen
and a set of matching rules.

## Why

The only way to find an old entry today is to step back month by month on
Entries, with the category filter as the only aid. There are about 1,170
entries going back to January 2025. When you half-remember an entry, the thing
you remember might be the date, the amount, the category or a word from the
description. Search should take whichever of those you remember, in one box,
without making you say which it is.

## What changes for you

**A search box at the top of Entries**, above the month stepper, reading
*Search all entries*. Nothing else on Entries moves until you type.

**Typing turns Entries into results.** Once the box has text in it, the month
stepper, the big total, the bar chart, the calendar grid and the filter pills
are hidden. Matches from every month, both spent and received, take their
place. The month and filters you had set are not applied, and they are not
changed either. **Cancel**, beside the box while it's in use, empties the box
and brings Entries back exactly as you left it. The ✕ inside the box empties it
but keeps the keyboard up.

**Results look like the Entries list**: grouped by day, newest first, using the
same rows. Above them:

- one line showing how your words were read, for example
  *Looking for 📅 any October · ₹500*
- a card with the count and the total, for example *5 entries · ₹2,500*. If
  the matches include money received as well as money spent, the two are
  totalled separately.

Tapping a result opens it in the entry sheet. Saving or closing it returns you
to the same results, so you can fix several in a row. Switching to Summary or
Settings clears the search. The + button while searching adds an entry dated
today.

Mockups: `.superpowers/brainstorm/1141-1794896753/content/` (the screens named
`search-how-it-reads`, `search-where-it-lives` and `search-flow`).

## How what you type is read

Every word you type has to match the **same** entry. "petrol oct" finds petrol
entries from October. It does not find every petrol entry plus everything else
from October.

A word matches an entry if it matches any one of the following:

- **Text.** The word appears anywhere in the category name or the description.
  Capitals don't matter and part of a word is enough, so "gro" finds Groceries.
- **Amount.** A number (with or without ₹ or thousands commas, decimals
  allowed) equals the entry's amount. A number also matches as text, so "199"
  finds "Netflix 199 plan".
- **Month.** A month name, full or at least three letters ("oct", "october",
  "sept"), matches entries from that month of any year. A month word also
  matches as text, so "dec" finds both December entries and "Decathlon".
- **Day or year with a month.** A number written next to a month word is read
  with it: "12 oct" and "oct 12" mean the 12th of October in any year, and
  "oct 2025" means October 2025. "12 oct 2025" is a single day.
- **Dates written in numbers**, day first like the rest of the app:
  `12/10/2025`, `12-10-2025`, `12/10` (any year), and `2025-10-12`.
- **A year on its own.** "2025" is the one case where the box has to guess:
  it matches entries from 2025 *and* entries of ₹2,025 *and* the text "2025".
  The reading line says so: *📅 2025 or ₹2,025*. Only years you actually have
  entries in are read this way, so "2000" is just ₹2,000.
- **A day next to a month is also tried the other way.** "oct 25" finds the
  25th of October, and it also finds an October entry of ₹25. That keeps the
  date reading from hiding anything.

**Nearest amounts.** If the search finds nothing and it contained a number
read as an amount, it is run again with that amount loosened to within about
10% either side. The results then carry a note: *Nothing for exactly ₹520.
These are the nearest amounts.* Exact matches always win. The loosening only
happens when exact gave nothing.

## Approaches considered

1. **Just type, and the app works out what each word means** (chosen). This is
   the fastest to use: you type and look, with nothing else to tap. The cost is
   the occasional guess, like a bare year, which is shown rather than hidden.
2. **Type, then tap what you meant.** Suggestions such as "Amount is ₹500" or
   "Description contains '500'" turn into removable tags. It needs no guessing,
   but takes an extra tap per word and is more to build. It was passed over
   because the point of the feature is to type what you remember without
   labelling it.

Where the box lives was chosen separately. A search box on Entries was picked
over a magnifier button at the top of Summary and Entries, and over a fourth
Search button in the bottom bar.

## Goals

- Find any entry from one box, by any mix of date, amount, category and
  description.
- See what the matches add up to.
- Get to an entry and edit it in two taps.

## Not doing

- Search on Summary, or anywhere other than Entries.
- Saved or recent searches.
- Spelling forgiveness ("grocerys") or synonyms ("medicine" finding
  Health/medical).
- Range syntax such as ">500" or "500-1000".

## Must not happen

- Search must never leave the Entries month or filters changed. Cancel returns
  you exactly where you were.
- An exact match must never be hidden by a guess. Every ambiguous reading
  widens the results and never narrows them.

## Left to the builder

- The matching rules belong in their own file with no React in it, tested the
  way `categories.js` and `sync.js` are. My call, so the date and number rules
  can be checked case by case.
- How many day groups to draw when a short search matches almost everything.
  The count and the total always cover every match. If the list is cut off, it
  says so and suggests adding a word.
- How the box and the floating nav behave with the iPhone keyboard up. Check
  this on the installed app, not only in a desktop browser.
- The exact wording of the reading line for each kind of word.
