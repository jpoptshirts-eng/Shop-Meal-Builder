export interface VisionOcrResult {
  text: string
  /** true when the call succeeded and returned non-empty text */
  ok: boolean
  /** populated when the call failed or returned no text */
  error?: string
}

/**
 * Cloud Vision OCR is no longer available in this prototype (no Supabase).
 * Always returns ok:false so callers fall back to Tesseract transparently.
 */
export async function runVisionOcr(_file: File | Blob): Promise<VisionOcrResult> {
  return {
    ok: false,
    text: '',
    error: 'Cloud Vision OCR unavailable — using on-device OCR',
  }
}
