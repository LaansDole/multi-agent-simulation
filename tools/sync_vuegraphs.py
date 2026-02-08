"""
Synchronize YAML Configurations to VueGraph Database

This tool uploads local YAML workflow configurations from the yaml_instance/
directory to the VueGraph database via the API endpoint. This is essential for
making workflow configurations available to the frontend visualization system.

Purpose:
- Ensures the database reflects the latest YAML configurations
- Required after modifying workflow YAML files to see changes in the UI
- Useful for development and deployment workflows

Usage:
    python tools/sync_vuegraphs.py
    # or via Makefile:
    make sync
"""

import os
import glob
import requests
import yaml
import time
from pathlib import Path

# Configuration
API_URL = "http://localhost:6400/api/vuegraphs/upload/content"
YAML_DIR = "yaml_instance"
MAX_RETRIES = 20
RETRY_DELAY = 2  # seconds

def wait_for_backend():
    """Wait for backend to be ready before syncing."""
    health_url = "http://localhost:6400/health"
    print(f"Waiting for backend to be ready at {health_url}...")
    
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = requests.get(health_url, timeout=5)
            if response.status_code == 200:
                print(f"Backend is ready!")
                return True
        except requests.exceptions.RequestException as e:
            if attempt == MAX_RETRIES:
                print(f"Backend failed to become ready after {MAX_RETRIES} attempts")
                return False
            print(f"Attempt {attempt}/{MAX_RETRIES}: Backend not ready yet, waiting {RETRY_DELAY}s...")
            time.sleep(RETRY_DELAY)
    
    return False

def sync_yaml_to_vuegraphs():
    """Reads all YAML files and uploads them to the VueGraph database."""
    if not wait_for_backend():
        print("ERROR: Cannot sync - backend is not available")
        return
    
    print(f"Syncing YAML files from {YAML_DIR} to {API_URL}...")

    yaml_files = glob.glob(os.path.join(YAML_DIR, "*.yaml"))

    for file_path in yaml_files:
        try:
            filename = Path(file_path).stem  # simulation_hospital_lmstudio

            with open(file_path, "r") as f:
                content = f.read()

            # Basic validation to ensure it's a valid YAML
            try:
                yaml.safe_load(content)
            except yaml.YAMLError as e:
                print(f"Skipping {filename}: Invalid YAML - {e}")
                continue

            # Upload to VueGraph API
            payload = {"filename": filename, "content": content}

            response = requests.post(API_URL, json=payload)

            if response.status_code == 200:
                print(f"✓ Synced: {filename}")
            else:
                print(f"✗ Failed: {filename} - {response.status_code} {response.text}")
                
        except Exception as e:
            print(f"Error processing {file_path}: {e}")


if __name__ == "__main__":
    sync_yaml_to_vuegraphs()
