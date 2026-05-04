import { useState, useEffect } from "react";

const THINKING_WORDS: string[] = [
  "Accomplishing", "Actioning", "Actualizing", "Architecting", "Baking",
  "Beaming", "Beboppin'", "Befuddling", "Billowing", "Blanching",
  "Bloviating", "Boogieing", "Boondoggling", "Booping", "Bootstrapping",
  "Brewing", "Bunning", "Burrowing", "Calculating", "Canoodling",
  "Caramelizing", "Cascading", "Catapulting", "Cerebrating", "Channeling",
  "Channelling", "Choreographing", "Churning", "Clauding", "Coalescing",
  "Cogitating", "Combobulating", "Composing", "Computing", "Concocting",
  "Considering", "Contemplating", "Cooking", "Crafting", "Creating",
  "Crunching", "Crystallizing", "Cultivating", "Deciphering", "Deliberating",
  "Determining", "Dilly-dallying", "Discombobulating", "Doing", "Doodling",
  "Drizzling", "Ebbing", "Effecting", "Elucidating", "Embellishing",
  "Enchanting", "Envisioning", "Evaporating", "Fermenting", "Fiddle-faddling",
  "Finagling", "Flambéing", "Flibbertigibbeting", "Flowing", "Flummoxing",
  "Fluttering", "Forging", "Forming", "Frolicking", "Frosting",
  "Gallivanting", "Galloping", "Garnishing", "Generating", "Gesticulating",
  "Germinating", "Gitifying", "Grooving", "Gusting", "Harmonizing",
  "Hashing", "Hatching", "Herding", "Honking", "Hullaballooing",
  "Hyperspacing", "Ideating", "Imagining", "Improvising", "Incubating",
  "Inferring", "Infusing", "Ionizing", "Jitterbugging", "Julienning",
  "Kneading", "Leavening", "Levitating", "Lollygagging", "Manifesting",
  "Marinating", "Meandering", "Metamorphosing", "Misting", "Moonwalking",
  "Moseying", "Mulling", "Mustering", "Musing", "Nebulizing",
  "Nesting", "Newspapering", "Noodling", "Nucleating", "Orbiting",
  "Orchestrating", "Osmosing", "Perambulating", "Percolating", "Perusing",
  "Philosophising", "Photosynthesizing", "Pollinating", "Pondering", "Pontificating",
  "Pouncing", "Precipitating", "Prestidigitating", "Processing", "Proofing",
  "Propagating", "Puttering", "Puzzling", "Quantumizing", "Razzle-dazzling",
  "Razzmatazzing", "Recombobulating", "Reticulating", "Roosting", "Ruminating",
  "Sautéing", "Scampering", "Schlepping", "Scurrying", "Seasoning",
  "Shenaniganing", "Shimmying", "Simmering", "Skedaddling", "Sketching",
  "Slithering", "Smooshing", "Sock-hopping", "Spelunking", "Spinning",
  "Sprouting", "Stewing", "Sublimating", "Swirling", "Swooping",
  "Symbioting", "Synthesizing", "Tempering", "Thinking", "Thundering",
  "Tinkering", "Tomfoolering", "Topsy-turvying", "Transfiguring", "Transmuting",
  "Twisting", "Undulating", "Unfurling", "Unravelling", "Vibing",
  "Waddling", "Wandering", "Warping", "Whatchamacalliting", "Whirlpooling",
  "Whirring", "Whisking", "Wibbling", "Working", "Wrangling",
  "Zesting", "Zigzagging",
];

const TIPS: string[] = [
  "⌘O expands every thought trace in view at once",
  "⌘O again collapses them all back",
  "Hover a session to pre-load it before you click",
  "The notification bell clears when you refocus this window",
  "Click any tool block to expand its full input and output",
  "⌘K global search across all sessions — coming soon",
  "Session bookmarks and pinned projects — coming soon",
  "Export any conversation as markdown — coming soon",
];

interface StreamingIndicatorProps {
  lastUserTimestamp: string | null;
  totalInputTokens: number;
  hasThinking: boolean;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

export function StreamingIndicator({
  lastUserTimestamp,
  totalInputTokens,
  hasThinking,
}: StreamingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);
  const [wordIndex, setWordIndex] = useState(() => Math.floor(Math.random() * THINKING_WORDS.length));
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));
  const [dotPhase, setDotPhase] = useState(0);

  useEffect(() => {
    const start = lastUserTimestamp ? new Date(lastUserTimestamp).getTime() : Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastUserTimestamp]);

  // Cycle thinking word every 3s
  useEffect(() => {
    const id = setInterval(
      () => setWordIndex((i) => (i + 1) % THINKING_WORDS.length),
      3000
    );
    return () => clearInterval(id);
  }, []);

  // Cycle tip every 9s
  useEffect(() => {
    const id = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 9000);
    return () => clearInterval(id);
  }, []);

  // Pulse the dot
  useEffect(() => {
    const id = setInterval(() => setDotPhase((p) => (p + 1) % 4), 400);
    return () => clearInterval(id);
  }, []);

  const dotOpacity = [1, 0.6, 0.3, 0.6][dotPhase];

  const kTokens =
    totalInputTokens >= 1000
      ? `↑ ${(totalInputTokens / 1000).toFixed(1)}k tokens`
      : totalInputTokens > 0
      ? `↑ ${totalInputTokens} tokens`
      : null;

  const statParts: string[] = [formatElapsed(elapsed)];
  if (kTokens) statParts.push(kTokens);
  if (hasThinking) statParts.push("thinking");
  const stats = statParts.join(" · ");

  return (
    <div
      style={{
        padding: "16px 0 0",
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
        lineHeight: 1.6,
        userSelect: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          color: "var(--text-muted)",
        }}
      >
        <span
          style={{
            color: "var(--accent-orange)",
            opacity: dotOpacity,
            transition: "opacity 0.2s",
            fontSize: "10px",
          }}
        >
          ●
        </span>
        <span>{THINKING_WORDS[wordIndex]}…</span>
        <span style={{ opacity: 0.55 }}>({stats})</span>
      </div>
      <div
        style={{
          color: "var(--text-muted)",
          opacity: 0.45,
          paddingLeft: "16px",
          marginTop: "2px",
        }}
      >
        └ Tip: {TIPS[tipIndex]}
      </div>
    </div>
  );
}
