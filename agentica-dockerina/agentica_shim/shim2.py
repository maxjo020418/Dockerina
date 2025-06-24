# shim.py
import json
from flask import Flask, request, Response
import requests

app = Flask(__name__)

@app.route("/chat/completions", methods=["POST"])
def proxy_chat():
    print(f"[shim] ← Incoming {request.method} {request.url}")

    print(f"{type(request.json)}")

    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(request.json, f, ensure_ascii=False, indent=4)

    # DEBUG SHORT-CIRCUIT: return 400 without calling the LLM
    return Response(
        json.dumps({"error": "debug mode: skipping LLM call"}),
        status=400,
        mimetype="application/json"
    )

if __name__ == "__main__":
    # Note: debug=True will auto-reload and show errors; remove in production
    app.run(host="0.0.0.0", port=8000, debug=True)
