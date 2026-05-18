import os
import tempfile

from flask import Blueprint, jsonify, request

from app.services import fromDocx, fromText

bp = Blueprint("extract", __name__, url_prefix="/api")


# izvelk prasības no ielīmēta teksta
@bp.post("/extract-text")
def extract_text():
    data = request.get_json(force=True)
    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "Teksts ir tukšs"}), 400
    try:
        reqs = fromText(text)
    except Exception as e:
        return jsonify({"error": f"Parsēšanas kļūda: {e}"}), 500
    return jsonify({"requirements": [r.to_dict() for r in reqs]})


# apstrādā augšupielādēto .docx failu 
# tiek izmantot tempfile, lai nebūtu jāizmanto serveris
@bp.post("/extract-file")
def extractFile():
    if "file" not in request.files:
        return jsonify({"error": "Nav pievienots fails"}), 400

    f = request.files["file"]
    if not f.filename.endswith(".docx"):
        return jsonify({"error": "Atbalstīts tikai .docx formāts"}), 400

    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
        tmp_path = tmp.name
        f.save(tmp_path)
    try:
        reqs = fromDocx(tmp_path)
    except Exception as e:
        return jsonify({"error": f"Faila parsēšanas kļūda: {e}"}), 500
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    return jsonify({"requirements": [r.to_dict() for r in reqs]})
