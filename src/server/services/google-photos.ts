const PICKER_API = 'https://photospicker.googleapis.com/v1';

export interface PickerSession {
  id: string;
  pickerUri: string;
  pollingConfig?: { pollInterval: string };
  mediaItemsSet: boolean;
}

export interface MediaItem {
  id: string;
  baseUrl: string;
  mimeType: string;
}

export async function createPickerSession(accessToken: string): Promise<PickerSession> {
  const response = await fetch(`${PICKER_API}/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Google Photos Picker API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function getPickerSession(accessToken: string, sessionId: string): Promise<PickerSession> {
  const response = await fetch(`${PICKER_API}/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Google Photos Picker API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function getSessionMediaItems(accessToken: string, sessionId: string): Promise<MediaItem[]> {
  const items: MediaItem[] = [];
  const params = new URLSearchParams({ sessionId });

  while (true) {
    const response = await fetch(`${PICKER_API}/mediaItems?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Google Photos Picker API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    for (const item of data.mediaItems ?? []) {
      const mediaFile = item.mediaFile ?? {};
      const baseUrl = mediaFile.baseUrl ?? '';
      if (!baseUrl) continue;

      items.push({
        id: item.id,
        baseUrl,
        mimeType: mediaFile.mimeType ?? '',
      });
    }

    const nextToken = data.nextPageToken;
    if (!nextToken) break;
    params.set('pageToken', nextToken);
  }

  return items;
}

export async function deletePickerSession(accessToken: string, sessionId: string): Promise<void> {
  const response = await fetch(`${PICKER_API}/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Google Photos Picker API error: ${response.status} ${response.statusText}`);
  }
}
