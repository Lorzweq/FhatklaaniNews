import fs from "node:fs";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const NAMES_PATH = "names.json";
const NEWS_PATH = "docs/news.json";
const MAX_ITEMS = 200;

// Kuvien asetukset
const IMAGES_DIR = "docs/images";
const MAKE_IMAGES = true;          // false jos haluat ottaa kuvat pois
const IMAGE_PROBABILITY = 0.5;     // 0..1 (esim 0.5 = noin puoleen uutisista kuva)
const IMAGE_SIZE = "1024x1024";    // tyypillinen
const IMAGE_MODEL = "gpt-image-1"; // OpenAI image model

function readJson(path, fallback) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); }
  catch { return fallback; }
}

function writeJson(path, data) {
  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

function ensureDir(path) {
  fs.mkdirSync(path, { recursive: true });
}

function safePrompt(name) {
  return `
Tee LEIKILLINEN ja SELVÄSTI FIKTIIVINEN juoru-uutinen henkilöstä nimeltä ${name}.
Tyyli: suomi, "seiska-henkinen", absurdin humoristinen ja hyväntahtoinen.

SÄÄNNÖT:
- Ei väitteitä oikeista rikoksista, sairauksista, päihteistä, seksistä tai muista arkaluonteisista asioista.
- Ei ulkonäön pilkkaamista, ei vihapuhetta.
- Tee selvästi vitsiksi: liioittelua, "lähteiden mukaan" -tyyliä.

Palauta VAIN validi JSON (ei muuta):
{
  "headline": "string",
  "content": "string",
  "tags": ["string","string","string"]
}
`.trim();
}

function imagePrompt({ name, headline, tags }) {
  // TÄRKEÄÄ: ei nimiä kuvaan, ei kasvoja, geneerinen kuvitus
  const vibe = [
    "blurry paparazzi-style illustration",
    "nighttime urban street",
    "street lights, cinematic",
    "grainy tabloid vibe",
    "anonymous human silhouette from behind",
    "face not visible, no identifiable person",
    "no text, no logos"
  ].join(", ");

  // Voit lisätä vähän “aihetta” tageista, mutta pidä geneerisenä:
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
  const resp = await client.responses.create({
    model: "gpt-5.2",
    input: safePrompt(name),
  });

  const text = resp.output_text ?? "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const jsonText = start >= 0 && end >= 0 ? text.slice(start, end + 1) : text;

  const obj = JSON.parse(jsonText);
  const headline = String(obj.headline ?? "").slice(0, 140).trim();
  const content = String(obj.content ?? "").trim();
  const tags = Array.isArray(obj.tags) ? obj.tags.map(x => String(x).trim()).filter(Boolean).slice(0, 10) : [];

  if (!headline || !content) throw new Error(`Bad output for ${name}`);
  return { headline, content, tags };
}

async function generateImagePng({ fileBase, headline, tags }) {
  ensureDir(IMAGES_DIR);

  const prompt = imagePrompt({ headline, tags });

  const img = await client.images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: IMAGE_SIZE
  });

  // SDK palauttaa yleensä base64:n kentässä b64_json
  const b64 = img?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image API did not return b64_json");

  const buffer = Buffer.from(b64, "base64");
  const absPath = `${IMAGES_DIR}/${fileBase}.png`;
  fs.writeFileSync(absPath, buffer);

  // Frontend-polku (docs/ pois)
  return `images/${fileBase}.png`;
}

function makeKey(item) {
  const day = (item.date || "").slice(0, 10);
  return `${item.name}__${day}__${item.headline}`.toLowerCase();
}

async function main() {
  const names = readJson(NAMES_PATH, []);
  if (!Array.isArray(names) || names.length === 0) throw new Error("names.json is empty/invalid");

  const existing = readJson(NEWS_PATH, []);
  const existingArr = Array.isArray(existing) ? existing : [];
  const keys = new Set(existingArr.map(makeKey));

  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  const fresh = [];

  for (const raw of names) {
    const name = String(raw).trim();
    if (!name) continue;

    const { headline, content, tags } = await generateForName(name);

    const item = { name, headline, content, tags, date: now };

    // Kuva vain osaan uutisista (halvempi)
    if (MAKE_IMAGES && Math.random() < IMAGE_PROBABILITY) {
      try {
        const fileBase = `${slugify(name)}_${day}_${slugify(headline).slice(0, 20)}`;
        const image = await generateImagePng({ fileBase, headline, tags });
        item.image = image;
      } catch (e) {
        // Jos kuvan teko failaa, uutinen silti tallennetaan
        console.warn("Image generation failed:", e?.message ?? e);
      }
    }

    const key = makeKey(item);
    if (!keys.has(key)) {
      fresh.push(item);
      keys.add(key);
    }
  }

  const merged = [...fresh, ...existingArr].slice(0, MAX_ITEMS);
  writeJson(NEWS_PATH, merged);

  console.log(`Added ${fresh.length} items. Total: ${merged.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});