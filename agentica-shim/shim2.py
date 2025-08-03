import json
from flask import Flask, request, Response

from openai import AsyncOpenAI
from openai._types import NOT_GIVEN

app = Flask(__name__)

@app.route("/v1/chat/completions", methods=["POST"])
async def proxy_chat():
    print(f"[shim] ← Incoming {request.method} {request.url}")

    print(f"{type(request.json)}")

    with open('debug.json', 'w', encoding='utf-8') as f:
        json.dump(request.json, f, ensure_ascii=False, indent=4)

    client = AsyncOpenAI(
        base_url="http://localhost:11434/v1",
        api_key="hellyeah",
    )

    request_payload: dict = request.json or {}

    # Due to Ollama API being in beta stage, `content` field should only be strings. (no multimodal support yet)
    # all lists/dict needs to be flattened to a single string.
    for msg in request_payload.get('messages', []):
        msg_content = msg.get('content')
        if isinstance(msg_content, list):
            # Flatten content list to a single string
            msg['content'] = "\n".join([c.get('text', '') for c in msg['content'] if c.get('type') == 'text'])
        
        elif isinstance(msg_content, dict):
            raise ValueError("`Dict` found! Aborting, needs debugging.")
    
    print(request_payload)

    response = await client.chat.completions.create(
         # required
        messages             = request_payload['messages'],
        model                = request_payload['model'],

        # optional with NOT_GIVEN default
        audio                = request_payload.get('audio',                NOT_GIVEN),
        frequency_penalty    = request_payload.get('frequency_penalty',    NOT_GIVEN),
        function_call        = request_payload.get('function_call',        NOT_GIVEN),
        functions            = request_payload.get('functions',            NOT_GIVEN),
        logit_bias           = request_payload.get('logit_bias',           NOT_GIVEN),
        logprobs             = request_payload.get('logprobs',             NOT_GIVEN),
        max_completion_tokens= request_payload.get('max_completion_tokens',NOT_GIVEN),
        max_tokens           = request_payload.get('max_tokens',           NOT_GIVEN),
        metadata             = request_payload.get('metadata',             NOT_GIVEN),
        modalities           = request_payload.get('modalities',           NOT_GIVEN),
        n                    = request_payload.get('n',                    NOT_GIVEN),
        parallel_tool_calls  = request_payload.get('parallel_tool_calls',  NOT_GIVEN),
        prediction           = request_payload.get('prediction',           NOT_GIVEN),
        presence_penalty     = request_payload.get('presence_penalty',     NOT_GIVEN),
        reasoning_effort     = request_payload.get('reasoning_effort',     NOT_GIVEN),
        response_format      = request_payload.get('response_format',      NOT_GIVEN),
        seed                 = request_payload.get('seed',                 NOT_GIVEN),
        service_tier         = request_payload.get('service_tier',         NOT_GIVEN),
        stop                 = request_payload.get('stop',                 NOT_GIVEN),
        store                = request_payload.get('store',                NOT_GIVEN),
        stream               = request_payload.get('stream',               NOT_GIVEN),
        stream_options       = request_payload.get('stream_options',       NOT_GIVEN),
        temperature          = request_payload.get('temperature',          NOT_GIVEN),
        tool_choice          = request_payload.get('tool_choice',          NOT_GIVEN),
        tools                = request_payload.get('tools',                NOT_GIVEN),
        top_logprobs         = request_payload.get('top_logprobs',         NOT_GIVEN),
        top_p                = request_payload.get('top_p',                NOT_GIVEN),
        user                 = request_payload.get('user',                 NOT_GIVEN),
        web_search_options   = request_payload.get('web_search_options',   NOT_GIVEN),

        # extras defaulting to None
        extra_headers        = request_payload.get('extra_headers',        None),
        extra_query          = request_payload.get('extra_query',          None),
        extra_body           = request_payload.get('extra_body',           None),
        timeout              = request_payload.get('timeout',              NOT_GIVEN),
    )

    print(f"\n\n[shim] → Outgoing")
    async for chunk in response:
        print(chunk)

    # DEBUG SHORT-CIRCUIT
    return Response(
        json.dumps({"error": "debug mode: skipping LLM call"}),
        status=400,
        mimetype="application/json"
    )

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
