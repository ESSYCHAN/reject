// ElevenLabs Text-to-Speech Service
// This calls the ElevenLabs API to convert text to audio


const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
// Rachel - warm, professional female voice (ElevenLabs default voice, always available)
const MAYA_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';


export async function textToSpeech(text: string): Promise<ArrayBuffer> {
  console.log('ElevenLabs API Key exists:', !!ELEVENLABS_API_KEY);
  console.log('Using voice ID:', MAYA_VOICE_ID);

  // Clean the text for speech 
  const cleanText = text
    .replace(/\*\*/g, '')      // Remove bold markdown
    .replace(/[#*_`]/g, '')    // Remove other markdown
    .replace(/\n+/g, '. ')     // Replace newlines with pauses
    .slice(0, 500);            // Limit length (saves API credits)

     // Call ElevenLabs API
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${MAYA_VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY || '',
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: 'eleven_multilingual_v2',  // More natural and expressive
        voice_settings: {
          stability: 0.75,          // Professional, consistent delivery
          similarity_boost: 0.75,   // Natural but not over-characterized
          style: 0.2,               // Subtle warmth, not dramatic
          use_speaker_boost: true   // Clear articulation
        }
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('ElevenLabs API failed:', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
      keyPresent: !!ELEVENLABS_API_KEY,
      keyPrefix: ELEVENLABS_API_KEY?.substring(0, 8) + '...',
      voiceId: MAYA_VOICE_ID
    });
    throw new Error(`ElevenLabs error: ${response.status} - ${errorText}`);
  }
  // Return the audio as bytes
  return response.arrayBuffer();
}
