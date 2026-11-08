import type { ChallengeRules, ConnectionType, Country, CountryConnection, RegionDef } from "../types";

/** Traversal view: how a given challenge looks at the shared graph. */
export interface GraphView {
  maritime: boolean;
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
  private readonly land = new Map<string, string[]>();
  private readonly sea = new Map<string, string[]>();
  private readonly edgeTypes = new Map<string, ConnectionType>();
  private readonly regions = new Map<string, ReadonlySet<string>>();

  constructor(countries: readonly Country[], connections: readonly CountryConnection[], regions: readonly RegionDef[] = []) {
    this.countries = new Map(countries.map((c) => [c.id, c]));
    for (const c of countries) {
      this.land.set(c.id, []);
      this.sea.set(c.id, []);
    }
    for (const e of connections) this.addEdge(e);
    for (const list of [...this.land.values(), ...this.sea.values()]) list.sort();
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
    const existing = this.edgeTypes.get(k);
    if (existing) {
      // Land always supersedes sea; duplicates of the same type are ignored.
      if (existing === "land" || type === "sea") return;
      this.removeFrom(this.sea, from, to);
    }
    this.edgeTypes.set(k, type);
    const m = type === "land" ? this.land : this.sea;
    m.get(from)!.push(to);
    m.get(to)!.push(from);
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
  /** Connection type between two countries, if any. */
  connection(a: string, b: string): ConnectionType | undefined {
    return this.edgeTypes.get(edgeKey(a, b));
  }
  landDegree(id: string): number {
    return this.land.get(id)?.length ?? 0;
  }
  edges(): CountryConnection[] {
    return [...this.edgeTypes.entries()].map(([k, type]) => {
      const [from, to] = k.split("|");
      return { from, to, type };
    });
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
    for (const n of this.land.get(id) ?? []) consider(n);
    if (view.maritime) for (const n of this.sea.get(id) ?? []) consider(n);
    return view.maritime ? out.sort() : out;
  }

  /** Build the traversal view for a set of challenge rules. */
  viewFor(rules: ChallengeRules, keep: readonly string[] = []): GraphView {
    const blocked = new Set<string>(rules.forbidden);
    if (rules.avoidRegion) for (const id of this.regionMembers(rules.avoidRegion)) blocked.add(id);
    for (const k of keep) blocked.delete(k);
    return {
      maritime: rules.maritime,
      blocked,
      allowed: rules.allowedRegion ? this.regionMembers(rules.allowedRegion) : undefined,
    };
  }
}

export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
