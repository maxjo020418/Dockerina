# shim.py
import json
from flask import Flask, request, Response
import requests

app = Flask(__name__)

@app.route("/chat/completions", methods=["POST"])
def proxy_chat():
    # 1) Log incoming request
    print(f"[shim] ← Incoming {request.method} {request.url}")

    # 2) Prepare outbound body
    body = request.get_json() or {}
    out = {}

    # Copy model, stream, etc.
    for k in ("model", "stream", "temperature", "top_p", "n", "stop", "max_tokens"):
        if k in body:
            out[k] = body[k]

    # 3) Transform messages
    out_msgs = []
    for m in body.get("messages", []):
        msg = {"role": m.get("role")}

        # Content: flatten array→string, extract images
        content = m.get("content")
        if isinstance(content, list):
            # join text parts
            text = "\n".join([c.get("text", "") for c in content if c.get("type") == "text"])
            msg["content"] = text
            # extract image URLs
            imgs = [c["image_url"]["url"] for c in content if c.get("type") == "image_url"]
            if imgs:
                msg["images"] = imgs
        else:
            msg["content"] = content

        # Function calls → tool_calls
        if "function_call" in m:
            fc = m["function_call"]
            try:
                args = json.loads(fc.get("arguments", "{}"))
            except json.JSONDecodeError:
                args = {}
            msg["tool_calls"] = [{
                "function": {
                    "name": fc.get("name"),
                    "arguments": args
                }
            }]

        out_msgs.append(msg)
    out["messages"] = out_msgs

    # 4) Map OpenAI-style functions → Ollama tools
    if "functions" in body:
        tools = []
        for f in body["functions"]:
            tools.append({
                "type": "function",
                "function": {
                    "name": f.get("name"),
                    "description": f.get("description"),
                    "parameters": f.get("parameters")
                }
            })
        out["tools"] = tools

    # 5) Proxy to your LLM
    llm_resp = requests.post(
        "http://localhost:11434/api/chat",
        json=out,
        headers={"Content-Type": "application/json"},
        stream=False
    )

    llm_resp.raise_for_status()
    print(llm_resp.text)

    # 6) Relay status, headers, and body
    excluded_headers = {"content-encoding", "transfer-encoding", "connection"}
    headers = [(name, value) for (name, value) in llm_resp.raw.headers.items()
               if name.lower() not in excluded_headers]

    return Response(llm_resp.content, status=llm_resp.status_code, headers=headers)

if __name__ == "__main__":
    # Note: debug=True will auto-reload and show errors; remove in production
    app.run(host="0.0.0.0", port=8000, debug=True)
