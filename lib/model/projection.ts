export type SegmentInput = { leads: number; response: number; proposalRate: number; signRate: number };
export type InkindScope = "all" | "new_only";

export type ProjectionInput = {
  signedToDate: number;
  openProspectInr: number;
  closeRate: number;
  inkindShare: number;
  prefestShare: number;
  avgNewDeal: number;
  warm: SegmentInput;
  other: SegmentInput;
  observedInkindShare?: number;
  inkindScope?: InkindScope;
  signedDealsToDate?: number;
  openProspectCount?: number;
};

export type ProjectionResult = {
  signed: number;
  cashBeforeFest: number;
  floorCash: number;
  newSigned: number;
  openClosed: number;
  newDeals: number;
  openDeals: number;
  totalDeals: number;
};

const fix = (x: number): number => Math.round(Math.round(x * 1e6) / 1e6);

export const segmentDeals = (s: SegmentInput): number => s.leads * s.response * s.proposalRate * s.signRate;

export function floorCash(input: Pick<ProjectionInput, "signedToDate" | "prefestShare" | "inkindShare" | "observedInkindShare">): number {
  const obs = input.observedInkindShare ?? input.inkindShare;
  return fix(input.signedToDate * (1 - obs) * input.prefestShare);
}

export function project(input: ProjectionInput): ProjectionResult {
  const obs = input.observedInkindShare ?? input.inkindShare;
  const scope = input.inkindScope ?? "all";
  const newDeals = segmentDeals(input.warm) + segmentDeals(input.other);
  const newSigned = newDeals * input.avgNewDeal;
  const openClosed = input.openProspectInr * input.closeRate;
  const signed = input.signedToDate + openClosed + newSigned;
  const keep = 1 - input.inkindShare;
  const cash =
    scope === "all"
      ? signed * keep * input.prefestShare
      : (input.signedToDate * (1 - obs) + (openClosed + newSigned) * keep) * input.prefestShare;
  const openDeals = (input.openProspectCount ?? 0) * input.closeRate;
  return {
    signed: fix(signed),
    cashBeforeFest: fix(cash),
    floorCash: floorCash(input),
    newSigned: fix(newSigned),
    openClosed: fix(openClosed),
    newDeals: Math.round(newDeals * 1e6) / 1e6,
    openDeals,
    totalDeals: (input.signedDealsToDate ?? 0) + openDeals + newDeals,
  };
}

export type ScenarioSettings = {
  closeRate: number;
  inkindShare: number;
  warm: { response: number; proposalRate: number; signRate: number };
  other: { response: number; proposalRate: number; signRate: number };
};

export type ModelSettings = {
  avgNewDeal: number;
  prefestShare: number;
  inkindScope: InkindScope;
  stretchWarmLeads: number;
  stretchOtherLeads: number;
  artistLeads: number;
  base: ScenarioSettings;
  stretch: ScenarioSettings;
};

export const DEFAULT_SETTINGS: ModelSettings = {
  avgNewDeal: 125_000,
  prefestShare: 0.75,
  inkindScope: "all",
  stretchWarmLeads: 85,
  stretchOtherLeads: 42,
  artistLeads: 30,
  base: {
    closeRate: 0.25,
    inkindShare: 0.1,
    warm: { response: 0.5, proposalRate: 0.4, signRate: 0.5 },
    other: { response: 0.25, proposalRate: 0.04, signRate: 0.5 },
  },
  stretch: {
    closeRate: 0.4,
    inkindShare: 0.05,
    warm: { response: 0.6, proposalRate: 0.5, signRate: 0.5 },
    other: { response: 0.25, proposalRate: 0.08, signRate: 0.5 },
  },
};

export type PlanState = {
  signedToDate: number;
  signedDealsToDate: number;
  openProspectInr: number;
  openProspectCount: number;
  queueWarm: number;
  queueOther: number;
  observedInkindShare: number;
};

export type Scenario = "base" | "stretch";

export function scenarioInput(state: PlanState, scenario: Scenario, settings: ModelSettings = DEFAULT_SETTINGS): ProjectionInput {
  const sc = settings[scenario];
  const warmLeads = scenario === "base" ? state.queueWarm : settings.stretchWarmLeads;
  const otherLeads = scenario === "base" ? state.queueOther : settings.stretchOtherLeads;
  return {
    signedToDate: state.signedToDate,
    openProspectInr: state.openProspectInr,
    closeRate: sc.closeRate,
    inkindShare: sc.inkindShare,
    prefestShare: settings.prefestShare,
    avgNewDeal: settings.avgNewDeal,
    warm: { leads: warmLeads, ...sc.warm },
    other: { leads: otherLeads, ...sc.other },
    observedInkindShare: state.observedInkindShare,
    inkindScope: settings.inkindScope,
    signedDealsToDate: state.signedDealsToDate,
    openProspectCount: state.openProspectCount,
  };
}

export type PlanProjection = { floor: number; base: ProjectionResult; stretch: ProjectionResult };

export function projectPlan(state: PlanState, settings: ModelSettings = DEFAULT_SETTINGS): PlanProjection {
  return {
    floor: floorCash({ ...scenarioInput(state, "base", settings) }),
    base: project(scenarioInput(state, "base", settings)),
    stretch: project(scenarioInput(state, "stretch", settings)),
  };
}

type Patch = {
  [K in keyof ModelSettings]?: ModelSettings[K] extends object ? Partial<{ [J in keyof ModelSettings[K]]: unknown }> : ModelSettings[K];
};

export function mergeSettings(patch: Patch = {}, from: ModelSettings = DEFAULT_SETTINGS): ModelSettings {
  const p = patch as Record<string, unknown>;
  const scen = (k: Scenario): ScenarioSettings => {
    const q = (p[k] ?? {}) as Partial<ScenarioSettings>;
    return {
      ...from[k],
      ...q,
      warm: { ...from[k].warm, ...(q.warm ?? {}) },
      other: { ...from[k].other, ...(q.other ?? {}) },
    };
  };
  return { ...from, ...(patch as Partial<ModelSettings>), base: scen("base"), stretch: scen("stretch") };
}