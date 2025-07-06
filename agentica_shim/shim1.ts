// shim.ts
import express, { Request, Response, NextFunction } from "express";
import axios, { AxiosRequestHeaders } from "axios";

const app = express();
app.use(express.json());

// --- DEBUG / PROXY ROUTE ---
// Catch all OpenAI-style calls to /chat/completions and forward them to Ollama's /api/chat
app.all(
  "/chat/completions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Log incoming request
      console.log(`[shim] ← ${req.method} ${req.originalUrl}`);

      // Build a new body 'out' by cloning and transforming
      const out: any = { ...req.body };
      // Transform messages: ensure content is string and parse function_call.arguments
      out.messages = (req.body.messages || []).map((m: any) => {
        const msg: any = { role: m.role };

        // Normalize content to string
        if (typeof m.content === "string") {
          msg.content = m.content;
        } else if (Array.isArray(m.content)) {
          msg.content = m.content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("\n");
        } else {
          msg.content = "";
        }

        // Convert OpenAI function_call (string args) into Ollama tool_calls (object args)
        if (m.function_call) {
          let argsObj: any = {};
          try {
            argsObj = JSON.parse(m.function_call.arguments);
          } catch (err) {
            console.warn("[shim] Warning: failed to parse function_call.arguments", err);
          }
          msg.tool_calls = [{
            function: { name: m.function_call.name, arguments: argsObj }
          }];
        }

        return msg;
      });

      // Convert top-level OpenAI functions into Ollama tools
      if (req.body.functions) {
        out.tools = req.body.functions.map((f: any) => ({
          name: f.name,
          description: f.description,
          parameters: f.parameters,
        }));
      }

      // Forward to Ollama
      console.log(`[shim] → forwarding to LLM /api/chat`);
      const start = Date.now();
      const llmResponse = await axios({
        method: req.method,
        url: "http://localhost:11434/api/chat",
        headers: {
          ...req.headers as AxiosRequestHeaders,
          host: "localhost:11434",
        },
        data: out,
        validateStatus: () => true,
      });
      const duration = Date.now() - start;

      // Log LLM response summary
      const preview = typeof llmResponse.data === "object"
        ? JSON.stringify(llmResponse.data).slice(0, 200)
        : llmResponse.data;
      console.log(
        `[shim] ← LLM responded ${llmResponse.status} in ${duration}ms, data: ${preview}...`
      );

      // Relay status, headers, and body
      res
        .status(llmResponse.status)
        .set(llmResponse.headers)
        .send(llmResponse.data);
    } catch (err) {
      next(err);
    }
  }
);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Shim proxy listening on http://localhost:${PORT}`);
});
