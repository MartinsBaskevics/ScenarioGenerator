import { state } from "./state.js";
import { $, show, hide, escHtml, highlightGherkin } from "./utils.js";
import { switchTab } from "./nav.js";


// atgriež tikai atzīmētās prasības no state.
export function getCheckedReqs() {
  return [...state.selected]
    .sort((a, b) => a - b)
    .map((i) => state.requirements[i])
    .filter(Boolean);
}


// renderē uzģenerētos scenārijus
export function showReqPreview() {
  const reqs = getCheckedReqs();
  const box = $("#gen-req-preview");

  if (!reqs.length) {
    box.innerHTML =
      '<div class="empty">Nav izvēlētu prasību -<br>' +
      '<button class="link" onclick="switchTab(\'extract\')">dodieties uz Prasību izguvi</button></div>';
    return;
  }

  box.innerHTML = `<div class="req-list" style="max-height:200px;overflow-y:auto">
    ${reqs.map((r) => `
      <div class="req-item">
        <span class="req-id">${escHtml(r.id)}</span>
        <span class="req-text">${escHtml(r.text)}</span>
      </div>`).join("")}
  </div>`;
}


function formatTime(secs) {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return s > 0 ? `${m}min ${s}s` : `${m}min`;
}


function showTimingTable(timings, totalElapsed) {
  let el = $("#timing-summary");
  if (!el) {
    el = document.createElement("div");
    el.id = "timing-summary";
    el.style.cssText =
      "margin-top:0.75rem;font-size:0.8rem;border-top:1px solid var(--border,#e5e7eb);padding-top:0.5rem;";
    $("#gen-progress").after(el);
  }

  const hasTokens = Object.values(timings).some(
    (t) => t.tokens_in != null || t.tokens_out != null
  );

  const headerCols = hasTokens
    ? `<th>Prasība</th><th>Laiks</th><th title="Ievades tokeni">↑ tokeni</th><th title="Izvades tokeni">↓ tokeni</th>`
    : `<th>Prasība</th><th>Laiks</th>`;

  const rows = Object.entries(timings).map(([id, t]) => {
    const tokIn = t.tokens_in != null ? t.tokens_in : "-";
    const tokOut = t.tokens_out != null ? t.tokens_out : "-";
    const tokenCols = hasTokens ? `<td>${tokIn}</td><td>${tokOut}</td>` : "";
    return `<tr>
      <td style="font-weight:600">${escHtml(id)}</td>
      <td>${formatTime(t.elapsed)}</td>
      ${tokenCols}
    </tr>`;
  }).join("");

  const totalStr = totalElapsed != null ? formatTime(totalElapsed) : "-";
  const sumIn = Object.values(timings).reduce((s, t) => s + (t.tokens_in ?? 0), 0);
  const sumOut = Object.values(timings).reduce((s, t) => s + (t.tokens_out ?? 0), 0);
  const totalTokenCols = hasTokens ? `<td>${sumIn}</td><td>${sumOut}</td>` : "";

  el.innerHTML = `
    <table style="width:100%;border-collapse:collapse;color:var(--text-muted,#666)">
      <thead>
        <tr style="border-bottom:1px solid var(--border,#e5e7eb);text-align:left;font-weight:600">
          ${headerCols}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="border-top:1px solid var(--border,#e5e7eb);font-weight:600">
          <td>Kopā</td><td>${totalStr}</td>${totalTokenCols}
        </tr>
      </tfoot>
    </table>`;
  show(el);
}


// apstrādā visus server side event tipus
function handleSseEvent(msg, fillEl, textEl, reqs) {
  if (msg.type === "progress") {
    const pct = Math.round(((msg.current - 1) / msg.total) * 100);
    fillEl.style.width = pct + "%";
    textEl.textContent = `Apstrādā ${msg.current}/${msg.total}: ${msg.id}`;

  } else if (msg.type === "wait") {
    const end = Date.now() + msg.seconds * 1000;
    const label = msg.limit_type === "tpd"
      ? `Dienas limits - gaidu ${Math.round(msg.seconds)}s`
      : `Minūtes limits - gaidu ${Math.round(msg.seconds)}s`;
    const tick = () => {
      const left = Math.ceil((end - Date.now()) / 1000);
      if (left > 0) {
        textEl.textContent = `${label} (${left}s) · ${msg.id}`;
        setTimeout(tick, 500);
      }
    };
    tick();

  } else if (msg.type === "result") {
    const t = msg.elapsed != null ? ` · ${msg.elapsed}s` : "";
    textEl.textContent = `Apstrādā ${msg.id}${t} - pabeigts`;

  } else if (msg.type === "done") {
    fillEl.style.width = "100%";
    const total = msg.total_elapsed != null ? ` ${formatTime(msg.total_elapsed)}` : "";
    textEl.textContent = `Pabeigts! ${reqs.length} prasības · kopā${total}`;
    state.feature = msg.feature;
    hide($("#output-placeholder"));
    $("#feature-out").innerHTML = highlightGherkin(msg.feature);
    show($("#output-ready"));
  }
}


async function startGeneration() {
  const apiKey = localStorage.getItem("groq_api_key") || "";
  const model = $("#model-select").value;
  const reqs = getCheckedReqs();
  const alertEl = $("#gen-alert");
  hide(alertEl);

  const usingOllama = model.startsWith("ollama:");
  if (!usingOllama && !apiKey) {
    alertEl.className = "alert alert-err";
    alertEl.textContent = "Nav GROQ API atslēgas. Dodieties uz Iestatījumiem un saglabājiet atslēgu.";
    show(alertEl);
    return;
  }
  if (!reqs.length) {
    alertEl.className = "alert alert-err";
    alertEl.textContent = "Nav izvēlētu prasību!";
    show(alertEl);
    return;
  }

  const btn = $("#btn-gen");
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Ģenerē…';

  const fillEl = $("#progress-fill");
  const textEl = $("#progress-text");
  show($("#gen-progress"));
  hide($("#output-ready"));
  show($("#output-placeholder"));

  const prevSummary = $("#timing-summary");
  if (prevSummary) hide(prevSummary);

  const timings = {};

  try {
    const resp = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        model,
        requirements: reqs,
        lang: localStorage.getItem("gherkin_lang") || "lv",
        prompt_num: parseInt($("#prompt-select").value),
      }),
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split("\n");
      buf = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let msg;
        try { msg = JSON.parse(line.slice(6)); } catch { continue; }

        if (msg.type === "error") throw new Error(msg.message);

        if (msg.type === "auth_error") {
          alertEl.className = "alert alert-err";
          alertEl.innerHTML = `${msg.message} <button class="link" onclick="switchTab('settings')">→ Iestatījumi</button>`;
          show(alertEl);
          return;
        }

        if (msg.type === "result" && msg.elapsed != null) {
          timings[msg.id] = {
            elapsed: msg.elapsed,
            tokens_in: msg.tokens_in ?? null,
            tokens_out: msg.tokens_out ?? null,
          };
        }

        handleSseEvent(msg, fillEl, textEl, reqs);

        if (msg.type === "done") {
          showTimingTable(timings, msg.total_elapsed);
        }
      }
    }

  } catch (e) {
    alertEl.className = "alert alert-err";
    alertEl.textContent = `Kļūda: ${e.message}`;
    show(alertEl);
  } finally {
    btn.disabled = false;
    btn.textContent = "Ģenerēt scenārijus";
  }
}


function setupCopyDownload() {
  $("#btn-copy").addEventListener("click", () => {
    navigator.clipboard.writeText(state.feature).then(() => {
      $("#btn-copy").textContent = "✓ Nokopēts";
      setTimeout(() => { $("#btn-copy").textContent = "Kopēt"; }, 2000);
    });
  });

  $("#btn-dl").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([state.feature], { type: "text/plain" }));
    a.download = "scenarios.feature";
    a.click();
  });
}


export function initGenerate() {
  $("#btn-gen").addEventListener("click", startGeneration);
  $("#btn-goto-gen").addEventListener("click", () => switchTab("generate"));
  setupCopyDownload();

  window.addEventListener("tabchange", ({ detail }) => {
    if (detail.name === "generate") showReqPreview();
  });
}
