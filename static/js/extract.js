import { state } from "./state.js";
import { $, $$, show, hide, escHtml } from "./utils.js";


// renderē sarakstu ar checkboxiem
export function showRequirements(reqs) {
  state.requirements = reqs;
  state.selected = new Set(reqs.map((_, i) => i));

  $("#req-count").textContent = reqs.length;
  const list = $("#req-list");

  if (!reqs.length) {
    list.innerHTML =
      '<div class="empty">Nav atrasta "Funkcionālās prasības" sadaļa.<br>' +
      "Pārliecinieties, ka dokumentā ir šāds virsraksts.</div>";
    show($("#req-result"));
    return;
  }

  list.innerHTML = reqs.map((r, i) => `
    <div class="req-item">
      <input type="checkbox" data-i="${i}" checked>
      <span class="req-id">${escHtml(r.id)}</span>
      <span class="req-text">${escHtml(r.text)}</span>
    </div>`).join("");

  list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", function () {
      const i = +this.dataset.i;
      this.checked ? state.selected.add(i) : state.selected.delete(i);
    });
  });

  show($("#req-result"));
}


function clearResults() {
  hide($("#req-result"));
  state.requirements = [];
  state.selected = new Set();
}


// pārslēdz Text / File režīmu
function setupInputToggle() {
  $("#mode-text").addEventListener("click", () => {
    $("#mode-text").classList.add("active");
    $("#mode-file").classList.remove("active");
    show($("#section-text"));
    hide($("#section-file"));
    $("#file-status").textContent = "";
    $("#file-inp").value = "";
    clearResults();
  });

  $("#mode-file").addEventListener("click", () => {
    $("#mode-file").classList.add("active");
    $("#mode-text").classList.remove("active");
    hide($("#section-text"));
    show($("#section-file"));
    clearResults();
  });
}


// POST /api/extract-text
function setupTextExtract() {
  $("#btn-extract-text").addEventListener("click", async () => {
    const text = $("#raw-text").value.trim();
    if (!text) { alert("Lūdzu, ievadiet tekstu!"); return; }

    const btn = $("#btn-extract-text");
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Apstrādā…';

    try {
      const res = await fetch("/api/extract-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      showRequirements(data.requirements);
    } finally {
      btn.disabled = false;
      btn.textContent = "Izgūt prasības";
    }
  });
}


// POST /api/extract-file
async function uploadFile(file) {
  const status = $("#file-status");
  status.textContent = `Augšupielādē: ${file.name}…`;

  const form = new FormData();
  form.append("file", file);

  try {
    const res = await fetch("/api/extract-file", { method: "POST", body: form });
    const data = await res.json();
    if (data.error) { status.textContent = `Kļūda: ${data.error}`; return; }
    status.textContent = `Apstrādāts: ${file.name}`;
    showRequirements(data.requirements);
  } catch (e) {
    status.textContent = `Kļūda: ${e.message}`;
  }
}


// drag & drop + click
function setupFileUpload() {
  const dropZone = $("#drop-zone");
  const fileInput = $("#file-inp");

  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("over"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("over"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("over");
    const f = e.dataTransfer.files?.[0];
    if (f) uploadFile(f);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files?.[0]) uploadFile(fileInput.files[0]);
  });
}


// "Atzīmēt visas" poga
function setupSelectAll() {
  $("#btn-sel-all").addEventListener("click", () => {
    const allChecked = state.selected.size === state.requirements.length;
    state.selected.clear();

    $("#req-list").querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = !allChecked;
      if (!allChecked) state.selected.add(+cb.dataset.i);
    });

    $("#btn-sel-all").textContent = allChecked ? "Atzīmēt visas" : "Noņemt visas";
  });
}


export function initExtract() {
  setupInputToggle();
  setupTextExtract();
  setupFileUpload();
  setupSelectAll();
}
