const { MAX_RISK, bondMixRates, chartTicks, formatPct, formatSgd, planRates, project, suggestPlan } = EtfCalc;

const $ = (id) => document.getElementById(id);

const VENUE_NOTES = {
  lse: "VWRA and CNDX. Pay in US dollars.",
  sgx: "XWR and XND. Pay in Singapore dollars.",
  "us:lse": "XDPU and CNDX. Pay in US dollars. S&P 500 only.",
  "us:sgx": "XUS and XND. Pay in Singapore dollars. S&P 500 only.",
};

function venueNote(venue, market) {
  if (market === "us") return VENUE_NOTES[`us:${venue}`];
  return VENUE_NOTES[venue];
}

const HABIT_NOTES = {
  recurring: "Buys every month, including after a drop.",
  manual: "You choose the day and the price.",
};

const BROKER_RULES = [
  { id: "recurring:lse", label: "Automatic, London", broker: "FSM Global", fee: "0% buy" },
  { id: "recurring:sgx", label: "Automatic, Singapore exchange", broker: "FSM Global", fee: "0% buy" },
  { id: "manual:lse", label: "Each buy yourself, London", broker: "Interactive Brokers", fee: "0.05%, min £1" },
  { id: "manual:sgx", label: "Each buy yourself, Singapore exchange", broker: "Longbridge", fee: "0% commission, 0.03% platform" },
  { id: "bond", label: "Bond fund, London", broker: "Interactive Brokers", fee: "0.05%, min £1" },
];

const QUESTIONS = [
  {
    kicker: "Loss",
    title: "Biggest drop you could watch without selling",
    key: "loss",
    options: [
      { value: 0.2, label: "About 20%", detail: "Mostly the global bond fund, with a small share fund" },
      { value: 0.4, label: "About 40%", detail: "A bit over half in the share fund, the rest in the bond fund" },
      { value: 0.6, label: "About 60%", detail: "Almost all shares. The Nasdaq slice stays small" },
      { value: 0.8, label: "About 80%", detail: "The largest Nasdaq slice that still fits how long you can wait" },
    ],
  },
  {
    kicker: "Time",
    title: "When do you need this money?",
    help: "Money you need soon cannot sit in a sleeve that may take years to recover.",
    key: "horizon",
    options: [
      { value: "under7", label: "Under 7 years" },
      { value: "mid", label: "7 to 15 years" },
      { value: "long", label: "15 years or more" },
    ],
  },
  {
    kicker: "Market",
    title: "Where should the main fund invest?",
    help: "US fund 0.03% a year. World fund 0.12%. Choose the countries.",
    key: "market",
    options: [
      { value: "global", label: "Worldwide", detail: "US companies, plus Europe, Japan, and other developed markets" },
      { value: "us", label: "United States", detail: "The S&P 500 only. You skip Europe, Japan, and the rest" },
    ],
  },
  {
    kicker: "Habit",
    title: "How do you want to buy?",
    help: "Automatic buys keep going after a drop. Manual buys let you set a price, and they are easy to skip.",
    key: "habit",
    options: [
      { value: "recurring", label: "Invest and forget", detail: "A regular savings plan buys for you" },
      { value: "manual", label: "Place each buy yourself", detail: "You choose the day and the limit price" },
    ],
  },
  {
    kicker: "Brokerage",
    title: "Which brokerages are you using now?",
    help: "Select every account you already have. The currency question comes next and only shows markets those accounts can buy if you keep them.",
    key: "broker",
    multiple: true,
    options: [
      { value: "none", label: "None yet" },
      { value: "fsm", label: "FSM Global" },
      { value: "ibkr", label: "Interactive Brokers" },
      { value: "moomoo", label: "Moomoo" },
      { value: "longbridge", label: "Longbridge" },
      { value: "other", label: "Another brokerage" },
    ],
  },
  {
    kicker: "Stay or switch",
    title: "Keep one of these brokerages, or switch?",
    help: "Staying uses the account you already have that can place this buy. The next question only offers markets that account can buy.",
    key: "prefer",
    options: [
      { value: "keep", label: "Keep my current brokerage", detail: "Stay if it can buy this plan" },
      { value: "change", label: "Switch if another fits better", detail: "Use the brokerage with the clearer fee for this habit" },
    ],
  },
  {
    kicker: "Exchange rate",
    title: "Which of these currency swings is okay?",
    help: EtfCalc.FX_CHOICES.help,
    key: "fx",
    options: EtfCalc.FX_CHOICES.options,
  },
];

function selectedBrokers() {
  const value = quiz.answers.broker;
  if (Array.isArray(value)) return value;
  if (value) return [value];
  return [];
}

function activeQuestions() {
  const hasAccount = selectedBrokers().some((id) => id !== "none");
  return QUESTIONS.filter((question) => question.key !== "prefer" || hasAccount);
}

function questionOptions(question) {
  if (question.key === "prefer" && !EtfCalc.canKeepBroker(quiz.answers.habit, selectedBrokers())) {
    return question.options.filter((option) => option.value !== "keep");
  }
  if (question.key === "fx") {
    return EtfCalc.allowedFxChoices({
      habit: quiz.answers.habit,
      currentBroker: selectedBrokers(),
      brokerPreference: quiz.answers.prefer,
    });
  }
  return question.options;
}

function questionHelp(question, options) {
  if (question.key === "prefer" && !options.some((option) => option.value === "keep")) {
    return "These accounts cannot buy the London funds or the Singapore-listed funds in the way you want to buy. The plan has to switch.";
  }
  if (question.key === "fx" && options.length === 1 && options[0].value === "sgd") {
    return "The account you are keeping can buy the Singapore-listed funds. It cannot buy the London funds, so the pound swing is not a choice. The US dollar versus the Singapore dollar risk remains.";
  }
  if (question.key === "fx" && options.length === 1 && options[0].value === "both") {
    return "The account you are keeping can buy the London funds. It cannot buy these Singapore-listed funds for an automatic purchase, so paying only in Singapore dollars is not a choice.";
  }
  return question.help;
}

const CHECK = `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.2 4.6 9 10 3" fill="none" stroke="#0a2a2b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const state = {
  venue: "lse",
  habit: "recurring",
  mix: "equity",
  market: "global",
  loss: "0.8",
  horizon: "long",
};

const quiz = {
  step: 0,
  answers: {},
  plan: null,
};

function readNumber(input, fallback) {
  const n = Number(input.value);
  return Number.isFinite(n) ? n : fallback;
}

function applyQuery() {
  const q = new URLSearchParams(location.search);
  if (q.has("start")) $("start").value = q.get("start");
  if (q.has("monthly")) $("monthly").value = q.get("monthly");
  if (q.has("years")) $("years").value = q.get("years");
  if (q.has("risk")) $("risk").value = q.get("risk");
  if (q.has("window")) $("window").value = q.get("window");
  if (q.has("fees")) $("fees").checked = q.get("fees") !== "0";
  if (q.get("venue") === "sgx" || q.get("venue") === "lse") state.venue = q.get("venue");
  if (q.get("habit") === "manual" || q.get("habit") === "recurring") state.habit = q.get("habit");
}

function setPressed(group, value) {
  for (const button of document.querySelectorAll(`[data-group="${group}"]`)) {
    button.setAttribute("aria-pressed", String(button.dataset.value === value));
  }
}

function habitNote() {
  return HABIT_NOTES[state.habit];
}

function horizonForYears(years) {
  if (years < 7) return "under7";
  if (years <= 15) return "mid";
  return "long";
}

function applyAppetite() {
  const years = readNumber($("years"), 20);
  state.horizon = horizonForYears(years);
  const plan = suggestPlan({
    loss: Number(state.loss),
    horizon: state.horizon,
    habit: state.habit,
    fx: state.venue === "sgx" ? "sgd" : "both",
    market: state.market,
    currentBroker: "none",
  });
  if (!plan.fits) return;
  state.mix = plan.bondWeight ? "bond" : "equity";
  if (plan.bondWeight) state.venue = "lse";
  $("risk").value = String(Math.round((plan.riskWeight || 0) * 100));
  $("share").value = String(Math.round((1 - (plan.bondWeight || 0)) * 100));
  render();
}

function renderBroker(bondMix) {
  const active = bondMix ? "bond" : `${state.habit}:${state.venue}`;
  const list = $("broker-rules");
  list.replaceChildren();
  for (const rule of BROKER_RULES) {
    const item = document.createElement("li");
    if (rule.id === active) item.className = "on";
    const label = document.createElement("span");
    label.textContent = rule.label;
    const pick = document.createElement("b");
    pick.textContent = `${rule.broker} · ${rule.fee}`;
    item.append(label, pick);
    list.append(item);
  }
  const current = BROKER_RULES.find((rule) => rule.id === active);
  $("broker-now").textContent = current
    ? `${current.broker}. ${current.fee}.`
    : "";
}

function renderQuiz() {
  const list = activeQuestions();
  if (quiz.step > list.length - 1) quiz.step = list.length - 1;
  const question = list[quiz.step];
  const options = questionOptions(question);
  if (question.key === "fx" && quiz.answers.fx && !options.some((option) => option.value === quiz.answers.fx)) {
    delete quiz.answers.fx;
  }
  if (question.key === "prefer" && quiz.answers.prefer === "keep" && !options.some((option) => option.value === "keep")) {
    delete quiz.answers.prefer;
  }
  $("progress").textContent = `Question ${quiz.step + 1} of ${list.length}`;
  $("q-kicker").textContent = question.kicker;
  $("q-title").textContent = question.title;
  const help = questionHelp(question, options) || "";
  $("q-help").textContent = help;
  $("q-help").hidden = !help;
  $("back").hidden = quiz.step === 0;
  const selected = quiz.answers[question.key];
  const chosen = question.multiple ? Array.isArray(selected) && selected.length > 0 : selected != null;
  $("next").disabled = !chosen;
  const brokerStillOpen = question.key === "broker" && !chosen;
  $("next").textContent = quiz.step === list.length - 1 && !brokerStillOpen ? "See the plan" : "Continue";

  const dots = $("dots");
  dots.replaceChildren();
  list.forEach((_, index) => {
    const step = document.createElement("span");
    step.textContent = String(index + 1);
    if (index === quiz.step) step.className = "on";
    else if (index < quiz.step) step.className = "done";
    dots.append(step);
  });

  const box = $("answers");
  box.replaceChildren();
  box.setAttribute("role", question.multiple ? "group" : "radiogroup");
  box.setAttribute("aria-label", question.title);
  for (const option of options) {
    const pressed = question.multiple
      ? Array.isArray(selected) && selected.includes(option.value)
      : option.value === selected;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer";
    button.setAttribute("aria-pressed", String(pressed));
    const copy = document.createElement("span");
    copy.textContent = option.label;
    if (option.detail) {
      const detail = document.createElement("small");
      detail.textContent = option.detail;
      copy.append(detail);
    }
    const mark = document.createElement("span");
    mark.className = "check";
    mark.innerHTML = CHECK;
    button.append(copy, mark);
    button.addEventListener("click", () => {
      if (question.multiple) {
        let picked = selectedBrokers();
        if (option.value === "none") {
          picked = picked.includes("none") ? [] : ["none"];
        } else {
          picked = picked.filter((id) => id !== "none");
          picked = picked.includes(option.value)
            ? picked.filter((id) => id !== option.value)
            : picked.concat(option.value);
        }
        quiz.answers.broker = picked;
        if (!picked.some((id) => id !== "none")) delete quiz.answers.prefer;
      } else {
        quiz.answers[question.key] = option.value;
      }
      renderQuiz();
    });
    box.append(button);
  }
}

function showResult(plan) {
  quiz.plan = plan;
  $("quiz").hidden = true;
  $("calculator").hidden = true;
  const result = $("result");
  result.hidden = false;
  result.replaceChildren();

  const card = document.createElement("div");
  card.className = "card";

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = plan.fits ? "A starting plan" : "Not this plan";
  card.append(eyebrow);

  if (plan.message) {
    const lead = document.createElement("p");
    lead.className = "lead";
    lead.textContent = plan.message;
    card.append(lead);
  }

  if (plan.fits) {
    const title = document.createElement("h2");
    title.className = "display";
    title.textContent = plan.headline;
    card.append(title);
  }

  if (plan.fits) {
    const grid = document.createElement("div");
    grid.className = "result-grid";
    const stats = [
      [plan.rateLabel, formatPct(plan.annual), true],
      plan.longAnnual == null ? null : ["Since 1988, no Nasdaq premium", formatPct(plan.longAnnual), true],
      ["Max loss", `−${formatPct(plan.maxLoss)}`, false],
      ["Max gain", `+${formatPct(plan.maxGain)}`, true],
    ].filter(Boolean);
    for (const [label, value, accent] of stats) {
      const stat = document.createElement("div");
      stat.className = "stat";
      const name = document.createElement("span");
      name.textContent = label;
      const amount = document.createElement("b");
      amount.className = accent ? "num mint" : "num";
      amount.textContent = value;
      stat.append(name, amount);
      grid.append(stat);
    }
    card.append(grid);

    const copy = document.createElement("div");
    copy.className = "stack-text";
    const brokerSentences = plan.broker.why.split(/(?<=[.!])\s+/).slice(0, 2).join(" ");
    const lines = [
      `S$1,000 a month for ${plan.years} years: ${formatSgd(plan.projection.balance)}.`,
      ...plan.notes,
      brokerSentences,
    ].filter(Boolean);
    for (const line of lines) {
      const p = document.createElement("p");
      p.textContent = line;
      copy.append(p);
    }
    card.append(copy);
    const fold = renderFundDetails(plan);
    if (fold) card.append(fold);
  }

  const actions = document.createElement("div");
  actions.className = "actions";
  const again = document.createElement("button");
  again.type = "button";
  again.className = "quiet";
  again.textContent = "Start again";
  again.addEventListener("click", resetQuiz);
  actions.append(again);
  card.append(actions);
  result.append(card);
  if (plan.fits) openCalculator(plan);
  result.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderFundDetails(plan) {
  if (!plan.funds || plan.funds.length === 0) return null;
  const fold = document.createElement("details");
  fold.className = "fund-fold";
  const summary = document.createElement("summary");
  summary.textContent = "About the funds";
  fold.append(summary);
  for (const fund of plan.funds) {
    const block = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = `${fund.weight}% ${fund.ticker}`;
    const name = document.createElement("p");
    name.className = "fund-name";
    name.textContent = fund.name;
    block.append(title, name);
    for (const line of fund.lines) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      block.append(paragraph);
    }
    fold.append(block);
  }
  return fold;
}

function openCalculator(plan) {
  $("years").value = String(plan.years);
  $("risk").value = String(Math.round(plan.riskWeight * 100));
  $("share").value = String(Math.round((1 - (plan.bondWeight || 0)) * 100));
  $("window").value = "y10";
  $("fees").checked = true;
  $("monthly").value = "1000";
  $("start").value = "0";
  state.mix = plan.bondWeight ? "bond" : "equity";
  state.market = plan.market === "us" ? "us" : "global";
  state.venue = plan.venueId;
  state.habit = plan.habit;
  state.loss = Number(plan.loss || 0.8).toFixed(1);
  state.horizon = horizonForYears(plan.years);
  $("calculator").hidden = false;
  render();
}

function resetQuiz() {
  quiz.step = 0;
  quiz.answers = {};
  quiz.plan = null;
  $("result").hidden = true;
  $("result").replaceChildren();
  $("calculator").hidden = true;
  $("quiz").hidden = false;
  renderQuiz();
}

function finishQuiz() {
  showResult(
    suggestPlan({
      loss: quiz.answers.loss,
      horizon: quiz.answers.horizon,
      habit: quiz.answers.habit,
      fx: quiz.answers.fx,
      market: quiz.answers.market,
      currentBroker: selectedBrokers().length ? selectedBrokers() : "none",
      brokerPreference: selectedBrokers().some((id) => id !== "none") ? quiz.answers.prefer : "change",
    }),
  );
}

function render() {
  const bondMix = state.mix === "bond" && state.venue === "lse";
  $("bond-panel").hidden = !bondMix;
  $("share-panel").hidden = bondMix;

  const riskWeight = Math.min(MAX_RISK, Math.max(0, readNumber($("risk"), 20) / 100));
  $("risk").value = String(Math.round(riskWeight * 100));
  $("risk-out").textContent = `${Math.round(riskWeight * 100)}%`;
  const shareWeight = Math.min(1, Math.max(0, readNumber($("share"), 10) / 100));
  $("share").value = String(Math.round(shareWeight * 100));
  $("share-out").textContent = `${Math.round(shareWeight * 100)}%`;

  const rates = bondMix
    ? bondMixRates({
      equityWeight: shareWeight,
      windowId: $("window").value,
      subtractFees: $("fees").checked,
      market: state.market,
    })
    : planRates({
      venueId: state.venue,
      windowId: $("window").value,
      riskWeight,
      subtractFees: $("fees").checked,
      market: state.market,
    });
  const path = project({
    start: readNumber($("start"), 0),
    monthly: readNumber($("monthly"), 0),
    years: readNumber($("years"), 30),
    annualRate: rates.annual,
  });

  $("ending").textContent = formatSgd(path.balance);
  $("blended").textContent = formatPct(rates.annual);
  $("gross").textContent = formatPct(rates.gross);
  $("fee-drag").textContent = formatPct(rates.ter);
  $("contributed").textContent = formatSgd(path.contributed);
  $("growth").textContent = formatSgd(path.growth);
  if (bondMix) {
    $("bond-pct").textContent = `${Math.round(rates.bondW * 100)}%`;
    $("share-pct").textContent = `${Math.round(rates.equityW * 100)}%`;
    $("bond-name").textContent = rates.bond.etf;
    $("share-name").textContent = rates.equity.etf;
    $("bond-note").hidden = !rates.bondSinceLaunch;
    $("pair").textContent = `${rates.bond.detail}. Share fund: ${rates.equity.detail}.`;
    $("extreme-detail").textContent =
      `${rates.bond.etf} ${rates.bond.lossWhen} −${formatPct(rates.bond.maxLoss)}, best year ${rates.bond.gainWhen} +${formatPct(rates.bond.maxGain)}. ` +
      `${rates.equity.etf} ${rates.coreExtreme.lossWhen} −${formatPct(rates.coreExtreme.maxLoss)}, ${rates.coreExtreme.gainLabel || `best year ${rates.coreExtreme.gainWhen}`} +${formatPct(rates.coreExtreme.maxGain)}. ` +
      "Weighted by this mix. The worst periods were not the same months.";
  } else {
    $("core-pct").textContent = `${Math.round(rates.coreW * 100)}%`;
    $("risk-pct").textContent = `${Math.round(rates.riskW * 100)}%`;
    $("core-name").textContent = rates.core.etf;
    $("risk-name").textContent = rates.riskFund.etf;
    $("pair").textContent = `${rates.core.detail}. Higher-risk sleeve: ${rates.riskFund.detail}.`;
    $("extreme-detail").textContent =
      `${rates.core.etf} ${rates.coreExtreme.lossWhen} −${formatPct(rates.coreExtreme.maxLoss)}, ${rates.coreExtreme.gainLabel || `best year ${rates.coreExtreme.gainWhen}`} +${formatPct(rates.coreExtreme.maxGain)}. ` +
      `Nasdaq-100 ${rates.nasdaqExtreme.lossWhen} −${formatPct(rates.nasdaqExtreme.maxLoss)}, best year ${rates.nasdaqExtreme.gainWhen} +${formatPct(rates.nasdaqExtreme.maxGain)}. ` +
      "Weighted by this mix. The worst periods were not the same months.";
  }

  $("max-loss").textContent = `−${formatPct(rates.maxLoss)}`;
  $("max-gain").textContent = `+${formatPct(rates.maxGain)}`;
  $("max-loss-dollars").textContent = `${formatSgd(path.balance * rates.maxLoss)} off the projected value`;
  $("max-gain-dollars").textContent = `${formatSgd(path.balance * rates.maxGain)} on the projected value`;
  $("loss-fill").style.width = `${Math.min(100, rates.maxLoss * 100)}%`;
  $("gain-fill").style.width = `${Math.min(100, rates.maxGain * 100)}%`;

  $("venue-note").textContent = bondMix
    ? `AGGU and ${rates.equity.etf}. London only.`
    : state.mix === "bond"
      ? `${venueNote(state.venue, state.market)} The bond fund is London only, so this is a share plan.`
      : venueNote(state.venue, state.market);
  $("habit-note").textContent = habitNote();
  $("long-note").textContent = rates.longUsesTenYear
    ? "Since-1988 uses the 10-year S&P 500 return. No extra Nasdaq return."
    : "Since-1988 applies to both sleeves. No extra Nasdaq return.";
  renderBroker(bondMix);
  setPressed("venue", state.venue);
  setPressed("habit", state.habit);
  setPressed("market", state.market);
  setPressed("loss", state.loss);

  $("window-warning").hidden = !rates.caution;
  $("long-note").hidden = rates.windowKey !== "long";

  drawChart(chartTicks(path.yearly));
  drawMilestones(path.yearly);
}

function drawMilestones(yearly) {
  const body = $("milestones");
  body.replaceChildren();
  const last = yearly[yearly.length - 1]?.year ?? 0;
  for (const point of yearly) {
    if (point.year === 0) continue;
    if (point.year % 5 !== 0 && point.year !== last) continue;
    const row = document.createElement("tr");
    for (const value of [
      `Year ${point.year}`,
      formatSgd(point.contributed),
      formatSgd(point.balance - point.contributed),
      formatSgd(point.balance),
    ]) {
      const cell = document.createElement("td");
      cell.className = "num";
      cell.textContent = value;
      row.append(cell);
    }
    body.append(row);
  }
}

function drawChart(points) {
  const svg = $("chart");
  const width = 680;
  const height = 280;
  const pad = { l: 64, r: 16, t: 22, b: 48 };
  const max = Math.max(...points.map((p) => p.balance), 1);
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const x = (i) => pad.l + (points.length === 1 ? innerW / 2 : (innerW * i) / (points.length - 1));
  const y = (v) => pad.t + innerH - (innerH * v) / max;
  const line = (key) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");
  const area =
    `${line("balance")} L ${x(points.length - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;

  const grid = [];
  for (let i = 0; i <= 4; i++) {
    const value = (max * i) / 4;
    const yy = y(value);
    grid.push(
      `<line x1="${pad.l}" y1="${yy.toFixed(1)}" x2="${width - pad.r}" y2="${yy.toFixed(1)}" class="grid"></line>`,
      `<text x="${pad.l - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end" class="tick">${axisMoney(value)}</text>`,
    );
  }
  const xLabels = points
    .map((p, i) => `<text x="${x(i).toFixed(1)}" y="${height - 22}" text-anchor="middle" class="tick">${p.year}</text>`)
    .join("");

  svg.innerHTML = `
    <text x="${pad.l}" y="12" class="axis-title">Value in Singapore dollars</text>
    ${grid.join("")}
    <path d="${area}" class="area"></path>
    <path d="${line("contributed")}" class="line contrib"></path>
    <path d="${line("balance")}" class="line value"></path>
    ${xLabels}
    <text x="${(pad.l + (width - pad.r)) / 2}" y="${height - 4}" text-anchor="middle" class="axis-title">Year</text>
  `;
}

function axisMoney(n) {
  if (n >= 1_000_000) return `S$${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `S$${Math.round(n / 1000)}k`;
  return `S$${Math.round(n)}`;
}

applyQuery();
renderQuiz();
$("next").addEventListener("click", () => {
  if (quiz.step === activeQuestions().length - 1) finishQuiz();
  else {
    quiz.step += 1;
    renderQuiz();
  }
});
$("back").addEventListener("click", () => {
  if (quiz.step === 0) return;
  quiz.step -= 1;
  renderQuiz();
});
for (const id of ["start", "monthly", "years", "risk", "share", "window", "fees"]) {
  $(id).addEventListener("input", () => {
    if (id === "years") {
      const bucket = horizonForYears(readNumber($("years"), 20));
      if (bucket !== state.horizon) {
        applyAppetite();
        return;
      }
    }
    render();
  });
}
for (const button of document.querySelectorAll("#calculator [data-group]")) {
  button.addEventListener("click", () => {
    state[button.dataset.group] = button.dataset.value;
    if (button.dataset.group === "loss" || button.dataset.group === "market") applyAppetite();
    else render();
  });
}
render();
