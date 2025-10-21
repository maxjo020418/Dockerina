from flask import Flask, request, Response
import requests
import json
import os
from datetime import datetime
from dotenv import load_dotenv

app = Flask(__name__)


def getenv_multi(keys, default=None):
    for k in keys:
        v = os.getenv(k)
        if v is not None and v != '':
            return v
    return default


_script_dir = os.path.dirname(os.path.abspath(__file__))
_dotenv_path = os.path.join(_script_dir, '.env')
load_dotenv(dotenv_path=_dotenv_path, override=False)


_base_raw = getenv_multi(['SHIM_BASE_DIR', 'BASE_DIR'], _script_dir)
BASE_DIR = os.path.abspath(_base_raw if os.path.isabs(_base_raw) else os.path.join(_script_dir, _base_raw))

_log_raw = getenv_multi(['SHIM_LOG_DIR', 'LOG_DIR'], os.path.join(BASE_DIR, 'logs'))
LOG_DIR = os.path.abspath(_log_raw if os.path.isabs(_log_raw) else os.path.join(BASE_DIR, _log_raw))

UPSTREAM_URL = getenv_multi(
    ['SHIM_URL', 'URL'],
    'http://localhost:11434/v1/chat/completions'
)
try:
    PORT = int(getenv_multi(['SHIM_PORT', 'PORT'], '8000'))
except ValueError:
    PORT = 8000
RULE = getenv_multi(['SHIM_RULE', 'RULE'], '/v1/chat/completions')


def shim():
    payload = request.get_json(force=True)
    
    os.makedirs(LOG_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    log_path = os.path.join(LOG_DIR, f"{timestamp}.json")
    with open(log_path, 'w') as f:
        json.dump(payload, f, indent=2)
    
    headers = {k: v for k, v in request.headers if k.lower() != 'host'}
    
    # Forward to LLM backend with streaming
    resp = requests.post(
        UPSTREAM_URL,  #'http://localhost:11434/v1/chat/completions',
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


app.add_url_rule(RULE, view_func=shim, methods=['POST'])

if __name__ == '__main__':
    app.run(port=PORT)
