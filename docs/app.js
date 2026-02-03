const listEl = document.getElementById("list");
const metaEl = document.getElementById("meta");
const searchEl = document.getElementById("search");
const refreshBtn = document.getElementById("refresh");

let allItems = [];

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("fi-FI", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso || "";
  }
}

function matches(item, q) {
  if (!q) return true;
  const needle = q.toLowerCase().trim();
  const hay = [
    item.name,
    item.headline,
    item.content,
    ...(Array.isArray(item.tags) ? item.tags : [])
  ].join(" ").toLowerCase();
  return hay.includes(needle);
}

function render(items) {
  metaEl.textContent = `Näytetään ${items.length}/${allItems.length} juttua. Päivitetty: ${formatDate(new Date().toISOString())}`;

  if (!items.length) {
    listEl.innerHTML = `
      <div class="rounded-2xl border border-white/10 bg-card/60 p-4 text-sm text-gray-300">
        Ei osumia. Kokeile toista hakua.
      </div>`;
    return;
  }

  listEl.innerHTML = items.map((it) => {
    const name = escapeHtml(it.name ?? "");
    const headline = escapeHtml(it.headline ?? "");
    const content = escapeHtml(it.content ?? "");
    const date = escapeHtml(formatDate(it.date));
    const tags = Array.isArray(it.tags) ? it.tags : [];

    const tagsHtml = tags.slice(0, 8).map(t => `
      <span class="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-gray-300">
        #${escapeHtml(t)}
      </span>
    `).join("");

    return `
      <article class="rounded-2xl border border-white/10 bg-card/70 p-4 shadow-sm">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span class="inline-flex items-center rounded-full bg-gradient-to-br from-pink-500/25 to-violet-600/25 px-2 py-0.5 text-xs font-semibold text-gray-200">
            ${name}
          </span>
          <span class="text-xs text-gray-500">${date}</span>
        </div>

        <h2 class="mt-2 text-lg font-extrabold leading-snug text-gray-100">
          ${headline}
        </h2>

        <p class="mt-2 text-sm leading-relaxed text-gray-300">
          ${content}
        </p>

        <div class="mt-3 flex flex-wrap gap-2">
          ${tagsHtml}
        </div>
      </article>
    `;
  }).join("");
}

async function loadNews({ bustCache = false } = {}) {
  const url = bustCache ? `./news.json?ts=${Date.now()}` : "./news.json";

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`news.json fetch failed: ${res.status}`);
  const data = await res.json();

  // Jos news.json on tyhjä tai ei array, normalisoidaan
  allItems = Array.isArray(data) ? data : [];
  const q = searchEl.value;
  render(allItems.filter(it => matches(it, q)));
}

searchEl.addEventListener("input", () => {
  const q = searchEl.value;
  render(allItems.filter(it => matches(it, q)));
});

refreshBtn.addEventListener("click", () => {
  loadNews({ bustCache: true }).catch(err => {
    metaEl.textContent = `Virhe päivityksessä: ${err.message}`;
  });
});

// initial
loadNews().catch(err => {
  metaEl.textContent = `Virhe: ${err.message}`;
  listEl.innerHTML = `
    <div class="rounded-2xl border border-white/10 bg-card/60 p-4 text-sm text-gray-300">
      news.json ei lataudu. Tarkista että <code class="rounded bg-black/30 px-1">docs/news.json</code> löytyy.
    </div>`;
});