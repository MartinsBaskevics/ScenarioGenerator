import traceback

from flask import Flask, jsonify, render_template

from app.routes import extract_bp, generate_bp


def create_app():
    app = Flask(__name__, template_folder="../templates", static_folder="../static")
    app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024

    app.register_blueprint(extract_bp)
    app.register_blueprint(generate_bp)

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/favicon.ico")
    def favicon():
        return "", 204

    @app.get("/.well-known/appspecific/com.chrome.devtools.json")
    def chrome_devtools():
        return "", 204

    @app.errorhandler(Exception)
    def handle_exception(e):
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    return app
