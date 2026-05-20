# ScenarioGenerator

BDD scenāriju ģenerators izmantojot SRS dokumentus latviešu valodā.
RTU bakalaura darbs - Mārtiņš Baškevics, 231RDB193

## Prasības

- Python 3.11+
- GROQ API atslēga (bezmaksas: https://console.groq.com) **vai** lokāli instalēts Ollama

## Uzstādīšana

```bash
pip install -r requirements.txt
```

## Palaišana

```bash
python run.py
```

Atver pārlūku: **http://localhost:5000**

## Lokālie modeļi (Ollama)

Lai izmantotu Ollama, jāinstalē kāds no atbalstītajiem modeļiem:

```bash
ollama pull llama3.2:3b
ollama pull gemma3:4b
ollama pull llama3.1:8b
ollama pull qwen3:8b
```

Ollama jābūt palaistam pirms ScenarioGenerator palaišanas.
