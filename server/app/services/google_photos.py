import logging

import httpx

PICKER_API = "https://photospicker.googleapis.com/v1"

logger = logging.getLogger(__name__)


async def create_picker_session(access_token: str) -> dict:
    """POST /v1/sessions - creates a new picker session.

    Returns dict with keys: id, pickerUri, pollingConfig, mediaItemsSet.
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PICKER_API}/sessions",
            headers={"Authorization": f"Bearer {access_token}"},
            json={},
        )
        response.raise_for_status()
        return response.json()


async def get_picker_session(access_token: str, session_id: str) -> dict:
    """GET /v1/sessions/{id} - returns session status including mediaItemsSet."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{PICKER_API}/sessions/{session_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        response.raise_for_status()
        return response.json()


async def get_session_media_items(access_token: str, session_id: str) -> list[dict]:
    """GET /v1/mediaItems?sessionId={id} - returns media items from a completed session.

    Handles pagination. Constructs display URLs: baseUrl + '=w1920-h1080'.
    """
    items = []
    params: dict = {"sessionId": session_id}
    async with httpx.AsyncClient() as client:
        while True:
            response = await client.get(
                f"{PICKER_API}/mediaItems",
                headers={"Authorization": f"Bearer {access_token}"},
                params=params,
            )
            response.raise_for_status()
            data = response.json()
            for item in data.get("mediaItems", []):
                media_file = item.get("mediaFile", {})
                base_url = media_file.get("baseUrl", "")
                if not base_url:
                    continue
                items.append({
                    "id": item["id"],
                    "baseUrl": base_url,
                    "mimeType": media_file.get("mimeType", ""),
                })
            next_token = data.get("nextPageToken")
            if not next_token:
                break
            params["pageToken"] = next_token
    return items


async def delete_picker_session(access_token: str, session_id: str) -> None:
    """DELETE /v1/sessions/{id} - deletes a picker session."""
    async with httpx.AsyncClient() as client:
        response = await client.delete(
            f"{PICKER_API}/sessions/{session_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        response.raise_for_status()
