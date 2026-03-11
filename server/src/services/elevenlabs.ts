// ElevenLabs Text-to-Speech Service
// This calls the ElevenLabs API to convert text to audio


const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
// Charlotte - warm, friendly, conversational voice
const MAYA_VOICE_ID = 'XB0fDUnXU5powFXDhCwa';


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
          stability: 0.65,          // More consistent delivery
          similarity_boost: 0.8,    // Closer to natural voice
          style: 0.4,               // Add expressiveness/emotion
          use_speaker_boost: true   // Enhance clarity
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
