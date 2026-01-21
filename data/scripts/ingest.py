import requests
import json
import sys

# 配置
EMBEDDING_API = "http://localhost:8000/v1/embeddings"
QDRANT_API = "http://localhost:6333/collections/documents/points"
MODEL = "text-embedding-3-small"

def ingest(text, doc_id):
    # 1. 获取 Embedding
    print(f"Generating embedding for doc {doc_id}...")
    resp = requests.post(EMBEDDING_API, json={
        "model": MODEL,
        "input": text
    })
    if resp.status_code != 200:
        print(f"Error getting embedding: {resp.text}")
        return
    
    vector = resp.json()["data"][0]["embedding"]

    # 2. 存入 Qdrant
    print(f"Uploading to Qdrant...")
    payload = {
        "points": [
            {
                "id": doc_id,
                "vector": vector,
                "payload": {"content": text}
            }
        ]
    }
    resp = requests.put(QDRANT_API, params={"wait": "true"}, json=payload)
    if resp.status_code != 200:
        print(f"Error uploading to Qdrant: {resp.text}")
    else:
        print("Success!")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python ingest.py <id> <text>")
        sys.exit(1)
    
    doc_id = int(sys.argv[1])
    text = sys.argv[2]
    ingest(text, doc_id)
