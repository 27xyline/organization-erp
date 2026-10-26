export interface DocumentApiErrorBody {
  error?: { message?: string }
}

export function encodeDocumentMetadata(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

export async function responseErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as DocumentApiErrorBody
    return payload.error?.message || fallback
  } catch {
    return fallback
  }
}

