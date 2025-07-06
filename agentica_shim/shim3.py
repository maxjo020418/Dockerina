from flask import Flask, request, Response
import requests
import json

app = Flask(__name__)
LOG_FILE = 'request_log.json'

@app.route('/v1/chat/completions', methods=['POST'])
def shim():
    # Parse JSON payload
    payload = request.get_json(force=True)
    
    # Log payload to file (overwrite)
    with open(LOG_FILE, 'w') as f:
        json.dump(payload, f, indent=2)
    
    # Prepare headers for forwarding (exclude Host)
    headers = {k: v for k, v in request.headers if k.lower() != 'host'}
    
    # Forward to LLM backend with streaming
    resp = requests.post(
        'http://localhost:11434/v1/chat/completions',
        json=payload,
        headers=headers,
        stream=True
    )
    
    # Stream response back to requester
    return Response(
        resp.raw,
        status=resp.status_code,
        headers=dict(resp.headers)
    )

if __name__ == '__main__':
    app.run(port=8000)
