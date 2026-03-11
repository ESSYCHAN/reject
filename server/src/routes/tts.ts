// TTS Route - converts text to Maya's voice
import { Router } from 'express';
import { textToSpeech } from '../services/elevenlabs.js';

const router = Router();

router.post('/speak', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    // Get audio from ElevenLabs
    const audioBuffer = await textToSpeech(text);
    
    // Return as audio file
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(audioBuffer));
  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

export default router;
