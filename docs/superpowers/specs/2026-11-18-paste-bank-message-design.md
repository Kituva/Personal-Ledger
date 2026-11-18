# Paste a bank message

Design, 18 November 2026. A small change: a set of rules that read an HDFC UPI
message, and the Add screen filling itself in from one.

## Why

Logging an expense today takes about five taps plus typing: +, the amount,
two taps for a category, the description, ✓. Most day-to-day spending goes out
by UPI from one HDFC account, and every payment already arrives as a text
message carrying the amount, the date and who was paid. Copying that message
into Ledger should do the typing.

Success looks like this: for a payee you've paid before, logging is **+, paste,
✓**. For a new payee, it's the same plus picking a category once.

## What changes for you

**Paste a message into the description box of a new entry.** Tap +, tap
*What was it for?*, and paste an HDFC "Sent Rs." message. The message text does
not appear in the box. Instead, the sheet fills in:

| From the message          | Becomes                                         |
|---------------------------|-------------------------------------------------|
| `Sent Rs.225.00`          | amount ₹225, and **Spent** selected             |
| `To KPN FARM FRESH`       | description *KPN FARM FRESH*                    |
| `On 17/11/26`             | date 17 Nov 2026                                |
| the payee, again          | the category you last used for this payee       |

The description is the payee exactly as the bank wrote it, capitals included,
with extra spaces removed ("SENTHIL  L" becomes "SENTHIL L"). If this payee has
never been pasted before, the category stays empty for you to pick. The
keyboard closes after the sheet fills, so you can see what it filled.
Everything stays editable before ✓.

**Which messages it reads.** Only HDFC's UPI "Sent" message, in the layout
below. It needs the `Sent Rs.` line, the `To` line and an `On` date that is a
real date. If any of those can't be read cleanly, the paste is treated as
ordinary text and lands in the box as it does today. That covers other banks,
cards, money-received messages and anything else.

```
Sent Rs.80.00
From HDFC Bank A/C *1234
To SOME PAYEE
On 18/11/26
Ref 600000000001
Not You?
Call 18002586161/SMS BLOCK UPI to 7308080808
```

**Remembering payees.** An entry made from a pasted message quietly keeps two
of the bank's details: the payee name and the reference number. Neither is
shown anywhere, sent to the Google Sheet or written to the CSV export. Renaming
the description or changing the amount, date or category doesn't remove them.

The category for a payee comes from your **most recent Spent entry (by date)
that was pasted from a message by the same payee**. Payee names are compared
ignoring capitals and extra spaces. The bank cuts long names at about 25
letters, but it cuts them the same way every time, so they still match.
Recategorising that latest entry changes what's remembered.

**Repeat warning.** If an entry with the same reference number already exists,
a line under the amount says, for example, *Already logged on 14 Nov as KPN
FARM FRESH*, using that entry's current date and description. It doesn't stop
you saving, because you might be splitting one payment into two entries.

**Editing an existing entry.** Pasting a message into an entry you're editing
pastes it as plain text, as today. A stray paste can never overwrite an entry
you already have.

## Not doing

- Other banks, cards, or money-received messages. Each gets added later from a
  real sample.
- Reading messages automatically. A web app can't read your texts.
- Several messages in one paste.
- Showing the hidden payee, or searching by it.
- Carrying the payee and reference through a CSV backup or the Google Sheet.
  After a CSV restore, entries come back but the payee memory starts fresh.
- Learning categories from entries typed by hand.

## Must never happen

- Pasted text getting lost. An unrecognised message always pastes as normal.
- An existing entry's details getting overwritten.
- A wrong amount or date filled in without anything looking odd. When unsure,
  treat the paste as unrecognised.
- The account number being kept. Only the payee and reference are stored, and
  only on the device.

## Approaches

- **A. Look up past entries by description.** Nothing new stored, but renaming
  a description breaks both the memory and the repeat check. Rejected.
- **B. Keep the payee and reference on each pasted entry, out of sight.**
  Chosen. Descriptions can be renamed freely, and the repeat check is exact
  because every payment has its own reference.
- **C. A separate payee-to-category list.** A second record to keep in step
  with your entries; deleting or recategorising an entry could leave it out of
  date. Rejected.

## Left to the builder

- The reading rules go in their own file with no screen code, the way
  `src/search.js` does, with tests covering the layout above plus commas in
  amounts, trailing spaces, Windows line breaks, a missing `Ref` line, an
  impossible date and a two-digit year.
- **Tests use made-up names, amounts and numbers.** The repo is public on
  GitHub, so the real messages shared during design stay out of it.
- The description box is a single-line input, which strips line breaks from a
  paste and would run `To SENTHIL  L` straight into `On 18/11/26`. The paste
  has to be read from the clipboard event before the box flattens it.
- New entries need the payee and reference passed through on save. Edits
  already carry every stored field across. Entries are stored whole, so no
  database version change is needed.
- Where the repeat warning sits relative to the *Pick a category* hint. Both
  must be visible at once.
- A remembered category always still exists, since a category can't be deleted
  while any entry uses it.
