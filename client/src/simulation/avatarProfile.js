const SKIN_TONES = ["#ffd5b8", "#e8b88a", "#c68642", "#8d5524", "#6b3e26"];
const HAIR_STYLES = ["cap", "bob", "spike", "bald"];
const HAIR_COLORS = [
  "#2c1810",
  "#5c4033",
  "#8b6914",
  "#c4a35a",
  "#1e293b",
  "#7c2d12",
];
const OUTFIT_COLORS = [
  "#6366f1",
  "#14b8a6",
  "#f97316",
  "#ec4899",
  "#64748b",
  "#eab308",
];

function hashSeed(seed) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick(values, index) {
  return values[index % values.length];
}

// create agent based on seed
export function createAgentAvatarProfile(seed) {
  const normalizedSeed = (seed || "agent").trim() || "agent";
  const hash = hashSeed(normalizedSeed);
  const isBot = normalizedSeed.includes("bot");

  return {
    isBot,
    body: { skinTone: pick(SKIN_TONES, hash) },
    hair: {
      style: pick(HAIR_STYLES, hash >>> 3),
      color: pick(HAIR_COLORS, hash >>> 5),
    },
    clothing: {
      topColor: pick(OUTFIT_COLORS, hash >>> 7),
      bottomColor: pick(OUTFIT_COLORS, hash >>> 9),
      shoesColor: "#2a2a2a",
    },
    accessories: {
      glasses: !isBot && Boolean((hash >>> 11) % 3 === 0),
      headphones: !isBot && Boolean((hash >>> 13) % 4 === 0),
    },
  };
}
