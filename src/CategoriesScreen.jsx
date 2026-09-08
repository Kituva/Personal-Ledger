/**
 * Every category, in two sections, with a ⋯ on each row.
 *
 * Income first, because it is the shorter list and the reason this screen
 * exists. Order within a section is `pos`, never name — the grid you pick from
 * every day is this same order, and it should not rearrange itself.
 */

import React, { useState } from "react";
import { useCats, canDelete, tint } from "./categories.js";
import { Chevron, More, Plus } from "./icons.jsx";
import CategorySheet from "./CategorySheet.jsx";

function Section({ side, label, list, txns, onEdit, onAdd }) {
  const { cats, deleteCat } = useCats();
  const [open, setOpen] = useState(null);

  return (
    <>
      <div className="catsec">{label} <span className="n">{list.length}</span></div>

      {list.map((c) => {
        const del = canDelete(c, cats, txns);
        const isOpen = open === c.id;
        return (
          <div key={c.id}>
            <button className={`catmanage ${isOpen ? "open" : ""}`}
              onClick={() => setOpen(isOpen ? null : c.id)}
              aria-expanded={isOpen} aria-label={`${c.name} options`}>
              <span className="tile sm" style={{ color: c.c, background: tint(c.c) }}>{c.e}</span>
              <span className="catname">{c.name}</span>
              <span className="catdots"><More /></span>
            </button>

            {isOpen && (
              <div className="catmenu">
                <button onClick={() => { setOpen(null); onEdit(c); }}>Rename or re-icon</button>
                <button className={del.ok ? "del" : ""} disabled={!del.ok}
                  onClick={() => { if (del.ok) { setOpen(null); deleteCat(c.id); } }}>
                  Delete
                </button>
                {!del.ok && <div className="why">{del.reason}</div>}
              </div>
            )}
          </div>
        );
      })}

      <button className="addcat" onClick={() => onAdd(side)}>
        <span className="plus"><Plus /></span>Add {label.toLowerCase()} category
      </button>
    </>
  );
}

export default function CategoriesScreen({ txns, onBack }) {
  const { income, expense, addCat, updateCat } = useCats();
  const [sheet, setSheet] = useState(null);

  const onEdit = (cat) => setSheet({ cat, side: cat.side });
  const onAdd = (side) => setSheet({ cat: null, side });

  const onSave = (cat) => {
    (sheet.cat ? updateCat : addCat)(cat);
    setSheet(null);
  };

  return (
    <div className="scroll">
      <div className="navrow">
        <button className="iconbtn" onClick={onBack} aria-label="Back"><Chevron dir="left" /></button>
        <span className="navtitle">Categories</span>
        <span style={{ width: 40 }} />
      </div>

      <Section side="income" label="Income" list={income}
        txns={txns} onEdit={onEdit} onAdd={onAdd} />
      <Section side="expense" label="Expenses" list={expense}
        txns={txns} onEdit={onEdit} onAdd={onAdd} />

      <div style={{ padding: "18px 4px 20px", fontSize: 12.5, color: "var(--text3)", lineHeight: 1.65 }}>
        A category belongs to one side or the other. Deleting one is blocked
        while entries still use it — change those entries first.
      </div>

      {sheet && (
        <CategorySheet cat={sheet.cat} side={sheet.side} txns={txns}
          onSave={onSave} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}
