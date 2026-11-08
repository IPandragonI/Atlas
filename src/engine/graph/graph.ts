import type { ChallengeRules, ConnectionType, Country, CountryConnection, RegionDef } from "../types";

/** Traversal view: how a given challenge looks at the shared graph. */
export interface GraphView {
  maritime: boolean;
  /** Strait crossings are traversable (independent of `maritime`). */
  straits?: boolean;
  /** Connections through disputed territory are traversable. */
  disputes?: boolean;
  /** Countries that cannot be used at all. */
  blocked: ReadonlySet<string>;
  /** When set, only these countries can be used. */
  allowed?: ReadonlySet<string>;
}

/**
 * Undirected country graph. One instance is shared by every mode;
 * game rules only change the {@link GraphView} used to traverse it.
 */
export class AtlasGraph {
  readonly countries: ReadonlyMap<string, Country>;
  private readonly adjacency: Record<ConnectionType, Map<string, string[]>> = { land: new Map(), sea: new Map(), strait: new Map(), dispute: new Map() };
  /** Every type a pair is connected by (a pair can be both a sea link and a strait, for instance). */
  private readonly edgeTypes = new Map<string, Set<ConnectionType>>();
  private readonly regions = new Map<string, ReadonlySet<string>>();

  constructor(countries: readonly Country[], connections: readonly CountryConnection[], regions: readonly RegionDef[] = []) {
    this.countries = new Map(countries.map((c) => [c.id, c]));
    for (const c of countries) for (const t of TYPES) this.adjacency[t].set(c.id, []);
    for (const e of connections) this.addEdge(e);
    for (const t of TYPES) for (const list of this.adjacency[t].values()) list.sort();
    for (const r of regions) {
      const members =
        r.kind === "continent"
          ? countries.filter((c) => c.continent === r.id).map((c) => c.id)
          : (r.countries ?? []);
      for (const m of members) if (!this.countries.has(m)) throw new Error(`Region ${r.id}: unknown country ${m}`);
      this.regions.set(r.id, new Set(members));
    }
  }

  private addEdge({ from, to, type }: CountryConnection) {
    if (from === to) throw new Error(`Self connection on ${from}`);
    if (!this.countries.has(from) || !this.countries.has(to)) throw new Error(`Unknown country in edge ${from}-${to}`);
    const k = edgeKey(from, to);
    const types = this.edgeTypes.get(k) ?? new Set<ConnectionType>();
    if (types.has(type)) return; // duplicates of the same type are ignored
    // Land supersedes sea (as before). Strait and dispute links are independent options: they are kept next to a sea link,
    // so that each setting enables exactly its own list and nothing else.
    if (type === "sea" && types.has("land")) return;
    if (type === "land") {
      types.delete("sea");
      this.removeFrom(this.adjacency.sea, from, to);
    }
    types.add(type);
    this.edgeTypes.set(k, types);
    this.adjacency[type].get(from)!.push(to);
    this.adjacency[type].get(to)!.push(from);
  }

  private removeFrom(m: Map<string, string[]>, a: string, b: string) {
    m.set(a, m.get(a)!.filter((x) => x !== b));
    m.set(b, m.get(b)!.filter((x) => x !== a));
  }

  get size(): number {
    return this.countries.size;
  }
  ids(): string[] {
    return [...this.countries.keys()];
  }
  country(id: string): Country {
    const c = this.countries.get(id);
    if (!c) throw new Error(`Unknown country ${id}`);
    return c;
  }
  has(id: string): boolean {
    return this.countries.has(id);
  }
  /** Main connection type between two countries (land, then sea, strait, dispute), if any. */
  connection(a: string, b: string): ConnectionType | undefined {
    const types = this.edgeTypes.get(edgeKey(a, b));
    return types ? TYPES.find((t) => types.has(t)) : undefined;
  }
  /** Every type of connection between two countries (a pair can be a sea link and a strait at once). */
  connectionTypes(a: string, b: string): ConnectionType[] {
    const types = this.edgeTypes.get(edgeKey(a, b));
    return types ? TYPES.filter((t) => types.has(t)) : [];
  }
  landDegree(id: string): number {
    return this.adjacency.land.get(id)?.length ?? 0;
  }
  /** One entry per (pair, type). */
  edges(): CountryConnection[] {
    const out: CountryConnection[] = [];
    for (const [k, types] of this.edgeTypes) {
      const [from, to] = k.split("|");
      for (const type of TYPES) if (types.has(type)) out.push({ from, to, type });
    }
    return out;
  }
  regionMembers(regionId: string): ReadonlySet<string> {
    const r = this.regions.get(regionId);
    if (!r) throw new Error(`Unknown region ${regionId}`);
    return r;
  }
  hasRegion(regionId: string): boolean {
    return this.regions.has(regionId);
  }
  regionIds(): string[] {
    return [...this.regions.keys()];
  }

  /** Neighbours of a country in the given view (sorted, deterministic). */
  neighbors(id: string, view: GraphView): string[] {
    if (view.blocked.has(id)) return [];
    const out: string[] = [];
    const consider = (n: string) => {
      if (view.blocked.has(n)) return;
      if (view.allowed && !view.allowed.has(n)) return;
      out.push(n);
    };
    for (const n of this.adjacency.land.get(id) ?? []) consider(n);
    let extra = false;
    for (const [on, type] of [[view.maritime, "sea"], [view.straits, "strait"], [view.disputes, "dispute"]] as const) {
      if (!on) continue;
      extra = true;
      for (const n of this.adjacency[type].get(id) ?? []) if (!out.includes(n)) consider(n); // a pair can appear under several types
    }
    return extra ? out.sort() : out;
  }

  /** Build the traversal view for a set of challenge rules. */
  viewFor(rules: ChallengeRules, keep: readonly string[] = []): GraphView {
    const blocked = new Set<string>(rules.forbidden);
    if (rules.avoidRegion) for (const id of this.regionMembers(rules.avoidRegion)) blocked.add(id);
    for (const k of keep) blocked.delete(k);
    return {
      maritime: rules.maritime,
      straits: rules.straits === true,
      disputes: rules.disputes === true,
      blocked,
      allowed: rules.allowedRegion ? this.regionMembers(rules.allowedRegion) : undefined,
    };
  }
}

/** Display / priority order of the connection types. */
const TYPES: readonly ConnectionType[] = ["land", "sea", "strait", "dispute"];

export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
