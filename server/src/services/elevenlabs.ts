// ElevenLabs Text-to-Speech Service
// This calls the ElevenLabs API to convert text to audio


const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
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
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.5,        // How consistent the voice is
          similarity_boost: 0.75 // How close to original voice
        }
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('ElevenLabs error:', response.status, errorText);
    throw new Error(`ElevenLabs error: ${response.status} - ${errorText}`);
  }
  // Return the audio as bytes
  return response.arrayBuffer();
}
