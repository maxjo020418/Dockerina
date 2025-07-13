from flask import Flask, request, Response
import requests
import json
import os
from datetime import datetime

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(BASE_DIR, 'logs')

@app.route('/v1/chat/completions', methods=['POST'])
def shim():
    # Parse JSON payload
    payload = request.get_json(force=True)
    
    # Log payload to a unique file inside LOG_DIR
    os.makedirs(LOG_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    log_path = os.path.join(LOG_DIR, f"{timestamp}.json")
    with open(log_path, 'w') as f:
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
