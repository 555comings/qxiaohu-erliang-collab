# Feishu Python Image Delivery Reusable Plan v1

## Goal

Turn the verified Feishu image workaround into a reusable repo artifact so Q小虎 or 二两 can send an image to Feishu without depending on the broken OpenClaw CLI image pipeline.

## What This Solves

- OpenClaw can read a local image file but may lose the media path in the final payload.
- Direct Feishu API delivery via Python has been verified as a working workaround.
- This plan turns that workaround into an explicit, repeatable path.

## Scope

This plan covers:

- uploading a local image to Feishu
- obtaining an `image_key`
- sending an image message to a target Feishu user or chat
- documenting the required inputs and verification steps

This plan does not fix the OpenClaw internal bug. It provides a stable workaround until that bug is fixed upstream.

## Required Inputs

You need four things:

1. a Feishu app with image upload and message send permission
2. a valid tenant access token
3. a target identifier
4. a local image file path

### Supported target formats

Use one of the following:

- `user:<open_id>`
- `chat:<chat_id>`

Examples:

- `user:ou_xxxxxxxxxxxxx`
- `chat:oc_xxxxxxxxxxxxx`

## API Flow

### Step 1: Upload image

Endpoint:

```text
POST /open-apis/im/v1/images
```

Multipart fields:

- `image_type=message`
- `image=<local file>`

Expected result:

- response contains `data.image_key`

### Step 2: Send image message

Endpoint:

```text
POST /open-apis/im/v1/messages?receive_id_type=<open_id|chat_id>
```

JSON body:

```json
{
  "receive_id": "<target id>",
  "msg_type": "image",
  "content": "{\"image_key\":\"<image_key>\"}"
}
```

Expected result:

- Feishu receives an image message

## Reference Script

Repo script:

- `qxiaohu-erliang-collab/scripts/feishu_send_image.py`

The script performs both steps in one run:

1. upload local image
2. extract `image_key`
3. send image message to Feishu

## Environment Variables

The reference script uses environment variables to avoid hardcoding secrets.

Required:

- `FEISHU_TENANT_ACCESS_TOKEN`

Optional:

- `FEISHU_BASE_URL` default: `https://open.feishu.cn`

## Example Usage

Send to a user:

```powershell
$env:FEISHU_TENANT_ACCESS_TOKEN = "<token>"
python qxiaohu-erliang-collab/scripts/feishu_send_image.py --target-type open_id --target ou_xxxxxxxxxxxxx --image C:\path\to\image.png
```

Send to a chat:

```powershell
$env:FEISHU_TENANT_ACCESS_TOKEN = "<token>"
python qxiaohu-erliang-collab/scripts/feishu_send_image.py --target-type chat_id --target oc_xxxxxxxxxxxxx --image C:\path\to\image.png
```

## Verification Checklist

A run counts as successful only if all items pass:

- the upload request returns HTTP 200
- the upload response contains `image_key`
- the send request returns HTTP 200
- the target Feishu conversation visibly shows the image

## Failure Modes

### Upload fails

Possible causes:

- invalid or expired token
- image file missing
- unsupported file format
- app missing image upload permission

### Send fails

Possible causes:

- wrong `receive_id_type`
- wrong target id
- app missing message send permission
- image uploaded with wrong app/token scope

### Image not visible in Feishu

Possible causes:

- sent to the wrong target
- image message accepted but not sent to the intended chat
- operator verified only API response but not actual client display

## Recommended Repo Follow-up

To make this fully operational for future use, keep these artifacts together:

- this plan document
- the Python script
- a short operator note describing how to acquire `FEISHU_TENANT_ACCESS_TOKEN`
- a future issue note linking this workaround to the upstream OpenClaw image-pipeline bug

## Status Language

Use this wording going forward:

- `OpenClaw CLI image send remains broken for Feishu in the current path.`
- `Python direct Feishu API delivery is a verified workaround.`
- `Image delivery capability exists, but the stable path is currently the Python workaround rather than the OpenClaw CLI image path.`
