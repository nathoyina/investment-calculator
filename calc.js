(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EtfCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
/**
 * Portfolio math for a Singapore all-equity plan.
 * Index returns are through 30 Sep 2026. They are not forecasts.
 */

const AS_OF = "30 Sep 2026";

/** MSCI factsheet, gross total return, USD, 30 Sep 2026. */
const CORES = {
  allworld: {
    id: "allworld",
    label: "All-world core",
    etf: "VWRA",
    detail: "Vanguard FTSE All-World fund, accumulating, priced in US dollars, listed in London",
    proxy: "MSCI ACWI gross total return, USD",
    ter: 0.0019,
    returns: { y3: 0.2225, y5: 0.1208, y10: 0.1292, long: 0.0889 },
  },
  developed: {
    id: "developed",
    label: "Developed-markets core",
    etf: "XWR",
    detail: "Xtrackers MSCI World fund, listed on the Singapore exchange, traded in Singapore dollars",
    proxy: "MSCI World gross total return, USD",
    ter: 0.0012,
    returns: { y3: 0.2191, y5: 0.1239, y10: 0.1337, long: 0.0902 },
  },
};

/**
 * Nasdaq-100 price index (NDX), not total return.
 * 3-year annualized is from the factsheet chart cumulative of 106.65%.
 * 5-year and 10-year are from cumulative price returns of 107.01% and 523.67%.
 */
const RISK_RETURNS = {
  y3: 0.2737,
  y5: 0.1566,
  y10: 0.2009,
};

const RISK_FUND = {
  allworld: {
    etf: "CNDX",
    detail: "iShares Nasdaq 100 fund, accumulating, priced in US dollars, listed in London",
    ter: 0.003,
  },
  developed: {
    etf: "XND",
    detail: "Xtrackers Nasdaq 100 fund, listed on the Singapore exchange, traded in Singapore dollars",
    ter: 0.002,
  },
};

const WINDOWS = {
  y3: {
    label: "Last 3 years",
    caution: true,
  },
  y5: {
    label: "Last 5 years",
    caution: false,
  },
  y10: {
    label: "Last 10 years",
    caution: false,
  },
  long: {
    label: "Since 1988, no tech premium",
    caution: false,
  },
};

const MAX_RISK = 0.45;

/**
 * Peak-to-trough max loss, and best calendar-year gain.
 * ACWI / World loss and the 2019 gains: MSCI factsheet, gross USD, 30 Sep 2026.
 * The 2019 figures are the best years in that factsheet's 2012–2025 table.
 * Nasdaq loss: QQQ price, March 2000–October 2002.
 * Nasdaq gain: Nasdaq-100 price return, calendar 1999.
 */
const EXTREMES = {
  allworld: { maxLoss: 0.5806, maxGain: 0.273, lossWhen: "Oct 2007–Mar 2009", gainWhen: "2019" },
  developed: { maxLoss: 0.5746, maxGain: 0.284, lossWhen: "Oct 2007–Mar 2009", gainWhen: "2019" },
  nasdaq: { maxLoss: 0.83, maxGain: 1.0195, lossWhen: "Mar 2000–Oct 2002", gainWhen: "1999" },
};

/**
 * iShares Core Global Aggregate Bond, USD hedged, accumulating, Ireland, London.
 * Returns and maxGain: BlackRock factsheet, USD, 30 Sep 2026. NAV, already after the 0.10% fee.
 * 3-year 4.16%, 5-year 0.10%, since inception 1.52%. Calendar 2022 was −11.65%.
 * Launched 21 Nov 2017, so there is no 10-year figure. 2019 is the best calendar year on that factsheet (8.03%).
 * maxLoss: week-end London closes in US dollars, 5.786 on 7 Dec 2020 to 4.892 on 16 Oct 2022 (Yahoo Finance AGGU.L).
 */
const BOND = {
  etf: "AGGU",
  detail: "iShares Core Global Aggregate Bond fund, accumulating, hedged to US dollars, listed in London",
  ter: 0.001,
  netY3: 0.0416,
  netY5: 0.001,
  netSince: 0.0152,
  calendar2022: 0.1165,
  maxLoss: 0.154511,
  maxGain: 0.0803,
  lossWhen: "7 Dec 2020–16 Oct 2022",
  gainWhen: "2019",
  /** BlackRock factsheet, October 2026. Yield to worst is not a planning rate. */
  duration: 6.02,
  yieldToWorst: 0.0447,
};

const VENUES = {
  lse: { id: "lse", coreId: "allworld", label: "Ireland-domiciled" },
  sgx: { id: "sgx", coreId: "developed", label: "SGX" },
};

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function planRates({ coreId, venueId, windowId, riskWeight, subtractFees }) {
  const venue = VENUES[venueId];
  const core = CORES[venue ? venue.coreId : coreId] ?? CORES.allworld;
  const windowKey = WINDOWS[windowId] ? windowId : "y10";
  const riskW = clamp(riskWeight, 0, MAX_RISK);
  const coreW = 1 - riskW;
  const coreR = core.returns[windowKey];
  const riskR = windowKey === "long" ? coreR : RISK_RETURNS[windowKey];
  const riskFund = RISK_FUND[core.id];
  const gross = coreW * coreR + riskW * riskR;
  const ter = coreW * core.ter + riskW * riskFund.ter;
  const annual = subtractFees ? gross - ter : gross;
  const coreExtreme = EXTREMES[core.id];
  const nasdaqExtreme = EXTREMES.nasdaq;
  const maxLoss = coreW * coreExtreme.maxLoss + riskW * nasdaqExtreme.maxLoss;
  const maxGain = coreW * coreExtreme.maxGain + riskW * nasdaqExtreme.maxGain;
  return {
    core,
    venue: venue ?? null,
    riskFund,
    windowKey,
    caution: WINDOWS[windowKey].caution,
    riskW,
    coreW,
    coreR,
    riskR,
    gross,
    ter,
    annual,
    maxLoss,
    maxGain,
    coreExtreme,
    nasdaqExtreme,
  };
}

/**
 * Month-end contributions. Existing balance compounds, then the contribution
 * is added. Nominal rate, no inflation, no FX move.
 */
function project({ start, monthly, years, annualRate }) {
  const safeYears = clamp(Math.round(years), 1, 50);
  const safeStart = Math.max(0, start);
  const safeMonthly = Math.max(0, monthly);
  const rate = clamp(annualRate, -0.9, 1);
  const r = Math.pow(1 + rate, 1 / 12) - 1;
  const months = safeYears * 12;
  let balance = safeStart;
  let contributed = safeStart;
  const yearly = [{ year: 0, balance: safeStart, contributed: safeStart }];

  for (let m = 1; m <= months; m++) {
    balance = balance * (1 + r) + safeMonthly;
    contributed += safeMonthly;
    if (m % 12 === 0) {
      yearly.push({
        year: m / 12,
        balance,
        contributed,
      });
    }
  }

  return {
    years: safeYears,
    balance,
    contributed,
    growth: balance - contributed,
    yearly,
  };
}

function chartTicks(yearly) {
  const last = yearly[yearly.length - 1]?.year ?? 0;
  return yearly.filter((point) => point.year % 5 === 0 || point.year === last);
}

function formatSgd(n) {
  return `S$${Math.round(n).toLocaleString("en-SG")}`;
}

function formatPct(n) {
  return `${(n * 100).toFixed(2)}%`;
}

function formatTer(n, digits) {
  return `${(n * 100).toFixed(digits)}%`;
}

/**
 * Quiz loss answers, 20 points apart. 0.2 and 0.4 need the bond fund,
 * because the share funds alone have already fallen about 58%.
 * 0.6 keeps a small Nasdaq slice. 0.8 allows the largest Nasdaq slice.
 */
const LOSS_LIMIT = {
  "0.20": 0.2,
  "0.40": 0.4,
  "0.60": 0.6,
  "0.80": 0.8,
};

function lossLimitFor(loss) {
  const key = Number(loss).toFixed(2);
  if (Object.prototype.hasOwnProperty.call(LOSS_LIMIT, key)) return LOSS_LIMIT[key];
  const n = Number(loss);
  return Number.isFinite(n) ? n : null;
}

const HORIZONS = {
  under7: { years: 5, cap: 0 },
  mid: { years: 10, cap: 0.15 },
  long: { years: 20, cap: MAX_RISK },
};

const GAIN_LABEL = { 0.2: "20%", 0.4: "40%", 0.6: "60%" };

function sleeveWeights() {
  const weights = [];
  for (let pct = 0; pct <= MAX_RISK * 100; pct += 5) weights.push(pct / 100);
  return weights;
}

function bondMixRates({ equityWeight, windowId, subtractFees }) {
  const equityW = clamp(equityWeight, 0, 1);
  const bondW = 1 - equityW;
  const equity = CORES.allworld;
  const windowKey = WINDOWS[windowId] ? windowId : "y10";
  const bondNet = windowKey === "y3" ? BOND.netY3 : windowKey === "y5" ? BOND.netY5 : BOND.netSince;
  const equityGross = equity.returns[windowKey];
  const gross = bondW * (bondNet + BOND.ter) + equityW * equityGross;
  const ter = bondW * BOND.ter + equityW * equity.ter;
  const annual = subtractFees ? gross - ter : gross;
  return {
    bondW,
    equityW,
    annual,
    gross,
    ter,
    maxLoss: bondW * BOND.maxLoss + equityW * EXTREMES.allworld.maxLoss,
    maxGain: bondW * BOND.maxGain + equityW * EXTREMES.allworld.maxGain,
    equity,
    bond: BOND,
    coreExtreme: EXTREMES.allworld,
    windowKey,
    caution: WINDOWS[windowKey].caution,
    bondSinceLaunch: windowKey !== "y3" && windowKey !== "y5",
  };
}

function calmMix(equityWeight) {
  const rates = bondMixRates({ equityWeight, windowId: "y10", subtractFees: true });
  return {
    bondW: rates.bondW,
    equityW: rates.equityW,
    annual: rates.annual,
    ter: rates.ter,
    maxLoss: rates.maxLoss,
    maxGain: rates.maxGain,
    equity: rates.equity,
  };
}

function nasdaqLines(ter) {
  const extreme = EXTREMES.nasdaq;
  return [
    `Yearly fee ${formatTer(ter, 2)}. It holds about 100 of the largest companies on the Nasdaq exchange, excluding financial companies. The world fund already holds the US market, so this plan does not add a separate S&P 500 fund.`,
    `The rates are the Nasdaq-100 price index through ${AS_OF}, so dividends are not in the number: ${formatPct(RISK_RETURNS.y10)} a year over 10 years. The deepest fall, using the QQQ price, was ${formatPct(extreme.maxLoss)}, from ${extreme.lossWhen}. The best calendar year was ${extreme.gainWhen}, up ${formatPct(extreme.maxGain)}.`,
  ];
}

function fundProfile(ticker, weight) {
  const profiles = {
    VWRA: () => {
      const core = CORES.allworld;
      const extreme = EXTREMES.allworld;
      return {
        name: "Vanguard FTSE All-World fund",
        lines: [
          `Dividends stay inside the fund. It is priced in US dollars and listed in London. The fund is based in Ireland, so US dividends inside it are withheld at 15%, and the holding generally sits outside US estate tax. Yearly fee ${formatTer(core.ter, 2)}.`,
          `It holds companies in developed and emerging markets. The planning rate uses the MSCI All Country World index, gross return in US dollars, through ${AS_OF}: ${formatPct(core.returns.y10)} a year over 10 years, and ${formatPct(core.returns.long)} a year since the end of 1987.`,
          `That index's deepest fall on the factsheet was ${formatPct(extreme.maxLoss)}, from ${extreme.lossWhen}. Its best calendar year in the factsheet's 2012–2025 table was ${extreme.gainWhen}, up ${formatPct(extreme.maxGain)}.`,
        ],
      };
    },
    XWR: () => {
      const core = CORES.developed;
      const extreme = EXTREMES.developed;
      return {
        name: "Xtrackers MSCI World fund",
        lines: [
          `Dividends stay inside the fund. Listed on the Singapore exchange and traded in Singapore dollars. The fund is based in Ireland, so US dividends inside it are withheld at 15%, and the holding generally sits outside US estate tax. Paying in Singapore dollars does not stop the price moving with the US dollar. Yearly fee ${formatTer(core.ter, 2)}.`,
          "Developed markets only, so it leaves out emerging markets. On 30 Sep 2026 the MSCI World index was 72.9% United States and 31.8% information technology.",
          `The planning rate uses that index, gross return in US dollars, through ${AS_OF}: ${formatPct(core.returns.y10)} a year over 10 years, and ${formatPct(core.returns.long)} a year since the end of 1987. Deepest fall ${formatPct(extreme.maxLoss)}, from ${extreme.lossWhen}. Best year in the 2012–2025 table: ${extreme.gainWhen}, up ${formatPct(extreme.maxGain)}.`,
        ],
      };
    },
    CNDX: () => ({
      name: "iShares Nasdaq 100 fund",
      lines: [
        "Dividends stay inside the fund. It is priced in US dollars and listed in London. The fund is based in Ireland.",
        ...nasdaqLines(RISK_FUND.allworld.ter),
      ],
    }),
    XND: () => ({
      name: "Xtrackers Nasdaq 100 fund",
      lines: [
        "Dividends stay inside the fund. Listed on the Singapore exchange and traded in Singapore dollars. The fund is based in Ireland. The Singapore-dollar price still moves with the US dollar. As of 31 Aug 2026, technology was 66.85% of this fund. The world fund's technology share on that same date was 35.49%.",
        ...nasdaqLines(RISK_FUND.developed.ter),
      ],
    }),
    AGGU: () => ({
      name: "iShares Core Global Aggregate Bond fund",
      lines: [
        `Dividends stay inside the fund. Listed in London, based in Ireland, and hedged to the US dollar. The hedge does not remove the US dollar versus the Singapore dollar. Yearly fee ${formatTer(BOND.ter, 2)}, and the published return is already after that fee.`,
        `Investment-grade bonds from governments and companies around the world. On the October 2026 factsheet the interest-rate sensitivity was ${BOND.duration.toFixed(2)} years. The current yield to worst is ${formatPct(BOND.yieldToWorst)}. That is the yield priced into the bonds now. The illustration does not treat it as the future gain.`,
        `On the ${AS_OF} factsheet, in US dollars and already after the fee: ${formatPct(BOND.netY3)} a year over 3 years, ${formatPct(BOND.netY5)} a year over 5 years, and ${formatPct(BOND.netSince)} a year since November 2017. The 5-year figure is near zero because the fund fell ${formatPct(BOND.calendar2022)} in 2022, when interest rates rose. The illustration uses the since-launch figure, not that 5-year window.`,
        `The deepest week-end fall in the US dollar price was ${formatPct(BOND.maxLoss)}, from ${BOND.lossWhen}. The best calendar year on the factsheet was ${BOND.gainWhen}, up ${formatPct(BOND.maxGain)}.`,
      ],
    }),
  };
  const built = profiles[ticker]();
  return { ticker, weight, name: built.name, lines: built.lines };
}

function fundsFor(parts) {
  return parts
    .filter((part) => part.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map((part) => fundProfile(part.ticker, part.weight));
}

function calmEquityWeight(lossLimit) {
  let best = null;
  for (let pct = 0; pct <= 100; pct += 5) {
    const equityW = pct / 100;
    if (calmMix(equityW).maxLoss <= lossLimit + 1e-12) best = equityW;
  }
  return best;
}

/**
 * Five years of ECB reference rates, 18 Oct 2021–16 Oct 2026, USD base.
 * Annualized volatility of daily log changes: USD/SGD 4.63%, USD/GBP 8.39%.
 * Largest peak-to-trough fall: USD/SGD −12.84% (28 Sep 2022–28 Jan 2026),
 * USD/GBP −23.31% (28 Sep 2022–29 Jan 2026).
 */
const FX_CHOICES = {
  help: "These funds are priced in US dollars. From 18 Oct 2021 to 16 Oct 2026, the average yearly swing in daily exchange rates from the European Central Bank was 4.6% for the US dollar against the Singapore dollar, and 8.4% against the pound. The biggest slide in that window was 12.8% versus the Singapore dollar and 23.3% versus the pound. This is history, not a forecast.",
  options: [
    {
      value: "both",
      label: "US dollar versus the Singapore dollar and the pound",
      detail: "About 4.6% a year against the Singapore dollar, and 8.4% a year against the pound. Biggest slides were 12.8% and 23.3%. This is the London pair: you convert Singapore dollars to buy.",
    },
    {
      value: "sgd",
      label: "Singapore exchange. The US dollar risk remains",
      detail: "You pay in Singapore dollars, so you skip the conversion and the pound’s 8.4% a year. The shares inside the fund are still mostly US companies, so the US dollar versus the Singapore dollar remains: about 4.6% a year, biggest slide 12.8%.",
    },
  ],
};

const BROKER_NAMES = {
  none: "No brokerage yet",
  fsm: "FSM Global",
  ibkr: "Interactive Brokers",
  moomoo: "Moomoo",
  longbridge: "Longbridge",
  other: "Another brokerage",
};

/** Paths a current account can actually use for this portfolio. */
const BROKER_SUPPORT = {
  fsm: ["recurring:lse", "recurring:sgx", "manual:lse", "manual:sgx"],
  ibkr: ["recurring:lse", "manual:lse", "manual:sgx"],
  moomoo: ["manual:sgx"],
  longbridge: ["manual:sgx"],
};

const BROKER_BLOCK = {
  "moomoo:recurring:lse": "Moomoo does not offer the London Stock Exchange. Its regular savings plan is eligible US stocks and funds only.",
  "moomoo:manual:lse": "Moomoo does not offer the London Stock Exchange.",
  "moomoo:recurring:sgx": "Moomoo’s regular savings plan covers eligible US stocks and funds only, not these Singapore-listed funds.",
  "longbridge:recurring:lse": "Longbridge does not offer the London funds in this plan.",
  "longbridge:manual:lse": "Longbridge does not offer the London funds in this plan.",
  "longbridge:recurring:sgx": "Longbridge is for manual Singapore-exchange buys here, not an automatic plan for XWR and XND.",
  "ibkr:recurring:sgx": "Interactive Brokers recurring investments cover US, Canadian, and European listings, not these Singapore-listed funds.",
  "other:any": "This list does not have fees for that brokerage, so staying would mean checking the ticker yourself.",
};

function pickBroker(habit, venueId, bond) {
  if (bond && venueId === "lse") {
    const automatic = habit === "recurring";
    return {
      id: "ibkr",
      name: "Interactive Brokers",
      why: automatic
        ? "AGGU and VWRA are London listings, and Interactive Brokers can buy both. An automatic buy is 0.05% with a £1 minimum and no platform fee. Keep cash in the account so it can run."
        : "AGGU and VWRA are London listings, and Interactive Brokers can buy both. Each buy is 0.05% with a £1 minimum, no platform fee, and you can set a limit price.",
      alt: "",
      confirm: automatic
        ? "Confirm AGGU and VWRA are eligible before the first automatic buy. Recurring buys need fractional shares turned on."
        : "Confirm AGGU is on the London menu before the first buy.",
    };
  }
  if (habit === "recurring" && venueId === "lse") {
    return {
      id: "fsm",
      name: "FSM Global",
      why: "Invest and forget fits FSM Global’s fund regular savings plan: 0% buy processing fee, no platform or custody fee, from S$50. That 0% is the automatic buy. A later manual London sale is 0.15% with a £15 minimum.",
      alt: "If VWRA or CNDX is not on the menu, Interactive Brokers recurring is 0.05% with a £1 minimum and no platform fee.",
      confirm: "Confirm the ticker is on the plan before the first automatic buy.",
    };
  }
  if (habit === "recurring" && venueId === "sgx") {
    return {
      id: "fsm",
      name: "FSM Global",
      why: "Invest and forget fits FSM Global’s regular savings plan for XWR and XND: 0% buy processing fee, no platform or custody fee, from S$50. A one-off Singapore-exchange fund trade is a flat S$3.80.",
      alt: "",
      confirm: "Confirm the ticker is on the plan before the first automatic buy.",
    };
  }
  if (habit === "manual" && venueId === "lse") {
    return {
      id: "ibkr",
      name: "Interactive Brokers",
      why: "Placing each buy yourself fits Interactive Brokers: 0.05% of the trade, minimum £1, no platform fee, and you can set a limit price.",
      alt: "Fixed pricing is also 0.05%, with a £3 minimum.",
      confirm: "",
    };
  }
  return {
    id: "longbridge",
    name: "Longbridge",
    why: "Placing each Singapore-exchange buy yourself fits Longbridge: 0% commission and a 0.03% platform fee, minimum S$0.99. Use a limit order while the spread settles.",
    alt: "Moomoo is the same kind of manual Singapore-exchange buy, about 0.04% to 0.06% with a S$1.98 minimum on standard pricing. Its recurring plan is US stocks and funds only.",
    confirm: "",
  };
}

function accountLine(id, habit, venueId) {
  const ideal = pickBroker(habit, venueId);
  if (id === ideal.id) return ideal;
  const extra = {
    "ibkr:recurring:lse": {
      id: "ibkr",
      name: "Interactive Brokers",
      why: "Recurring London buys are 0.05% with a £1 minimum and no platform fee. Keep cash in the account so the automatic buy can run.",
      alt: "",
      confirm: "Confirm the ticker is on the plan before the first automatic buy.",
    },
    "ibkr:manual:sgx": {
      id: "ibkr",
      name: "Interactive Brokers",
      why: "Singapore-exchange trades are 0.08% with a S$2.50 minimum and no separate platform fee. You can set a limit price.",
      alt: "",
      confirm: "",
    },
    "fsm:manual:lse": {
      id: "fsm",
      name: "FSM Global",
      why: "A one-off London trade is 0.15% with a £15 minimum and no platform fee. That minimum is large on a small order.",
      alt: "",
      confirm: "",
    },
    "fsm:manual:sgx": {
      id: "fsm",
      name: "FSM Global",
      why: "A one-off Singapore-exchange fund trade is a flat S$3.80, with no platform or custody fee.",
      alt: "",
      confirm: "",
    },
    "moomoo:manual:sgx": {
      id: "moomoo",
      name: "Moomoo",
      why: "Manual Singapore-exchange buys are about 0.04% to 0.06%, with a S$1.98 minimum on standard pricing. Its recurring plan is US stocks and funds only, so this is a buy you place yourself.",
      alt: "",
      confirm: "",
    },
  };
  return extra[`${id}:${habit}:${venueId}`] ?? null;
}

function blockReason(id, habit, venueId) {
  return BROKER_BLOCK[`${id}:${habit}:${venueId}`] || BROKER_BLOCK[`${id}:any`] || "That brokerage is not set up for this mix in this plan.";
}

const STAY_ORDER = {
  "recurring:lse": ["fsm", "ibkr"],
  "recurring:sgx": ["fsm"],
  "manual:lse": ["ibkr", "fsm"],
  "manual:sgx": ["longbridge", "moomoo", "ibkr", "fsm"],
};

function brokerIds(currentBroker) {
  const raw = Array.isArray(currentBroker) ? currentBroker : [currentBroker];
  const ids = [];
  for (const id of raw) {
    if ((BROKER_SUPPORT[id] || id === "other") && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function nameList(ids) {
  const names = ids.map((id) => (id === "other" ? "another brokerage" : BROKER_NAMES[id]));
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Keep a current account when it can place this buy. Otherwise name the switch.
 * currentBroker: one id, or a list when the person uses more than one brokerage.
 * brokerPreference: keep | change
 */
function chooseBroker(habit, venueId, currentBroker, brokerPreference, options = {}) {
  const bond = options.bond === true && venueId === "lse";
  const ideal = pickBroker(habit, venueId, bond);
  const ids = brokerIds(currentBroker);
  const keep = brokerPreference === "keep" && ids.length > 0;
  const path = `${habit}:${venueId}`;

  if (bond) {
    const stayId = ["ibkr", "fsm"].find((id) => ids.includes(id) && BROKER_SUPPORT[id].includes(path));
    if (stayId === "ibkr") {
      return { ...ideal, decision: "stay", why: `Stay on Interactive Brokers. ${ideal.why}`, alt: "" };
    }
    if (stayId === "fsm") {
      const line = accountLine("fsm", habit, venueId);
      return {
        ...line,
        decision: "stay",
        why: `Stay on FSM Global. ${line.why} Confirm AGGU is on the menu before the first buy.`,
        alt: "",
      };
    }
  }

  if (!keep) {
    if (ids.length === 1 && ids[0] === ideal.id) {
      return {
        ...ideal,
        decision: "stay",
        why: `You asked about switching, and ${ideal.name} is already the brokerage for this plan. ${ideal.why}`,
      };
    }
    if (ids.includes(ideal.id)) {
      return {
        ...ideal,
        decision: "stay",
        why: `You asked about switching, and ${ideal.name}, which you already use, is the brokerage for this plan. ${ideal.why}`,
      };
    }
    if (ids.length > 0) {
      const from = ids.length === 1 && ids[0] === "other" ? "your current brokerage" : nameList(ids);
      return {
        ...ideal,
        decision: "switch",
        why: `Switch from ${from} to ${ideal.name}. ${ideal.why}`,
      };
    }
    return { ...ideal, decision: "open" };
  }

  const supported = (STAY_ORDER[path] ?? []).filter((id) => ids.includes(id) && BROKER_SUPPORT[id].includes(path));
  if (supported.length > 0) {
    const line = accountLine(supported[0], habit, venueId);
    const same = line.id === ideal.id;
    const extra = supported.length > 1
      ? ` You also have ${nameList(supported.slice(1))}, and this account is the better fit of the ones you kept.`
      : "";
    return {
      ...line,
      decision: "stay",
      why: `Stay on ${line.name}. ${line.why}${extra}`,
      alt: same ? line.alt : `The usual switch for this plan is ${ideal.name}. ${ideal.why}`,
    };
  }

  const reasons = ids.map((id) => (
    id === "other"
      ? blockReason(id, habit, venueId)
      : `${BROKER_NAMES[id]} cannot run this buy. ${blockReason(id, habit, venueId)}`
  ));
  return {
    ...ideal,
    decision: "switch",
    why: `${reasons.join(" ")} This needs a switch to ${ideal.name}. ${ideal.why}`,
  };
}

/**
 * Map quiz answers to one portfolio, or to a clear "this does not fit".
 * loss: 0.2 | 0.4 | 0.6 | 0.8
 * gain: 0.2 | 0.4 | 0.6
 * horizon: under7 | mid | long
 * habit: recurring | manual
 * fx: both | sgd | none
 * currentBroker: none | fsm | ibkr | moomoo | longbridge | other, or a list of those
 * brokerPreference: keep | change
 */
function suggestPlan({ loss, gain, horizon, habit, fx, currentBroker, brokerPreference }) {
  const horizonSpec = HORIZONS[horizon] ?? HORIZONS.under7;
  const habitId = habit === "manual" ? "manual" : "recurring";
  const gainHope = GAIN_LABEL[gain] ? gain : 0.2;

  if (fx === "none") {
    return {
      fits: false,
      reason: "fx",
      message:
        "From 18 Oct 2021 to 16 Oct 2026, the US dollar swung about 4.6% a year against the Singapore dollar and about 8.4% a year against the pound. The biggest slides were 12.8% and 23.3%. Neither London nor the Singapore exchange removes that. This plan does not fit money that must not move with those currencies.",
      notes: [],
      venueId: null,
      habit: habitId,
      years: horizonSpec.years,
      riskWeight: null,
      headline: "",
      annual: null,
      longAnnual: null,
      ter: null,
      maxLoss: null,
      maxGain: null,
      projection: null,
      fxNote: "",
      flatNote: "",
      fundLine: "",
      broker: null,
      gainCapped: false,
      horizonCapped: false,
    };
  }

  const lossLimit = lossLimitFor(loss);
  if (lossLimit == null) {
    return {
      fits: false,
      reason: "loss",
      message: "That drop is not one of the choices this plan can match.",
      notes: [],
      venueId: null,
      habit: habitId,
      years: horizonSpec.years,
      riskWeight: null,
      bondWeight: null,
      rateLabel: "",
      headline: "",
      annual: null,
      longAnnual: null,
      ter: null,
      maxLoss: null,
      maxGain: null,
      projection: null,
      fxNote: "",
      flatNote: "",
      fundLine: "",
      broker: null,
      gainCapped: false,
      horizonCapped: false,
    };
  }

  if (lossLimit <= 0.4) {
    const equityW = calmEquityWeight(lossLimit);
    if (equityW === null) {
      return {
        fits: false,
        reason: "loss",
        message: `The calmest mix here is the global bond fund, and its deepest fall since launch was ${formatPct(BOND.maxLoss)}, from ${BOND.lossWhen}. A smaller drop than that does not fit.`,
        notes: [],
        venueId: null,
        habit: habitId,
        years: horizonSpec.years,
        riskWeight: null,
        bondWeight: null,
        rateLabel: "",
        headline: "",
        annual: null,
        longAnnual: null,
        ter: null,
        maxLoss: BOND.maxLoss,
        maxGain: BOND.maxGain,
        projection: null,
        fxNote: "",
        flatNote: "",
        fundLine: "",
        broker: null,
        gainCapped: false,
        horizonCapped: false,
      };
    }

    const mix = calmMix(equityW);
    const parts = [
      { pct: Math.round(mix.bondW * 100), etf: BOND.etf, ter: BOND.ter },
      { pct: Math.round(mix.equityW * 100), etf: mix.equity.etf, ter: mix.equity.ter },
    ].filter((part) => part.pct > 0).sort((a, b) => b.pct - a.pct);
    const headline = parts.length === 1
      ? `100% ${parts[0].etf}`
      : `${parts[0].pct}% ${parts[0].etf} and ${parts[1].pct}% ${parts[1].etf}`;
    const fundLine =
      `Fund cost ${formatTer(mix.ter, 3)} a year: ${parts.map((part) => `${part.pct}% ${part.etf} at ${formatTer(part.ter, 2)}`).join(" and ")}. The bond fund's figure is already after its fee. The share fund's fee is taken off the index return.`;
    const notes = [];
    if (fx === "sgd") {
      notes.push(
        "You preferred the Singapore exchange, but this calmer mix is a London bond fund. The buy converts Singapore dollars into US dollars. The plan has no Singapore-listed version of that bond fund.",
      );
    }
    notes.push(
      "The illustration uses the bond fund's return since November 2017 and the share fund's 10-year return. The bond fund's 5 years to 30 Sep 2026 were 0.10% a year, because 2022 was a fall of 11.65%.",
    );
    const projection = project({
      start: 0,
      monthly: 1000,
      years: horizonSpec.years,
      annualRate: mix.annual,
    });
    return {
      fits: true,
      reason: null,
      message: notes[0] ?? "",
      notes: notes.slice(1),
      venueId: "lse",
      habit: habitId,
      years: horizonSpec.years,
      riskWeight: 0,
      bondWeight: mix.bondW,
      rateLabel: "Bond fund since Nov 2017, share fund over 10 years",
      headline,
      funds: fundsFor(parts.map((part) => ({ ticker: part.etf, weight: part.pct }))),
      annual: mix.annual,
      longAnnual: null,
      ter: mix.ter,
      maxLoss: mix.maxLoss,
      maxGain: mix.maxGain,
      projection,
      fxNote:
        "Exchange rate: you convert Singapore dollars into US dollars to buy, and back when you sell. Over the five years to 16 Oct 2026 that was about 4.6% a year versus the Singapore dollar (biggest slide 12.8%) and about 8.4% a year versus the pound (biggest slide 23.3%). The bond fund is hedged to the US dollar, which does not remove the Singapore-dollar swing.",
      flatNote:
        "The S$ illustration assumes the exchange rate stays flat. A weaker US dollar would reduce that amount.",
      fundLine,
      broker: chooseBroker(habitId, "lse", currentBroker, brokerPreference, { bond: true }),
      gainCapped: false,
      horizonCapped: false,
    };
  }

  const venueId = fx === "sgd" ? "sgx" : "lse";
  const weights = sleeveWeights();
  const ratesAt = (riskWeight, windowId) =>
    planRates({ venueId, windowId, riskWeight, subtractFees: true });

  let best = null;
  for (const weight of weights) {
    if (ratesAt(weight, "y10").maxLoss <= lossLimit + 1e-12) best = weight;
  }

  const calm = ratesAt(0, "y10");
  if (best === null) {
    const horizonNote =
      horizon === "under7"
        ? " A horizon under 7 years would also keep the Nasdaq sleeve at 0%."
        : "";
    return {
      fits: false,
      reason: "loss",
      message: `Even with no Nasdaq sleeve, this mix has historically fallen ${formatPct(calm.maxLoss)}. This all-equity plan does not fit money you could not leave alone through that drop.${horizonNote}`,
      notes: [],
      venueId,
      habit: habitId,
      years: horizonSpec.years,
      riskWeight: null,
      headline: "",
      annual: null,
      longAnnual: null,
      ter: null,
      maxLoss: calm.maxLoss,
      maxGain: calm.maxGain,
      projection: null,
      fxNote: "",
      flatNote: "",
      fundLine: "",
      broker: null,
      gainCapped: false,
      horizonCapped: false,
    };
  }

  let gainWeight = weights[weights.length - 1];
  for (const weight of weights) {
    if (ratesAt(weight, "y10").maxGain + 1e-12 >= gainHope) {
      gainWeight = weight;
      break;
    }
  }

  const horizonCapped = best > horizonSpec.cap + 1e-12;
  const riskWeight = horizonCapped ? horizonSpec.cap : best;
  const gainCapped = gainWeight > riskWeight + 1e-12;
  const rates = ratesAt(riskWeight, "y10");
  const longRates = ratesAt(riskWeight, "long");
  const projection = project({
    start: 0,
    monthly: 1000,
    years: horizonSpec.years,
    annualRate: rates.annual,
  });

  const notes = [];
  if (horizon === "under7") {
    notes.push(
      "You need this money in under 7 years, so the Nasdaq sleeve stays at 0%. You may need the cash before a drop has recovered.",
    );
  } else if (horizon === "mid" && horizonCapped) {
    notes.push(
      "A 7–15 year horizon caps the Nasdaq sleeve at 15%, because you may need the cash during a drop.",
    );
  }
  if (gainCapped) {
    notes.push(
      `A best year around ${GAIN_LABEL[gainHope]} has historically needed a heavier Nasdaq sleeve than this limit allows, so the safer weight stays.`,
    );
  }

  const corePct = Math.round(rates.coreW * 100);
  const riskPct = Math.round(rates.riskW * 100);
  const headline =
    riskPct === 0
      ? `100% ${rates.core.etf}`
      : `${corePct}% ${rates.core.etf} and ${riskPct}% ${rates.riskFund.etf}`;
  const fundLine =
    riskPct === 0
      ? `Fund cost ${formatTer(rates.ter, 3)} a year, from ${rates.core.etf} at ${formatTer(rates.core.ter, 2)}. Already taken out of the planning rate.`
      : `Fund cost ${formatTer(rates.ter, 3)} a year: ${corePct}% ${rates.core.etf} at ${formatTer(rates.core.ter, 2)} and ${riskPct}% ${rates.riskFund.etf} at ${formatTer(rates.riskFund.ter, 2)}. Already taken out of the planning rate.`;
  const fxNote =
    venueId === "lse"
      ? "Exchange rate: you convert Singapore dollars into US dollars to buy, and back when you sell. Over the five years to 16 Oct 2026 that was about 4.6% a year versus the Singapore dollar (biggest slide 12.8%) and about 8.4% a year versus the pound (biggest slide 23.3%)."
      : "Exchange rate: you pay in Singapore dollars, so there is no conversion step and you skip the pound’s 8.4% a year. The fund value still moves with the US dollar, about 4.6% a year versus the Singapore dollar over the five years to 16 Oct 2026, with a biggest slide of 12.8%.";

  return {
    fits: true,
    reason: null,
    message: notes[0] ?? "",
    notes: notes.slice(1),
    venueId,
    habit: habitId,
    years: horizonSpec.years,
      riskWeight,
      bondWeight: 0,
      rateLabel: "10-year average after fees",
      headline,
      funds: fundsFor([
        { ticker: rates.core.etf, weight: corePct },
        { ticker: rates.riskFund.etf, weight: riskPct },
      ]),
    annual: rates.annual,
    longAnnual: longRates.annual,
    ter: rates.ter,
    maxLoss: rates.maxLoss,
    maxGain: rates.maxGain,
    projection,
    fxNote,
    flatNote:
      "The S$ illustration assumes the exchange rate stays flat. A weaker US dollar would reduce that amount.",
    fundLine,
    broker: chooseBroker(habitId, venueId, currentBroker, brokerPreference),
    gainCapped,
    horizonCapped: horizon === "under7" || horizonCapped,
  };
}

function canKeepBroker(habit, currentBroker) {
  const ids = brokerIds(currentBroker);
  if (ids.length === 0) return false;
  const habitId = habit === "manual" ? "manual" : "recurring";
  const known = ids.filter((id) => id !== "other");
  if (known.length === 0) return true;
  return known.some((id) => BROKER_SUPPORT[id].some((path) => path.startsWith(`${habitId}:`)));
}

function allowedFxChoices({ habit, currentBroker, brokerPreference }) {
  const habitId = habit === "manual" ? "manual" : "recurring";
  const ids = brokerIds(currentBroker);
  const keep = brokerPreference === "keep" && ids.length > 0;
  const allows = (venueId) => {
    if (!keep) return true;
    const known = ids.filter((id) => id !== "other");
    if (known.length === 0) return true;
    return known.some((id) => BROKER_SUPPORT[id].includes(`${habitId}:${venueId}`));
  };
  return FX_CHOICES.options.filter((option) => allows(option.value === "sgd" ? "sgx" : "lse"));
}

  return {
    AS_OF, CORES, RISK_RETURNS, RISK_FUND, WINDOWS, EXTREMES, VENUES, MAX_RISK,
    clamp, planRates, bondMixRates, project, chartTicks, formatSgd, formatPct, suggestPlan, FX_CHOICES,
    canKeepBroker, allowedFxChoices,
  };
});
