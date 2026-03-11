// TTS Service - calls our backend which calls ElevenLabs

export interface SpeakResult {
  audio: HTMLAudioElement;
  promise: Promise<void>;
}

export async function speakWithMaya(text: string): Promise<SpeakResult> {
  console.log('[TTS] Calling ElevenLabs via backend...');

  // Call our backend TTS endpoint (uses Vite proxy to reach Express)
  const response = await fetch('/api/tts/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[TTS] Backend error:', response.status, errorText);
    throw new Error(`TTS failed: ${response.status}`);
  }

  console.log('[TTS] Got audio response, playing...');

  // Get audio and play it
  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);

  // Return audio element AND promise so caller can interrupt
  const promise = new Promise<void>((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      console.log('[TTS] Playback complete');
      resolve();
    };
    audio.onerror = (e) => {
      console.error('[TTS] Audio playback error:', e);
      reject(new Error('Audio playback failed'));
    };
    audio.onpause = () => {
      // Resolve on pause too (for interruption)
      URL.revokeObjectURL(audioUrl);
      resolve();
    };
  });

  audio.play().catch(() => {});

  return { audio, promise };
}
