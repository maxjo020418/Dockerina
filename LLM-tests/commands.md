based on issue [6127](https://github.com/ollama/ollama/issues/6127)

```bash
ollama show <modelname> > outfile.modelfile
ollama create <modelname> -f outfile.modelfile

curl -X POST http://localhost:11434/v1/chat/completions \
     -H "Content-Type: application/json" \
     --data @request_log.json
```

Wireshark filter (capture on Ollama host): `json && tcp.port != 8000`