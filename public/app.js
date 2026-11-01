import { BacktestingPage } from "./backtesting.js";
const React = window.React;
const { useEffect, useMemo, useRef, useState } = React;
const createRoot = window.ReactDOM.createRoot;
const htm = window.htm;
const html = htm.bind(React.createElement);
const STORAGE_KEY = "edge-journal-v2";
const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const shiftDate = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : "id_" + Date.now() + "_" + Math.random().toString(36).slice(2));
const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const money = (v, currency = "USD") => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n(v));
  } catch {
    return "$" + n(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
};
const signedMoney = (v, currency = "USD") => (n(v) > 0 ? "+" : "") + money(v, currency);
const shortDate = (iso) => iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
const fullDate = (iso) => iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";
const pnlClass = (v) => n(v) > 0 ? "positive" : n(v) < 0 ? "negative" : "neutral";
const calcPnl = (trade) => {
  if (trade?.entry == null || trade?.exit == null) return n(trade?.pnl);
  const entry = n(trade.entry), exit = n(trade.exit), qty = n(trade.quantity), point = n(trade.pointValue) || 1, fees = n(trade.fees);
  return (trade.side === "Short" ? entry - exit : exit - entry) * qty * point - fees;
};
const calcRisk = (trade) => {
  if (trade?.entry == null || trade?.stop == null) return n(trade?.riskAmount);
  return Math.abs(n(trade.entry) - n(trade.stop)) * n(trade.quantity) * (n(trade.pointValue) || 1);
};
const calcR = (trade) => calcRisk(trade) > 0 ? calcPnl(trade) / calcRisk(trade) : 0;
const clone = (obj) => JSON.parse(JSON.stringify(obj));

const DEMO_DATA = (() => {
  const accounts = [
    { id: "apex-pa", firm: "Apex", accountType: "Futures", accountStage: "Funded", accountStatus: "Active", name: "Apex 50K PA", startingBalance: 50000, dailyLoss: 1000, maxDrawdown: 2500, profitTarget: 3000, consistencyCap: 30 },
    { id: "ftmo-100", firm: "FTMO", accountType: "Forex", accountStage: "Step 1", accountStatus: "Active", name: "FTMO 100K Challenge", startingBalance: 100000, dailyLoss: 5000, maxDrawdown: 10000, profitTarget: 10000, consistencyCap: 30 },
    { id: "topstep-50", firm: "Topstep", accountType: "Futures", accountStage: "Eval", accountStatus: "Active", name: "Topstep 50K Combine", startingBalance: 50000, dailyLoss: 1000, maxDrawdown: 2000, profitTarget: 3000, consistencyCap: 40 }
  ];
  const raw = [
    { accountId: "apex-pa", symbol: "NQ", market: "Futures", side: "Long", date: shiftDate(0), entry: 20000, exit: 20013, stop: 19987, quantity: 1, pointValue: 25, fees: 0, setup: "Opening range breakout", notes: "Waited for retest; clean continuation." },
    { accountId: "ftmo-100", symbol: "EURUSD", market: "Forex", side: "Short", date: shiftDate(-1), entry: 1.085, exit: 1.08275, stop: 1.087, quantity: 1, pointValue: 100000, fees: 0, setup: "London session sweep", notes: "Liquidity sweep into prior day high." },
    { accountId: "apex-pa", symbol: "ES", market: "Futures", side: "Long", date: shiftDate(-2), entry: 6000, exit: 5997.1, stop: 5997, quantity: 1, pointValue: 50, fees: 0, setup: "VWAP reclaim", notes: "Stopped after failed hold." },
    { accountId: "topstep-50", symbol: "MNQ", market: "Futures", side: "Short", date: shiftDate(-3), entry: 20000, exit: 19979, stop: 20021, quantity: 10, pointValue: 2, fees: 0, setup: "Trend pullback", notes: "Lower high confirmation." },
    { accountId: "ftmo-100", symbol: "XAUUSD", market: "Forex", side: "Long", date: shiftDate(-4), entry: 2700, exit: 2703.6, stop: 2696.4, quantity: 1, pointValue: 50, fees: 0, setup: "Demand zone reaction", notes: "Partial taken at first target." },
    { accountId: "apex-pa", symbol: "NQ", market: "Futures", side: "Short", date: shiftDate(-5), entry: 20030, exit: 20033.8, stop: 20040, quantity: 1, pointValue: 25, fees: 0, setup: "Failed breakout", notes: "Entered late; review patience." },
    { accountId: "topstep-50", symbol: "ES", market: "Futures", side: "Long", date: shiftDate(-7), entry: 5990, exit: 5995.2, stop: 5984.8, quantity: 1, pointValue: 50, fees: 0, setup: "Opening drive", notes: "Good execution; trailed behind structure." },
    { accountId: "ftmo-100", symbol: "EURUSD", market: "Forex", side: "Long", date: shiftDate(-9), entry: 1.08, exit: 1.0789, stop: 1.078, quantity: 1, pointValue: 100000, fees: 0, setup: "Range expansion", notes: "Invalidated below the range." }
  ];
  const trades = raw.map((t) => ({ ...t, id: uid(), pnl: calcPnl(t), riskAmount: calcRisk(t), rMultiple: calcR(t) }));
  const playbook = [
    { id: "pb-1", name: "Opening Range Breakout", market: "Futures", bias: "Both", entryRules: "Mark the first 15-minute range. Wait for a decisive close outside the range, then enter on a controlled retest with volume confirmation.", stopRule: "Stop beyond the retest swing or back inside the opening range. Risk fixed at 0.5–1R.", targets: "Scale 50% at 1R; trail the remainder to 2R or next liquidity pool.", notes: "Avoid the first impulsive candle. No trade if the opening range is unusually wide." },
    { id: "pb-2", name: "Session Liquidity Sweep", market: "Forex", bias: "Both", entryRules: "Identify prior session high/low. Wait for a sweep and a close back inside the range; enter on lower-timeframe structure shift.", stopRule: "Beyond the sweep extreme with a small volatility buffer.", targets: "Target opposing session liquidity. Minimum planned reward-to-risk 1.8:1.", notes: "Best during London and New York overlap. Avoid major news releases." },
    { id: "pb-3", name: "VWAP Reclaim", market: "Futures", bias: "Long", entryRules: "Price reclaims VWAP after a failed push lower. Require a higher low and acceptance above VWAP.", stopRule: "Below the higher-low pivot. Exit if price loses VWAP on a closing basis.", targets: "Prior swing high, then 2R extension.", notes: "Prefer alignment with higher-timeframe trend." }
  ];
  return { accounts, trades, playbook, backtests: [] };
})();

const ICONS = {
  overview: "M3 3h7v7H3z M14 3h7v4h-7z M14 10h7v11h-7z M3 13h7v8H3z",
  trades: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  calendar: "M4 5h16a1 1 0 0 1 1 1v14H3V6a1 1 0 0 1 1-1z M8 3v4M16 3v4M3 10h18",
  analytics: "M4 19V5M4 19h17M8 15l3-4 3 2 5-7",
  playbook: "M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2z M5 17a2 2 0 0 1 2-2h12M9 7h6M9 10h5",
  data: "M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3",
  payouts: "M3 7h18M5 7l1 13h12l1-13M9 7V4h6v3m-3 4v5m-2-2 2 2 2-2",
  plus: "M12 5v14M5 12h14",
  search: "M20 20l-4.5-4.5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0z",
  chevron: "m9 18 6-6-6-6",
  left: "m15 18-6-6 6-6",
  right: "m9 18 6-6-6-6",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z",
  trash: "M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m4 4v7m6-7v7",
  close: "M18 6 6 18M6 6l12 12",
  upload: "M12 16V4m0 0L8 8m4-4 4 4M4 16v4h16v-4",
  download: "M12 4v12m0 0 4-4m-4 4-4-4M4 20h16",
  shield: "M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6z M9 12l2 2 4-4",
  trend: "M3 17l6-6 4 4 8-9M15 6h6v6",
  menu: "M4 6h16M4 12h16M4 18h16",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.6 2.8-.2-.1a1.7 1.7 0 0 0-1.9.3l-.1.1h-3.2l-.1-.2a1.7 1.7 0 0 0-1.5-1l-.2.1H8l-.1-.2a1.7 1.7 0 0 0-1.9-.3l-.1.1-1.6-2.8.1-.1a1.7 1.7 0 0 0 .3-1.9l-.1-.2v-2.6l.1-.2a1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.6-2.8.1.1a1.7 1.7 0 0 0 1.9-.3l.1-.1h3.2l.1.2a1.7 1.7 0 0 0 1.5 1l.2-.1H16l.1.2a1.7 1.7 0 0 0 1.9.3l.1-.1 1.6 2.8-.1.1a1.7 1.7 0 0 0-.3 1.9l.1.2v2.6z",
  sun: "M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42m0-12.72-1.42 1.42m-9.88 9.88-1.42 1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z",
  moon: "M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5z"
};
function Icon({ name, size = 18 }) {
  return html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d=${ICONS[name] || ICONS.overview} /></svg>`;
}

function Modal({ title, subtitle, onClose, children, wide = false }) {
  const panelRef = useRef(null);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const previous = document.activeElement;
    const focusable = () => Array.from(panel.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter((node) => !node.hidden && node.getClientRects().length);
    (focusable()[0] || panel).focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); panel.focus(); return; }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    };
    panel.addEventListener("keydown", onKeyDown);
    return () => {
      panel.removeEventListener("keydown", onKeyDown);
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, []);
  return html`<div className="modal-scrim" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref=${panelRef} className=${"modal " + (wide ? "modal-wide" : "")} role="dialog" aria-modal="true" aria-label=${title} tabIndex="-1">
      <header className="modal-head">
        <div><h2>${title}</h2>${subtitle ? html`<p>${subtitle}</p>` : null}</div>
        <button type="button" className="icon-button" onClick=${onClose} aria-label="Close"><${Icon} name="close" /></button>
      </header>
      ${children}
    </section>
  </div>`;
}

function Field({ label, hint, children }) {
  return html`<label className="field"><span className="field-label">${label}</span>${children}${hint ? html`<small>${hint}</small>` : null}</label>`;
}

function MetricCard({ label, value, detail, tone = "normal", icon = "trend" }) {
  return html`<article className="metric-card">
    <div className="metric-top"><span>${label}</span><span className=${"metric-icon " + tone}><${Icon} name=${icon} size=${16} /></span></div>
    <div className=${"metric-value " + (tone === "green" ? "positive" : tone === "red" ? "negative" : "")}>${value}</div>
    <div className="metric-detail">${detail}</div>
  </article>`;
}

function SectionHeading({ eyebrow, title, description, action }) {
  return html`<div className="section-heading">
    <div><div className="eyebrow">${eyebrow}</div><h1>${title}</h1>${description ? html`<p>${description}</p>` : null}</div>
    ${action || null}
  </div>`;
}

function ImageLightbox({ file, onClose }) {
  const panelRef = useRef(null);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const previous = document.activeElement;
    const closeButton = panel.querySelector("button");
    (closeButton || panel).focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key === "Tab") { event.preventDefault(); (panel.querySelector("button") || panel).focus(); }
    };
    panel.addEventListener("keydown", onKeyDown);
    return () => {
      panel.removeEventListener("keydown", onKeyDown);
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, []);
  return html`<div className="media-lightbox" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref=${panelRef} tabIndex="-1" className="media-lightbox-panel" role="dialog" aria-modal="true" aria-label="Trade image preview">
      <div className="media-lightbox-head"><strong>${file.name || "Trade image"}</strong><button type="button" className="icon-button" onClick=${onClose} aria-label="Close image preview"><${Icon} name="close" size=${18} /></button></div>
      <img src=${file.url} alt=${file.name || "Trade image preview"} />
      <div className="media-lightbox-foot">Click outside the image or press the close button to return to the trade log.</div>
    </section>
  </div>`;
}

function TradeTable({ trades, accounts, onEdit, onDelete, compact = false }) {
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const rows = trades;
  const [previewImage, setPreviewImage] = useState(null);
  return html`<div className="table-scroll"><table className="data-table">
    <thead><tr><th>Trade</th><th>Account</th><th>Date</th><th>Side</th><th>Position Size</th><th>Net P&L</th><th>R</th><th>Media</th><th></th></tr></thead>
    <tbody>
      ${rows.length ? rows.map((t) => {
        const attachments = t.media || [];
        const firstImage = attachments.find((file) => file.url);
        return html`<tr key=${t.id}>
        <td><div className="symbol-cell"><strong>${t.symbol}</strong><small>${t.market} · ${t.setup || "No setup"}</small><small className="trade-tags-line">${t.marketBias || "Neutral"} · ${String(t.emotionState || "calm").replace(/^./, (c) => c.toUpperCase())}</small></div></td>
        <td><span className="account-pill">${accountMap[t.accountId]?.firm || "Account"}</span></td>
        <td className="muted-cell">${shortDate(t.date)}</td>
        <td><span className=${"side-pill " + (t.side === "Long" ? "long" : "short")}>${t.side}</span></td>
        <td className="muted-cell">${t.positionSize || "—"}</td>
        <td className=${"mono-cell pnl-cell " + pnlClass(t.pnl)}>${signedMoney(t.pnl)}</td>
        <td className=${"mono-cell " + pnlClass(t.rMultiple)}>${n(t.rMultiple).toFixed(2)}R</td>
        <td className="muted-cell">${firstImage ? html`<button type="button" className="trade-media-trigger" onClick=${() => setPreviewImage(firstImage)} title="Preview attached image"><img src=${firstImage.url} alt=${firstImage.name || "Trade attachment"} /><span>${attachments.length > 1 ? "+" + (attachments.length - 1) : "View"}</span></button>` : attachments.length ? attachments.length + " file(s)" : "—"}</td>
        <td><div className="row-actions"><button type="button" className="tiny-icon" onClick=${() => onEdit(t)} title="Edit" aria-label="Edit trade"><${Icon} name="edit" size=${14} /></button><button type="button" className="tiny-icon danger" onClick=${() => onDelete(t.id)} title="Delete" aria-label="Delete trade"><${Icon} name="trash" size=${14} /></button></div></td>
      </tr>`;
      }) : html`<tr><td colSpan="9"><div className="empty-state small-empty"><strong>No trades found</strong><span>Add a closed trade or adjust your filters.</span></div></td></tr>`}
    </tbody>
  </table>
  ${previewImage ? html`<${ImageLightbox} file=${previewImage} onClose=${() => setPreviewImage(null)} />` : null}
  </div>`;
}

function EquityChart({ series, currency = "USD" }) {
  const [hovered, setHovered] = useState(null);
  const W = 820, H = 300, L = 112, R = 24, T = 22, B = 48;
  const values = series.map((point) => n(point.value));
  const minValue = Math.min(...values), maxValue = Math.max(...values);
  const rawSpread = maxValue - minValue;
  const spread = rawSpread || Math.max(1, Math.abs(maxValue) * 0.002);
  // Wider vertical domain keeps normal daily fluctuations visually restrained.
  const low = minValue - spread * 0.75, high = maxValue + spread * 0.75;
  const plotWidth = W - L - R, plotHeight = H - T - B;
  const x = (index) => L + (series.length <= 1 ? plotWidth / 2 : index / (series.length - 1) * plotWidth);
  const y = (value) => T + (high - value) / (high - low) * plotHeight;
  const points = series.map((point, index) => ({ ...point, x: x(index), y: y(n(point.value)) }));
  const path = points.map((point, index) => (index ? "L" : "M") + point.x.toFixed(1) + " " + point.y.toFixed(1)).join(" ");
  const ticks = Array.from({ length: 5 }, (_, index) => high - (high - low) * index / 4);
  const dateLabel = (point) => point?.start ? "Start" : shortDate(point?.date);
  const labelPoints = [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]];
  const active = hovered && points[hovered.index];
  return html`<div className="chart-wrap">
    <div className="chart-legend"><span><i></i> Portfolio equity</span><strong className="chart-current-value">${money(series[series.length - 1]?.value || 0, currency)}</strong><span className="chart-range">${series.some((point) => !point.start) ? shortDate(series.find((point) => !point.start)?.date) + " — " + shortDate(series[series.length - 1]?.date) : "No closed trades yet"}</span></div>
    <svg className="equity-svg" viewBox=${"0 0 " + W + " " + H} role="img" aria-label="Portfolio equity by trading day">
      ${ticks.map((value) => html`<g><line x1=${L} x2=${W - R} y1=${y(value)} y2=${y(value)} stroke="#263442" strokeWidth="1" /><text x=${L - 12} y=${y(value) + 4} textAnchor="end" fill="#9aa8b8" fontSize="12" fontFamily="inherit">${money(value, currency)}</text></g>`)}
      <path d=${path} fill="none" stroke="#66ff99" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      ${points.length > 1 ? html`<circle cx=${points[points.length - 1].x} cy=${points[points.length - 1].y} r="4" fill="#66ff99" stroke="#0c151e" strokeWidth="2" />` : null}
      ${points.map((point, index) => html`<g onMouseEnter=${() => setHovered({ ...point, index })} onMouseLeave=${() => setHovered(null)}><circle cx=${point.x} cy=${point.y} r="13" fill="transparent" style=${{ cursor: "crosshair" }} /></g>`)}
      ${labelPoints.map((point, index) => html`<text x=${point.x} y=${H - 13} textAnchor=${index === 0 ? "start" : index === 2 ? "end" : "middle"} fill="#8b9aaa" fontSize="12" fontFamily="inherit">${dateLabel(point)}</text>`)}
      ${active ? html`<g pointerEvents="none"><line x1=${active.x} x2=${active.x} y1=${T} y2=${H - B} stroke="#9aa8b8" strokeDasharray="3 4" opacity=".7" /><circle cx=${active.x} cy=${active.y} r="4" fill="#66ff99" stroke="#0c151e" strokeWidth="2" /><g transform=${`translate(${Math.max(L, Math.min(W - 206, active.x + 12))} ${Math.max(T, active.y - 58)})`}><rect width="194" height="50" rx="7" fill="#101a25" stroke="#4b6478" /><text x="11" y="19" fill="#b9c7d5" fontSize="11">${active.start ? "Starting balance" : fullDate(active.date)}</text><text x="11" y="39" fill="#66ff99" fontSize="15" fontWeight="700">${money(active.value, currency)}</text></g></g>` : null}
    </svg>
  </div>`;
}

function TradePnlChart({ trades }) {
  const [hovered, setHovered] = useState(null);
  const daily = {};
  trades.forEach((trade) => { daily[trade.date] = (daily[trade.date] || 0) + n(trade.pnl); });
  const dates = Object.keys(daily).sort();
  let running = 0;
  const series = dates.map((date) => ({ date, value: (running += daily[date]) }));
  if (!series.length) {
    return html`<section className="panel trade-pnl-chart"><div className="panel-head"><div><div className="eyebrow">TRADE PERFORMANCE</div><h3>Cumulative realized P&L</h3></div><span className="panel-chip">No closed trades</span></div><div className="trade-chart-empty">Add trades to build your performance line.</div></section>`;
  }
  const W = 900, H = 190, L = 16, R = 16, T = 14, B = 25;
  const values = series.map((point) => point.value);
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const spread = max - min || Math.max(1, Math.abs(max) * 0.08);
  const low = min - spread * 0.12, high = max + spread * 0.12;
  const x = (index) => L + (series.length === 1 ? (W - L - R) / 2 : index / (series.length - 1) * (W - L - R));
  const y = (value) => T + (high - value) / (high - low) * (H - T - B);
  const points = series.map((point, index) => ({ ...point, x: x(index), y: y(point.value) }));
  const line = points.map((point, index) => (index ? "L" : "M") + point.x.toFixed(1) + " " + point.y.toFixed(1)).join(" ");
  const baseline = y(0);
  const area = line + " L " + points[points.length - 1].x + " " + baseline + " L " + points[0].x + " " + baseline + " Z";
  const last = series[series.length - 1];
  const ticks = [high, (high + low) / 2, low];
  return html`<section className="panel trade-pnl-chart">
    <div className="panel-head"><div><div className="eyebrow">TRADE PERFORMANCE</div><h3>Cumulative realized P&L</h3></div><span className="panel-chip">${series.length} trading days</span></div>
    <div className="chart-wrap trade-chart-wrap">
      <div className="chart-legend"><span><i></i> Running net P&L</span><strong className=${pnlClass(last.value)}>${signedMoney(last.value)}</strong><span className="chart-range">${shortDate(series[0].date)} — ${shortDate(last.date)}</span></div>
      <svg className="equity-svg trade-pnl-svg" viewBox=${"0 0 " + W + " " + H} role="img" aria-label="Cumulative realized trade profit and loss line chart">
        <defs><linearGradient id="trade-pnl-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#66ff99" stopOpacity=".18" /><stop offset="100%" stopColor="#66ff99" stopOpacity="0" /></linearGradient></defs>
        ${ticks.map((value) => html`<g><line x1=${L} x2=${W - R} y1=${y(value)} y2=${y(value)} stroke="#292929" strokeDasharray="3 5" /><text x=${L} y=${y(value) - 5} fill="rgba(255,255,255,.48)" fontSize="10">${money(value)}</text></g>`)}
        <line x1=${L} x2=${W - R} y1=${baseline} y2=${baseline} stroke="rgba(255,255,255,.3)" strokeDasharray="4 4" />
        ${null}
        <path d=${line} fill="none" stroke="#66ff99" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        ${points.map((point, i) => html`<g onMouseEnter=${() => setHovered({ ...point, index: i })} onMouseLeave=${() => setHovered(null)}><circle cx=${point.x} cy=${point.y} r="12" fill="transparent" style=${{ cursor: "crosshair" }} /><circle cx=${point.x} cy=${point.y} r="0" fill="#66ff99" /></g>`) }
        ${hovered ? html`<g pointerEvents="none"><line x1=${hovered.x} x2=${hovered.x} y1=${T} y2=${H - B} stroke="#9aa8b8" strokeDasharray="3 4" opacity=".7" /><circle cx=${hovered.x} cy=${hovered.y} r="0" fill="#66ff99" /><g transform=${`translate(${Math.max(8, Math.min(W - 184, hovered.x + 10))} ${Math.max(4, hovered.y - 54)})`}><rect width="176" height="44" rx="7" fill="#101a25" stroke="#4b6478" /><text x="10" y="17" fill="#b9c7d5" fontSize="10">${fullDate(hovered.date)}</text><text x="10" y="34" fill="#66ff99" fontSize="13" fontWeight="700">${signedMoney(hovered.value)}</text></g></g>` : null}
      </svg>
      <div className="chart-xlabels"><span>${shortDate(series[0].date)}</span><span>${shortDate(series[Math.floor((series.length - 1) / 2)].date)}</span><span>${shortDate(last.date)}</span></div>
    </div>
  </section>`;
}

function AccountHealthStrip({ accountBreakdown }) {
  return html`<section className="panel account-health-panel">
    <div className="panel-head"><div><div className="eyebrow">INDIVIDUAL ACCOUNT LIMITS & P&L</div><h3>Account balance and progress</h3></div><span className="panel-chip">${accountBreakdown.length} ${accountBreakdown.length === 1 ? "account" : "accounts"}</span></div>
    <div className="account-health-list">
      ${accountBreakdown.map(({ account, stats }) => {
        const mll = n(account.maxDrawdown);
        const drawdown = n(stats.pnl);
        const actualMaxDD = n(stats.maxDD);
        const starting = n(account.startingBalance);
        const target = n(account.profitTarget);
        const currentBalance = starting + drawdown;
        const rangeTotal = mll + target;
        const startPosition = rangeTotal > 0 ? mll / rangeTotal * 100 : 50;
        const currentPosition = rangeTotal > 0 ? Math.max(0, Math.min(100, (mll + drawdown) / rangeTotal * 100)) : 50;
        const lossWidth = Math.max(0, startPosition - currentPosition);
        const profitWidth = Math.max(0, currentPosition - startPosition);
        const stage = account.accountStage || "Eval";
        const status = (n(account.maxDrawdown) > 0 && stats.maxDD >= n(account.maxDrawdown)) || (account.accountStatus || "").toLowerCase() === "failed" ? "Failed" : (account.accountStatus || "Active");
        return html`<article className="account-health-card account-range-card" key=${account.id}>
          <div className="account-health-heading"><div><strong>${account.name}</strong><span>${account.firm} · ${account.accountType || (account.firm === "FTMO" ? "Forex" : "Futures")}</span></div><div className="account-tag-row"><span className="account-stage-tag">${stage}</span><span className=${"account-status-tag " + status.toLowerCase()}>${status}</span></div></div>
          <div className="account-range-section">
            <div className="account-range-track" role="img" aria-label=${"Current balance " + money(currentBalance) + "; realized P&L " + signedMoney(drawdown) + "; max drawdown " + money(actualMaxDD) + " of MLL " + (mll > 0 ? money(mll) : "not set") + "; profit target " + (target > 0 ? money(target) : "not set")}>
              <i className="account-range-loss" style=${{ left: currentPosition + "%", width: lossWidth + "%" }}></i>
              <i className="account-range-gain" style=${{ left: startPosition + "%", width: profitWidth + "%" }}></i>
              <b className="account-range-start-marker" style=${{ left: startPosition + "%" }}></b>
              <b className="account-range-current-marker" style=${{ left: currentPosition + "%" }}></b>
            </div>
            <div className="account-range-scale">
              <div className="account-range-end account-range-loss-label"><strong>${mll > 0 ? money(mll) : "—"}</strong><span>MAX LOSS LIMIT</span></div>
              <div className="account-range-start-label"><strong>${money(currentBalance)}</strong><span>CURRENT BALANCE</span><small className=${"account-range-pnl " + (drawdown >= 0 ? "positive" : "negative")}>${signedMoney(drawdown)} P&L · START ${money(starting)}</small></div>
              <div className="account-range-end account-range-target-label"><strong>${target > 0 ? money(target) : "—"}</strong><span>PROFIT TARGET</span></div>
            </div>
          </div>
          ${null}
        </article>`;
      })}
      ${accountBreakdown.length ? null : html`<div className="empty-state small-empty"><strong>No accounts selected</strong><span>Select an account to view its limits and balance.</span></div>`}
    </div>
    <div className="account-health-note">Drawdown and balance use recorded realized trades. Live prop-firm MLL and broker balance feeds are not connected.</div>
  </section>`;
}

function accountMetrics(account, trades) {
  const pnl = trades.reduce((s, t) => s + n(t.pnl), 0);
  const winners = trades.filter((t) => n(t.pnl) > 0);
  const losers = trades.filter((t) => n(t.pnl) < 0);
  const grossWin = winners.reduce((s, t) => s + n(t.pnl), 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + n(t.pnl), 0));
  const days = {};
  trades.forEach((t) => { const day = String(t.date || ""); if (day) days[day] = (days[day] || 0) + n(t.pnl); });
  const activeDays = Object.values(days);
  const positiveDays = activeDays.filter((v) => v > 0).length;
  const bestDay = Math.max(0, ...activeDays);
  const riskValues = trades
    .filter((trade) => Number(trade.riskAmount) > 0 && Number.isFinite(Number(trade.rMultiple)))
    .map((trade) => Number(trade.rMultiple));
  let equity = n(account?.startingBalance), peak = equity, maxDD = 0;
  trades
    .map((trade, index) => ({ trade, index }))
    .sort((a, b) => String(a.trade.date || "").localeCompare(String(b.trade.date || "")) || a.index - b.index)
    .forEach(({ trade }) => {
      equity += n(trade.pnl);
      peak = Math.max(peak, equity);
      maxDD = Math.max(maxDD, peak - equity);
    });
  const todayPnl = trades.filter((t) => t.date === todayISO()).reduce((s, t) => s + n(t.pnl), 0);
  return {
    pnl, count: trades.length, winRate: trades.length ? winners.length / trades.length * 100 : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0,
    avgR: riskValues.length ? riskValues.reduce((s, v) => s + v, 0) / riskValues.length : 0,
    avgWin: winners.length ? grossWin / winners.length : 0,
    avgLoss: losers.length ? grossLoss / losers.length : 0,
    consistency: n(account?.profitTarget) > 0 ? bestDay / n(account.profitTarget) * 100 : 0,
    positiveDays, activeDays: activeDays.length, bestDayShare: n(account?.profitTarget) > 0 ? bestDay / n(account.profitTarget) * 100 : 0,
    bestDay, maxDD, maxDDPct: n(account?.startingBalance) ? maxDD / n(account.startingBalance) * 100 : 0,
    todayPnl
  };
}

function isAccountFailed(account, trades) {
  if (!account) return false;
  if ((account.accountStatus || "").toLowerCase() === "failed") return true;
  const limit = n(account.maxDrawdown);
  if (limit <= 0) return false;
  return accountMetrics(account, trades.filter((trade) => trade.accountId === account.id)).maxDD >= limit;
}

function payoutEligibility(account, trades, payouts, requestAmount = 0) {
  if (!account) return { eligible: false, checks: [], available: 0, metrics: {} };
  const accountTrades = trades.filter((trade) => trade.accountId === account.id);
  const stats = accountMetrics(account, accountTrades);
  const startingBalance = n(account.startingBalance);
  const grossBalance = startingBalance + stats.pnl;
  const safetyNet = n(account.safetyNetBalance);
  const minimumDays = n(account.minimumTradingDays);
  const consistencyCap = n(account.consistencyCap);
  const minimumProfitableDays = n(account.minimumProfitableDays);
  const minimumProfitPerDay = n(account.minimumProfitPerDay);
  const minimumPayoutAmount = n(account.minimumPayoutAmount);
  const minimumProfitAboveSafetyNet = n(account.minimumProfitAboveSafetyNet ?? 500);
  const failed = isAccountFailed(account, trades);
  const stageOk = String(account.accountStage || "").toLowerCase() === "funded";
  const activeOk = !failed && String(account.accountStatus || "Active").toLowerCase() === "active";
  const minDaysOk = minimumDays <= 0 || stats.activeDays >= minimumDays;
  const consistencyTarget = n(account.profitTarget);
  const consistencyPct = consistencyTarget > 0 ? stats.bestDay / consistencyTarget * 100 : 0;
  const consistencyOk = consistencyCap > 0 && consistencyTarget > 0 && consistencyPct <= consistencyCap;
  const byDay = {};
  accountTrades.forEach((trade) => { const day = String(trade.date || ""); if (day) byDay[day] = (byDay[day] || 0) + n(trade.pnl); });
  const profitableDays = Object.values(byDay).filter((value) => value > 0).length;
  const qualifyingProfitDays = Object.values(byDay).filter((value) => minimumProfitPerDay > 0 && value >= minimumProfitPerDay).length;
  const minProfitDaysOk = minimumProfitableDays > 0 && minimumProfitPerDay > 0 && qualifyingProfitDays >= minimumProfitableDays;
  const committed = payouts.filter((payout) => payout.account_id === account.id && ["Requested", "Paid"].includes(payout.status)).reduce((sum, payout) => sum + n(payout.amount), 0);
  const balanceAfterPayouts = grossBalance - committed;
  const safetyNetOk = safetyNet > 0 && balanceAfterPayouts >= safetyNet;
  const profitAboveSafety = safetyNet > 0 ? Math.max(0, Math.min(stats.pnl - committed, balanceAfterPayouts - safetyNet)) : 0;
  const available = Math.max(0, profitAboveSafety);
  const minPayoutOk = minimumPayoutAmount > 0 && n(requestAmount) >= minimumPayoutAmount;
  const profitAboveSafetyOk = minimumProfitAboveSafetyNet > 0 && available >= minimumProfitAboveSafetyNet;
  const checks = [
    { key: "funded", label: "Funded account", passed: stageOk, detail: stageOk ? "Account is in funded stage" : "Payouts are only available on funded accounts" },
    { key: "status", label: "Account active / MLL clear", passed: activeOk, detail: failed ? "Account has failed its MLL" : activeOk ? "No MLL breach recorded" : "Account is not marked Active" },
    { key: "profit", label: "Profit above Safety Net Threshold", passed: profitAboveSafetyOk, detail: "Available above safety net: " + money(available) + " / required " + money(minimumProfitAboveSafetyNet) },
    { key: "profitPositive", label: "Positive available profit", passed: available > 0, detail: available > 0 ? "Available to request: " + money(available) : "No uncommitted realized profit available" },
    { key: "days", label: "Minimum trading days", passed: minDaysOk, detail: minimumDays > 0 ? stats.activeDays + " / " + minimumDays + " distinct days" : "No minimum trading-day requirement configured" },
    { key: "consistency", label: "Consistency rule", passed: consistencyOk, detail: consistencyCap > 0 && consistencyTarget > 0 ? money(stats.bestDay) + " best day / " + money(consistencyTarget) + " profit target = " + consistencyPct.toFixed(1) + "% (max " + consistencyCap + "%)" : "Set a profit target and consistency cap" },
    { key: "safety", label: "Safety-net threshold", passed: safetyNetOk, detail: safetyNet > 0 ? "Protected balance floor: " + money(safetyNet) + " · balance after payouts: " + money(balanceAfterPayouts) : "Set a Safety Net Threshold" },
    { key: "profitDays", label: "Minimum profitable days", passed: minProfitDaysOk, detail: minimumProfitableDays > 0 && minimumProfitPerDay > 0 ? qualifyingProfitDays + " / " + minimumProfitableDays + " days with at least " + money(minimumProfitPerDay) + " profit (" + profitableDays + " green days total)" : "Set both minimum profitable days and minimum profit per day" },
    { key: "minPayout", label: "Minimum payout amount", passed: minPayoutOk, detail: minimumPayoutAmount > 0 ? "Request must be at least " + money(minimumPayoutAmount) : "Set a minimum payout amount" }
  ];
  return { eligible: checks.every((check) => check.passed), checks, available, metrics: { pnl: stats.pnl, balance: grossBalance, balanceAfterPayouts, maxDrawdown: stats.maxDD, activeDays: stats.activeDays, bestDayShare: stats.bestDayShare, safetyNet, committed, profitableDays, qualifyingProfitDays } };
}

function buildEquitySeries(accounts, trades) {
  const start = accounts.reduce((sum, account) => sum + n(account.startingBalance), 0);
  const byDay = {};
  trades.forEach((trade) => { byDay[trade.date] = (byDay[trade.date] || 0) + n(trade.pnl); });
  const dates = Object.keys(byDay).filter(Boolean).sort();
  if (!dates.length) return [{ date: null, value: start, start: true }];
  let running = start;
  const series = [{ date: null, value: start, start: true }];
  dates.forEach((date) => {
    running += byDay[date];
    series.push({ date, value: running });
  });
  return series;
}

function TradeModal({ trade, accounts, trades, initialAccountId, onClose, onSave }) {
  const firstEligibleAccount = accounts.find((account) => !isAccountFailed(account, trades));
  const preferredAccountId = initialAccountId || firstEligibleAccount?.id || accounts[0]?.id || "";
  const [form, setForm] = useState(() => ({
    accountId: trade?.accountId || preferredAccountId,
    symbol: trade?.symbol || "", market: trade?.market || "Futures", side: trade?.side || "Long",
    date: trade?.date || todayISO(), pnl: trade?.pnl ?? "", riskAmount: trade?.riskAmount ?? "",
    setup: trade?.setup || "", notes: trade?.notes || "",
    marketBias: trade?.marketBias || "Neutral",
    emotionState: trade?.emotionState || "calm",
    positionSize: trade?.positionSize || ""
  }));
  const [media, setMedia] = useState(() => trade?.media || []);
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const fileInputRef = useRef(null);
  const newlyUploaded = useRef([]);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const preview = n(form.pnl), risk = n(form.riskAmount), r = risk ? preview / risk : 0;
  const selectedAccount = accounts.find((account) => account.id === form.accountId);
  const blockNewEntry = !trade && isAccountFailed(selectedAccount, trades);
  const prepareTradeImage = async (file) => {
    if (!file || !/^image\/(jpeg|png|webp|gif)$/i.test(file.type || "")) throw new Error("Choose a JPG, PNG, WEBP or GIF image.");
    if (file.size > 20 * 1024 * 1024) throw new Error("Choose an image smaller than 20 MB. Large screenshots are compressed automatically.");
    let bitmap;
    try {
      if (typeof createImageBitmap === "function") bitmap = await createImageBitmap(file);
      else bitmap = await new Promise((resolve, reject) => {
        const image = new Image(); const objectUrl = URL.createObjectURL(file);
        image.onload = () => { URL.revokeObjectURL(objectUrl); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("This image could not be opened. Try JPG or PNG.")); };
        image.src = objectUrl;
      });
    } catch { throw new Error("This image format could not be opened. Please save it as JPG or PNG and try again."); }
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Your browser could not prepare this image.");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (typeof bitmap.close === "function") bitmap.close();
    let blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("Could not compress this image. Please try another file.");
    if (blob.size > 2 * 1024 * 1024) {
      const smaller = document.createElement("canvas");
      smaller.width = Math.max(1, Math.round(canvas.width * 0.78));
      smaller.height = Math.max(1, Math.round(canvas.height * 0.78));
      const smallerContext = smaller.getContext("2d", { alpha: false });
      smallerContext.fillStyle = "#ffffff"; smallerContext.fillRect(0, 0, smaller.width, smaller.height);
      smallerContext.drawImage(canvas, 0, 0, smaller.width, smaller.height);
      blob = await new Promise(resolve => smaller.toBlob(resolve, "image/jpeg", 0.72));
    }
    if (!blob || blob.size > 2 * 1024 * 1024) throw new Error("This image is still too large after compression. Try a smaller screenshot.");
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read the compressed image.")); reader.readAsDataURL(blob);
    });
    return { base64: dataUrl.split(",")[1], filename: (file.name || "trade-image").replace(/\.[^.]+$/, "") + ".jpg" };
  };
  const uploadFile = async (file) => {
    const prepared = await prepareTradeImage(file);
    const response = await fetch("/api/trade-media", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...prepared, contentType: "image/jpeg" }) });
    let result = {}; try { result = await response.json(); } catch {}
    if (response.status === 401 || result.error === "login_required") {
      location.assign("/login?next=" + encodeURIComponent(location.pathname + location.search));
      throw new Error("Please sign in to upload trade images.");
    }
    if (!response.ok) throw new Error(result.error || "Image upload failed. Please try again.");
    return result;
  };
  const uploadSelected = async () => {
    const uploaded = [];
    for (const file of selectedFiles) {
      const result = await uploadFile(file);
      uploaded.push({ key: result.key, name: result.name, contentType: result.contentType, bytes: result.bytes, url: result.url });
      newlyUploaded.current.push(result.key);
    }
    return uploaded;
  };
  const cleanupNewUploads = async () => {
    await Promise.all(newlyUploaded.current.map((key) => fetch("/api/trade-media", {
      method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key })
    }).catch(() => null)));
    newlyUploaded.current = [];
  };
  const close = async () => { await cleanupNewUploads(); onClose(); };
  const submit = async (e) => {
    e.preventDefault();
    if (blockNewEntry) { setMediaError("This account has failed its Maximum Loss Limit (MLL). New trade entries are locked."); return; }
    if (!form.accountId || !form.symbol.trim() || form.pnl === "") return;
    setUploading(true); setMediaError("");
    let uploaded = [];
    try {
      uploaded = await uploadSelected();
      const item = {
        id: trade?.id || uid(), accountId: form.accountId, symbol: form.symbol.trim(),
        market: form.market, side: form.side, date: form.date, setup: form.setup.trim(),
        marketBias: form.marketBias, emotionState: form.emotionState, positionSize: form.positionSize.trim(),
        notes: form.notes, pnl: n(form.pnl), riskAmount: n(form.riskAmount),
        rMultiple: n(form.riskAmount) > 0 ? n(form.pnl) / n(form.riskAmount) : 0,
        media: [...media, ...uploaded]
      };
      const keptKeys = new Set(item.media.map((file) => file.key));
      const removed = (trade?.media || []).filter((file) => file.key && !keptKeys.has(file.key));
      newlyUploaded.current = [];
      onSave(item);
      removed.forEach((file) => fetch("/api/trade-media", {
        method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: file.key })
      }).catch(() => null));
    } catch (error) {
      await cleanupNewUploads();
      setMediaError(error.message || "Could not upload the selected image(s).");
      setUploading(false);
      return;
    }
  };
  return html`<${Modal} title=${trade ? "Edit trade" : "Log a trade"} subtitle="Record the result, your risk and the chart evidence for this trade." onClose=${close} wide=${true}>
    <form className="modal-form" onSubmit=${submit}>
      ${blockNewEntry ? html`<div role="alert" style=${{ marginBottom: "14px", padding: "12px 14px", borderRadius: "8px", border: "1px solid rgba(255,77,77,.4)", background: "rgba(255,77,77,.1)", color: "var(--red, #ff4d4d)" }}><strong>ACCOUNT FAILED — MLL HIT</strong><div style=${{ marginTop: "4px", fontSize: "12px" }}>This account has reached its Maximum Loss Limit. Trade entry is locked. Select an eligible account to continue.</div></div>` : null}
      <div className="form-grid one">
        <${Field} label="Account"><select required value=${form.accountId} onChange=${(e) => set("accountId", e.target.value)}>${accounts.map((a) => html`<option value=${a.id} disabled=${isAccountFailed(a, trades)}>${a.name}${isAccountFailed(a, trades) ? " — FAILED" : ""}</option>`)}</select></${Field}>
      </div>
      <fieldset disabled=${blockNewEntry} style=${{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="form-grid three">
        <${Field} label="Instrument"><input required value=${form.symbol} onChange=${(e) => set("symbol", e.target.value.toUpperCase())} placeholder="e.g. NQ, EURUSD" /></${Field}>
        <${Field} label="Market"><select value=${form.market} onChange=${(e) => set("market", e.target.value)}><option>Futures</option><option>Forex</option><option>Stocks</option><option>Crypto</option><option>Options</option></select></${Field}>
        <${Field} label="Trade date"><input type="date" required value=${form.date} onChange=${(e) => set("date", e.target.value)} /></${Field}>
        <${Field} label="Direction"><select value=${form.side} onChange=${(e) => set("side", e.target.value)}><option>Long</option><option>Short</option></select></${Field}>
        <${Field} label="Setup"><input value=${form.setup} onChange=${(e) => set("setup", e.target.value)} placeholder="Playbook setup" /></${Field}>
      </div>
      <div className="form-grid three trade-context-grid">
        <${Field} label="Market Bias"><select value=${form.marketBias} onChange=${(e) => set("marketBias", e.target.value)}><option>Bullish</option><option>Bearish</option><option>Neutral</option></select></${Field}>
        <${Field} label="Emotion State"><select value=${form.emotionState} onChange=${(e) => set("emotionState", e.target.value)}><option value="calm">Calm</option><option value="focused">Focused</option><option value="confident">Confident</option><option value="anxious">Anxious</option><option value="frustrated">Frustrated</option><option value="discipline">Discipline</option></select></${Field}>
        <${Field} label="Position Size" hint="Enter your actual size, e.g. 2 contracts, 3 micros or 1.5 lots."><input type="text" maxlength="60" value=${form.positionSize} onChange=${(e) => set("positionSize", e.target.value)} placeholder="e.g. 2 contracts or 1.5 lots" /></${Field}>
      </div>
      <div className="form-divider"><span>Trade result</span></div>
      <div className="form-grid two">
        <${Field} label="Net P&L ($)"><input required type="number" step="any" value=${form.pnl} onChange=${(e) => set("pnl", e.target.value)} placeholder="e.g. 250 or -120" /></${Field}>
        <${Field} label="Risk amount ($, optional)"><input type="number" min="0" step="any" value=${form.riskAmount} onChange=${(e) => set("riskAmount", e.target.value)} placeholder="Planned dollar risk" /></${Field}>
      </div>
      <div className="pnl-preview">
        <div><span>Net P&L</span><strong className=${pnlClass(preview)}>${signedMoney(preview)}</strong></div>
        <div><span>Risk amount</span><strong>${money(risk)}</strong></div>
        <div><span>R-multiple</span><strong className=${pnlClass(r)}>${r.toFixed(2)}R</strong></div>
      </div>
      <${Field} label="Trade notes"><textarea rows="3" value=${form.notes} onChange=${(e) => set("notes", e.target.value)} placeholder="Execution quality, emotions, lessons learned…" /></${Field}>
      <div className="media-upload-block">
        <div className="media-upload-head">
          <div><strong>Trade media</strong><small>Attach JPG, PNG, WEBP or GIF screenshots. Images are compressed automatically (20 MB max before compression).</small></div>
          <input ref=${fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden-input" onChange=${(e) => { setSelectedFiles((files) => [...files, ...Array.from(e.target.files || [])]); e.target.value = ""; setMediaError(""); }} />
          <button type="button" className="btn btn-secondary" onClick=${() => fileInputRef.current?.click()}><${Icon} name="upload" size=${15} /> Add media</button>
        </div>
        <div className="media-attachment-grid">
          ${media.map((file) => html`<div className="media-attachment" key=${file.key}>
            ${file.url ? html`<button type="button" className="media-preview-trigger" onClick=${() => setPreviewImage(file)} title="Click to preview image"><img src=${file.url} alt=${file.name || "Trade attachment"} /><span>Click to preview</span></button>` : html`<div className="media-placeholder"><${Icon} name="upload" size=${18} /></div>`}
            <div><span>${file.name || "Trade image"}</span><button type="button" onClick=${() => setMedia((items) => items.filter((item) => item.key !== file.key))}>Remove</button></div>
          </div>`)}
          ${selectedFiles.map((file, index) => html`<div className="media-pending" key=${file.name + file.size + index}><${Icon} name="upload" size=${16} /><span>${file.name}</span><button type="button" onClick=${() => setSelectedFiles((items) => items.filter((_, i) => i !== index))}>Remove</button></div>`)}
        </div>
        ${mediaError ? html`<small className="media-error">${mediaError}</small>` : null}
        ${uploading ? html`<small className="media-uploading">Uploading media and saving trade…</small>` : null}
      </div>
      </fieldset>
      <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick=${close} disabled=${uploading}>Cancel</button><button type="submit" className="btn btn-primary" disabled=${uploading || blockNewEntry}>${blockNewEntry ? "Entry locked" : uploading ? "Saving…" : trade ? "Save changes" : "Add trade"}</button></div>
    </form>
    ${previewImage ? html`<${ImageLightbox} file=${previewImage} onClose=${() => setPreviewImage(null)} />` : null}
  </${Modal}>`;
}

function AccountsModal({ accounts, trades, onClose, onAdd, onUpdate, onDelete }) {
  const emptyForm = () => ({ firm: "Apex", customFirm: "", accountType: "Futures", accountStage: "Eval", accountStatus: "Active", name: "", startingBalance: 50000, dailyLoss: 1000, maxDrawdown: 2500, profitTarget: 3000, consistencyCap: 30, minimumTradingDays: 0, safetyNetBalance: 0, minimumProfitableDays: 0, minimumProfitPerDay: 0, minimumPayoutAmount: 0, minimumProfitAboveSafetyNet: 500 });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const startEdit = (account) => {
    const knownFirms = ["Apex","FTMO","Topstep","TradeDay","My Funded Futures","Take Profit Trader","Alpha Capital","The5ers","Funding Pips","FundedNext"];
    const isCustomFirm = !knownFirms.includes(account.firm);
    setEditingId(account.id);
    setForm({
      ...emptyForm(), ...account,
      firm: isCustomFirm ? "__custom__" : account.firm,
      accountType: account.accountType || (account.firm === "FTMO" ? "Forex" : "Futures"),
      accountStage: account.accountStage || "Eval",
      accountStatus: account.accountStatus || "Active",
      profitTarget: account.profitTarget ?? 0,
      customFirm: isCustomFirm ? account.firm : ""
    });
  };
  const cancelEdit = () => { setEditingId(null); setForm(emptyForm()); };
  const submit = (e) => {
    e.preventDefault();
    const firmName = form.firm === "__custom__" ? form.customFirm.trim() : form.firm;
    if (!form.name.trim() || !firmName) return;
    const { customFirm, ...account } = form;
    const saved = { ...account, firm: firmName, id: editingId || uid(), startingBalance: n(form.startingBalance), dailyLoss: n(form.dailyLoss), maxDrawdown: n(form.maxDrawdown), profitTarget: n(form.profitTarget), consistencyCap: n(form.consistencyCap), minimumTradingDays: n(form.minimumTradingDays), safetyNetBalance: n(form.safetyNetBalance), minimumProfitableDays: n(form.minimumProfitableDays), minimumProfitPerDay: n(form.minimumProfitPerDay), minimumPayoutAmount: n(form.minimumPayoutAmount), minimumProfitAboveSafetyNet: n(form.minimumProfitAboveSafetyNet) };
    delete saved.positiveDrawdownLimitValue;
    if (editingId) onUpdate(saved); else onAdd(saved);
    cancelEdit();
  };
  const accountTypeOf = (a) => a.accountType || (a.firm === "FTMO" ? "Forex" : "Futures");
  const stageOf = (a) => a.accountStage || "Eval";
  const statusOf = (a) => isAccountFailed(a, trades) ? "Failed" : (a.accountStatus || "Active");
  return html`<${Modal} title="Manage accounts" subtitle="Set each prop account's stage, status, market type and performance limits." onClose=${onClose} wide=${true}>
    <div className="account-manage-list">
      ${accounts.map((a) => html`<div className="account-manage-row"><div className="firm-mark">${a.firm.slice(0, 1)}</div><div className="account-manage-name"><strong>${a.name}</strong><span>${a.firm} · ${accountTypeOf(a)} · ${stageOf(a)} · ${money(a.startingBalance)} start</span><div className="account-tag-row"><span className="account-stage-tag">${stageOf(a)}</span><span className=${"account-status-tag " + statusOf(a).toLowerCase()}>${statusOf(a)}</span></div></div><div className="account-limits">Daily ${money(a.dailyLoss)} <i>·</i> MLL ${money(a.maxDrawdown)} <i>·</i> Profit target ${money(a.profitTarget)} <i>·</i> Min days ${n(a.minimumTradingDays) > 0 ? n(a.minimumTradingDays) : "—"}</div><div className="account-row-actions"><button type="button" className="tiny-icon" onClick=${() => startEdit(a)} title="Edit account" aria-label="Edit account"><${Icon} name="edit" size=${14} /></button><button type="button" className="tiny-icon danger" onClick=${() => onDelete(a.id)} title="Delete account" aria-label="Delete account"><${Icon} name="trash" size=${14} /></button></div></div>`)}
      ${accounts.length ? null : html`<div className="empty-state small-empty"><strong>No accounts yet</strong><span>Add your first prop firm account below.</span></div>`}
    </div>
    <div className="form-divider"><span>${editingId ? "Edit account" : "Add account"}</span></div>
    <form className="modal-form" onSubmit=${submit}>
      <div className="form-grid three">
        <${Field} label="Prop firm"><select value=${form.firm} onChange=${(e) => set("firm", e.target.value)}>
          <option value="Apex">Apex</option><option value="FTMO">FTMO</option><option value="Topstep">Topstep</option><option value="TradeDay">TradeDay</option><option value="My Funded Futures">My Funded Futures</option><option value="Take Profit Trader">Take Profit Trader</option><option value="Alpha Capital">Alpha Capital</option><option value="The5ers">The5ers</option><option value="Funding Pips">Funding Pips</option><option value="FundedNext">FundedNext</option><option value="__custom__">＋ Add another prop firm manually</option>
        </select></${Field}>
        <${Field} label="Account type"><select value=${form.accountType} onChange=${(e) => set("accountType", e.target.value)}><option value="Forex">Forex</option><option value="Futures">Futures</option><option value="Crypto">Crypto</option></select></${Field}>
        <${Field} label="Account stage"><select value=${form.accountStage} onChange=${(e) => set("accountStage", e.target.value)}><option>Step 1</option><option>Step 2</option><option>Instant</option><option>Eval</option><option>Funded</option><option>Challenge</option></select></${Field}>
        ${form.accountStage === "Funded" ? html`<${Field} label="Safety Net Threshold ($)"><input type="number" min="0" step="0.01" value=${form.safetyNetBalance} onChange=${(e) => set("safetyNetBalance", e.target.value)} placeholder="Enter safety net threshold" /></${Field}>` : null}
        <${Field} label="Account status"><select value=${form.accountStatus} onChange=${(e) => set("accountStatus", e.target.value)}><option>Active</option><option>Failed</option><option>Pass</option></select></${Field}>
        ${form.firm === "__custom__" ? html`<${Field} label="Custom prop firm name"><input required autoFocus value=${form.customFirm} onChange=${(e) => set("customFirm", e.target.value)} placeholder="Enter prop firm name" /></${Field}>` : null}
        <${Field} label="Account name"><input required value=${form.name} onChange=${(e) => set("name", e.target.value)} placeholder="e.g. Apex 50K PA" /></${Field}>
        <${Field} label="Starting balance ($)"><input type="number" min="0" value=${form.startingBalance} onChange=${(e) => set("startingBalance", e.target.value)} /></${Field}>
        <${Field} label="Maximum daily loss ($)"><input type="number" min="0" value=${form.dailyLoss} onChange=${(e) => set("dailyLoss", e.target.value)} /></${Field}>
        <${Field} label="Maximum drawdown / MLL ($)"><input type="number" min="0" value=${form.maxDrawdown} onChange=${(e) => set("maxDrawdown", e.target.value)} /></${Field}>
        <${Field} label="Profit target ($)"><input type="number" min="0" step="0.01" value=${form.profitTarget} onChange=${(e) => set("profitTarget", e.target.value)} /><small>Consistency is calculated as your best profitable day divided by this target.</small></${Field}>
        <${Field} label="Consistency rule (%)"><input type="number" min="1" max="100" value=${form.consistencyCap} onChange=${(e) => set("consistencyCap", e.target.value)} /></${Field}>
        <${Field} label="Minimum trading days"><select value=${form.minimumTradingDays ?? 0} onChange=${(e) => set("minimumTradingDays", e.target.value)}><option value="0">Not set</option>${Array.from({ length: 30 }, (_, i) => i + 1).map((days) => html`<option value=${days}>${days} ${days === 1 ? "day" : "days"}</option>`)}</select><small>Optional. Leave as Not set when the prop firm\'s rules do not require a minimum.</small></${Field}>
        ${form.accountStage === "Funded" ? html`<${Field} label="Minimum profitable days"><input type="number" min="1" max="30" step="1" value=${form.minimumProfitableDays ?? 0} onChange=${(e) => set("minimumProfitableDays", e.target.value)} placeholder="e.g. 5" /><small>Required for payout eligibility; pair this with a minimum profit per day.</small></${Field}><${Field} label="Minimum profit per day ($)"><input type="number" min="0.01" step="0.01" value=${form.minimumProfitPerDay ?? 0} onChange=${(e) => set("minimumProfitPerDay", e.target.value)} placeholder="e.g. 100" /><small>Required with minimum profitable days to qualify.</small></${Field}><${Field} label="Minimum payout amount ($)"><input type="number" min="0.01" step="0.01" value=${form.minimumPayoutAmount ?? 0} onChange=${(e) => set("minimumPayoutAmount", e.target.value)} placeholder="e.g. 500" /><small>Required minimum request size for this funded account.</small></${Field}>` : null}
      </div>
      <div className="modal-actions">${editingId ? html`<button className="btn btn-ghost" type="button" onClick=${cancelEdit}>Cancel edit</button>` : null}<button className="btn btn-primary" type="submit"><${Icon} name=${editingId ? "edit" : "plus"} size=${15} /> ${editingId ? "Save account" : "Add account"}</button></div>
    </form>
  </${Modal}>`;
}

function PlaybookModal({ item, onClose, onSave }) {
  const [form, setForm] = useState({
    name: item?.name || "", market: item?.market || "Futures", bias: item?.bias || "Both",
    entryRules: item?.entryRules || "", stopRule: item?.stopRule || "", targets: item?.targets || "", notes: item?.notes || ""
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = (e) => { e.preventDefault(); if (!form.name.trim()) return; onSave({ ...form, id: item?.id || uid() }); };
  return html`<${Modal} title=${item ? "Edit playbook setup" : "New playbook setup"} subtitle="Document repeatable rules before the next session." onClose=${onClose} wide=${true}>
    <form className="modal-form" onSubmit=${submit}>
      <div className="form-grid three">
        <${Field} label="Setup name"><input required value=${form.name} onChange=${(e) => set("name", e.target.value)} placeholder="e.g. Opening range breakout" /></${Field}>
        <${Field} label="Market"><select value=${form.market} onChange=${(e) => set("market", e.target.value)}><option>Futures</option><option>Forex</option><option>Stocks</option><option>Crypto</option><option>Options</option><option>Any</option></select></${Field}>
        <${Field} label="Direction bias"><select value=${form.bias} onChange=${(e) => set("bias", e.target.value)}><option>Both</option><option>Long</option><option>Short</option></select></${Field}>
      </div>
      <${Field} label="Entry rules"><textarea required rows="3" value=${form.entryRules} onChange=${(e) => set("entryRules", e.target.value)} placeholder="What must happen before you enter?" /></${Field}>
      <div className="form-grid two">
        <${Field} label="Stop-loss rules"><textarea rows="3" value=${form.stopRule} onChange=${(e) => set("stopRule", e.target.value)} placeholder="Invalidation level and risk rules…" /></${Field}>
        <${Field} label="Targets & trade management"><textarea rows="3" value=${form.targets} onChange=${(e) => set("targets", e.target.value)} placeholder="Profit targets, scaling and trailing…" /></${Field}>
      </div>
      <${Field} label="Notes"><textarea rows="2" value=${form.notes} onChange=${(e) => set("notes", e.target.value)} placeholder="Time of day, conditions, avoidances…" /></${Field}>
      <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick=${onClose}>Cancel</button><button type="submit" className="btn btn-primary">Save setup</button></div>
    </form>
  </${Modal}>`;
}

function Overview({ accounts, trades, metrics, series, accountBreakdown, showAccountPerformance, onNewTrade, onEdit, onDelete, onManage }) {
  const recent = [...trades].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  return html`<div className="page-stack">
    <${SectionHeading} eyebrow="PORTFOLIO SNAPSHOT" title="Overview" description="Your trading performance, consolidated across selected accounts." action=${html`<button type="button" className="btn btn-primary" onClick=${onNewTrade}><${Icon} name="plus" size=${15} /> Log trade</button>`} />
    <div className=${"metrics-grid overview-metrics-grid " + (showAccountPerformance ? "account-workspace-metrics" : "")}>
      <${MetricCard} label="Net realized P&L" value=${signedMoney(metrics.pnl)} detail=${trades.length + " closed trades"} tone=${metrics.pnl >= 0 ? "green" : "red"} icon="trend" />
      <${MetricCard} label="Win rate" value=${metrics.winRate.toFixed(1) + "%"} detail=${metrics.wins + " wins · " + metrics.losses + " losses"} tone="blue" icon="analytics" />
      <${MetricCard} label="Profit factor" value=${metrics.profitFactor === Infinity ? "∞" : metrics.profitFactor.toFixed(2)} detail="Gross profit ÷ gross loss" tone="normal" icon="shield" />
      <${MetricCard} label="Avg. R-multiple" value=${metrics.avgR.toFixed(2) + "R"} detail="Average reward relative to risk" tone=${metrics.avgR >= 0 ? "green" : "red"} icon="trend" />
      ${!showAccountPerformance ? html`<${MetricCard} label="Consistency rule" value=${metrics.consistency.toFixed(1) + "%"} detail="Largest winning day ÷ total profit target" tone="normal" icon="analytics" />` : null}
      <${MetricCard} label="Max drawdown" value=${money(metrics.maxDD)} detail=${(accounts.reduce((sum, account) => sum + n(account.startingBalance), 0) ? (metrics.maxDD / accounts.reduce((sum, account) => sum + n(account.startingBalance), 0) * 100).toFixed(2) + "% of starting balance · trade-by-trade" : "Peak-to-trough realized equity")} tone="red" icon="shield" />
    </div>
    <div className=${"content-grid overview-grid " + (showAccountPerformance ? "" : "single-account-overview")}>
      <section className="panel chart-panel">
        <div className="panel-head"><div><div className="eyebrow">ACCOUNT GROWTH</div><h3>${showAccountPerformance ? "Combined equity curve" : "Account equity curve"}</h3></div><span className="panel-chip">Realized · ${trades.length} trades</span></div>
        <${EquityChart} series=${series} />
      </section>
      ${showAccountPerformance ? html`<section className="panel performance-panel">
        <div className="panel-head"><div><div className="eyebrow">BY ACCOUNT</div><h3>Account performance</h3></div><button type="button" className="text-button" onClick=${onManage}>Manage <${Icon} name="chevron" size=${13} /></button></div>
        <div className="account-performance-list">
          ${accountBreakdown.map(({ account, stats }) => html`<div className="account-performance-row">
            <div className="firm-mark">${account.firm.slice(0, 1)}</div>
            <div className="account-performance-main"><strong>${account.name}</strong><span>${stats.count} trades · ${stats.winRate.toFixed(0)}% win rate</span><div className="mini-track"><i className=${stats.pnl >= 0 ? "bar-green" : "bar-red"} style=${{ width: Math.min(100, Math.max(5, Math.abs(stats.pnl) / Math.max(1, ...accountBreakdown.map((x) => Math.abs(x.stats.pnl))) * 100)) + "%" }} /></div></div>
            <strong className=${"account-pnl " + pnlClass(stats.pnl)}>${signedMoney(stats.pnl)}</strong>
          </div>`)}
          ${accountBreakdown.length ? null : html`<div className="empty-state small-empty"><strong>No accounts</strong><span>Add an account to start tracking.</span></div>`}
        </div>
      </section>` : null}
      ${!showAccountPerformance ? html`<div className="overview-account-health"><${AccountHealthStrip} accountBreakdown=${accountBreakdown} /></div>` : null}
    </div>
    <section className="panel">
      <div className="panel-head"><div><div className="eyebrow">LATEST ACTIVITY</div><h3>Recent trades</h3></div><span className="panel-chip">${recent.length} of ${trades.length} trades</span></div>
      <${TradeTable} trades=${recent} accounts=${accounts} onEdit=${onEdit} onDelete=${onDelete} compact=${true} />
    </section>
  </div>`;
}

function TradeLogs({ trades, accounts, accountBreakdown, onNew, onEdit, onDelete }) {
  const [search, setSearch] = useState("");
  const [result, setResult] = useState("All");
  const [market, setMarket] = useState("All");
  const visible = trades.filter((t) => {
    const q = search.toLowerCase();
    const matches = !q || [t.symbol, t.setup, t.notes, t.market].join(" ").toLowerCase().includes(q);
    return matches && (result === "All" || (result === "Winners" && n(t.pnl) > 0) || (result === "Losers" && n(t.pnl) < 0)) && (market === "All" || t.market === market);
  });
  const sorted = [...visible].sort((a, b) => b.date.localeCompare(a.date));
  return html`<div className="page-stack">
    <${SectionHeading} eyebrow="EXECUTION HISTORY" title="Trade logs" description="Review every closed position and keep your execution data clean." action=${html`<button type="button" className="btn btn-primary" onClick=${onNew}><${Icon} name="plus" size=${15} /> Add trade</button>`} />
    <section className="panel">
      <div className="filter-bar">
        <div className="search-box"><${Icon} name="search" size=${16} /><input placeholder="Search symbol, setup or notes…" value=${search} onChange=${(e) => setSearch(e.target.value)} /></div>
        <select value=${market} onChange=${(e) => setMarket(e.target.value)}><option>All</option><option>Futures</option><option>Forex</option><option>Stocks</option><option>Crypto</option><option>Options</option></select>
        <select value=${result} onChange=${(e) => setResult(e.target.value)}><option>All</option><option>Winners</option><option>Losers</option></select>
        <span className="filter-count">${sorted.length} / ${trades.length} trades</span>
      </div>
      <${TradeTable} trades=${sorted} accounts=${accounts} onEdit=${onEdit} onDelete=${onDelete} />
    </section>
    <${TradePnlChart} trades=${sorted} />
    <div className="helper-note"><${Icon} name="settings" size=${15} /><span>Record net P&L directly, add optional dollar risk, and attach chart screenshots to keep execution evidence with each trade.</span></div>
  </div>`;
}

function CalendarPage({ trades, accounts }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const year = month.getFullYear(), m = month.getMonth();
  const firstDay = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const byDay = {};
  trades.forEach((t) => { byDay[t.date] = (byDay[t.date] || 0) + n(t.pnl); });
  const days = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, i) => new Date(year, m, i - firstDay + 1));
  const monthTrades = trades.filter((t) => t.date.startsWith(year + "-" + String(m + 1).padStart(2, "0")));
  const monthPnl = monthTrades.reduce((s, t) => s + n(t.pnl), 0);
  const greenDays = Object.keys(byDay).filter((d) => d.startsWith(year + "-" + String(m + 1).padStart(2, "0")) && byDay[d] > 0).length;
  const redDays = Object.keys(byDay).filter((d) => d.startsWith(year + "-" + String(m + 1).padStart(2, "0")) && byDay[d] < 0).length;
  const dailyMax = Math.max(1, ...Object.values(byDay).map(Math.abs));
  const changeMonth = (step) => setMonth(new Date(year, m + step, 1));
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const [selectedDay, setSelectedDay] = useState(todayISO());
  const selectedTrades = trades.filter((t) => t.date === selectedDay).sort((a, b) => b.pnl - a.pnl);
  const ddSeries = (() => {
    const daily = {};
    trades.forEach((t) => { daily[t.date] = (daily[t.date] || 0) + n(t.pnl); });
    const dates = Object.keys(daily).sort(); let eq = accounts.reduce((s, a) => s + n(a.startingBalance), 0), peak = eq;
    return dates.map((d) => { eq += daily[d]; peak = Math.max(peak, eq); return { date: d, dd: peak - eq }; });
  })();
  const maxDd = Math.max(0, ...ddSeries.map((x) => x.dd));
  return html`<div className="page-stack">
    <${SectionHeading} eyebrow="DAILY PERFORMANCE" title="Calendar & P&L" description="A day-by-day view of realized results and portfolio drawdown." />
    <div className="metrics-grid three-metrics">
      <${MetricCard} label="Month-to-date P&L" value=${signedMoney(monthPnl)} detail=${monthTrades.length + " closed trades"} tone=${monthPnl >= 0 ? "green" : "red"} icon="calendar" />
      <${MetricCard} label="Green days" value=${String(greenDays)} detail=${redDays + " red days this month"} tone="green" icon="trend" />
      <${MetricCard} label="Max observed drawdown" value=${money(maxDd)} detail="Peak-to-trough realized equity" tone="red" icon="shield" />
    </div>
    <div className="content-grid calendar-grid">
      <section className="panel calendar-panel">
        <div className="calendar-toolbar"><div><div className="eyebrow">MONTHLY HEATMAP</div><h3>${month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h3></div><div className="calendar-nav"><button type="button" className="icon-button" onClick=${() => changeMonth(-1)}><${Icon} name="left" size=${16} /></button><button type="button" className="icon-button" onClick=${() => changeMonth(1)}><${Icon} name="right" size=${16} /></button></div></div>
        <div className="calendar-grid-days">${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => html`<div className="weekday">${d}</div>`)}
          ${days.map((d) => {
            const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
            const inMonth = d.getMonth() === m;
            const value = byDay[iso] || 0;
            const has = Object.prototype.hasOwnProperty.call(byDay, iso);
            const alpha = has ? Math.min(.34, .09 + Math.abs(value) / dailyMax * .25) : 0;
            return html`<button type="button" className=${"calendar-day " + (!inMonth ? "outside " : "") + (selectedDay === iso ? "selected " : "") + (has ? (value >= 0 ? "day-profit" : "day-loss") : "")} style=${has ? { background: value >= 0 ? "rgba(102,255,153," + alpha + ")" : "rgba(255,77,77," + alpha + ")" } : {}} onClick=${() => setSelectedDay(iso)}>
              <span className="day-number">${d.getDate()}</span>${has ? html`<strong className=${pnlClass(value)}>${value > 0 ? "+" : ""}${Math.round(value).toLocaleString("en-US")}</strong><i>${Math.abs(value) > 1000 ? "●●●" : Math.abs(value) > 300 ? "●●" : "●"}</i>` : html`<span className="no-trade">—</span>`}
            </button>`;
          })}
        </div>
        <div className="calendar-legend"><span><i className="legend-dot profit-dot"></i> Profit day</span><span><i className="legend-dot loss-dot"></i> Loss day</span><span><i className="legend-dot no-dot"></i> No trade</span></div>
      </section>
      <section className="panel day-detail-panel">
        <div className="panel-head"><div><div className="eyebrow">DAY DETAIL</div><h3>${fullDate(selectedDay)}</h3></div><span className="panel-chip">${selectedTrades.length} trades</span></div>
        <div className="day-pnl-hero"><span>Daily realized P&L</span><strong className=${pnlClass(selectedTrades.reduce((s, t) => s + n(t.pnl), 0))}>${signedMoney(selectedTrades.reduce((s, t) => s + n(t.pnl), 0))}</strong></div>
        <div className="day-trade-list">
          ${selectedTrades.length ? selectedTrades.map((t) => html`<div className="day-trade"><div><strong>${t.symbol}</strong><span>${accountMap[t.accountId]?.firm || "Account"} · ${t.side}</span></div><strong className=${pnlClass(t.pnl)}>${signedMoney(t.pnl)}</strong></div>`) : html`<div className="empty-state"><div className="empty-icon"><${Icon} name="calendar" size=${21} /></div><strong>No trades on this day</strong><span>Select a highlighted date to inspect its trades.</span></div>`}
        </div>
        <div className="drawdown-summary"><div><span>Current max drawdown</span><strong className="negative">${money(maxDd)}</strong></div><span>Calculated from realized daily equity peaks.</span></div>
      </section>
    </div>
  </div>`;
}

function AnalyticsPage({ accounts, trades, metrics, accountBreakdown }) {
  const daily = {};
  trades.forEach((t) => { daily[t.date] = (daily[t.date] || 0) + n(t.pnl); });
  const dailyEntries = Object.entries(daily).sort((a, b) => a[0].localeCompare(b[0]));
  const best = dailyEntries.reduce((m, x) => Math.max(m, x[1]), 0);
  const worst = dailyEntries.reduce((m, x) => Math.min(m, x[1]), 0);
  const maxAbs = Math.max(1, ...accountBreakdown.map((x) => Math.abs(x.stats.pnl)));
  const starting = accounts.reduce((s, a) => s + n(a.startingBalance), 0);
  const dailyLossLimit = accounts.reduce((s, a) => s + n(a.dailyLoss), 0);
  const todayPnl = trades.filter((t) => t.date === todayISO()).reduce((s, t) => s + n(t.pnl), 0);
  const todayUsage = dailyLossLimit ? Math.max(0, -todayPnl) / dailyLossLimit * 100 : 0;
  const cap = accounts.length ? Math.min(...accounts.map((a) => n(a.consistencyCap) || 100)) : 30;
  return html`<div className="page-stack">
    <${SectionHeading} eyebrow="EDGE & RISK" title="Analytics" description="Measure expectancy, consistency and drawdown discipline across your portfolio." />
    <div className="metrics-grid">
      <${MetricCard} label="Average win" value=${money(metrics.avgWin)} detail="Mean P&L on winning trades" tone="green" icon="trend" />
      <${MetricCard} label="Average loss" value=${money(metrics.avgLoss)} detail="Mean absolute loss" tone="red" icon="shield" />
      <${MetricCard} label="Consistency rule" value=${metrics.consistency.toFixed(1) + "%"} detail="Largest winning day ÷ total profit target" tone="blue" icon="calendar" />
      <${MetricCard} label="Expectancy" value=${signedMoney(metrics.count ? metrics.pnl / metrics.count : 0)} detail="Average P&L per trade" tone=${metrics.pnl >= 0 ? "green" : "red"} icon="analytics" />
    </div>
    <div className="content-grid analytics-grid">
      <section className="panel">
        <div className="panel-head"><div><div className="eyebrow">ACCOUNT RANKING</div><h3>Performance by account</h3></div><span className="panel-chip">Net P&L</span></div>
        <div className="rank-list">${accountBreakdown.map(({ account, stats }) => html`<div className="rank-row">
          <div className="rank-name"><div className="firm-mark">${account.firm.slice(0, 1)}</div><div><strong>${account.name}</strong><span>${stats.count} trades · PF ${stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}</span></div></div>
          <div className="rank-bar-wrap"><div className="rank-bar"><i className=${stats.pnl >= 0 ? "bar-green" : "bar-red"} style=${{ width: Math.max(3, Math.abs(stats.pnl) / maxAbs * 100) + "%" }} /></div><strong className=${"mono-cell " + pnlClass(stats.pnl)}>${signedMoney(stats.pnl)}</strong></div>
        </div>`)}</div>
      </section>
      <section className="panel risk-panel">
        <div className="panel-head"><div><div className="eyebrow">RISK GOVERNANCE</div><h3>Prop firm guardrails</h3></div><span className="status-tag">Monitoring</span></div>
        <div className="risk-meter-block"><div className="risk-meter-label"><span>Daily loss usage</span><strong>${todayUsage.toFixed(1)}%</strong></div><div className="risk-meter"><i className=${todayUsage >= 100 ? "meter-red" : todayUsage >= 70 ? "meter-amber" : "meter-green"} style=${{ width: Math.min(100, todayUsage) + "%" }} /></div><small>${money(Math.max(0, -todayPnl))} used of ${money(dailyLossLimit)} combined daily limits</small></div>
        <div className="risk-meter-block"><div className="risk-meter-label"><span>Best-day concentration</span><strong>${metrics.bestDayShare.toFixed(1)}%</strong></div><div className="risk-meter"><i className=${metrics.bestDayShare > cap ? "meter-amber" : "meter-green"} style=${{ width: Math.min(100, metrics.bestDayShare) + "%" }} /></div><small>Largest winning day ÷ total profit target × 100 · rule ${cap}%</small></div>
        <div className="risk-stats-row"><div><span>Best trading day</span><strong className="positive">${signedMoney(best)}</strong></div><div><span>Worst trading day</span><strong className="negative">${signedMoney(worst)}</strong></div></div>
      </section>
    </div>
    <section className="panel">
      <div className="panel-head"><div><div className="eyebrow">ACCOUNT HEALTH</div><h3>Drawdown & consistency monitor</h3></div><span className="panel-chip">Per-account limits</span></div>
      <div className="health-table-wrap"><table className="data-table health-table"><thead><tr><th>Account</th><th>Net P&L</th><th>Max observed DD</th><th>DD limit</th><th>Consistency</th><th>Daily P&L</th><th>Status</th></tr></thead><tbody>
        ${accountBreakdown.map(({ account, stats, failed }) => {
          const ddUse = account.maxDrawdown ? stats.maxDD / account.maxDrawdown * 100 : 0;
          const dailyUse = account.dailyLoss ? Math.max(0, -stats.todayPnl) / account.dailyLoss * 100 : 0;
          const concentration = stats.bestDayShare;
          const breached = failed || ddUse >= 100 || dailyUse >= 100;
          const watch = ddUse >= 70 || dailyUse >= 70 || concentration > n(account.consistencyCap);
          return html`<tr><td><strong>${account.name}</strong><small>${account.firm}</small></td><td className=${"mono-cell " + pnlClass(stats.pnl)}>${signedMoney(stats.pnl)}</td><td className="mono-cell">${money(stats.maxDD)}</td><td><div className="limit-cell"><span>${ddUse.toFixed(0)}%</span><div className="limit-track"><i style=${{ width: Math.min(100, ddUse) + "%" }} className=${ddUse >= 100 ? "meter-red" : ddUse >= 70 ? "meter-amber" : "meter-green"} /></div></div></td><td className="mono-cell">${concentration.toFixed(1)}% / ${account.consistencyCap}%</td><td className=${"mono-cell " + pnlClass(stats.todayPnl)}>${signedMoney(stats.todayPnl)}</td><td><span className=${"health-status " + (breached ? "breach" : watch ? "watch" : "healthy")}>${failed ? "Failed" : breached ? "Limit hit" : watch ? "Watch" : "On track"}</span></td></tr>`;
        })}
      </tbody></table></div>
      <div className="helper-note"><${Icon} name="shield" size=${15} /><span>Risk checks use recorded, realized trades only. Intraday unrealized drawdown and each firm's live rule engine are not connected.</span></div>
    </section>
  </div>`;
}

function PlaybookPage({ items, onNew, onEdit, onDelete }) {
  return html`<div className="page-stack">
    <${SectionHeading} eyebrow="PROCESS LIBRARY" title="Playbook" description="Turn your best setups into repeatable entry, stop and target rules." action=${html`<button className="btn btn-primary" onClick=${onNew}><${Icon} name="plus" size=${15} /> New setup</button>`} />
    <div className="playbook-grid">
      ${items.map((item, i) => html`<article className="panel playbook-card">
        <div className="playbook-card-top"><span className="playbook-index">0${i + 1}</span><div className="playbook-actions"><button type="button" className="tiny-icon" onClick=${() => onEdit(item)} title="Edit" aria-label="Edit playbook setup"><${Icon} name="edit" size=${14} /></button><button type="button" className="tiny-icon danger" onClick=${() => onDelete(item.id)} title="Delete" aria-label="Delete playbook setup"><${Icon} name="trash" size=${14} /></button></div></div>
        <h3>${item.name}</h3><div className="playbook-tags"><span>${item.market}</span><span>${item.bias}</span></div>
        <div className="playbook-rule"><label>ENTRY CONDITIONS</label><p>${item.entryRules || "No entry rules added yet."}</p></div>
        <div className="rule-pair"><div className="playbook-rule"><label>STOP-LOSS</label><p>${item.stopRule || "Not defined."}</p></div><div className="playbook-rule"><label>TARGETS</label><p>${item.targets || "Not defined."}</p></div></div>
        ${item.notes ? html`<div className="playbook-notes">${item.notes}</div>` : null}
      </article>`)}
      <button type="button" className="add-playbook-card" onClick=${onNew}><span><${Icon} name="plus" size=${22} /></span><strong>Add a new setup</strong><small>Define a repeatable edge</small></button>
    </div>
    ${items.length ? null : html`<section className="panel empty-state"><div className="empty-icon"><${Icon} name="playbook" size=${21} /></div><strong>Your playbook is empty</strong><span>Add a setup with entry, stop-loss and target rules.</span><button className="btn btn-primary" onClick=${onNew}>Create first setup</button></section>`}
  </div>`;
}

function DataCenter({ data, syncStatus, onExportCsv, onExportJson, onImport, onClear, onReset }) {
  const inputRef = useRef(null);
  return html`<div className="page-stack">
    <${SectionHeading} eyebrow="BACKUPS & PREFERENCES" title="Data center" description="Keep a portable backup of your trading journal and manage stored records." />
    <div className="metrics-grid three-metrics">
      <${MetricCard} label="Accounts" value=${String(data.accounts.length)} detail="Connected prop firm accounts" tone="blue" icon="shield" />
      <${MetricCard} label="Trade records" value=${String(data.trades.length)} detail="Closed positions stored" tone="green" icon="trades" />
      <${MetricCard} label="Playbook setups" value=${String(data.playbook.length)} detail="Documented strategies" tone="normal" icon="playbook" />
    </div>
    <section className="panel data-card">
      <div className="data-card-icon"><${Icon} name="download" size=${20} /></div><div className="data-card-copy"><h3>Export journal data</h3><p>Download a CSV of your trade history or a complete JSON backup containing accounts, trades and playbook setups.</p><div className="data-actions"><button className="btn btn-primary" onClick=${onExportCsv}><${Icon} name="download" size=${15} /> Export trades CSV</button><button className="btn btn-secondary" onClick=${onExportJson}><${Icon} name="download" size=${15} /> Full JSON backup</button></div></div>
    </section>
    <section className="panel data-card">
      <div className="data-card-icon blue-icon"><${Icon} name="upload" size=${20} /></div><div className="data-card-copy"><h3>Restore from backup</h3><p>Import a previously exported Trading Journal JSON file. The imported dataset replaces the currently loaded journal.</p><input ref=${inputRef} type="file" accept=".json,application/json" className="hidden-input" onChange=${onImport} /><button className="btn btn-secondary" onClick=${() => inputRef.current?.click()}><${Icon} name="upload" size=${15} /> Import JSON backup</button></div>
    </section>
    <section className="panel data-card">
      <div className="data-card-icon"><${Icon} name="shield" size=${20} /></div><div className="data-card-copy"><h3>Storage & autosave</h3><p>Changes are saved in this browser and synced to your private project database when you are signed in.</p><div className="storage-status"><span className="online-dot"></span><strong>${syncStatus}</strong><span>·</span><span>${data.trades.length + data.accounts.length + data.playbook.length} records tracked</span></div></div>
    </section>
    <section className="panel danger-zone">
      <div><h3>Reset journal</h3><p>Clear trade history or restore the sample workspace. Export a backup first if you need to keep your current records.</p></div>
      <div className="data-actions"><button type="button" className="btn btn-danger" onClick=${onClear}>Clear all trades</button><button type="button" className="btn btn-ghost" onClick=${onReset}>Restore demo data</button></div>
    </section>
    <div className="helper-note"><${Icon} name="shield" size=${15} /><span>CSV exports contain trade rows only. JSON backups include account settings and playbook content. Data is not connected to a broker or prop firm's account feed.</span></div>
  </div>`;
}

function PayoutsPage({ accounts, trades, payouts, onRequest, onUpdateStatus, loading }) {
  const firstFunded = accounts.find((account) => String(account.accountStage || "").toLowerCase() === "funded") || accounts[0];
  const [accountId, setAccountId] = useState(firstFunded?.id || "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const eligibility = payoutEligibility(selectedAccount, trades, payouts, n(amount));
  const pendingTotal = payouts.filter((payout) => payout.status === "Requested").reduce((sum, payout) => sum + n(payout.amount), 0);
  const receivedTotal = payouts.filter((payout) => payout.status === "Paid").reduce((sum, payout) => sum + n(payout.amount), 0);
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!eligibility.eligible) { setError("Complete every required payout condition before requesting."); return; }
    if (!(n(amount) > 0) || n(amount) > eligibility.available + 0.00001) { setError("Enter an amount within the available payout balance."); return; }
    setBusy(true);
    try {
      await onRequest({ accountId, amount: n(amount), note });
      setAmount("");
      setNote("");
    } catch (err) {
      setError(err?.message || "Unable to submit payout request.");
    } finally {
      setBusy(false);
    }
  };
  return html`<div className="payout-page">
    <${SectionHeading} eyebrow="FUNDED ACCOUNT CASH FLOW" title="Payouts" description="Check your funded-account rules, submit a payout request, and keep a permanent record of every request." />
    <div className="payout-summary-grid">
      <article className="payout-summary-card"><span>PAID OUT</span><strong>${money(receivedTotal)}</strong><small>${payouts.filter((payout) => payout.status === "Paid").length} completed payouts</small></article>
      <article className="payout-summary-card"><span>REQUESTED</span><strong>${money(pendingTotal)}</strong><small>${payouts.filter((payout) => payout.status === "Requested").length} awaiting processing</small></article>
      <article className="payout-summary-card"><span>REQUEST HISTORY</span><strong>${payouts.length}</strong><small>All accounts · all statuses</small></article>
    </div>
    <div className="payout-work-grid">
      <section className="panel payout-request-panel">
        <div className="panel-head"><div><div className="eyebrow">ELIGIBILITY CHECK</div><h3>Request a payout</h3></div><span className="panel-chip">Live journal checks</span></div>
        <div className="payout-form-body">
          <${Field} label="Funded account">
            <select value=${accountId} onChange=${(event) => { setAccountId(event.target.value); setError(""); setAmount(""); }}>
              ${accounts.map((account) => html`<option value=${account.id}>${account.name} · ${account.firm} · ${account.accountStage || "Eval"}</option>`)}
            </select>
          </${Field}>
          ${selectedAccount ? html`<div className="payout-account-meta"><span>${selectedAccount.firm || "Prop firm"}</span><strong>${selectedAccount.accountStage || "Eval"}</strong><span>${selectedAccount.accountStatus || "Active"}</span></div>` : html`<div className="payout-empty-inline">Add an account to begin.</div>`}
          <div className="payout-eligibility-head"><div><strong>Eligibility requirements</strong><span>Calculated from saved trade records and account settings</span></div><span className=${"payout-eligibility-state " + (eligibility.eligible ? "is-ready" : "is-blocked")}>${eligibility.eligible ? "Eligible" : "Not eligible"}</span></div>
          <div className="payout-check-list">
            ${eligibility.checks.map((check) => html`<div className="payout-check-row" key=${check.key}><span className=${"payout-check-icon " + (check.passed ? "pass" : "fail")}>${check.passed ? "✓" : "!"}</span><div><strong>${check.label}</strong><small>${check.detail}</small></div><span className="payout-check-status">${check.configured === false ? "Not set" : check.passed ? "Passed" : "Failed"}</span></div>`)}
          </div>
          <div className="payout-available"><span>Account balance after requested / paid payouts</span><strong>${money(eligibility.metrics.balanceAfterPayouts)}</strong></div><div className="payout-available"><span>Available payout balance</span><strong>${money(eligibility.available)}</strong></div>
          <form className="payout-submit-form" onSubmit=${submit}>
            <${Field} label="Request amount (USD)" hint="Cannot exceed available realized profit after pending and paid payouts."><input type="number" min="0.01" max=${eligibility.available} step="0.01" value=${amount} onChange=${(event) => setAmount(event.target.value)} placeholder="0.00" disabled=${!eligibility.checks.filter((check) => check.key !== "minPayout").every((check) => check.passed) || busy} /></${Field}>
            <${Field} label="Note (optional)"><input value=${note} onChange=${(event) => setNote(event.target.value)} maxLength="500" placeholder="Payout cycle, invoice or reference" disabled=${!eligibility.checks.filter((check) => check.key !== "minPayout").every((check) => check.passed) || busy} /></${Field}>
            ${error ? html`<div className="payout-error" role="alert">${error}</div>` : null}
            <button type="submit" className="btn btn-primary payout-submit" disabled=${!eligibility.eligible || busy || !(n(amount) > 0) || n(amount) > eligibility.available}>${busy ? "Submitting request…" : eligibility.eligible ? "Request payout" : "Resolve conditions first"}</button>
          </form>
          <p className="payout-disclaimer">This records a request in your journal; it does not submit to or receive money from the prop firm. Rules vary by firm. Only the conditions configured in this account are checked; confirm any additional firm-specific rules before requesting.</p>
        </div>
      </section>
      <section className="panel payout-rules-panel">
        <div className="panel-head"><div><div className="eyebrow">ACCOUNT RULES</div><h3>What is being checked</h3></div><span className="panel-chip">Per account</span></div>
        <div className="payout-rules-list">
          <div><strong>Funded stage</strong><p>Only accounts set to Funded can request a payout.</p></div>
          <div><strong>Account health / MLL</strong><p>Account must be Active and must not have reached its maximum drawdown limit.</p></div>
          <div><strong>Minimum trading days</strong><p>Uses the account's Minimum trading days setting and counts distinct dates with trades.</p></div>
          <div><strong>Consistency rule</strong><p>Uses the account's consistency percentage and compares the best positive day against the profit target.</p></div>
          <div><strong>Minimum profit above Safety Net Threshold</strong><p>At least $500 (or the account's configured amount) must be available above the safety net before payout eligibility.</p></div>
          <div><strong>Protected safety-net threshold</strong><p>This amount is never included in a payout. Every request is capped so the account balance after pending and paid payouts cannot fall below this protected threshold.</p></div>
          <div><strong>Available profit</strong><p>Paid and pending requests are deducted to prevent requesting the same profit twice.</p></div>
        </div>
      </section>
    </div>
    <section className="panel payout-history-panel">
      <div className="panel-head"><div><div className="eyebrow">DATABASE RECORDS</div><h3>Payout history</h3></div><span className="panel-chip">${payouts.length} records</span></div>
      ${loading ? html`<div className="payout-history-empty">Loading payout history…</div>` : payouts.length ? html`<div className="payout-history-table-wrap"><table className="payout-history-table"><thead><tr><th>Account</th><th>Requested</th><th>Amount</th><th>Status</th><th>Reference / note</th><th>Action</th></tr></thead><tbody>
        ${payouts.map((payout) => html`<tr key=${payout.id}><td><strong>${payout.account_name}</strong><small>${payout.firm || "—"}</small></td><td>${new Date(payout.created_at).toLocaleDateString()}</td><td className="payout-amount-cell">${money(payout.amount, payout.currency || "USD")}</td><td><span className=${"payout-history-status " + String(payout.status).toLowerCase()}>${payout.status}</span></td><td>${payout.note || "—"}</td><td>${payout.status === "Requested" ? html`<div className="payout-row-actions"><button type="button" className="btn btn-secondary" onClick=${() => onUpdateStatus(payout.id, "Paid")}>Mark paid</button><button type="button" className="btn btn-ghost" onClick=${() => onUpdateStatus(payout.id, "Cancelled")}>Cancel</button></div>` : "—"}</td></tr>`)}
      </tbody></table></div>` : html`<div className="payout-history-empty"><strong>No payout requests yet</strong><span>Once you meet the account conditions, submit your first payout request here.</span></div>`}
    </section>
  </div>`;
}

function App() {
  const [data, setData] = useState(() => clone(DEMO_DATA));
  const [page, setPage] = useState("overview");
  const [accountFilter, setAccountFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [payoutLoading, setPayoutLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("Loading saved journal…");
  const [storageKey, setStorageKey] = useState(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("tj-theme") === "light" ? "light" : "dark"; } catch { return "dark"; } });
  const noticeTimer = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("tj-theme", theme); } catch (e) {}
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", theme === "light" ? "#f5f7f5" : "#000000");
  }, [theme]);

  const toast = (message) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2800);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const response = await fetch("/api/payouts", { method: "GET", credentials: "same-origin" });
        if (response.status === 401) { location.replace("/login?next=" + encodeURIComponent(location.pathname + location.search)); return; }
        if (response.ok) {
          const result = await response.json();
          if (alive) setPayouts(Array.isArray(result.payouts) ? result.payouts : []);
        }
      } catch (error) {}
      if (alive) setPayoutLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      let loaded = null;
      let userStorageKey = null;
      try {
        const response = await fetch("/api/journal", { method: "GET", credentials: "same-origin" });
        if (response.status === 401) {
          location.replace("/login?next=" + encodeURIComponent(location.pathname + location.search));
          return;
        }
        if (response.ok) {
          const result = await response.json();
          const ownerId = String(result.ownerId || "").trim();
          if (ownerId) {
            userStorageKey = STORAGE_KEY + ":" + encodeURIComponent(ownerId);
            loaded = result.payload || null;
            if (!loaded) {
              try {
                const local = localStorage.getItem(userStorageKey);
                if (local) loaded = JSON.parse(local);
              } catch (e) {}
            }
          }
        }
      } catch (e) {}
      if (!alive) return;
      if (!userStorageKey) {
        setData(clone(DEMO_DATA));
        setReady(true);
        setSyncStatus("Account not verified · local cache not loaded");
        return;
      }
      if (!loaded || !Array.isArray(loaded.accounts) || !Array.isArray(loaded.trades) || !Array.isArray(loaded.playbook)) loaded = clone(DEMO_DATA);
      if (!Array.isArray(loaded.backtests)) loaded.backtests = [];
      loaded = { ...loaded, accounts: loaded.accounts.map((account) => isAccountFailed(account, loaded.trades) ? { ...account, accountStatus: "Failed" } : account) };
      setStorageKey(userStorageKey);
      setData(loaded);
      setReady(true);
      setSyncStatus("Journal loaded");
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!ready || !storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch (e) {}
    setSyncStatus("Saving changes…");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/journal", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ payload: data })
        });
        if (response.status === 401) {
          location.replace("/login?next=" + encodeURIComponent(location.pathname + location.search));
          return;
        }
        setSyncStatus(response.ok ? "Cloud synced" : "Cloud sync failed · local copy only");
      } catch (e) {
        setSyncStatus("Cloud sync unavailable · local copy only");
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [data, ready, storageKey]);

  const visibleAccounts = useMemo(() => accountFilter === "all" ? data.accounts : data.accounts.filter((a) => a.id === accountFilter), [data.accounts, accountFilter]);
  const visibleTrades = useMemo(() => data.trades.filter((t) => visibleAccounts.some((a) => a.id === t.accountId)), [data.trades, visibleAccounts]);
  const metrics = useMemo(() => {
    const pnl = visibleTrades.reduce((s, t) => s + n(t.pnl), 0);
    const wins = visibleTrades.filter((t) => n(t.pnl) > 0), losses = visibleTrades.filter((t) => n(t.pnl) < 0);
    const grossWin = wins.reduce((s, t) => s + n(t.pnl), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + n(t.pnl), 0));
    const days = {};
    visibleTrades.forEach((t) => { const day = String(t.date || ""); if (day) days[day] = (days[day] || 0) + n(t.pnl); });
    const dayValues = Object.values(days);
    const rValues = visibleTrades
      .filter((trade) => Number(trade.riskAmount) > 0 && Number.isFinite(Number(trade.rMultiple)))
      .map((trade) => Number(trade.rMultiple));
    const bestDay = Math.max(0, ...dayValues);
    const profitTargetTotal = visibleAccounts.reduce((sum, account) => sum + n(account.profitTarget), 0);
    let eq = visibleAccounts.reduce((s, a) => s + n(a.startingBalance), 0), peak = eq, maxDD = 0;
    visibleTrades.map((trade, index) => ({ trade, index })).sort((a, b) => String(a.trade.date || "").localeCompare(String(b.trade.date || "")) || a.index - b.index).forEach(({ trade }) => {
      eq += n(trade.pnl);
      peak = Math.max(peak, eq);
      maxDD = Math.max(maxDD, peak - eq);
    });
    return {
      pnl, count: visibleTrades.length, wins: wins.length, losses: losses.length,
      winRate: visibleTrades.length ? wins.length / visibleTrades.length * 100 : 0,
      profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0,
      avgR: rValues.length ? rValues.reduce((s, v) => s + v, 0) / rValues.length : 0,
      avgWin: wins.length ? grossWin / wins.length : 0, avgLoss: losses.length ? grossLoss / losses.length : 0,
      consistency: profitTargetTotal > 0 ? bestDay / profitTargetTotal * 100 : 0,
      positiveDays: dayValues.filter((v) => v > 0).length, activeDays: dayValues.length,
      bestDayShare: profitTargetTotal > 0 ? bestDay / profitTargetTotal * 100 : 0, maxDD
    };
  }, [visibleAccounts, visibleTrades]);
  const series = useMemo(() => buildEquitySeries(visibleAccounts, visibleTrades), [visibleAccounts, visibleTrades]);
  const accountBreakdown = useMemo(() => visibleAccounts.map((account) => ({ account, stats: accountMetrics(account, data.trades.filter((t) => t.accountId === account.id)), failed: isAccountFailed(account, data.trades) })), [visibleAccounts, data.trades]);

  const requestPayout = async ({ accountId, amount, note }) => {
    const response = await fetch("/api/payouts", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, amount, note })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Payout request could not be saved.");
    setPayouts((current) => [result.payout, ...current]);
    toast("Payout request saved to history");
    return result;
  };
  const updatePayoutStatus = async (id, status) => {
    if (status === "Paid" && !window.confirm("Confirm that this payout has actually been received?")) return;
    const response = await fetch("/api/payouts", {
      method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { toast(result.error || "Could not update payout status"); return; }
    setPayouts((current) => current.map((payout) => payout.id === id ? result.payout : payout));
    toast(status === "Paid" ? "Payout marked as received" : "Payout request cancelled");
  };

  const deleteStoredMedia = (trades) => {
    const keys = trades.flatMap((trade) => (trade.media || []).map((file) => file.key).filter(Boolean));
    keys.forEach((key) => fetch("/api/trade-media", {
      method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key })
    }).catch(() => null));
  };
  const addTrade = (trade) => {
    const existingTrade = data.trades.some((item) => item.id === trade.id);
    const targetAccount = data.accounts.find((account) => account.id === trade.accountId);
    if (!existingTrade && isAccountFailed(targetAccount, data.trades)) {
      toast("Trade entry blocked: this account has failed its MLL.");
      return;
    }
    setData((d) => {
      const nextTrades = [...d.trades.filter((item) => item.id !== trade.id), trade];
      const nextAccounts = d.accounts.map((account) => account.id === trade.accountId && isAccountFailed(account, nextTrades) ? { ...account, accountStatus: "Failed" } : account);
      return { ...d, accounts: nextAccounts, trades: nextTrades };
    });
    setModal(null); toast("Trade saved");
  };
  const deleteTrade = (id) => {
    if (!window.confirm("Delete this trade record?")) return;
    const removed = data.trades.find((trade) => trade.id === id);
    if (removed) deleteStoredMedia([removed]);
    setData((d) => ({ ...d, trades: d.trades.filter((t) => t.id !== id) }));
    toast("Trade deleted");
  };
  const addAccount = (account) => {
    setData((d) => ({ ...d, accounts: [...d.accounts, account] }));
    toast("Account added");
  };
  const updateAccount = (account) => {
    setData((d) => ({ ...d, accounts: d.accounts.map((item) => item.id === account.id ? account : item) }));
    toast("Account updated");
  };
  const deleteAccount = (id) => {
    const linkedTrades = data.trades.filter((t) => t.accountId === id);
    const linked = linkedTrades.length;
    if (!window.confirm("Delete this account and its " + linked + " linked trade(s)?")) return;
    deleteStoredMedia(linkedTrades);
    setData((d) => ({ ...d, accounts: d.accounts.filter((a) => a.id !== id), trades: d.trades.filter((t) => t.accountId !== id) }));
    if (accountFilter === id) setAccountFilter("all");
    toast("Account removed");
  };
  const savePlaybook = (item) => {
    setData((d) => ({ ...d, playbook: [...d.playbook.filter((p) => p.id !== item.id), item] }));
    setModal(null); toast("Playbook setup saved");
  };
  const deletePlaybook = (id) => {
    if (!window.confirm("Delete this playbook setup?")) return;
    setData((d) => ({ ...d, playbook: d.playbook.filter((p) => p.id !== id) }));
    toast("Setup deleted");
  };
  const saveBacktestTrade = (trade) => {
    setData((d) => ({ ...d, backtests: [trade, ...(d.backtests || [])] }));
    toast("Backtest trade saved");
  };
  const deleteBacktestTrade = (id) => {
    setData((d) => ({ ...d, backtests: (d.backtests || []).filter((trade) => trade.id !== id) }));
    toast("Backtest trade deleted");
  };

  const downloadFile = (filename, content, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const exportCsv = () => {
    const columns = ["date","account","firm","accountType","accountStage","accountStatus","startingBalance","profitTarget","symbol","market","side","marketBias","emotionState","positionSize","netPnl","riskAmount","rMultiple","setup","notes","mediaFiles"];
    const rows = data.trades.map((t) => {
      const account = data.accounts.find((a) => a.id === t.accountId);
      return [t.date, account?.name || "", account?.firm || "", account?.accountType || "", account?.accountStage || "Eval", account?.accountStatus || "Active", account?.startingBalance || "", account?.profitTarget || "", t.symbol, t.market, t.side, t.marketBias || "Neutral", t.emotionState || "calm", t.positionSize || "full", t.pnl, t.riskAmount, t.rMultiple, t.setup, t.notes, (t.media || []).map((file) => file.name).join("; ")];
    });
    const csv = [columns, ...rows].map((row) => row.map((cell) => '"' + String(cell ?? "").replace(/"/g, '""') + '"').join(",")).join("\n");
    downloadFile("trading-journal-trades-" + todayISO() + ".csv", csv, "text/csv;charset=utf-8");
    toast("Trade CSV exported");
  };
  const exportJson = () => {
    downloadFile("trading-journal-backup-" + todayISO() + ".json", JSON.stringify({ app: "Trading Journal", version: 1, exportedAt: new Date().toISOString(), data }, null, 2), "application/json");
    toast("JSON backup exported");
  };
  const importJson = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const next = parsed.data || parsed;
        if (!Array.isArray(next.accounts) || !Array.isArray(next.trades) || !Array.isArray(next.playbook)) throw new Error("Invalid backup");
        if (!window.confirm("Replace your current journal with the imported backup?")) return;
        deleteStoredMedia(data.trades);
        setData(next); setAccountFilter("all"); toast("Backup imported");
      } catch (err) { toast("Could not read that backup file"); }
      e.target.value = "";
    };
    reader.readAsText(file);
  };
  const clearTrades = () => {
    if (!window.confirm("Remove every trade from every account? This cannot be undone unless you exported a backup.")) return;
    deleteStoredMedia(data.trades);
    setData((d) => ({ ...d, trades: [] })); toast("Trade history cleared");
  };
  const resetDemo = () => {
    if (!window.confirm("Restore the sample dashboard? This replaces current accounts, trades and playbook.")) return;
    deleteStoredMedia(data.trades);
    setData(clone(DEMO_DATA)); setAccountFilter("all"); toast("Sample data restored");
  };

  const nav = [
    { id: "overview", label: "Overview", icon: "overview", group: "WORKSPACE" },
    { id: "trades", label: "Trade logs", icon: "trades" },
    { id: "calendar", label: "Calendar & P&L", icon: "calendar" },
    { id: "analytics", label: "Analytics", icon: "analytics", group: "ANALYSIS" },
    { id: "backtesting", label: "Backtesting", icon: "trend" },
    { id: "playbook", label: "Playbook", icon: "playbook" },
    { id: "payouts", label: "Payouts", icon: "payouts", group: "FINANCE" },
    { id: "data", label: "Data center", icon: "data", group: "SYSTEM" }
  ];
  const pageTitle = nav.find((item) => item.id === page)?.label || "Overview";
  const pageContent = (() => {
    if (page === "overview") return html`<${Overview} accounts=${visibleAccounts} trades=${visibleTrades} metrics=${metrics} series=${series} accountBreakdown=${accountBreakdown} showAccountPerformance=${accountFilter === "all"} onNewTrade=${() => setModal({ type: "trade" })} onEdit=${(t) => setModal({ type: "trade", trade: t })} onDelete=${deleteTrade} onManage=${() => setModal({ type: "accounts" })} />`;
    if (page === "trades") return html`<${TradeLogs} trades=${visibleTrades} accounts=${visibleAccounts} accountBreakdown=${accountBreakdown} onNew=${() => setModal({ type: "trade" })} onEdit=${(t) => setModal({ type: "trade", trade: t })} onDelete=${deleteTrade} />`;
    if (page === "calendar") return html`<${CalendarPage} trades=${visibleTrades} accounts=${visibleAccounts} />`;
    if (page === "analytics") return html`<${AnalyticsPage} accounts=${visibleAccounts} trades=${visibleTrades} metrics=${metrics} accountBreakdown=${accountBreakdown} />`;
    if (page === "backtesting") return html`<${BacktestingPage} trades=${data.backtests || []} onSave=${saveBacktestTrade} onDelete=${deleteBacktestTrade} theme=${theme} />`;
    if (page === "playbook") return html`<${PlaybookPage} items=${data.playbook} onNew=${() => setModal({ type: "playbook" })} onEdit=${(item) => setModal({ type: "playbook", item })} onDelete=${deletePlaybook} />`;
    if (page === "payouts") return html`<${PayoutsPage} accounts=${data.accounts} trades=${data.trades} payouts=${payouts} onRequest=${requestPayout} onUpdateStatus=${updatePayoutStatus} loading=${payoutLoading} />`;
    return html`<${DataCenter} data=${data} syncStatus=${syncStatus} onExportCsv=${exportCsv} onExportJson=${exportJson} onImport=${importJson} onClear=${clearTrades} onReset=${resetDemo} />`;
  })();

  return html`<div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><img src="/brand-mark.svg?v=15" alt="" /></div><div><strong>TRADING<span>JOURNAL</span></strong><small>TRADING WORKSPACE</small></div></div>
      <div className="sidebar-section">
        ${nav.map((item, i) => html`${item.group ? html`<div className="nav-label">${item.group}</div>` : null}<button type="button" className=${"nav-item " + (page === item.id ? "active" : "")} title=${item.label} aria-label=${item.label} aria-current=${page === item.id ? "page" : undefined} onClick=${() => setPage(item.id)}><${Icon} name=${item.icon} size=${17} /><span>${item.label}</span>${page === item.id ? html`<i className="nav-active-dot"></i>` : null}</button>`)}
      </div>
      <div className="sidebar-bottom">
        <div className="sidebar-account-card"><div className="sidebar-account-head"><span className="online-dot"></span><strong>${data.accounts.filter((account) => !isAccountFailed(account, data.trades) && (account.accountStatus || "Active") === "Active").length} active accounts</strong></div><p>Portfolio tracking is enabled.</p><button onClick=${() => setModal({ type: "accounts" })}>Manage accounts <${Icon} name="chevron" size=${12} /></button></div>
        <div className="profile-row"><div className="profile-avatar">TJ</div><div><strong>My Journal</strong><span>Private workspace</span></div><span className="profile-status"></span></div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left"><div className="breadcrumb">WORKSPACE <span>/</span> <strong>${pageTitle.toUpperCase()}</strong></div><div className="mobile-brand"><div className="brand-mark"><img src="/brand-mark.svg?v=15" alt="" /></div><strong>TRADING JOURNAL</strong></div></div>
        <div className="topbar-actions">
          <div className="sync-indicator"><span className="online-dot"></span><span>${syncStatus}</span></div>
          <button type="button" className="theme-toggle" onClick=${() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label=${theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title=${theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}><${Icon} name=${theme === "dark" ? "sun" : "moon"} size=${16} /><span>${theme === "dark" ? "Light" : "Dark"}</span></button>
          <label className="account-select-wrap"><span>ACCOUNT</span><select value=${accountFilter} onChange=${(e) => setAccountFilter(e.target.value)}><option value="all">All accounts</option>${data.accounts.map((a) => html`<option value=${a.id}>${a.firm} · ${a.accountType || (a.firm === "FTMO" ? "Forex" : "Futures")} · ${a.accountStage || "Eval"} · ${a.name}</option>`)}</select></label>
          <button type="button" className="btn btn-secondary manage-btn" onClick=${() => setModal({ type: "accounts" })}>Accounts <${Icon} name="settings" size=${14} /></button>
        </div>
      </header>
      <div className="page-content">${pageContent}</div>
      <footer className="app-footer"><span>TRADING JOURNAL <i>·</i> PRIVATE TRADING WORKSPACE</span><span>REALIZED DATA ONLY <i>·</i> NOT BROKER CONNECTED</span></footer>
    </main>
    <nav className="mobile-bottom-nav" aria-label="Main navigation">${nav.map((item) => html`<button type="button" className=${"mobile-nav-item " + (page === item.id ? "active" : "")} onClick=${() => setPage(item.id)} aria-current=${page === item.id ? "page" : undefined}><${Icon} name=${item.icon} size=${17} /><span>${item.label === "Calendar & P&L" ? "Calendar" : item.label === "Trade logs" ? "Trades" : item.label === "Data center" ? "Data" : item.label}</span></button>`)}</nav>
    ${modal?.type === "trade" ? html`<${TradeModal} trade=${modal.trade} accounts=${data.accounts} trades=${data.trades} initialAccountId=${accountFilter === "all" ? data.accounts[0]?.id : accountFilter} onClose=${() => setModal(null)} onSave=${addTrade} />` : null}
    ${modal?.type === "accounts" ? html`<${AccountsModal} accounts=${data.accounts} trades=${data.trades} onClose=${() => setModal(null)} onAdd=${addAccount} onUpdate=${updateAccount} onDelete=${deleteAccount} />` : null}
    ${modal?.type === "playbook" ? html`<${PlaybookModal} item=${modal.item} onClose=${() => setModal(null)} onSave=${savePlaybook} />` : null}
    ${notice ? html`<div className="toast"><span className="toast-check">✓</span>${notice}</div>` : null}
  </div>`;
}

createRoot(document.getElementById("root")).render(html`<${App} />`);