import { $, $$ } from "./utils.js";

export function switchTab(name) {
  // noņem active visiem
  $$(".nav-btn").forEach((b) => b.classList.remove("active"));
  $$(".tab").forEach((t) => { t.classList.remove("active"); t.classList.add("hidden"); });

  const btn = $(`.nav-btn[data-tab="${name}"]`);
  const tab = $(`#tab-${name}`);
  if (btn) btn.classList.add("active");
  if (tab) { tab.classList.remove("hidden"); tab.classList.add("active"); }

  window.dispatchEvent(new CustomEvent("tabchange", { detail: { name } }));
}

export function initNav() {
  $$(".nav-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  window.switchTab = switchTab;
}
