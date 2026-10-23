// What's It Worth? — valuation engine (no DOM; runs in the browser and in Node for tests)
(function (root) {
  const PUB = ['performance', 'mechanical', 'sync', 'other'];
  const MAS = ['streaming', 'neighboring', 'sync', 'other'];

  const num = (v) => {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  };
  const pct = (v) => Math.min(Math.max(num(v), 0), 100) / 100;
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);

  // ---------- Quick estimate (artist lookup) ----------
  // Calibrations carried over from v1.
  function quickEstimate(monthlyListeners, songwriterSplitPct) {
    const split = pct(songwriterSplitPct);
    const streams = num(monthlyListeners) * 2.8; // monthly streams
    const yr = 12;
    const spotifyMaster = streams * 0.004 * yr;
    const spotifyPub = streams * 0.001 * split * yr;
    const apple = streams * 0.10 * 0.008 * yr;
    const youtube = streams * 0.35 * 0.002 * yr;
    const master = spotifyMaster + apple + youtube;
    const publishing = spotifyPub;
    const total = master + publishing;
    return {
      streams, spotifyMaster, spotifyPub, apple, youtube, master, publishing, total,
      range: { low: total * 7, mid: total * 12, high: total * 20 },
    };
  }

  // ---------- Full valuation ----------
  function decayForAge(age) {
    if (age < 1) return 0.25;
    if (age < 2) return 0.18;
    if (age < 3) return 0.12;
    if (age < 5) return 0.08;
    if (age < 10) return 0.04;
    if (age < 20) return 0.02;
    return 0.01;
  }

  function yearNet(year, rights, d) {
    const usePub = rights !== 'masters';
    const useMas = rights !== 'publishing';
    const keep = (1 - d.admin);
    const pub = {}, mas = {};
    PUB.forEach((k) => { pub[k] = usePub ? num(year.pub?.[k]) * (1 - d.pubPayout) * keep : 0; });
    MAS.forEach((k) => { mas[k] = useMas ? num(year.mas?.[k]) * (1 - d.masPayout) * keep : 0; });
    const sync = pub.sync + mas.sync;
    const total = sum(Object.values(pub)) + sum(Object.values(mas));
    return { pub, mas, sync, total, recurring: total - sync };
  }

  function valuate(input) {
    const rights = ['publishing', 'masters', 'both'].includes(input.rights) ? input.rights : 'both';
    const d = { pubPayout: pct(input.pubPayout), masPayout: pct(input.masPayout), admin: pct(input.adminFee) };
    const years = (input.years || []).map((y) => ({ label: y.label, ...yearNet(y, rights, d) }));
    const withIncome = years.filter((y) => y.total > 0);
    if (!withIncome.length) return { empty: true };

    const latest = years[years.length - 1];
    const avgSync = sum(withIncome.map((y) => y.sync)) / withIncome.length;
    const normalizeSync = input.normalizeSync !== false;
    const base = latest.recurring + (normalizeSync ? avgSync : latest.sync);

    // Trend: CAGR of recurring (non-sync) net income across years entered
    let cagr = null;
    const rec = withIncome.map((y) => y.recurring).filter((v) => v > 0);
    if (rec.length >= 2) cagr = Math.pow(rec[rec.length - 1] / rec[0], 1 / (rec.length - 1)) - 1;

    // Volatility: coefficient of variation of yearly net totals
    let cv = null;
    if (withIncome.length >= 3) {
      const t = withIncome.map((y) => y.total);
      const m = sum(t) / t.length;
      cv = Math.sqrt(sum(t.map((v) => (v - m) ** 2)) / t.length) / m;
    }

    const dollarAge = Math.max(num(input.dollarAge), 0);
    const topShare = pct(input.topShare);

    // Multiple: base by rights type, then adjustments
    const baseMultiple = { publishing: 13, masters: 11, both: 12 }[rights];
    const adj = [];
    if (dollarAge < 3) adj.push(['Young catalog (dollar age under 3)', -3]);
    else if (dollarAge < 5) adj.push(['Dollar age 3–5 years', -1.5]);
    else if (dollarAge >= 20) adj.push(['Evergreen catalog (dollar age 20+)', 2.5]);
    else if (dollarAge >= 10) adj.push(['Mature catalog (dollar age 10–20)', 1.5]);
    if (topShare > 0.6) adj.push(['Top song is over 60% of income', -1.5]);
    else if (topShare > 0.4) adj.push(['Top song is 40–60% of income', -0.75]);
    else if (topShare > 0 && topShare < 0.2) adj.push(['Well diversified (top song under 20%)', 0.5]);
    if (cv !== null) {
      if (cv > 0.35) adj.push(['Volatile year-to-year income', -1.5]);
      else if (cv > 0.2) adj.push(['Some year-to-year swings', -0.5]);
    }
    if (cagr !== null) {
      if (cagr < -0.15) adj.push(['Steep decline in recurring income', -2]);
      else if (cagr < -0.05) adj.push(['Declining recurring income', -1]);
      else if (cagr > 0.05) adj.push(['Growing recurring income', 1]);
    }
    const mid = Math.min(Math.max(baseMultiple + sum(adj.map((a) => a[1])), 4), 22);
    const multiple = { low: mid * 0.8, mid, high: mid * 1.2 };

    // DCF: 10-year projection with age-based decay + streaming growth, Gordon terminal value
    const r = num(input.discountRate ?? 10) / 100;
    const tg = num(input.terminalGrowth ?? 0) / 100;
    const sg = num(input.streamingGrowth ?? 3) / 100;
    const projection = [];
    let income = base, pv = 0;
    for (let t = 1; t <= 10; t++) {
      const g = sg - decayForAge(dollarAge + t - 1);
      income = income * (1 + g);
      const disc = income / Math.pow(1 + r, t);
      pv += disc;
      projection.push({ year: t, income, pv: disc, growth: g });
    }
    const tv = r > tg ? (income * (1 + tg)) / (r - tg) : 0;
    const pvTV = tv / Math.pow(1 + r, 10);
    const dcf = pv + pvTV;

    // Income mix for the latest year
    const mix = {};
    if (rights !== 'masters') PUB.forEach((k) => { mix['pub_' + k] = latest.pub[k]; });
    if (rights !== 'publishing') MAS.forEach((k) => { mix['mas_' + k] = latest.mas[k]; });

    return {
      rights, years, latest, base, avgSync, normalizeSync, cagr, cv,
      baseMultiple, adj, multiple,
      values: { low: base * multiple.low, mid: base * multiple.mid, high: base * multiple.high },
      dcf: { value: dcf, pvCashFlows: pv, pvTerminal: pvTV, impliedMultiple: base ? dcf / base : 0, projection },
      mix,
    };
  }

  const api = { quickEstimate, valuate, decayForAge, PUB, MAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Valuation = api;
})(typeof window !== 'undefined' ? window : this);
