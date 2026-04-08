"""CLI tool for downloading GGUF models from Hugging Face Hub."""

import argparse
import os
import sys
from typing import Any, Dict, Optional


def resolve_model_path(name: str, params: Optional[Dict[str, Any]] = None) -> str:
    """Resolve the local file path for a GGUF model.

    Priority order:
    1. params["model_path"] if it points to an existing file on disk
    2. name treated as a Hugging Face repo ID (contains "/") -- auto-downloads
    3. name treated as a direct file path

    Args:
        name: Model name from the YAML config (file path or HF repo ID).
        params: Optional dict that may contain "model_path".

    Returns:
        Absolute path to the GGUF model file on disk.

    Raises:
        FileNotFoundError: If no valid model file can be resolved.
    """
    params = params or {}

    explicit_path = params.get("model_path")
    if explicit_path and os.path.isfile(explicit_path):
        return os.path.abspath(explicit_path)

    if os.path.isfile(name):
        return os.path.abspath(name)

    if "/" in name:
        return _download_from_hf(name, params)

    raise FileNotFoundError(
        f"Cannot resolve model '{name}'. Provide a valid file path, "
        f"a Hugging Face repo ID (with '/'), or set params.model_path."
    )


def _download_from_hf(repo_id: str, params: Optional[Dict[str, Any]] = None) -> str:
    """Download a GGUF model from Hugging Face Hub and return the local path.

    If multiple GGUF files exist, selects the first one matching an optional
    ``model_file_pattern`` param, otherwise picks the largest ``.gguf`` file.

    Args:
        repo_id: Hugging Face repository ID (e.g. "TheBloke/Mistral-7B-GGUF").
        params: Optional dict that may contain "model_file_pattern" and
                "cache_dir".

    Returns:
        Absolute path to the downloaded GGUF model file.
    """
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        raise ImportError(
            "huggingface_hub is required for downloading models. "
            "Install with: uv sync --extra local"
        )

    params = params or {}
    cache_dir = params.get("cache_dir")
    pattern = params.get("model_file_pattern", "*.gguf")

    print(f"Downloading model from Hugging Face: {repo_id}")

    allow_patterns = [pattern] if pattern else ["*.gguf"]

    download_kwargs: Dict[str, Any] = {
        "repo_id": repo_id,
        "allow_patterns": allow_patterns,
    }
    if cache_dir:
        download_kwargs["local_dir"] = cache_dir

    snapshot_path = snapshot_download(**download_kwargs)

    gguf_files = [f for f in os.listdir(snapshot_path) if f.endswith(".gguf")]

    if not gguf_files:
        raise FileNotFoundError(
            f"No .gguf files found in repo '{repo_id}' matching pattern '{pattern}'"
        )

    chosen = gguf_files[0]
    if len(gguf_files) > 1:
        chosen = max(
            gguf_files, key=lambda f: os.path.getsize(os.path.join(snapshot_path, f))
        )
        print(f"Multiple GGUF files found; selecting largest: {chosen}")

    model_path = os.path.join(snapshot_path, chosen)
    print(f"Model ready: {model_path}")
    return model_path


def main() -> None:
    """Entry point for the download_model CLI."""
    parser = argparse.ArgumentParser(
        description="Download GGUF models from Hugging Face Hub"
    )
    parser.add_argument(
        "--repo",
        required=True,
        help="Hugging Face repository ID (e.g. TheBloke/Mistral-7B-Instruct-v0.2-GGUF)",
    )
    parser.add_argument(
        "--pattern",
        default="*.gguf",
        help="Filename glob pattern to select specific GGUF file(s) (default: *.gguf)",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Local directory to download files into (default: HF cache)",
    )
    args = parser.parse_args()

    params: Dict[str, Any] = {"model_file_pattern": args.pattern}
    if args.output_dir:
        params["cache_dir"] = args.output_dir

    model_path = _download_from_hf(args.repo, params)
    print(model_path)


if __name__ == "__main__":
    main()
