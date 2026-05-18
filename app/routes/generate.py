from flask import Blueprint, Response, jsonify, request, stream_with_context

from app.services import generateScenarios

bp = Blueprint("generate", __name__, url_prefix="/api")

DEFAULT_MODEL = "groq:llama-3.3-70b-versatile"

# saņem prasības, API atslēgu un modeli
# atgriež server sent events
@bp.post("/generate")
def generate():
    data = request.get_json(force=True)
    api_key = data.get("api_key", "").strip()
    model = data.get("model", DEFAULT_MODEL).strip()
    requirements = data.get("requirements", [])
    lang = data.get("lang", "lv").strip()
    prompt_num = int(data.get("prompt_num", 1))

    if not model.startswith("ollama:") and not api_key:
        return jsonify({"error": "Nav norādīta GROQ API atslēga"}), 400
    if not requirements:
        return jsonify({"error": "Nav prasību"}), 400

    return Response(
        stream_with_context(generateScenarios(requirements, api_key, model, lang, prompt_num)),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
