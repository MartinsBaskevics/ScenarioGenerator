import json
import re
import time
from pathlib import Path

import requests

GROQ_API = "https://api.groq.com/openai/v1/chat/completions"
OLLAMA_API = "http://localhost:11434/api/chat"

RETRY_LIMIT = 10
TOKEN_BUFFER = 2000

PROMPTS_FOLDER = Path(__file__).parent.parent / "prompts"
loadedPrompts = {}


def getPromptText(num):
    if num not in loadedPrompts:
        f = PROMPTS_FOLDER / f"prompt_{num}.txt"
        if not f.exists():
            f = PROMPTS_FOLDER / "prompt_1.txt"
        loadedPrompts[num] = f.read_text(encoding="utf-8")
    return loadedPrompts[num]


# izveido uzvedni
def buildPrompt(lang, num=1):
    if lang == "en":
        kw = ("Given", "When", "Then", "Feature", "Scenario")
    else:
        kw = ("Kad", "Ja", "Tad", "Funkcionalitāte", "Scenārijs")
    return getPromptText(num).format(
        kw_given=kw[0], kw_when=kw[1], kw_then=kw[2],
        kw_feature=kw[3], kw_scenario=kw[4]
    )


def requirementToXml(reqId, text):
    # escape speciālās rakstzīmes lai XML būtu derīgs
    safe = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f'<prasiba id="{reqId}"><apraksts>{safe}</apraksts></prasiba>'


def cleanOutput(text, modelName):
    # qwen3 reizēm atstāj <think> bloku, noņem to
    if "qwen3" in modelName:
        text = re.sub(r"<think>.*?</think>\s*", "", text, flags=re.DOTALL)
    # dažreiz modelis ieliek atbildi markdown blokā
    for prefix in ("```gherkin", "```feature", "```"):
        if text.startswith(prefix):
            text = text[len(prefix):]
            break
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def parseResetTime(headers, errBody):
    # nolasa cik sekundes jāgaida no GROQ rate limita vai kļūdas ziņojuma
    def parseDuration(s):
        total = 0.0
        for val, unit in re.findall(r"([\d.]+)\s*(ms|s|m)", s.strip()):
            v = float(val)
            if unit == "ms":
                total += v / 1000.0
            elif unit == "s":
                total += v
            elif unit == "m":
                total += v * 60.0
        return total

    msg = ""
    if isinstance(errBody, dict):
        msg = errBody.get("error", {}).get("message", "") or ""

    isDaily = bool(re.search(r"tokens?\s+per\s+day|daily|tpd", msg, re.IGNORECASE))
    limitType = "tpd" if isDaily else "tpm"

    resetHeader = headers.get("x-ratelimit-reset-tokens", "").strip()
    if resetHeader:
        secs = parseDuration(resetHeader)
        if secs > 0:
            return secs + 0.5, limitType

    m = re.search(r"try again in\s+([\d.]+\s*(?:ms|s|m)[^\"]*)", msg, re.IGNORECASE)
    if m:
        secs = parseDuration(m.group(1))
        if secs > 0:
            return secs + 0.5, limitType

    return 10.0, limitType


def callModel(apiKey, modelName, systemPrompt, xmlInput, usingOllama):
    # vienota funkcija abiem API - Ollama un GROQ
    userMsg = f"Ģenerē Gherkin scenārijus šai prasībai:\n{xmlInput}"

    if usingOllama:
        params = {"temperature": 0.2, "num_predict": 2048}
        # qwen3 un llama3.1:8b nepietiek VRAM ar lielāku kontekstu
        if "qwen3" in modelName or "llama3.1:8b" in modelName:
            params["num_ctx"] = 4096

        msgs = [
            {"role": "system", "content": systemPrompt},
            {"role": "user", "content": userMsg},
        ]
        # qwen3 thinking apiet ar - think=False
        if "qwen3" in modelName:
            msgs.append({"role": "assistant", "content": "<think>\n</think>"})

        resp = requests.post(
            OLLAMA_API,
            json={"model": modelName, "stream": True, "options": params, "messages": msgs},
            timeout=(120, 900),
            stream=True,
        )
        resp.raise_for_status()

        parts = []
        tokIn = tokOut = None
        for line in resp.iter_lines():
            if not line:
                continue
            try:
                chunk = json.loads(line)
            except ValueError:
                continue
            txt = chunk.get("message", {}).get("content", "")
            if txt:
                parts.append(txt)
            if chunk.get("done"):
                tokIn = chunk.get("prompt_eval_count")
                tokOut = chunk.get("eval_count")
                break

        return "".join(parts).strip(), {}, tokIn, tokOut

    else:
        resp = requests.post(
            GROQ_API,
            headers={"Authorization": f"Bearer {apiKey}", "Content-Type": "application/json"},
            json={
                "model": modelName,
                "max_tokens": 2048,
                "temperature": 0.2,
                "messages": [
                    {"role": "system", "content": systemPrompt},
                    {"role": "user", "content": userMsg},
                ],
            },
            timeout=120,
        )
        hdrs = dict(resp.headers)
        return None, (resp, hdrs), None, None


def generateScenarios(requirements, apiKey, model, lang, promptNum=1):
    usingOllama = model.startswith("ollama:")
    modelName = model.split(":", 1)[1] if ":" in model else model
    systemPrompt = buildPrompt(lang, promptNum)
    total = len(requirements)
    results = []
    startTime = time.monotonic()

    for idx, req in enumerate(requirements):
        reqId = req.get("id", f"FP-{idx + 1}")
        reqText = req.get("text", "")
        xml = requirementToXml(reqId, reqText)
        reqStart = time.monotonic()

        yield f"data: {json.dumps({'type': 'progress', 'current': idx + 1, 'total': total, 'id': reqId})}\n\n"

        for attempt in range(RETRY_LIMIT):
            try:
                feature, groqData, tokIn, tokOut = callModel(
                    apiKey, modelName, systemPrompt, xml, usingOllama
                )

                if not usingOllama:
                    apiResp, hdrs = groqData

                    if apiResp.status_code == 401:
                        yield f"data: {json.dumps({'type': 'auth_error', 'message': 'Nepareiza GROQ API atslēga. Pārbaudiet atslēgu Iestatījumos.'})}\n\n"
                        return

                    if apiResp.status_code == 429:
                        try:
                            errBody = apiResp.json()
                        except Exception:
                            errBody = {}
                        waitSecs, limitType = parseResetTime(hdrs, errBody)
                        waitSecs = max(waitSecs, 5.0)
                        yield f"data: {json.dumps({'type': 'wait', 'id': reqId, 'seconds': round(waitSecs, 1), 'limit_type': limitType, 'attempt': attempt + 1})}\n\n"
                        time.sleep(waitSecs)
                        continue

                    apiResp.raise_for_status()
                    body = apiResp.json()
                    feature = body["choices"][0]["message"]["content"].strip()
                    usage = body.get("usage", {})
                    tokIn = usage.get("prompt_tokens")
                    tokOut = usage.get("completion_tokens")

                feature = cleanOutput(feature, modelName)
                results.append(feature)
                elapsed = round(time.monotonic() - reqStart, 1)

                msg = {"type": "result", "id": reqId, "content": feature, "elapsed": elapsed}
                if tokIn is not None:
                    msg["tokens_in"] = tokIn
                if tokOut is not None:
                    msg["tokens_out"] = tokOut
                yield f"data: {json.dumps(msg)}\n\n"

                if not usingOllama:
                    remaining = int(hdrs.get("x-ratelimit-remaining-tokens", "99999"))
                    if remaining < TOKEN_BUFFER:
                        resetHdr = hdrs.get("x-ratelimit-reset-tokens", "5s")
                        waitSecs, limitType = parseResetTime({"x-ratelimit-reset-tokens": resetHdr}, {})
                        waitSecs = max(waitSecs, 5.0)
                        yield f"data: {json.dumps({'type': 'wait', 'id': reqId, 'seconds': round(waitSecs, 1), 'limit_type': limitType, 'attempt': 0})}\n\n"
                        time.sleep(waitSecs)

                break

            except requests.exceptions.Timeout:
                if attempt + 1 < RETRY_LIMIT:
                    yield f"data: {json.dumps({'type': 'wait', 'id': reqId, 'seconds': 5.0, 'attempt': attempt + 1})}\n\n"
                    time.sleep(5)
                    continue
                yield f"data: {json.dumps({'type': 'error', 'message': f'Ollama timeout prasībai {reqId}. Mēģiniet vēlreiz.'})}\n\n"
                return
            except requests.HTTPError as e:
                yield f"data: {json.dumps({'type': 'error', 'message': f'API kļūda {reqId}: {e.response.text}'})}\n\n"
                return
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': f'Kļūda {reqId}: {str(e)}'})}\n\n"
                return
        else:
            yield f"data: {json.dumps({'type': 'error', 'message': f'Prasībai {reqId} beidzās mēģinājumi ({RETRY_LIMIT}).'})}\n\n"
            return

    fullText = "\n\n\n".join(results)
    totalTime = round(time.monotonic() - startTime, 1)
    yield f"data: {json.dumps({'type': 'done', 'feature': fullText, 'total_elapsed': totalTime})}\n\n"
