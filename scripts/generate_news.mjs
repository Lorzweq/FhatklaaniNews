import fs from "node:fs";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const NAMES_PATH = "names.json";
const NEWS_PATH = "docs/news.json";
const MAX_ITEMS = 200;

// Images
const IMAGES_DIR = "docs/images";
const MAKE_IMAGES = true;

// ⚡ Speed knobs
const TEXT_CONCURRENCY = 3;     // how many text calls at once
const MAX_IMAGES_PER_RUN = 1;   // BIG speed win (0/1 recommended)
const IMAGE_SIZE = "1024x1024";
const IMAGE_MODEL = "gpt-image-1";

function readJson(path, fallback) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); }
  catch { return fallback; }
}
function writeJson(path, data) {
  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}
function ensureDir(path) { fs.mkdirSync(path, { recursive: true }); }

function safePrompt(name) {
  return `
Tee juoru-uutinen henkilöstä nimeltä ${name}.
Tyyli: suomi, seiska-henkinen, huvittava ja yllätyksellinen.

SALLITTUA SISÄLTÖÄ:
- Humalaisuus ja juominen (esim. "sammui baarin lattialle", "karaokella kutkotti")
- Uhkapelit ja rahapelaaminen (voitot, tappiot, onnenonkijat)
- Seksuaaliset juorut (huumorikylläinen, vihjaileva, ei graafista)

RAJOITUKSET (TÄRKEÄÄ):
- Ei alaikäisiä.
- Ei väkivaltaa, ei huumeita, ei seksuaalirikoksia.
- Ei graafista/pornografista sisältöä.
- Ei vakavia rikossyytöksiä.
- Ei vihapuhetta eikä ulkonäön pilkkaamista.

Palauta VAIN validi JSON (ei mitään muuta):
{
  "headline": "string",
  "content": "string",
  "tags": ["string","string","string"]
}
`.trim();
}

function imagePrompt({ tags }) {
  const vibe = [
    "blurry paparazzi-style illustration",
    "nighttime urban street",
    "street lights, cinematic",
    "grainy tabloid vibe",
    "anonymous human silhouette from behind",
    "face not visible, no identifiable person",
    "no text, no logos"
  ].join(", ");

  const extra = (Array.isArray(tags) && tags.length)
    ? `subtle theme hints: ${tags.slice(0, 3).join(", ")}`
    : "subtle theme hints: mystery, humor";

  return `${vibe}. ${extra}.`;
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .trim()
    .replaceAll("ä", "a")
    .replaceAll("ö", "o")
    .replaceAll("å", "a")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

async function generateForName(name) {
  console.log(`\n[GEN] Starting text generation for: ${name}`);
  const resp = await client.responses.create({
    model: "gpt-5.2",
    input: safePrompt(name),
  });

  const text = resp.output_text ?? "";
  console.log(`[GEN] Raw output length for ${name}: ${text.length}`);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const jsonText = start >= 0 && end >= 0 ? text.slice(start, end + 1) : text;

  const obj = JSON.parse(jsonText);
  const headline = String(obj.headline ?? "").slice(0, 140).trim();
  const content = String(obj.content ?? "").trim();
  const tags = Array.isArray(obj.tags) ? obj.tags.map(x => String(x).trim()).filter(Boolean).slice(0, 10) : [];

  if (!headline || !content) throw new Error(`Bad output for ${name}`);
  console.log(`[GEN] OK for ${name}: headline="${headline.slice(0, 60)}" tags=${tags.length}`);
  return { headline, content, tags };
}

async function generateImagePng({ fileBase, tags }) {
  console.log(`[IMG] Starting image generation: ${fileBase}`);
  ensureDir(IMAGES_DIR);

  const prompt = imagePrompt({ tags });

  const img = await client.images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: IMAGE_SIZE
  });

  const b64 = img?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image API did not return b64_json");

  const buffer = Buffer.from(b64, "base64");
  const absPath = `${IMAGES_DIR}/${fileBase}.png`;
  fs.writeFileSync(absPath, buffer);
  console.log(`[IMG] Saved image: ${absPath}`);

  return `images/${fileBase}.png`;
}

function makeKey(item) {
  const day = (item.date || "").slice(0, 10);
  return `${item.name}__${day}__${item.headline}`.toLowerCase();
}

// Simple concurrency limiter (no extra deps)
async function mapLimit(arr, limit, fn) {
  const results = new Array(arr.length);
  let i = 0;

  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= arr.length) return;
      results[idx] = await fn(arr[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, arr.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log("[START] generate_news.mjs");
  const namesRaw = readJson(NAMES_PATH, []);
  const names = (Array.isArray(namesRaw) ? namesRaw : [])
    .map(n => String(n).trim())
    .filter(Boolean);

  if (names.length === 0) throw new Error("names.json is empty/invalid");
  console.log(`[INFO] names.json entries: ${names.length}`);

  const existing = readJson(NEWS_PATH, []);
  const existingArr = Array.isArray(existing) ? existing : [];
  const keys = new Set(existingArr.map(makeKey));
  console.log(`[INFO] existing news: ${existingArr.length}`);

  const now = new Date().toISOString();
  const day = now.slice(0, 10);

  // ⚡ Generate all texts in parallel (limited)
  const storyResults = await mapLimit(names, TEXT_CONCURRENCY, async (name) => {
    try {
      const { headline, content, tags } = await generateForName(name);
      return { ok: true, name, headline, content, tags };
    } catch (e) {
      return { ok: false, name, error: e?.message ?? String(e) };
    }
  });

  let imagesUsed = 0;
  const fresh = [];

  for (const res of storyResults) {
    if (!res.ok) {
      console.warn(`Text gen failed for ${res.name}: ${res.error}`);
      continue;
    }

    const item = { name: res.name, headline: res.headline, content: res.content, tags: res.tags, date: now };

    // 🖼️ Max 1 image per run (massive speed boost)
    if (MAKE_IMAGES && imagesUsed < MAX_IMAGES_PER_RUN) {
      try {
        const fileBase = `${slugify(item.name)}_${day}_${slugify(item.headline).slice(0, 20)}`;
        item.image = await generateImagePng({ fileBase, tags: item.tags });
        imagesUsed++;
      } catch (e) {
        console.warn("Image generation failed:", e?.message ?? e);
      }
    }

    const key = makeKey(item);
    if (!keys.has(key)) {
      fresh.push(item);
      keys.add(key);
      console.log(`[ADD] Added: ${item.name} (${item.headline.slice(0, 40)})`);
    } else {
      console.log(`[SKIP] Duplicate: ${item.name} (${item.headline.slice(0, 40)})`);
    }
  }

  const merged = [...fresh, ...existingArr].slice(0, MAX_ITEMS);
  writeJson(NEWS_PATH, merged);

  console.log(`Added ${fresh.length} items. Total: ${merged.length}. Images used: ${imagesUsed}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});