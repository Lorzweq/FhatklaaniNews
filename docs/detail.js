const detailEl = document.getElementById("detail");
const metaEl = document.getElementById("meta");

const BASE_PATH = location.pathname.includes("/docs/") ? "./" : "./docs/";

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

async function loadDetail() {
  const params = new URLSearchParams(location.search);
  const index = Number.parseInt(params.get("i"), 10);

  if (Number.isNaN(index)) {
    metaEl.textContent = "Virhe: puuttuva tai virheellinen id.";
    return;
  }

  const res = await fetch(`${BASE_PATH}news.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`news.json fetch failed: ${res.status}`);
  const data = await res.json();
  const items = Array.isArray(data) ? data : [];
  const item = items[index];

  if (!item) {
    metaEl.textContent = "Uutista ei löytynyt.";
    return;
  }

  const name = escapeHtml(item.name ?? "");
  const headline = escapeHtml(item.headline ?? "");
  const content = escapeHtml(item.content ?? "");
  const date = escapeHtml(formatDate(item.date));
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const imageUrl = item.image ? `${BASE_PATH}${String(item.image).replace(/^\/+/, "")}` : "";

  const tagsHtml = tags.slice(0, 12).map(t => `
    <span class="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-gray-300">
      #${escapeHtml(t)}
    </span>
  `).join("");

  metaEl.textContent = `Päivitetty: ${formatDate(new Date().toISOString())}`;

  detailEl.innerHTML = `
    <article class="rounded-2xl border border-white/10 bg-card/70 p-5 shadow-sm">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="inline-flex items-center rounded-full bg-gradient-to-br from-pink-500/25 to-violet-600/25 px-2 py-0.5 text-xs font-semibold text-gray-200">
          ${name}
        </span>
        <span class="text-xs text-gray-500">${date}</span>
      </div>

      <h2 class="mt-2 text-2xl font-extrabold leading-snug text-gray-100">
        ${headline}
      </h2>

      ${imageUrl ? `
        <img src="${imageUrl}" alt="" class="mt-4 w-full rounded-xl border border-white/10" />
      ` : ""}

      <p class="mt-4 text-sm leading-relaxed text-gray-300">
        ${content}
      </p>

      <div class="mt-4 flex flex-wrap gap-2">
        ${tagsHtml}
      </div>
    </article>
  `;
}

loadDetail().catch(err => {
  metaEl.textContent = `Virhe: ${err.message}`;
  detailEl.innerHTML = `
    <div class="rounded-2xl border border-white/10 bg-card/60 p-4 text-sm text-gray-300">
      Uutisen lataus epäonnistui.
    </div>`;
});
