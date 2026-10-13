export interface SpeechRecordingHandle {
  stop: () => void
  result: Promise<SpeechToTextResult>
  stream: MediaStream | null
}

export interface SpeechToTextResult {
  text: string
  ok: boolean
  error?: string
  usedCloudApi: boolean
}

export function detectMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const type of [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ]) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return null
}

/**
 * Start mic recording via the browser Web Speech API.
 * (Cloud STT via Supabase was removed from this prototype.)
 */
export async function startSpeechRecording(): Promise<SpeechRecordingHandle | null> {
  const SpeechRecognition =
    (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition })
      .webkitSpeechRecognition

  if (!SpeechRecognition) return null

  const rec = new SpeechRecognition()
  rec.lang = 'en-GB'
  rec.continuous = true
  rec.interimResults = false
  rec.maxAlternatives = 1

  let buffer = ''
  let resolveResult!: (r: SpeechToTextResult) => void
  const result = new Promise<SpeechToTextResult>((res) => {
    resolveResult = res
  })

  rec.onresult = (event: SpeechRecognitionEvent) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i]
      if (r.isFinal) {
        const t = r[0]?.transcript?.trim() ?? ''
        buffer = buffer ? `${buffer}, ${t}` : t
      }
    }
  }

  rec.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === 'aborted') return
    resolveResult({ ok: false, text: '', error: event.error, usedCloudApi: false })
  }

  rec.onend = () => {
    const text = buffer.trim()
    resolveResult({ ok: text.length > 0, text, usedCloudApi: false })
  }

  try {
    rec.start()
  } catch {
    return null
  }

  return {
    stop: () => {
      try {
        rec.stop()
      } catch {
        /* noop */
      }
    },
    result,
    stream: null,
  }
}
