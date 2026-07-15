import { ControlLattice } from "./warp/field";

export interface Profile {
  id: string;
  name: string;
  gridSize: number;
  /** Flattened (dx, dy) per control point, field units. */
  displacements: number[];
  createdAt: string;
  updatedAt: string;
}

const STORE_KEY = "visdistort.profiles.v1";
const WORKING_KEY = "visdistort.working.v1";

interface Store {
  profiles: Profile[];
  activeId: string | null;
}

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      if (Array.isArray(parsed.profiles)) return parsed;
    }
  } catch {
    // corrupted store: start fresh rather than crash
  }
  return { profiles: [], activeId: null };
}

function saveStore(store: Store): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function newId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class ProfileManager {
  private store: Store;
  onChange: (() => void) | null = null;

  constructor() {
    this.store = loadStore();
  }

  list(): Profile[] {
    return this.store.profiles;
  }

  get activeId(): string | null {
    return this.store.activeId;
  }

  get active(): Profile | null {
    return this.store.profiles.find((p) => p.id === this.store.activeId) ?? null;
  }

  setActive(id: string | null): void {
    this.store.activeId = id;
    this.persist();
  }

  create(name: string, lattice: ControlLattice): Profile {
    const now = new Date().toISOString();
    const profile: Profile = {
      id: newId(),
      name,
      gridSize: lattice.n,
      displacements: Array.from(lattice.disp),
      createdAt: now,
      updatedAt: now,
    };
    this.store.profiles.push(profile);
    this.store.activeId = profile.id;
    this.persist();
    return profile;
  }

  /** Overwrite the active profile's field with the given lattice. */
  updateActive(lattice: ControlLattice): Profile | null {
    const p = this.active;
    if (!p) return null;
    p.gridSize = lattice.n;
    p.displacements = Array.from(lattice.disp);
    p.updatedAt = new Date().toISOString();
    this.persist();
    return p;
  }

  rename(id: string, name: string): void {
    const p = this.store.profiles.find((x) => x.id === id);
    if (!p) return;
    p.name = name;
    p.updatedAt = new Date().toISOString();
    this.persist();
  }

  remove(id: string): void {
    this.store.profiles = this.store.profiles.filter((p) => p.id !== id);
    if (this.store.activeId === id) {
      this.store.activeId = this.store.profiles[0]?.id ?? null;
    }
    this.persist();
  }

  latticeFor(profile: Profile): ControlLattice {
    return new ControlLattice(profile.gridSize, Float32Array.from(profile.displacements));
  }

  exportProfile(profile: Profile): string {
    return JSON.stringify({ app: "vis-distort", version: 1, profile }, null, 2);
  }

  importProfile(json: string): Profile {
    const parsed = JSON.parse(json) as { profile?: Profile };
    const p = parsed.profile;
    if (
      !p ||
      typeof p.name !== "string" ||
      typeof p.gridSize !== "number" ||
      !Array.isArray(p.displacements) ||
      p.displacements.length !== p.gridSize * p.gridSize * 2
    ) {
      throw new Error("Not a valid Vis-Distort profile file.");
    }
    // Validate by constructing the lattice (throws on bad sizes).
    new ControlLattice(p.gridSize, Float32Array.from(p.displacements));
    const now = new Date().toISOString();
    const copy: Profile = {
      id: newId(),
      name: p.name,
      gridSize: p.gridSize,
      displacements: p.displacements.map(Number),
      createdAt: p.createdAt ?? now,
      updatedAt: now,
    };
    this.store.profiles.push(copy);
    this.store.activeId = copy.id;
    this.persist();
    return copy;
  }

  /** Autosaved scratch state so an unsaved calibration survives a reload. */
  saveWorking(lattice: ControlLattice): void {
    try {
      localStorage.setItem(
        WORKING_KEY,
        JSON.stringify({ gridSize: lattice.n, displacements: Array.from(lattice.disp) })
      );
    } catch {
      // storage full/unavailable — losing the scratch copy is acceptable
    }
  }

  loadWorking(): ControlLattice | null {
    try {
      const raw = localStorage.getItem(WORKING_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { gridSize: number; displacements: number[] };
      if (
        typeof parsed.gridSize !== "number" ||
        !Array.isArray(parsed.displacements) ||
        parsed.displacements.length !== parsed.gridSize * parsed.gridSize * 2
      ) {
        return null;
      }
      return new ControlLattice(parsed.gridSize, Float32Array.from(parsed.displacements));
    } catch {
      return null;
    }
  }

  private persist(): void {
    saveStore(this.store);
    this.onChange?.();
  }
}
