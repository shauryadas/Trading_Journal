const React = window.React;
const { useEffect, useMemo, useRef, useState } = React;
const html = window.htm.bind(React.createElement);

function BTHeading({ eyebrow, title, description }) {
  return html`<div className="section-heading"><div><div className="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div></div>`;
}
function BTMetric({ label, value, detail, tone = "normal" }) {
  return html`<article className="metric-card"><div className="metric-top"><span>${label}</span><span className="metric-icon">◇</span></div><div className=${"metric-value " + (tone === "green" ? "positive" : tone === "red" ? "negative" : "")}>${value}</div><div className="metric-detail">${detail}</div></article>`;
}

const fmt = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value) || 0);
const pct = (value) => (Number(value) || 0).toFixed(1) + "%";
const makeId = () => globalThis.crypto?.randomUUID ? crypto.randomUUID() : "bt_" + Date.now() + "_" + Math.random().toString(36).slice(2);
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const chronologicalBacktests = (items) => items.map((trade, index) => ({ trade, index })).sort((a, b) => {
  const dateOrder = String(a.trade.date || "").localeCompare(String(b.trade.date || ""));
  if (dateOrder) return dateOrder;
  const aTime = Date.parse(a.trade.createdAt || "");
  const bTime = Date.parse(b.trade.createdAt || "");
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
  return b.index - a.index;
}).map(({ trade }) => trade);

function BTEquityCurve({ trades }) {
  const series = chronologicalBacktests(trades).reduce((points, trade) => {
    const previous = points.length ? points[points.length - 1].value : 0;
    points.push({ date: trade.date, value: previous + (Number(trade.pnl) || 0) });
    return points;
  }, []);
  if (!series.length) return html`<section className="panel bt-equity-panel"><div className="panel-head"><div><div className="eyebrow">PERFORMANCE VISUALIZATION</div><h3>Backtest equity curve</h3><p>Cumulative simulated P&L, in date order.</p></div></div><div className="bt-empty"><strong>Your equity curve will appear here</strong><span>Save backtest trades to build a cumulative performance chart.</span></div></section>`;
  const W = 760, H = 230, L = 20, R = 20, T = 18, B = 28;
  const values = [0, ...series.map((point) => point.value)];
  const low = Math.min(...values), high = Math.max(...values), spread = high - low || Math.max(1, Math.abs(high) * 0.1);
  const min = low - spread * 0.12, max = high + spread * 0.12;
  const x = (index) => L + (index / Math.max(1, series.length)) * (W - L - R);
  const y = (value) => T + ((max - value) / (max - min)) * (H - T - B);
  const points = [{ value: 0 }, ...series].map((point, index) => ({ x: x(index), y: y(point.value), ...point }));
  const path = points.map((point, index) => (index ? "L" : "M") + point.x.toFixed(1) + " " + point.y.toFixed(1)).join(" ");
  const baseline = y(0);
  return html`<section className="panel bt-equity-panel">
    <div className="panel-head"><div><div className="eyebrow">PERFORMANCE VISUALIZATION</div><h3>Backtest equity curve</h3><p>Cumulative simulated P&L across ${series.length} recorded trades, in date order.</p></div><span className="panel-chip">${fmt(series[series.length - 1].value)} cumulative</span></div>
    <div className="bt-equity-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative backtest profit and loss equity curve">
      <line x1=${L} y1=${baseline} x2=${W-R} y2=${baseline} className="bt-equity-zero" />
      <line x1=${L} y1=${T} x2=${L} y2=${H-B} className="bt-equity-axis" />
      <path d=${path} className="bt-equity-line" />
      <text x=${L} y=${H-7} className="bt-equity-label">${series[0].date || "Start"}</text>
      <text x=${W-R} y=${H-7} textAnchor="end" className="bt-equity-label">${series[series.length-1].date || "Latest"}</text>
      <text x=${L+6} y=${Math.max(T+12, baseline-7)} className="bt-equity-label">0</text>
    </svg></div>
  </section>`;
}

function TradingViewChart({ symbol, interval, theme }) {
  const host = useRef(null);
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    root.innerHTML = "";
    const container = document.createElement("div");
    container.className = "tradingview-widget-container";
    container.style.cssText = "height:100%;width:100%";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.cssText = "height:calc(100% - 28px);width:100%";
    const credit = document.createElement("div");
    credit.className = "tradingview-widget-copyright";
    const link = document.createElement("a");
    link.href = "https://www.tradingview.com/";
    link.target = "_blank";
    link.rel = "noopener nofollow";
    link.textContent = "Chart by TradingView";
    credit.appendChild(link);
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.textContent = JSON.stringify({
      autosize: true, symbol: symbol || "NASDAQ:AAPL", interval: interval || "15",
      timezone: "Etc/UTC", theme: theme === "light" ? "light" : "dark",
      style: "1", locale: "en", allow_symbol_change: true, calendar: false,
      hide_side_toolbar: false, hide_top_toolbar: false, hide_legend: false,
      hide_volume: false, withdateranges: true, save_image: true,
      support_host: "https://www.tradingview.com"
    });
    container.append(widget, credit, script);
    root.appendChild(container);
    return () => { root.innerHTML = ""; };
  }, [symbol, interval, theme]);
  return html`<div className="bt-tv-host" ref=${host}><div className="bt-tv-loading">Loading TradingView chart…</div></div>`;
}

function BacktestingPage({ trades = [], onSave, onDelete, theme = "dark" }) {
  const [chartSymbol, setChartSymbol] = useState("NASDAQ:AAPL");
  const [interval, setInterval] = useState("15");
  const [form, setForm] = useState({ date: today(), symbol: "NASDAQ:AAPL", market: "Stocks", timeframe: "15m", strategy: "", side: "Long", entry: "", exit: "", stop: "", quantity: "1", pointValue: "1", fees: "0", notes: "" });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const calc = useMemo(() => {
    const entry = Number(form.entry), exit = Number(form.exit);
    const stop = form.stop === "" ? null : Number(form.stop);
    const qty = Number(form.quantity) || 0, point = form.pointValue === "" ? 1 : Number(form.pointValue), fees = Number(form.fees) || 0;
    const pnl = (form.side === "Short" ? entry - exit : exit - entry) * qty * point - fees;
    const risk = stop == null || !Number.isFinite(stop) ? 0 : Math.abs(entry - stop) * qty * point;
    return { pnl: Number.isFinite(pnl) ? pnl : 0, risk: Number.isFinite(risk) ? risk : 0, r: risk > 0 ? pnl / risk : 0 };
  }, [form]);
  const sorted = useMemo(() => chronologicalBacktests(trades), [trades]);
  const stats = useMemo(() => {
    const wins = trades.filter((t) => Number(t.pnl) > 0), losses = trades.filter((t) => Number(t.pnl) < 0);
    const grossWin = wins.reduce((s, t) => s + Number(t.pnl), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.pnl), 0));
    let equity = 0, peak = 0, maxDD = 0;
    sorted.forEach((t) => { equity += Number(t.pnl) || 0; peak = Math.max(peak, equity); maxDD = Math.max(maxDD, peak - equity); });
    return { pnl: trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0), count: trades.length, winRate: trades.length ? wins.length / trades.length * 100 : 0, pf: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0, avgR: trades.filter((t) => Number(t.riskAmount) > 0).length ? trades.filter((t) => Number(t.riskAmount) > 0).reduce((s, t) => s + (Number(t.rMultiple) || 0), 0) / trades.filter((t) => Number(t.riskAmount) > 0).length : 0, maxDD };
  }, [trades, sorted]);
  const submit = (event) => {
    event.preventDefault();
    if (!form.symbol.trim() || form.entry === "" || form.exit === "" || !(Number(form.quantity) > 0) || (form.pointValue !== "" && !(Number(form.pointValue) > 0)) || Number(form.fees) < 0) return;
    onSave({ ...form, id: makeId(), pnl: calc.pnl, riskAmount: calc.risk, rMultiple: calc.r, entry: Number(form.entry), exit: Number(form.exit), stop: form.stop === "" ? null : Number(form.stop), quantity: Number(form.quantity), pointValue: form.pointValue === "" ? 1 : Number(form.pointValue), fees: Number(form.fees) || 0, createdAt: new Date().toISOString() });
    setForm((current) => ({ ...current, date: today(), entry: "", exit: "", stop: "", notes: "" }));
  };
  const remove = (trade) => { if (window.confirm("Delete this backtest trade?")) onDelete(trade.id); };
  const field = (label, key, type = "text", extra = {}) => html`<label className="field"><span className="field-label">${label}</span><input type=${type} value=${form[key]} onChange=${(e) => set(key, e.target.value)} required=${!!extra.required} step=${extra.step || (type === "number" ? "any" : undefined)} placeholder=${extra.placeholder || ""} /></label>`;
  return html`<div className="page-stack bt-page">
    <${BTHeading} eyebrow="STRATEGY LAB" title="Backtesting" description="Test your setups on historical price action. Backtest trades are stored separately from your live trading journal." />
    <div className="metrics-grid bt-metrics">
      <${BTMetric} label="Net backtest P&L" value=${fmt(stats.pnl)} detail=${stats.count + " simulated trades"} tone=${stats.pnl >= 0 ? "green" : "red"} icon="trend" />
      <${BTMetric} label="Win rate" value=${pct(stats.winRate)} detail="Winning trades ÷ total trades" tone="normal" icon="analytics" />
      <${BTMetric} label="Profit factor" value=${Number.isFinite(stats.pf) ? stats.pf.toFixed(2) : "∞"} detail="Gross profit ÷ gross loss" tone="normal" icon="shield" />
      <${BTMetric} label="Average R" value=${stats.avgR.toFixed(2) + "R"} detail="Average risk multiple" tone="normal" icon="trend" />
      <${BTMetric} label="Max drawdown" value=${fmt(stats.maxDD)} detail="Peak-to-trough backtest P&L" tone="red" icon="analytics" />
    </div>
    <${BTEquityCurve} trades=${trades} />
    <section className="panel bt-chart-panel">
      <div className="panel-head bt-chart-head"><div><div className="eyebrow">TRADINGVIEW · MARKET CHART</div><h3>Chart & historical analysis</h3><p>Use TradingView's symbol search, indicators and drawing tools to review price action.</p></div><a className="btn btn-secondary" href="https://www.tradingview.com/chart/" target="_blank" rel="noopener noreferrer">Open TradingView <span>↗</span></a></div>
      <div className="bt-chart-controls">
        <label className="field"><span className="field-label">Chart symbol</span><input value=${chartSymbol} onChange=${(e) => setChartSymbol(e.target.value.toUpperCase())} placeholder="NASDAQ:AAPL" /></label>
        <label className="field"><span className="field-label">Timeframe</span><select value=${interval} onChange=${(e) => setInterval(e.target.value)}><option value="1">1 minute</option><option value="5">5 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option><option value="240">4 hours</option><option value="D">1 day</option><option value="W">1 week</option><option value="M">1 month</option></select></label>
      </div>
      <${TradingViewChart} symbol=${chartSymbol} interval=${interval} theme=${theme} />
    </section>
    <section className="panel bt-entry-panel">
      <div className="panel-head"><div><div className="eyebrow">RECORD A SIMULATED POSITION</div><h3>Log backtest trade</h3><p>Enter the historical entry and exit you observed on the chart. P&L and R are calculated automatically.</p></div><span className="panel-chip">Separate backtest data</span></div>
      <form className="modal-form bt-form" onSubmit=${submit}>
        <div className="form-grid three">
          ${field("Trade date", "date", "date", { required: true })}
          ${field("Symbol / TradingView ticker", "symbol", "text", { required: true, placeholder: "CME_MINI:NQ1!" })}
          <label className="field"><span className="field-label">Market</span><select value=${form.market} onChange=${(e) => set("market", e.target.value)}><option>Stocks</option><option>Futures</option><option>Forex</option><option>Crypto</option><option>Options</option><option>Other</option></select></label>
          ${field("Strategy / setup", "strategy", "text", { placeholder: "e.g. Opening range breakout" })}
          <label className="field"><span className="field-label">Side</span><select value=${form.side} onChange=${(e) => set("side", e.target.value)}><option>Long</option><option>Short</option></select></label>
          <label className="field"><span className="field-label">Timeframe</span><select value=${form.timeframe} onChange=${(e) => set("timeframe", e.target.value)}><option>1m</option><option>5m</option><option>15m</option><option>30m</option><option>1h</option><option>4h</option><option>1D</option><option>1W</option></select></label>
          ${field("Entry price", "entry", "number", { required: true })}
          ${field("Exit price", "exit", "number", { required: true })}
          ${field("Stop price", "stop", "number")}
          ${field("Quantity", "quantity", "number", { required: true })}
          ${field("Point value / contract multiplier", "pointValue", "number")}
          ${field("Fees ($)", "fees", "number")}
        </div>
        <label className="field"><span className="field-label">Trade notes</span><textarea rows="2" value=${form.notes} onChange=${(e) => set("notes", e.target.value)} placeholder="Entry trigger, market context, rule adherence…" /></label>
        <div className="bt-preview"><div><span>Estimated net P&L</span><strong className=${calc.pnl >= 0 ? "positive" : "negative"}>${fmt(calc.pnl)}</strong></div><div><span>Risk amount</span><strong>${fmt(calc.risk)}</strong></div><div><span>R multiple</span><strong className=${calc.r >= 0 ? "positive" : "negative"}>${calc.r.toFixed(2)}R</strong></div><button className="btn btn-primary" type="submit">Save backtest trade</button></div>
      </form>
    </section>
    <section className="panel bt-history-panel">
      <div className="panel-head"><div><div className="eyebrow">HISTORICAL TEST LOG</div><h3>Backtest trade history</h3></div><span className="panel-chip">${trades.length} trades</span></div>
      ${trades.length ? html`<div className="table-scroll"><table className="data-table"><thead><tr><th>Symbol / setup</th><th>Date</th><th>Side</th><th>Entry → Exit</th><th>Quantity</th><th>Net P&L</th><th>R</th><th></th></tr></thead><tbody>${[...trades].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map((trade) => html`<tr key=${trade.id}><td><div className="symbol-cell"><strong>${trade.symbol}</strong><small>${trade.strategy || "No strategy"} · ${trade.timeframe || "—"}</small></div></td><td>${trade.date}</td><td><span className=${"side-pill " + String(trade.side).toLowerCase()}>${trade.side}</span></td><td>${trade.entry} → ${trade.exit}</td><td>${trade.quantity}</td><td className=${Number(trade.pnl)>=0?"positive":"negative"}>${fmt(trade.pnl)}</td><td>${Number(trade.rMultiple||0).toFixed(2)}R</td><td><button type="button" className="tiny-icon danger" title="Delete backtest trade" onClick=${() => remove(trade)}>×</button></td></tr>` )}</tbody></table></div>` : html`<div className="bt-empty"><strong>No backtest trades yet</strong><span>Review a chart above, then record your first historical setup.</span></div>`}
    </section>
    <div className="helper-note bt-disclaimer"><strong>TradingView integration note</strong> The embedded Advanced Chart provides TradingView market charts and drawing tools. Trade replay, automated strategy execution, and historical candle-data import are not included; record the historical fills you test in the journal below. Data availability and delayed/live status depend on TradingView and the selected exchange.</div>
  </div>`;
}

export { BacktestingPage };