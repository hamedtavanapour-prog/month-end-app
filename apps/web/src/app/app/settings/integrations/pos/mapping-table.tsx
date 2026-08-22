"use client";

import { useMemo, useState } from "react";

import { updatePosItemMapping } from "./actions";

type MappingRow = {
  id: string;
  externalItemId: string;
  name: string;
  category: string;
  sku: string;
  status: string;
  target: string;
  targetLabel: string;
};

type MenuTarget = {
  value: string;
  label: string;
};

export function PosMappingTable({ canMap, rows, targets }: { canMap: boolean; rows: MappingRow[]; targets: MenuTarget[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const visible = useMemo(() => rows.filter((row) => {
    const text = `${row.name} ${row.category} ${row.sku} ${row.externalItemId}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (status === "all" || row.status === status);
  }), [query, rows, status]);

  return <section className="pos-card">
    <div className="pos-card-heading">
      <div><p className="eyebrow">Menu mapping</p><h2>External POS items</h2><p>Imported items remain separate until a manager confirms a Month End recipe and size.</p></div>
      <span className="pos-count">{visible.length} of {rows.length}</span>
    </div>
    <div className="pos-filter-row">
      <input aria-label="Search POS items" onChange={(event) => setQuery(event.target.value)} placeholder="Search external items" type="search" value={query} />
      <select aria-label="Filter mapping status" onChange={(event) => setStatus(event.target.value)} value={status}>
        <option value="all">All mapping states</option>
        <option value="unmapped">Unmapped</option>
        <option value="mapped">Mapped</option>
        <option value="needs_review">Needs review</option>
        <option value="ignored">Ignored</option>
      </select>
    </div>
    <div className="pos-mapping-list">
      {visible.length ? visible.map((row) => <form action={updatePosItemMapping} className="pos-mapping-row" key={row.id}>
        <input name="posMenuItemId" type="hidden" value={row.id} />
        <div className="pos-external-item">
          <span className={`pos-status pos-status-${row.status}`}>{row.status.replace("_", " ")}</span>
          <strong>{row.name}</strong>
          <small>{[row.category, row.sku, row.externalItemId].filter(Boolean).join(" · ")}</small>
        </div>
        <label>
          <span>Month End recipe</span>
          <select defaultValue={row.target} disabled={!canMap} name="menuTarget">
            <option value="">Choose menu item and size</option>
            {targets.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}
          </select>
          {row.targetLabel ? <small>Current: {row.targetLabel}</small> : null}
        </label>
        {canMap ? <div className="pos-mapping-actions">
          <button className="pos-primary-button" name="mappingStatus" type="submit" value="mapped">Save mapping</button>
          <button name="mappingStatus" type="submit" value="needs_review">Needs review</button>
          <button name="mappingStatus" type="submit" value="ignored">Ignore</button>
        </div> : null}
      </form>) : <div className="pos-empty">No imported items match this filter.</div>}
    </div>
  </section>;
}
