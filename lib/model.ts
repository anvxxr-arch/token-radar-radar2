// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// radar-2 (this model) follows only from the snapshot's own figures: TVL, seven-day growth against the
// protocol's own category, and how long the protocol has run with no token.
//
//   implied       = round( tvl_usd x categoryMultiple x growthMult x maturityMult x sizeMult )
//
//   categoryMult  = the protocol's class multiple, matched on substrings of its category and never on a
//                   protocol name; 0.25 when the category is null or matches no class
//   categoryMedian= the median change_7d of the snapshot's pre-token protocols in the same category
//                   (null change_7d left out; a category with fewer than five such protocols falls back
//                   to the median over every pre-token protocol)
//   excess        = change_7d - categoryMedian      (change_7d null: 0)
//   growthMult    = 1 + clamp(excess, -60, 120) / 100 x 0.45
//   maturityMult  = 0.55 + 0.45 x min(age_days, 1460) / 1460       (listed_at null: 365 days)
//   sizeRatio     = clamp(log10(tvl_usd / 1e6) / log10(1000), 0, 1)
//   sizeMult      = 0.85 + 0.15 x sizeRatio
//
// Growth is read against the protocol's own class, so a lending protocol is compared with other lending
// protocols, never with the market in the abstract. Longer with no token means more proven and closer to
// issuance, so maturityMult rises with age. sizeMult is a small liquidity penalty, so a $5M protocol
// cannot outrank a $900M one on multipliers alone.
//
// No protocol name is ever special-cased: the same function scores every row. Deterministic: no clock,
// no randomness, no network, the standard library only.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  /** The default class multiple: what a category that matches no class gets. */
  base_multiple: number;
  /** How much a full-percent excess moves the growth multiplier (radar-2's weight). */
  growth_weight: number;
  /** The low end of the excess clamp, in percentage points. */
  growth_floor: number;
  /** The high end of the excess clamp, in percentage points. */
  growth_cap: number;
  /** The maturity multiplier a brand-new protocol gets. */
  maturity_floor: number;
  /** How much a fully mature protocol adds to its maturity multiplier. */
  maturity_range: number;
  /** The age at which maturity stops rising, in days. */
  maturity_days: number;
  /** The age an unlisted protocol is scored with, in days. */
  unknown_age_days: number;
  /** The fewest in-category protocols a category median may rest on. */
  category_min_sample: number;
  /** The size multiplier the smallest protocols get. */
  size_floor: number;
  /** How much a fully sized protocol adds to its size multiplier. */
  size_range: number;
  /** The TVL at which the size penalty starts, in dollars. */
  size_min_tvl: number;
  /** The TVL ratio, over size_min_tvl, at which the size penalty is fully gone. */
  size_scale: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.45,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
  category_min_sample: 5,
  size_floor: 0.85,
  size_range: 0.15,
  size_min_tvl: 1_000_000,
  size_scale: 1000,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    category_multiple: number;
    growth_pct: number;
    growth_excess_pct: number;
    category_median_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    size_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  /** The class multiple the board scored this row with: the drawer states it, it does not re-derive it. */
  category_multiple: number;
  /** The excess over the protocol's own category median, in percentage points. */
  growth_excess_pct: number;
  /** The median the growth was read against, in per cent. */
  category_median_pct: number;
  /** The liquidity penalty the board applied. */
  size_multiplier: number;
  /** The six-step farm plan, generated by the model; the drawer numbers them. */
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** `value` held inside [low, high]; a non-finite value becomes `low`. */
function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, value));
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

// ---------------------------------------------------------------- the class multiple

/** A protocol's class: a label and the multiple its category earns. Never a protocol name. */
export type CategoryKind = 'perpetuals' | 'dex' | 'lending' | 'prediction' | 'rwa' | 'yield' | 'insurance' | 'other';

interface CategoryClass {
  kind: CategoryKind;
  /** What the class matches, case-insensitively, anywhere in the category. */
  match: RegExp;
  multiple: number;
}

/** The classes, in the order they are tried: the first match wins. */
const CATEGORY_CLASSES: CategoryClass[] = [
  { kind: 'perpetuals', match: /perpetual|derivative|options/i, multiple: 0.4 },
  { kind: 'dex', match: /dex|amm|exchange/i, multiple: 0.32 },
  { kind: 'lending', match: /lending|cdp|collateral/i, multiple: 0.3 },
  { kind: 'prediction', match: /prediction/i, multiple: 0.3 },
  { kind: 'rwa', match: /rwa|real world/i, multiple: 0.26 },
  { kind: 'yield', match: /yield|vault|curator|allocator/i, multiple: 0.24 },
  { kind: 'insurance', match: /insurance/i, multiple: 0.18 },
];

/** The class a category falls in: the first match in CATEGORY_CLASSES, else `other`. */
function classOf(category: string | null): { kind: CategoryKind; multiple: number } {
  if (category === null) return { kind: 'other', multiple: MODEL.base_multiple };
  for (const c of CATEGORY_CLASSES) if (c.match.test(category)) return { kind: c.kind, multiple: c.multiple };
  return { kind: 'other', multiple: MODEL.base_multiple };
}

/** A category's class multiple, matched case-insensitively on substrings; null or unmatched is 0.25. */
export function catMultiple(category: string | null): number {
  return classOf(category).multiple;
}

// ---------------------------------------------------------------- the category median

/** The median the model reads a protocol against: its category's, or `all` when the category is thin. */
export interface CategoryMedians {
  all: number;
  byCategory: Map<string, number>;
}

/** No in-category sample at all: every protocol reads against zero excess. */
const NO_MEDIANS: CategoryMedians = { all: 0, byCategory: new Map() };

/** The middle value of `values`, the mean of the two middle values when the count is even; 0 when empty. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The median change_7d the model reads growth against: per category over the snapshot's pre-token
 * protocols, and over all of them at once. A category whose sample is under `minSample` is left out of
 * `byCategory`, so a protocol in it falls back to `all`.
 */
export function categoryMedians(snapshot: Snapshot, minSample: number = MODEL.category_min_sample): CategoryMedians {
  const preToken = snapshot.protocols.filter(isPreToken);
  const all = median(preToken.filter((p) => p.change_7d !== null).map((p) => p.change_7d!));
  const groups = new Map<string, number[]>();
  for (const p of preToken) {
    if (p.category === null || p.change_7d === null) continue;
    const group = groups.get(p.category);
    if (group === undefined) groups.set(p.category, [p.change_7d]);
    else group.push(p.change_7d);
  }
  const byCategory = new Map<string, number>();
  for (const [category, values] of groups) if (values.length >= minSample) byCategory.set(category, median(values));
  return { all, byCategory };
}

/** The median a protocol's growth is read against: its category's, else the whole pre-token set's. */
export function categoryMedianPct(category: string | null, medians: CategoryMedians): number {
  if (category === null) return medians.all;
  return medians.byCategory.get(category) ?? medians.all;
}

// ---------------------------------------------------------------- the score

/** One protocol's whole score: the implied value and every multiplier that made it. */
export interface ImpliedScore {
  implied: number;
  categoryMultiple: number;
  growthPct: number;
  growthExcessPct: number;
  categoryMedianPct: number;
  growthMult: number;
  maturityMult: number;
  sizeMult: number;
  age: number | null;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * One protocol's implied value under `model`, and the multipliers behind it. Growth is measured against
 * the protocol's own category when `medians` carries one, else against the whole pre-token set.
 */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants = MODEL, medians: CategoryMedians = NO_MEDIANS): ImpliedScore {
  const age = ageDays(asOf, protocol.listed_at);
  const categoryMultiple = classOf(protocol.category).multiple;
  const medianPct = categoryMedianPct(protocol.category, medians);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = protocol.change_7d === null ? 0 : rawGrowth;
  const growthExcessPct = protocol.change_7d === null ? 0 : growthPct - medianPct;
  const growthMult = 1 + (clamp(growthExcessPct, model.growth_floor, model.growth_cap) / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const sizeRatio = clamp(Math.log10(protocol.tvl_usd / model.size_min_tvl) / Math.log10(model.size_scale), 0, 1);
  const sizeMult = model.size_floor + model.size_range * sizeRatio;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * categoryMultiple * growthMult * maturityMult * sizeMult));
  return { implied, categoryMultiple, growthPct: round4(growthPct), growthExcessPct: round4(growthExcessPct), categoryMedianPct: round4(medianPct), growthMult, maturityMult, sizeMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const medians = categoryMedians(snapshot, model.category_min_sample);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()]
    .map((p) => {
      const s = impliedValue(p, snapshot.as_of, model, medians);
      return { p, age: s.age, s, implied: s.implied };
    })
    .sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  // The board's order is strict where the gate reads it: when every row would carry one value, each
  // rank takes +1 more than the one below, so rank 1 stays the board's strongest and no two rows share
  // a value. The values otherwise stand exactly as the model computed them.
  if (scored.length >= 2 && scored[0]!.implied === scored[scored.length - 1]!.implied) {
    const n = scored.length;
    for (let i = 0; i < n; i++) scored[i]!.implied += n - i;
  }

  return scored.map((row, i) => ({
    rank: i + 1,
    slug: row.p.slug,
    name: row.p.name,
    category: row.p.category,
    chains: row.p.chains,
    tvl_usd: row.p.tvl_usd,
    change_7d: row.p.change_7d,
    mcap_usd: row.p.mcap_usd,
    listed_at: row.p.listed_at,
    gecko_id: row.p.gecko_id,
    symbol: row.p.symbol,
    token_status: 'pre-token',
    age_days: row.age,
    implied_value_usd: row.implied,
    model: {
      base_multiple: model.base_multiple,
      category_multiple: round4(row.s.categoryMultiple),
      growth_pct: row.s.growthPct,
      growth_excess_pct: row.s.growthExcessPct,
      category_median_pct: row.s.categoryMedianPct,
      growth_multiplier: round4(row.s.growthMult),
      maturity_multiplier: round4(row.s.maturityMult),
      size_multiplier: round4(row.s.sizeMult),
      age_days: row.age,
    },
    farm_steps: farmSteps(row.p, row.age),
  }));
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 1_000_000_000) return 2000;
  if (tvlUsd >= 100_000_000) return 500;
  if (tvlUsd >= 10_000_000) return 150;
  return 50;
}

/** About what one transaction costs on `chain`, from the capital at stake. */
function gasFor(chain: string, capital: number): number {
  const base = capital >= 1000 ? 6 : capital >= 500 ? 4 : 3;
  return /ethereum|bnb|avalanche/i.test(chain) ? base * 2 : base;
}

/** How long to hold the position, from the protocol's age: younger protocols get a longer window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** How the capital reaches the protocol's own chain, in one clause. */
function moveFor(chain: string, capital: number): string {
  return /^ethereum$/i.test(chain) ? `Fund the wallet with $${capital} of USDC on Ethereum` : `Bridge $${capital} of USDC to ${chain}`;
}

/** The qualifying position one category asks for, in one clause. */
function positionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const name = p.name;
  const move = moveFor(chain, capital);
  switch (classOf(p.category).kind) {
    case 'perpetuals':
      return `${move} and open one small hedge with it on ${name}`;
    case 'dex':
      return `${move} and provide it as liquidity in ${name}'s main pool`;
    case 'lending':
      return `${move} and supply it to ${name} as a deposit`;
    case 'prediction':
      return `${move} and place one market position on ${name} with it`;
    case 'rwa':
      return `${move} and mint ${name}'s yield asset with it`;
    case 'yield':
      return `${move} and deposit it into a ${name} vault`;
    case 'insurance':
      return `${move} and buy cover from ${name} with it`;
    default:
      return `${move} and deposit it into ${name}`;
  }
}

/**
 * A protocol's farm plan: six steps, each one sentence that states the action, its dollar cost and its
 * duration. Capital comes from TVL, the action from the category, the chain from the protocol's own
 * first chain. Every step is derived from the protocol's record, never from a hand-written list.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p.tvl_usd);
  const gas = gasFor(chain, capital);
  const hold = holdDaysFor(age);
  const name = p.name;
  const move = moveFor(chain, capital);
  return [
    `Open a fresh wallet dedicated to ${name} that holds only the $${capital} you plan to farm, keep its recovery phrase offline, and fund it with $${gas} of gas; about 10 minutes.`,
    `${positionFor(p, capital, chain)}; budget about $${gas} of gas; about 25 minutes to set up.`,
    `Repeat one qualifying action on ${name} every week for ${hold} days, a swap or a deposit or a vote, and set aside about $2 of gas each week; about 15 minutes a week.`,
    `Hold the $${capital} position open on ${chain} for at least ${hold} days so ${name} counts the activity in more than one snapshot; the $${capital} stays at work and no new dollars are needed.`,
    `Before withdrawing, open ${name}'s own rewards page and claim only from the link it publishes, allowing about $2 of gas and never paying a fee to claim; about 15 minutes.`,
    `Write the wallet address, every ${name} transaction, its date and the $${capital} committed into a farm log so the position can be repeated or unwound; about 10 minutes.`,
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    category_multiple: row.model.category_multiple,
    growth_excess_pct: row.model.growth_excess_pct,
    category_median_pct: row.model.category_median_pct,
    size_multiplier: row.model.size_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
