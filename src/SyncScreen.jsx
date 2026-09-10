/**
 * Connecting the ledger to a Google Sheet.
 *
 * Setup is four steps and every one of them is a copy or a paste, because it
 * is done on a phone. The script is served from the same file the repo keeps,
 * with the code already substituted in, so there is nothing to type and no
 * chance of pasting a script that doesn't match the app talking to it.
 */

import React, { useState, useEffect } from "react";
import { Chevron } from "./icons.jsx";
import { readSheet, makeCode, PUSH_INTERVAL_DAYS } from "./sync.js";
import SCRIPT from "../docs/apps-script/Code.gs?raw";

const PLACEHOLDER = "PASTE-THE-CODE-FROM-THE-APP-HERE";

const when = (ms) =>
  new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

function Step({ n, title, sub, action, children }) {
  return (
    <div className="syncstep">
      <span className="syncnum">{n}</span>
      <div className="syncbody">
        <div className="synctitle">{title}</div>
        {sub && <div className="rowsub">{sub}</div>}
        {children}
      </div>
      {action}
    </div>
  );
}

export default function SyncScreen({ url, code, lastPushAt, pushing, onSave, onPush, onBack }) {
  const [draft, setDraft] = useState(url || "");
  const [test, setTest] = useState(null);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);

  // The code is the app's to invent, so there is no reason to make anyone ask
  // for one. It exists by the time step 2 hands over the script carrying it.
  useEffect(() => { if (!code) onSave({ code: makeCode() }); }, [code]);

  const save = () => { if (draft.trim() !== url) onSave({ url: draft.trim() }); };

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(SCRIPT.replace(PLACEHOLDER, code || PLACEHOLDER));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setTest({ kind: "error", text: "Couldn't reach the clipboard. Copy Code.gs from the repo instead." });
    }
  };

  const runTest = async () => {
    const target = draft.trim();
    save();
    if (!target || !code) {
      setTest({ kind: "error", text: "Paste the web app address first." });
      return;
    }
    setTesting(true);
    setTest(null);
    const r = await readSheet(target, code);
    setTesting(false);
    setTest(r.ok
      ? { kind: "ok", text: `Connected. The sheet holds ${r.data.rows.toLocaleString("en-IN")} rows.` }
      : { kind: "error", text: r.message });
  };

  return (
    <div className="scroll">
      <div className="navrow">
        <button className="iconbtn" onClick={onBack} aria-label="Back"><Chevron dir="left" /></button>
        <span className="navtitle">Google Sheet</span>
        <span style={{ width: 40 }} />
      </div>

      <div className="sect">Setting it up</div>
      <div className="setcard">
        <Step n="1" title="Open a Google Sheet"
          sub="Any sheet, new or old. The app writes to its own tab called Ledger and leaves everything else in the file alone." />

        <Step n="2" title="Paste in the script"
          sub="In the sheet: Extensions → Apps Script. Delete what's there, paste this, and save."
          action={
            <button className="syncbtn" onClick={copyScript}>{copied ? "Copied" : "Copy"}</button>
          }>
          <code className="synccode">{code ? `${code.slice(0, 10)}…` : "…"}</code>
          <span className="rowsub" style={{ display: "inline", marginLeft: 8 }}>
            your code, already in the script
          </span>
        </Step>

        <Step n="3" title="Publish it"
          sub="Deploy → New deployment → Web app. Execute as Me, Who has access Anyone. Anyone is what lets your phone reach it; the code above is what stops anyone else." />

        <Step n="4" title="Paste the address back"
          sub="Deploying gives you a web app URL. That is the address, not the sheet's own link.">
          <input className="inp" style={{ marginTop: 10 }} inputMode="url" autoCapitalize="off"
            autoCorrect="off" spellCheck={false} placeholder="https://script.google.com/macros/s/…/exec"
            value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save} />
        </Step>

        <button className="row" onClick={runTest} disabled={testing}>
          <span>
            {testing ? "Testing…" : "Test connection"}
            <span className="rowsub" style={{ display: "block" }}>
              Reads the sheet without writing anything to it.
            </span>
          </span>
          <Chevron dir="right" size={16} />
        </button>
      </div>

      {test && (
        <div className="syncmsg" style={{ color: test.kind === "ok" ? "var(--pos)" : "var(--neg)" }}>
          {test.text}
        </div>
      )}

      <div className="sect">Pushing</div>
      <div className="setcard">
        <button className="row" onClick={() => onPush(false)} disabled={pushing || !url || !code}>
          <span>
            {pushing ? "Pushing…" : "Push now"}
            <span className="rowsub" style={{ display: "block" }}>
              {lastPushAt ? `Last pushed ${when(lastPushAt)}.` : "Not pushed yet."}
            </span>
          </span>
          <Chevron dir="right" size={16} />
        </button>
      </div>

      <div style={{ padding: "4px 4px 20px", fontSize: 12.5, color: "var(--text3)", lineHeight: 1.65 }}>
        Once connected, the app pushes on its own every {PUSH_INTERVAL_DAYS} days — the first
        time you open it after that long, since a home-screen app can't wake itself
        up. The sheet ends up matching the app exactly, so entries you correct are
        corrected and entries you delete go away. Anything a push would remove is
        counted and shown to you first. Nothing is ever read back out of the sheet,
        so an edit made there is overwritten by the next push.
      </div>
    </div>
  );
}
