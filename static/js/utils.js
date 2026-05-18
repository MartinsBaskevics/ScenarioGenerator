export const $ = (s) => document.querySelector(s);
export const $$ = (s) => document.querySelectorAll(s);

export const show = (el) => el.classList.remove("hidden");
export const hide = (el) => el.classList.add("hidden");

export function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function highlightGherkin(text) {
  const lang = localStorage.getItem("gherkin_lang") || "lv";
  // ... regex loģika krāsošanai (Feature, Scenario, Given/When/Then)
  const stepKw = lang === "en"
    ? /^(    (?:Given|When|Then|And|But) )(.*)$/gm
    : /^(    (?:Kad|Ja|Tad|Un|Bet) )(.*)$/gm;

  // Feature un Scenario atslēgvārdi atkarībā no valodas
  const featureKw = lang === "en" ? "Feature" : "Funkcionalitāte";
  const scenarioKw = lang === "en" ? "Scenario" : "Scenārijs";

  const featureRe = new RegExp(`^(${featureKw}:.*)$`, "gm");
  const scenarioRe = new RegExp(`^(  ${scenarioKw}:.*)$`, "gm");

  // aizsargā pret XSS
  return escHtml(text)
    .replace(featureRe,   '<span class="kw-feature">$1</span>')
    .replace(scenarioRe,  '<span class="kw-scenario">$1</span>')
    .replace(stepKw,      '$1<span class="kw-step">$2</span>')
    .replace(/^(#.*)$/gm, '<span class="kw-comment">$1</span>');
}