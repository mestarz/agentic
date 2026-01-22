import requests
import os
import sys

# Qdrant 配置
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
VECTOR_SIZE = int(os.getenv("AGENTIC_VECTOR_SIZE", "1024"))  # OpenAI default: 1536, BGE-M3: 1024
DISTANCE_METRIC = "Cosine"

COLLECTIONS = [
    "mem_staging",
    "mem_shared",
    "documents"
]

def init_collection(name, recreate=False):
    print(f"Checking collection: {name}...")
    resp = requests.get(f"{QDRANT_URL}/collections/{name}")
    
    exists = resp.status_code == 200
    if exists:
        if recreate:
            print(f"Recreating collection: {name} (forced)...")
        else:
            # Check dimension
            data = resp.json()
            current_size = data.get("result", {}).get("config", {}).get("params", {}).get("vectors", {}).get("size")
            if current_size != VECTOR_SIZE:
                print(f"Collection '{name}' has wrong dimension: {current_size}, expected: {VECTOR_SIZE}. Recreating...")
                recreate = True
            else:
                print(f"Collection '{name}' already exists with correct dimension.")
                return

    if recreate and exists:
        requests.delete(f"{QDRANT_URL}/collections/{name}")

    print(f"Creating collection '{name}' with dimension {VECTOR_SIZE}...")
    payload = {
        "vectors": {
            "size": VECTOR_SIZE,
            "distance": DISTANCE_METRIC
        }
    }
    create_resp = requests.put(f"{QDRANT_URL}/collections/{name}", json=payload)
    if create_resp.status_code == 200:
        print(f"Successfully created '{name}'.")
    else:
        print(f"Failed to create '{name}': {create_resp.text}")

if __name__ == "__main__":
    recreate = "--recreate" in sys.argv
    try:
        for coll in COLLECTIONS:
            init_collection(coll, recreate)
    except Exception as e:
        print(f"Error connecting to Qdrant at {QDRANT_URL}: {e}")
