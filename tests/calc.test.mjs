import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const { bondMixRates, planRates, project, suggestPlan } = createRequire(import.meta.url)("../calc.js");

test("default 20% Nasdaq, 10-year window, fees on", () => {
  const rates = planRates({
    coreId: "allworld",
    windowId: "y10",
    riskWeight: 0.2,
    subtractFees: true,
  });
  assert.ok(Math.abs(rates.gross - (0.8 * 0.1292 + 0.2 * 0.2009)) < 1e-12);
  assert.ok(Math.abs(rates.ter - (0.8 * 0.0019 + 0.2 * 0.003)) < 1e-12);
  assert.ok(Math.abs(rates.annual - (rates.gross - rates.ter)) < 1e-12);
});

test("risk weight stays a minority of the portfolio", () => {
  const rates = planRates({
    coreId: "developed",
    windowId: "y5",
    riskWeight: 0.8,
    subtractFees: false,
  });
  assert.equal(rates.riskW, 0.45);
  assert.equal(rates.core.etf, "XWR");
  assert.equal(rates.riskFund.etf, "XND");
});

test("long window removes the Nasdaq premium", () => {
  const rates = planRates({
    coreId: "allworld",
    windowId: "long",
    riskWeight: 0.2,
    subtractFees: false,
  });
  assert.equal(rates.coreR, 0.0889);
  assert.equal(rates.riskR, 0.0889);
  assert.equal(rates.gross, 0.0889);
});

test("month-end contributions match the closed-form value", () => {
  const annual = 0.07;
  const start = 10_000;
  const monthly = 500;
  const years = 10;
  const path = project({ start, monthly, years, annualRate: annual });
  const r = Math.pow(1 + annual, 1 / 12) - 1;
  const months = years * 12;
  const closed =
    start * Math.pow(1 + r, months) + monthly * ((Math.pow(1 + r, months) - 1) / r);
  assert.ok(Math.abs(path.balance - closed) < 0.01);
  assert.equal(path.contributed, start + monthly * months);
});

test("a larger Nasdaq sleeve widens both historical extremes", () => {
  const calm = planRates({ venueId: "lse", windowId: "y10", riskWeight: 0, subtractFees: true });
  const tilted = planRates({ venueId: "lse", windowId: "y10", riskWeight: 0.45, subtractFees: true });
  assert.equal(calm.core.etf, "VWRA");
  assert.ok(tilted.maxLoss > calm.maxLoss);
  assert.ok(tilted.maxGain > calm.maxGain);
  assert.ok(Math.abs(calm.maxLoss - 0.5806) < 1e-12);
  assert.ok(Math.abs(tilted.maxLoss - (0.55 * 0.5806 + 0.45 * 0.83)) < 1e-12);
  assert.ok(Math.abs(tilted.maxGain - (0.55 * 0.273 + 0.45 * 1.0195)) < 1e-12);
});

test("SGX uses the developed-market pair", () => {
  const rates = planRates({ venueId: "sgx", windowId: "y5", riskWeight: 0.2, subtractFees: false });
  assert.equal(rates.core.etf, "XWR");
  assert.equal(rates.riskFund.etf, "XND");
  assert.ok(Math.abs(rates.maxLoss - (0.8 * 0.5746 + 0.2 * 0.83)) < 1e-12);
});

test("a long horizon and a deep loss limit take the highest Nasdaq sleeve", () => {
  const plan = suggestPlan({
    loss: 0.8,
    gain: 0.6,
    horizon: "long",
    habit: "recurring",
    fx: "both",
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.venueId, "lse");
  assert.equal(plan.riskWeight, 0.45);
  assert.equal(plan.years, 20);
  assert.equal(plan.gainCapped, false);
  assert.equal(plan.headline, "55% VWRA and 45% CNDX");
  assert.equal(plan.broker.id, "fsm");
  assert.match(plan.broker.why, /0% buy processing fee/);
  assert.match(plan.broker.why, /£15/);
  assert.match(plan.broker.alt, /0\.05%/);
  assert.match(plan.fxNote, /convert Singapore dollars/);
  assert.ok(plan.projection.balance > plan.projection.contributed);
});

test("a 20-point gap maps 20% and 40% to a bond mix and 60% and 80% to Nasdaq slices", () => {
  const plans = [0.2, 0.4, 0.6, 0.8].map((loss) => (
    suggestPlan({ loss, horizon: "long", habit: "recurring", fx: "both" })
  ));
  assert.deepEqual(plans.map((plan) => plan.headline), [
    "90% AGGU and 10% VWRA",
    "55% VWRA and 45% AGGU",
    "95% VWRA and 5% CNDX",
    "55% VWRA and 45% CNDX",
  ]);
  assert.ok(Math.abs(plans[0].bondWeight - 0.9) < 1e-9);
  assert.ok(Math.abs(plans[1].bondWeight - 0.45) < 1e-9);
  assert.equal(plans[0].longAnnual, null);
  assert.equal(plans[0].rateLabel, "Bond fund since Nov 2017, share fund over 10 years");
  assert.equal(plans[3].rateLabel, "10-year average after fees");
  const calm = 0.9 * 0.0152 + 0.1 * (0.1292 - 0.0019);
  assert.match(`${plans[0].message} ${plans[0].notes.join(" ")}`, /11\.65%/);
  assert.match(plans[0].funds[0].lines.join(" "), /since-launch figure/);
  assert.ok(Math.abs(plans[0].annual - calm) < 1e-12);
  const opened = bondMixRates({ equityWeight: 0.1, windowId: "y10", subtractFees: true });
  assert.ok(Math.abs(opened.annual - plans[0].annual) < 1e-12);
  assert.ok(Math.abs(opened.bondW - 0.9) < 1e-9);
  assert.ok(plans[0].maxLoss <= 0.2);
  assert.ok(plans[1].maxLoss <= 0.4);
  assert.deepEqual(plans[0].funds.map((fund) => fund.ticker), ["AGGU", "VWRA"]);
  assert.equal(plans[0].funds[0].weight, 90);
  assert.match(plans[0].funds[0].lines.join(" "), /6\.02 years/);
  assert.deepEqual(plans[3].funds.map((fund) => `${fund.weight}% ${fund.ticker}`), ["55% VWRA", "45% CNDX"]);
  assert.match(plans[3].funds[1].lines.join(" "), /83\.00%/);
});

test("a 60% loss limit keeps the sleeve at 5% and says when the hoped gain needs more", () => {
  const plan = suggestPlan({
    loss: 0.6,
    gain: 0.4,
    horizon: "long",
    habit: "manual",
    fx: "sgd",
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.venueId, "sgx");
  assert.equal(plan.riskWeight, 0.05);
  assert.equal(plan.headline, "95% XWR and 5% XND");
  assert.match(plan.funds.map((fund) => fund.lines.join(" ")).join(" "), /Dividends stay inside the fund/);
  assert.match(plan.funds.find((fund) => fund.ticker === "XND").lines.join(" "), /66\.85%/);
  assert.equal(plan.gainCapped, true);
  assert.match(`${plan.message} ${plan.notes.join(" ")}`, /safer weight/);
  assert.equal(plan.broker.id, "longbridge");
  assert.match(plan.broker.why, /0\.03%/);
  assert.match(plan.broker.why, /S\$0\.99/);
  assert.match(plan.broker.alt, /Moomoo/);
  assert.match(plan.fxNote, /no conversion step/);
  const rates = planRates({ venueId: "sgx", windowId: "y10", riskWeight: 0.05, subtractFees: true });
  assert.ok(Math.abs(plan.ter - rates.ter) < 1e-12);
  assert.ok(Math.abs(plan.annual - rates.annual) < 1e-12);
});

test("a 7 to 15 year horizon caps the sleeve at 15%", () => {
  const plan = suggestPlan({
    loss: 0.8,
    gain: 0.6,
    horizon: "mid",
    habit: "recurring",
    fx: "both",
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.riskWeight, 0.15);
  assert.equal(plan.years, 10);
  assert.equal(plan.horizonCapped, true);
  assert.match(plan.message, /15%/);
  assert.equal(plan.gainCapped, true);
  assert.equal(plan.broker.id, "fsm");
  assert.match(plan.broker.why, /0% buy processing fee/);
});

test("under 7 years forces a 0% sleeve and leads with that warning", () => {
  const plan = suggestPlan({
    loss: 0.8,
    gain: 0.2,
    horizon: "under7",
    habit: "manual",
    fx: "both",
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.riskWeight, 0);
  assert.equal(plan.years, 5);
  assert.equal(plan.headline, "100% VWRA");
  assert.match(plan.message, /under 7 years/);
  assert.equal(plan.broker.id, "ibkr");
  assert.match(plan.broker.why, /0\.05%/);
  assert.match(plan.broker.why, /£1/);
  const long = planRates({ venueId: "lse", windowId: "long", riskWeight: 0, subtractFees: true });
  assert.ok(Math.abs(plan.longAnnual - long.annual) < 1e-12);
});

test("a drop under the bond fund's own fall does not invent a calmer mix", () => {
  const plan = suggestPlan({
    loss: 0.1,
    gain: 0.2,
    horizon: "long",
    habit: "recurring",
    fx: "both",
  });
  assert.equal(plan.fits, false);
  assert.equal(plan.reason, "loss");
  assert.equal(plan.broker, null);
  assert.match(plan.message, /15\.45%/);
  assert.match(plan.message, /does not fit/);
});

test("a bond plan stays on Interactive Brokers instead of sending the buy elsewhere", () => {
  const plan = suggestPlan({
    loss: 0.2,
    horizon: "long",
    habit: "recurring",
    fx: "both",
    currentBroker: "ibkr",
    brokerPreference: "change",
  });
  assert.equal(plan.broker.id, "ibkr");
  assert.equal(plan.broker.decision, "stay");
  assert.match(plan.broker.why, /Stay on Interactive Brokers/);
  assert.match(plan.broker.why, /AGGU/);
  assert.doesNotMatch(plan.broker.why, /Switch/);
  assert.doesNotMatch(plan.broker.alt, /FSM/);
});

test("a 20% drop on the Singapore exchange still uses the London bond fund", () => {
  const plan = suggestPlan({
    loss: 0.2,
    horizon: "long",
    habit: "manual",
    fx: "sgd",
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.venueId, "lse");
  assert.equal(plan.headline, "90% AGGU and 10% VWRA");
  assert.match(plan.message, /Singapore exchange/);
  assert.equal(plan.broker.id, "ibkr");
});

test("refusing exchange-rate risk does not treat SGX as a hedge", () => {
  const plan = suggestPlan({
    loss: 0.8,
    gain: 0.4,
    horizon: "long",
    habit: "recurring",
    fx: "none",
  });
  assert.equal(plan.fits, false);
  assert.equal(plan.reason, "fx");
  assert.equal(plan.venueId, null);
  assert.equal(plan.broker, null);
  assert.match(plan.message, /does not fit/);
  assert.match(plan.message, /US dollar/);
});

test("SGX recurring uses FSM and names the one-off sell fee", () => {
  const plan = suggestPlan({
    loss: 0.8,
    gain: 0.2,
    horizon: "long",
    habit: "recurring",
    fx: "sgd",
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.broker.id, "fsm");
  assert.match(plan.broker.why, /XWR and XND/);
  assert.match(plan.broker.why, /S\$3\.80/);
  assert.match(plan.fundLine, /XWR at 0\.12%/);
  assert.match(plan.fundLine, /XND at 0\.20%/);
  assert.match(plan.broker.confirm, /before the first automatic buy/);
});

test("keeping a brokerage that can buy the plan stays there", () => {
  const plan = suggestPlan({
    loss: 0.8,
    gain: 0.2,
    horizon: "long",
    habit: "manual",
    fx: "sgd",
    currentBroker: "moomoo",
    brokerPreference: "keep",
  });
  assert.equal(plan.broker.id, "moomoo");
  assert.equal(plan.broker.decision, "stay");
  assert.match(plan.broker.why, /Stay on Moomoo/);
  assert.match(plan.broker.why, /0\.04% to 0\.06%/);
  assert.match(plan.broker.alt, /Longbridge/);
});

test("keeping Moomoo for a London recurring plan switches to FSM", () => {
  const plan = suggestPlan({
    loss: 0.8,
    gain: 0.2,
    horizon: "long",
    habit: "recurring",
    fx: "both",
    currentBroker: "moomoo",
    brokerPreference: "keep",
  });
  assert.equal(plan.broker.id, "fsm");
  assert.equal(plan.broker.decision, "switch");
  assert.match(plan.broker.why, /London Stock Exchange/);
  assert.match(plan.broker.why, /switch to FSM Global/);
  assert.match(plan.broker.why, /0% buy processing fee/);
});

test("asking to switch leaves a fitting current account when it is already the pick", () => {
  const plan = suggestPlan({
    loss: 0.8,
    gain: 0.2,
    horizon: "long",
    habit: "manual",
    fx: "both",
    currentBroker: "ibkr",
    brokerPreference: "change",
  });
  assert.equal(plan.broker.id, "ibkr");
  assert.equal(plan.broker.decision, "stay");
  assert.match(plan.broker.why, /already the brokerage/);
});

test("keeping several accounts uses the one that can place the buy", () => {
  const plan = suggestPlan({
    loss: 0.8,
    gain: 0.2,
    horizon: "long",
    habit: "manual",
    fx: "sgd",
    currentBroker: ["moomoo", "longbridge"],
    brokerPreference: "keep",
  });
  assert.equal(plan.broker.id, "longbridge");
  assert.equal(plan.broker.decision, "stay");
  assert.match(plan.broker.why, /Stay on Longbridge/);
  assert.match(plan.broker.why, /Moomoo/);
});

test("keeping accounts that cannot buy London still switches", () => {
  const plan = suggestPlan({
    loss: 0.8,
    gain: 0.2,
    horizon: "long",
    habit: "recurring",
    fx: "both",
    currentBroker: ["moomoo", "longbridge"],
    brokerPreference: "keep",
  });
  assert.equal(plan.broker.id, "fsm");
  assert.equal(plan.broker.decision, "switch");
  assert.match(plan.broker.why, /Moomoo cannot run this buy/);
  assert.match(plan.broker.why, /Longbridge cannot run this buy/);
  assert.match(plan.fxNote, /4\.6%/);
  assert.match(plan.fxNote, /8\.4%/);
});

test("asking to switch from Moomoo on SGX manual uses Longbridge", () => {
  const plan = suggestPlan({
    loss: 0.8,
    gain: 0.2,
    horizon: "long",
    habit: "manual",
    fx: "sgd",
    currentBroker: "moomoo",
    brokerPreference: "change",
  });
  assert.equal(plan.broker.id, "longbridge");
  assert.equal(plan.broker.decision, "switch");
  assert.match(plan.broker.why, /Switch from Moomoo to Longbridge/);
});

test("keeping Interactive Brokers for automatic buys hides the Singapore-listed funds", () => {
  const { allowedFxChoices, canKeepBroker } = createRequire(import.meta.url)("../calc.js");
  assert.equal(canKeepBroker("recurring", ["ibkr"]), true);
  const choices = allowedFxChoices({
    habit: "recurring",
    currentBroker: ["ibkr"],
    brokerPreference: "keep",
  });
  assert.deepEqual(choices.map((choice) => choice.value), ["both"]);
});

test("keeping Moomoo for manual buys hides the London funds", () => {
  const { allowedFxChoices } = createRequire(import.meta.url)("../calc.js");
  const choices = allowedFxChoices({
    habit: "manual",
    currentBroker: ["moomoo", "longbridge"],
    brokerPreference: "keep",
  });
  assert.deepEqual(choices.map((choice) => choice.value), ["sgd"]);
});

test("an automatic buy on Moomoo cannot stay, because neither market is available", () => {
  const { canKeepBroker, allowedFxChoices } = createRequire(import.meta.url)("../calc.js");
  assert.equal(canKeepBroker("recurring", ["moomoo"]), false);
  const choices = allowedFxChoices({
    habit: "recurring",
    currentBroker: ["moomoo"],
    brokerPreference: "change",
  });
  assert.deepEqual(choices.map((choice) => choice.value), ["both", "sgd"]);
});

test("Nasdaq cumulative figures annualize to the rates in the model", () => {
  const ann = (cumulative, years) => Math.pow(1 + cumulative, 1 / years) - 1;
  assert.ok(Math.abs(ann(1.0665, 3) - 0.2737) < 0.0002);
  assert.ok(Math.abs(ann(1.0701, 5) - 0.1566) < 0.0002);
  assert.ok(Math.abs(ann(5.2367, 10) - 0.2009) < 0.0002);
});
