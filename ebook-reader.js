/* ==========================================================================
   EBOOK-READER.JS — advanced reader with translation, highlights, bookmarks
   Works for PDF (text extracted via pdf.js), and plain text/markdown files.
   Other file types fall back to a protected embedded viewer.
   ========================================================================== */
import { initTheme, toggleTheme, protectElement, toast } from "./app-shell.js";

initTheme();
document.getElementById("dark-toggle").onclick = () => {
  toggleTheme();
  document.getElementById("reader-page").classList.toggle("dark-mode");
};

const params = new URLSearchParams(window.location.search);
const fileUrl = params.get("url");
const title = params.get("title") || "Document";
document.title = title + " — Reader";
document.getElementById("doc-title").textContent = title;

const readerPage = document.getElementById("reader-page");
const tocBox = document.getElementById("toc-box");
protectElement(readerPage);

let pages = [];       // array of plain-text page content
let currentPage = 0;
let fontSize = 17;
const storageKey = "cacgw_reader_" + btoa(title).slice(0, 24);

init();

async function init() {
  if (!fileUrl) { readerPage.innerHTML = "<p>No document specified.</p>"; return; }
  try {
    if (fileUrl.toLowerCase().includes(".pdf")) {
      await loadPdf(fileUrl);
    } else if (fileUrl.match(/\.(txt|md)(\?|$)/i)) {
      const res = await fetch(fileUrl);
      const text = await res.text();
      pages = chunkText(text);
    } else {
      // Fallback: protected embedded viewer for other formats (docx, etc.)
      readerPage.innerHTML = `<iframe src="${fileUrl}" style="width:100%;height:75vh;border:0;border-radius:10px;" sandbox="allow-scripts allow-same-origin"></iframe>`;
      return;
    }
    buildTOC();
    restoreProgress();
    renderPage();
  } catch (e) {
    console.error(e);
    readerPage.innerHTML = `<p>Could not load this document while offline or the link is invalid. <a href="${fileUrl}" target="_blank">Open directly</a>.</p>`;
  }
}

/* ---------- PDF text extraction via pdf.js ---------- */
async function loadPdf(url) {
  const pdfjsLib = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.mjs";
  const doc = await pdfjsLib.getDocument(url).promise;
  pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(it => it.str).join(" ");
    pages.push(text || "(No extractable text on this page — it may be an image scan.)");
  }
}

function chunkText(text, wordsPerPage = 550) {
  const words = text.split(/\s+/);
  const out = [];
  for (let i = 0; i < words.length; i += wordsPerPage) out.push(words.slice(i, i + wordsPerPage).join(" "));
  return out.length ? out : ["(Empty document)"];
}

/* ---------- TOC ---------- */
function buildTOC() {
  if (pages.length <= 1) return;
  let html = `<h5><i class="fa-solid fa-list"></i> Table of Contents</h5><div style="display:flex;flex-wrap:wrap;gap:6px;">`;
  pages.forEach((_, i) => { html += `<button class="btn-outline" data-p="${i}" style="padding:6px 12px;">Page ${i + 1}</button>`; });
  html += `</div>`;
  tocBox.innerHTML = html;
  tocBox.style.display = "block";
  tocBox.querySelectorAll("button").forEach(b => b.onclick = () => { currentPage = Number(b.dataset.p); renderPage(); });
}

/* ---------- Render current page ---------- */
function renderPage() {
  const highlights = JSON.parse(localStorage.getItem(storageKey + "_hl") || "{}");
  let content = pages[currentPage] || "";
  const savedHl = highlights[currentPage];
  readerPage.innerHTML = `
    <div style="font-size:${fontSize}px;line-height:${document.getElementById("line-spacing").value};">
      ${savedHl ? applyHighlights(content, savedHl) : escapeHtml(content)}
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:20px;">
      <button class="btn-outline" id="prev-page" ${currentPage === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-left"></i> Previous</button>
      <span style="color:var(--muted);">Page ${currentPage + 1} of ${pages.length}</span>
      <button class="btn-outline" id="next-page" ${currentPage === pages.length - 1 ? "disabled" : ""}>Next <i class="fa-solid fa-arrow-right"></i></button>
    </div>`;
  document.getElementById("prev-page")?.addEventListener("click", () => { currentPage--; renderPage(); saveProgress(); });
  document.getElementById("next-page")?.addEventListener("click", () => { currentPage++; renderPage(); saveProgress(); });
  saveProgress();
}
function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function applyHighlights(text, phrases) {
  let html = escapeHtml(text);
  phrases.forEach(p => { if (p) html = html.split(escapeHtml(p)).join(`<mark class="hl">${escapeHtml(p)}</mark>`); });
  return html;
}

/* ---------- Progress autosave ---------- */
function saveProgress() { localStorage.setItem(storageKey, String(currentPage)); }
function restoreProgress() {
  const saved = localStorage.getItem(storageKey);
  if (saved !== null) { currentPage = Math.min(Number(saved), pages.length - 1); toast("Resumed from your last position", "success"); }
}

/* ---------- Toolbar interactions ---------- */
document.getElementById("font-plus").onclick = () => { fontSize = Math.min(fontSize + 2, 30); renderPage(); };
document.getElementById("font-minus").onclick = () => { fontSize = Math.max(fontSize - 2, 12); renderPage(); };
document.getElementById("line-spacing").onchange = renderPage;

document.getElementById("bookmark-btn").onclick = () => {
  const bms = JSON.parse(localStorage.getItem(storageKey + "_bm") || "[]");
  if (!bms.includes(currentPage)) bms.push(currentPage);
  localStorage.setItem(storageKey + "_bm", JSON.stringify(bms));
  toast(`Bookmarked page ${currentPage + 1}`, "success");
};

document.getElementById("highlight-btn").onclick = () => {
  const sel = window.getSelection().toString().trim();
  if (!sel) { toast("Select some text first, then click highlight.", "error"); return; }
  const highlights = JSON.parse(localStorage.getItem(storageKey + "_hl") || "{}");
  highlights[currentPage] = highlights[currentPage] || [];
  highlights[currentPage].push(sel);
  localStorage.setItem(storageKey + "_hl", JSON.stringify(highlights));
  renderPage();
  toast("Text highlighted", "success");
};

document.getElementById("search-box").addEventListener("input", (e) => {
  const term = e.target.value.trim().toLowerCase();
  if (!term) return;
  const foundIdx = pages.findIndex(p => p.toLowerCase().includes(term));
  if (foundIdx >= 0 && foundIdx !== currentPage) { currentPage = foundIdx; renderPage(); toast(`Found on page ${foundIdx + 1}`, "success"); }
});

/* ---------- Free translation via MyMemory API (no key required) ---------- */
document.getElementById("translate-lang").addEventListener("change", async (e) => {
  const lang = e.target.value;
  if (!lang) return;
  const text = pages[currentPage];
  if (!text) return;
  toast("Translating…", "info");
  try {
    const chunk = text.slice(0, 480); // MyMemory free tier limit-friendly
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|${lang}`);
    const data = await res.json();
    const translated = data?.responseData?.translatedText || "(Translation unavailable right now)";
    readerPage.querySelector("div").innerHTML = escapeHtml(translated) + (text.length > 480 ? "<p style='color:var(--muted);font-size:.8rem;'>(Preview translated — full-page translation requires a paid quota tier.)</p>" : "");
    toast("Translated!", "success");
  } catch (err) {
    toast("Translation failed — check your connection.", "error");
  }
});
