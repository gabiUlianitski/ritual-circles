import type { Hoby } from "../api/types";

/** Balanced buckets so one kind of hobby, especially sports, does not take every day. */
export type DiscoveryCategory =
  | "sports"
  | "food"
  | "creativity"
  | "learning"
  | "outdoor"
  | "games"
  | "wellness"
  | "social";

const FOOD = ["cook", "baking", "bake", "food", "wine", "brunch", "dinner"];
const WELLNESS = ["yoga", "meditation", "pilates", "wellness", "mindful"];
const OUTDOOR = ["hiking", "hike", "cycling", "running", "trail", "walk", "climb"];
const POPULAR = ["padel", "cooking", "photography", "hiking", "chess", "running", "board"];

const ADJACENT: Record<DiscoveryCategory, DiscoveryCategory[]> = {
  food: ["social", "creativity"],
  sports: ["outdoor", "wellness"],
  outdoor: ["sports", "wellness"],
  creativity: ["learning", "social"],
  games: ["social", "learning"],
  learning: ["creativity", "games"],
  wellness: ["outdoor", "social"],
  social: ["food", "games"],
};

const HISTORY_DAYS = 21;

type HistoryItem = { date: string; slug: string; category: DiscoveryCategory };

export type DiscoveryPick = {
  slug: string;
  displayName: string;
  icon: string | null;
  category: DiscoveryCategory;
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function discoveryCategory(h: { slug: string; displayName: string; interestCategory?: string | null }): DiscoveryCategory {
  const blob = `${h.slug} ${h.displayName}`.toLowerCase();
  if (FOOD.some((k) => blob.includes(k))) return "food";
  if (WELLNESS.some((k) => blob.includes(k))) return "wellness";
  if (OUTDOOR.some((k) => blob.includes(k))) return "outdoor";
  switch ((h.interestCategory ?? "").toLowerCase()) {
    case "arts":
      return "creativity";
    case "games":
      return "games";
    case "learning":
      return "learning";
    case "sports":
      return "sports";
    default:
      return "social";
  }
}

function historyKey(userId: string | null): string {
  return `ritual_discovery_history_${userId ?? "anon"}`;
}

function readHistory(userId: string | null, today: string): HistoryItem[] {
  try {
    const raw = localStorage.getItem(historyKey(userId));
    const parsed = raw ? (JSON.parse(raw) as HistoryItem[]) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item?.slug && item.date && item.date < today).slice(0, HISTORY_DAYS);
  } catch {
    return [];
  }
}

export function rememberDiscovery(userId: string | null, today: string, pick: DiscoveryPick): void {
  try {
    const raw = localStorage.getItem(historyKey(userId));
    const prev = raw ? (JSON.parse(raw) as HistoryItem[]) : [];
    const slug = pick.slug.toLowerCase();
    if (Array.isArray(prev) && prev[0]?.date === today && prev[0]?.slug === slug) return;
    const older = (Array.isArray(prev) ? prev : []).filter((item) => item?.date && item.date < today);
    const next = [{ date: today, slug, category: pick.category }, ...older].slice(0, HISTORY_DAYS);
    localStorage.setItem(historyKey(userId), JSON.stringify(next));
  } catch {
    /* storage is optional */
  }
}

/** One hobby for today. Same user and date always get the same hobby. */
export function pickTodaysHobby(opts: {
  hobies: Hoby[];
  userSlugs: string[];
  circleSlugs: string[];
  userId: string | null;
  today?: string;
}): DiscoveryPick | null {
  const today = opts.today ?? todayKey();
  const pool = opts.hobies.filter((h) => h.slug?.trim() && h.displayName?.trim());
  if (!pool.length) return null;

  const bySlug = new Map(pool.map((h) => [h.slug.trim().toLowerCase(), h]));
  const catsOf = (slugs: string[]) =>
    new Set(
      slugs
        .map((s) => bySlug.get(s.trim().toLowerCase()))
        .filter((h): h is Hoby => Boolean(h))
        .map(discoveryCategory),
    );
  const userSlugs = new Set(opts.userSlugs.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const userCats = catsOf([...userSlugs]);
  const circleCats = catsOf(opts.circleSlugs);
  const history = readHistory(opts.userId, today);
  const recent = new Set(history.map((item) => item.slug));
  const last = history[0];
  const relatedDay = circleCats.size > 0 && hash(today) % 3 === 0;
  const canSkipRecent = pool.length > recent.size;

  let best: Hoby | null = null;
  let bestScore = -Infinity;
  for (const h of pool) {
    const slug = h.slug.trim().toLowerCase();
    if (canSkipRecent && recent.has(slug)) continue;
    const cat = discoveryCategory(h);
    let score = (hash(`${today}:${slug}`) % 100) / 100;
    if (last && cat !== last.category) score += 4;
    if (last?.category === "sports" && cat === "sports") score -= 6;
    if (userSlugs.size > 0) {
      if (userCats.has(cat) && !userSlugs.has(slug)) score += 5;
      if (userSlugs.has(slug)) score -= 2;
    } else if (POPULAR.some((p) => slug.includes(p))) {
      score += 3;
    }
    if (relatedDay && [...circleCats].some((c) => ADJACENT[c].includes(cat))) score += 4;
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  const chosen = best ?? pool[hash(today) % pool.length];
  const pick: DiscoveryPick = {
    slug: chosen.slug,
    displayName: chosen.displayName,
    icon: chosen.icon ?? null,
    category: discoveryCategory(chosen),
  };
  return pick;
}

export function discoveryImageUrl(prompt: string, seed: string): string {
  const q = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${q}?width=960&height=640&nologo=true&seed=${hash(seed)}`;
}

export function scenePrompt(name: string): string {
  return (
    `Candid warm photograph of a small diverse group of friends enjoying ${name} together, ` +
    "natural light, authentic, social and positive, no text, no watermark"
  );
}

const COPY_KEY = "ritual_discovery_copy_";

export type DiscoveryCopy = { title: string; body: string; imagePrompt: string; source: "ai" | "catalog" };

export function readDiscoveryCopy(userId: string | null, today: string, slug: string): DiscoveryCopy | null {
  try {
    const raw = localStorage.getItem(`${COPY_KEY}${userId ?? "anon"}_${today}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DiscoveryCopy & { slug?: string };
    if (parsed.slug !== slug.toLowerCase() || !parsed.title || !parsed.body) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDiscoveryCopy(userId: string | null, today: string, slug: string, copy: DiscoveryCopy): void {
  try {
    localStorage.setItem(
      `${COPY_KEY}${userId ?? "anon"}_${today}`,
      JSON.stringify({ ...copy, slug: slug.toLowerCase() }),
    );
  } catch {
    /* storage is optional */
  }
}
