import { $, $$ , show, hide } from "./utils.js";

// GROQ atslēgas saglabāšana localStorage
function initApiKey() {
  const savedKey = localStorage.getItem("groq_api_key") || "";
  if (savedKey) $("#settings-key").value = savedKey;

  $("#btn-save-key").addEventListener("click", () => {
    const key = $("#settings-key").value.trim();
    if (!key) return;
    localStorage.setItem("groq_api_key", key);
    const ok = $("#key-saved");
    ok.className = "alert alert-ok";
    show(ok);
    setTimeout(() => hide(ok), 2500);
  });
}

// aktivizē valodas pogu
function applyLang(lang) {
  $$("#lang-toggle .lang-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === lang);
  });
}

// klausās klikšķus uz valodas pogām
function initLangToggle() {
  const savedLang = localStorage.getItem("gherkin_lang") || "lv";
  applyLang(savedLang);

  $("#lang-toggle")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".lang-btn");
    if (!btn) return;
    const lang = btn.dataset.lang;
    localStorage.setItem("gherkin_lang", lang);
    applyLang(lang);
    const ok = $("#lang-saved");
    ok.className = "alert alert-ok";
    show(ok);
    setTimeout(() => hide(ok), 2000);
  });
}

export function initSettings() {
  initApiKey();
  initLangToggle();
}
