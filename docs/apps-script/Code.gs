/**
 * Ledger → Google Sheet.
 *
 * Paste this into a Google Sheet (Extensions → Apps Script), replace CODE with
 * the code the app generates for you, then Deploy → New deployment → Web app,
 * with "Execute as" set to Me and "Who has access" set to Anyone. Copy the web
 * app URL back into the app.
 *
 * "Anyone" is what makes CODE necessary: without it, anybody holding that URL
 * could rewrite the sheet. Nothing here answers a request that doesn't carry it.
 *
 * This script makes no decisions. It hands back the tag column, or it writes
 * the rows it is given. The app works out what changed.
 */

var CODE = "PASTE-THE-CODE-FROM-THE-APP-HERE";
var TAB = "Ledger";
var HEADERS = ["Date", "Amount", "Category", "Description", "Month", "Year", "Tag"];

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    if (req.code !== CODE) return reply_({ ok: false, error: "bad code" });
    if (req.action === "read") return reply_(read_());
    if (req.action === "write") return reply_(write_(req.rows || []));
    return reply_({ ok: false, error: "unknown action" });
  } catch (err) {
    return reply_({ ok: false, error: String((err && err.message) || err) });
  }
}

/* Opening the URL in a browser should say something. If you get Google's
   sign-in page here instead, the deployment is not published to Anyone. */
function doGet() {
  return reply_({ ok: false, error: "This endpoint answers POSTs from the ledger app." });
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* The app owns one tab and creates it if it isn't there, so whatever else is
   already in your spreadsheet is left alone. Setting up the header, the date
   format and the hidden tag column happens once, on the first push. */
function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TAB) || ss.insertSheet(TAB);

  var head = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (String(head[0]) !== HEADERS[0] || String(head[6]) !== HEADERS[6]) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.getRange(2, 1, sh.getMaxRows() - 1, 1).setNumberFormat("dd-mm-yyyy");
    sh.hideColumns(7);
  }
  return sh;
}

function read_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return { ok: true, tags: [], rows: 0 };

  var tags = sh.getRange(2, 7, last - 1, 1).getValues().map(function (r) {
    return String(r[0] === null || r[0] === undefined ? "" : r[0]);
  });
  return { ok: true, tags: tags, rows: tags.length };
}

function write_(rows) {
  var sh = sheet_();
  var before = Math.max(sh.getLastRow() - 1, 0);

  /* Dates arrive as YYYY-MM-DD and go in as real dates. A date built from its
     three parts carries no timezone to shift, and the column's own dd-mm-yyyy
     format is what displays it — so no locale can read 08-04-2025 as August. */
  var values = rows.map(function (r) {
    var p = String(r[0]).split("-");
    return [
      new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])),
      r[1], r[2], r[3], r[4], r[5], r[6],
    ];
  });

  /* Write first, clear the surplus afterwards. Clearing first and then failing
     part-way through the write would leave the archive empty. */
  if (values.length) sh.getRange(2, 1, values.length, HEADERS.length).setValues(values);
  if (before > values.length) {
    sh.getRange(values.length + 2, 1, before - values.length, HEADERS.length).clearContent();
  }
  return { ok: true, written: values.length };
}
