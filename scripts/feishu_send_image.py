import argparse
import json
import os
from pathlib import Path

import requests


DEFAULT_BASE_URL = os.environ.get("FEISHU_BASE_URL", "https://open.feishu.cn")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upload a local image to Feishu and send it as an image message."
    )
    parser.add_argument(
        "--target-type",
        choices=("open_id", "chat_id"),
        required=True,
        help="Feishu receive_id_type.",
    )
    parser.add_argument("--target", required=True, help="Target open_id or chat_id.")
    parser.add_argument("--image", required=True, help="Local image path.")
    return parser.parse_args()


def require_token() -> str:
    token = os.environ.get("FEISHU_TENANT_ACCESS_TOKEN")
    if not token:
        raise SystemExit("Missing FEISHU_TENANT_ACCESS_TOKEN environment variable.")
    return token


def upload_image(base_url: str, token: str, image_path: Path) -> str:
    url = f"{base_url}/open-apis/im/v1/images"
    headers = {"Authorization": f"Bearer {token}"}

    with image_path.open("rb") as image_file:
        files = {
            "image_type": (None, "message"),
            "image": (image_path.name, image_file, "application/octet-stream"),
        }
        response = requests.post(url, headers=headers, files=files, timeout=60)

    response.raise_for_status()
    payload = response.json()
    image_key = payload.get("data", {}).get("image_key")
    if not image_key:
        raise SystemExit(f"Upload succeeded but image_key missing: {payload}")
    return image_key


def send_image_message(base_url: str, token: str, target_type: str, target: str, image_key: str) -> dict:
    url = f"{base_url}/open-apis/im/v1/messages?receive_id_type={target_type}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8",
    }
    body = {
        "receive_id": target,
        "msg_type": "image",
        "content": json.dumps({"image_key": image_key}, ensure_ascii=False),
    }
    response = requests.post(url, headers=headers, json=body, timeout=60)
    response.raise_for_status()
    return response.json()


def main() -> None:
    args = parse_args()
    image_path = Path(args.image).expanduser().resolve()
    if not image_path.exists():
        raise SystemExit(f"Image not found: {image_path}")

    token = require_token()
    image_key = upload_image(DEFAULT_BASE_URL, token, image_path)
    result = send_image_message(
        DEFAULT_BASE_URL, token, args.target_type, args.target, image_key
    )

    print(json.dumps({
        "status": "ok",
        "image_key": image_key,
        "message_response": result,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
