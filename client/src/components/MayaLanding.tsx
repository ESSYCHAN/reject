/**
 * MayaLanding - The emotional entry point to REJECT
 *
 * This replaces the traditional dashboard. Maya IS the interface.
 * Non-signed-in users get a teaser intro, then prompted to sign up.
 */

import { useState, useEffect, useRef } from 'react';
import { useUser, useAuth, SignInButton, SignUpButton } from '@clerk/clerk-react';
import { speakWithMaya } from '../services/ttsService';
import './MayaLanding.css';

const AGENTS_API_URL = import.meta.env.VITE_AGENTS_API_URL || '/agents';
const API_URL = import.meta.env.VITE_API_URL || '';

interface Message {
  role: 'maya' | 'user';
  content: string;
  timestamp: Date;
  attachment?: { name: string; type: string };
}

interface UserProfile {
  fullName?: string;
  currentTitle?: string;
  yearsExperience?: number;
  skills?: string[];
  cvText?: string;
  targetRoles?: string[];
}

export default function MayaLanding() {
  const { user, isSignedIn } = useUser();
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [freeMessagesUsed, setFreeMessagesUsed] = useState(0);
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);
  const [hasPlayedIntro, setHasPlayedIntro] = useState(false);
  const [isPlayingIntro, setIsPlayingIntro] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const FREE_MESSAGE_LIMIT = 3; // Let them try 3 messages before prompting signup

  const MAYA_INTRO_TEXT = "Hey. I'm Maya. I'm your AI career coach. I help people navigate the messy, emotional rollercoaster of job searching. Got a rejection? Paste it here. Feeling stuck? Let's talk. Need CV help? I've got you. Try me out... ask me anything.";

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      recognitionRef.current = new SpeechRecognitionAPI();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results as any)
          .map((result: any) => result[0].transcript)
          .join('');
        setInput(transcript);

        // If final result, send automatically
        if (event.results[event.results.length - 1].isFinal) {
          setIsListening(false);
          // Small delay to show the transcribed text before sending
          setTimeout(() => {
            if (transcript.trim()) {
              handleSend(transcript.trim());
            }
          }, 300);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const startListening = () => {
    // Interrupt Maya if she's speaking
    if (isSpeaking) {
      stopSpeaking();
    }

    if (recognitionRef.current && !isListening) {
      setIsListening(true);
      setInput(''); // Clear previous input
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  // Stop Maya from speaking (interrupt her)
  const stopSpeaking = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      setIsSpeaking(false);
    }
  };

  const firstName = user?.firstName || '';

  // Fetch user profile when signed in
  useEffect(() => {
    async function loadProfile() {
      if (!isSignedIn) return;
      try {
        const token = await getToken();
        const response = await fetch('/api/user/profile', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setUserProfile(data.profile || null);
        }
      } catch (err) {
        console.log('[Maya] Could not load profile:', err);
      }
    }
    loadProfile();
  }, [isSignedIn, getToken]);

  // Use localStorage for persistent conversation ID (survives refresh)
  useEffect(() => {
    // Migrate from sessionStorage if exists
    const sessionConvId = sessionStorage.getItem('maya_conversation_id');
    if (sessionConvId && !localStorage.getItem('maya_conversation_id')) {
      localStorage.setItem('maya_conversation_id', sessionConvId);
      sessionStorage.removeItem('maya_conversation_id');
    }
  }, []);

  // Load conversation history on mount (for signed-in users)
  useEffect(() => {
    async function loadConversationHistory() {
      if (!isSignedIn || !user?.id) return;

      try {
        const token = await getToken();
        const response = await fetch(`${API_URL}/api/conversations/${user.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          const history = data.data || [];

          if (history.length > 0) {
            // Convert backend messages to our format
            const loadedMessages: Message[] = history.map((msg: { role: string; content: string; createdAt: string }) => ({
              role: msg.role === 'user' ? 'user' : 'maya',
              content: msg.content,
              timestamp: new Date(msg.createdAt)
            }));

            setMessages(loadedMessages);
            setShowQuickActions(false); // Hide quick actions since we have history
            console.log(`[Maya] Loaded ${loadedMessages.length} messages from history`);
            return;
          }
        }
      } catch (err) {
        console.log('[Maya] Could not load conversation history:', err);
      }

      // No history found - show greeting
      const greeting = getGreeting(firstName, isSignedIn, userProfile);
      setMessages([{ role: 'maya', content: greeting, timestamp: new Date() }]);
    }

    loadConversationHistory();
  }, [isSignedIn, user?.id, getToken, firstName, userProfile]);

  // Maya's opening for non-signed-in users
  useEffect(() => {
    if (!isSignedIn) {
      const greeting = getGreeting(firstName, isSignedIn, userProfile);
      setTimeout(() => {
        setMessages([{ role: 'maya', content: greeting, timestamp: new Date() }]);
      }, 500);
    }
  }, [firstName, isSignedIn, userProfile]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function getGreeting(name: string, signedIn: boolean | undefined, profile: UserProfile | null): string {
    if (signedIn && name) {
      // Personalized greeting based on profile
      if (profile?.currentTitle) {
        return `Hey ${name}! Good to see you 💙\n\nI see you're a ${profile.currentTitle}. What's going on with the job search?`;
      }
      return `Hey ${name}! What's going on?`;
    }
    return `Hey. I'm Maya 💙\n\nI'm your AI career coach. I help people navigate the messy, emotional rollercoaster of job searching.\n\nGot a rejection? Paste it here. Feeling stuck? Let's talk. Need CV help? I've got you.\n\nTry me out - ask me anything.`;
  }

  // Quick action buttons for common entry points
  const quickActions = [
    { label: "Just got rejected", emoji: "💔", prompt: "I just got a rejection email" },
    { label: "Help with my CV", emoji: "📄", prompt: "Can you help me with my resume?" },
    { label: "Interview prep", emoji: "🎯", prompt: "I have an interview coming up" },
  ];

  async function handleSend(text?: string) {
    const messageText = text || input.trim();
    if (!messageText) return;

    // Check if non-signed-in user has hit limit
    if (!isSignedIn && freeMessagesUsed >= FREE_MESSAGE_LIMIT) {
      setShowSignupPrompt(true);
      return;
    }

    // Hide quick actions once conversation starts
    setShowQuickActions(false);

    // Add user message
    const userMessage: Message = { role: 'user', content: messageText, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Track free messages for non-signed-in users
    if (!isSignedIn) {
      setFreeMessagesUsed(prev => prev + 1);
    }

    try {
      // Call Maya's backend (FastAPI agents server)
      // Use localStorage for persistence across refreshes
      const existingConvId = localStorage.getItem('maya_conversation_id');
      console.log('[Maya] Sending message with conversation_id:', existingConvId || 'new');

      // Build user context to send to Maya
      const userContext: Record<string, unknown> = {};
      if (isSignedIn) {
        if (firstName) userContext.userName = firstName;
        if (userProfile) {
          if (userProfile.fullName) userContext.fullName = userProfile.fullName;
          if (userProfile.currentTitle) userContext.currentTitle = userProfile.currentTitle;
          if (userProfile.yearsExperience) userContext.yearsExperience = userProfile.yearsExperience;
          if (userProfile.skills?.length) userContext.skills = userProfile.skills;
          if (userProfile.targetRoles?.length) userContext.targetRoles = userProfile.targetRoles;
          if (userProfile.cvText) userContext.hasCv = true; // Flag that CV exists, don't send full text each time
        }
      }

      const response = await fetch(`${AGENTS_API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          agent: 'maya',
          conversation_id: existingConvId || undefined,
          user_id: user?.id || undefined,  // Pass Clerk user ID for tracker access
          context: Object.keys(userContext).length > 0 ? { userContext } : undefined
        })
      });

      const data = await response.json();

      // Store conversation ID for persistence (localStorage survives refresh)
      if (data.conversation_id) {
        console.log('[Maya] Got conversation_id:', data.conversation_id);
        localStorage.setItem('maya_conversation_id', data.conversation_id);
      }

      const responseText = data.response || "I'm here. Tell me more.";

      // Add Maya's response
      const mayaMessage: Message = {
        role: 'maya',
        content: responseText,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, mayaMessage]);

      // Check if this was their last free message
      if (!isSignedIn && freeMessagesUsed + 1 >= FREE_MESSAGE_LIMIT) {
        // Add a gentle nudge after Maya's response
        setTimeout(() => {
          setMessages(prev => [...prev, {
            role: 'maya',
            content: "I'm really enjoying our chat! 💙\n\nSign up to keep talking - I can help you decode rejections, prep for interviews, review your CV, and so much more. It's free to get started.",
            timestamp: new Date()
          }]);
          setShowSignupPrompt(true);
        }, 2000);
      }

      // Speak the response if voice is enabled
      if (voiceEnabled && responseText) {
        setIsSpeaking(true);
        try {
          const { audio, promise } = await speakWithMaya(responseText);
          currentAudioRef.current = audio;
          await promise;
        } catch (err) {
          console.error('Voice failed, showing text only:', err);
        } finally {
          setIsSpeaking(false);
          currentAudioRef.current = null;
        }
      }
    } catch (error) {
      console.error('Error talking to Maya:', error);
      setMessages(prev => [...prev, {
        role: 'maya',
        content: "Sorry, I had a moment there. What were you saying?",
        timestamp: new Date()
      }]);
    } finally {
      setIsTyping(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Handle file upload (CV/resume)
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];

    if (!allowedTypes.includes(file.type)) {
      setUploadError('Please upload a PDF, DOC, DOCX, or TXT file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File too large. Maximum size is 5MB');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setShowQuickActions(false);

    // Add user message showing the upload
    const fileType = file.name.split('.').pop()?.toUpperCase() || 'FILE';
    const userMessage: Message = {
      role: 'user',
      content: `[Uploaded CV: ${file.name}]`,
      timestamp: new Date(),
      attachment: { name: file.name, type: fileType }
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      // Upload file to server for text extraction
      const formData = new FormData();
      formData.append('file', file);

      const token = isSignedIn ? await getToken() : null;
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const uploadResponse = await fetch(`${API_URL}/api/user/upload-cv`, {
        method: 'POST',
        headers,
        body: formData
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to process file');
      }

      const { text: extractedText } = await uploadResponse.json();

      if (!extractedText || extractedText.trim().length < 50) {
        throw new Error('Could not extract text from file. Try copying and pasting instead.');
      }

      // Track free messages for non-signed-in users
      if (!isSignedIn) {
        setFreeMessagesUsed(prev => prev + 1);
      }

      // Now send to Maya with the extracted CV text
      setIsTyping(true);
      const existingConvId = localStorage.getItem('maya_conversation_id');

      const response = await fetch(`${AGENTS_API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Here's my CV/resume. Please review it and give me feedback:\n\n${extractedText}`,
          agent: 'maya',
          conversation_id: existingConvId || undefined,
          context: {
            userContext: {
              userName: firstName || undefined,
              uploadedCV: true,
              cvFileName: file.name
            }
          }
        })
      });

      const data = await response.json();

      if (data.conversation_id) {
        localStorage.setItem('maya_conversation_id', data.conversation_id);
      }

      const responseText = data.response || "I've received your CV. Let me take a look...";

      const mayaMessage: Message = {
        role: 'maya',
        content: responseText,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, mayaMessage]);

      // Speak response if voice enabled
      if (voiceEnabled && responseText) {
        setIsSpeaking(true);
        try {
          const { audio, promise } = await speakWithMaya(responseText);
          currentAudioRef.current = audio;
          await promise;
        } catch (err) {
          console.error('Voice failed:', err);
        } finally {
          setIsSpeaking(false);
          currentAudioRef.current = null;
        }
      }

    } catch (error) {
      console.error('File upload error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to process file';
      setUploadError(errorMsg);

      // Add Maya's error response
      setMessages(prev => [...prev, {
        role: 'maya',
        content: `Hmm, I had trouble reading that file. ${errorMsg}\n\nYou can also just paste your CV text directly in the chat if that's easier!`,
        timestamp: new Date()
      }]);
    } finally {
      setIsUploading(false);
      setIsTyping(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  // Play Maya's intro speech
  async function playIntro() {
    if (hasPlayedIntro || isPlayingIntro) return;

    setIsPlayingIntro(true);
    setHasPlayedIntro(true);

    try {
      const { audio, promise } = await speakWithMaya(MAYA_INTRO_TEXT);
      currentAudioRef.current = audio;
      await promise;
    } catch (err) {
      console.error('Intro voice failed:', err);
    } finally {
      setIsPlayingIntro(false);
      currentAudioRef.current = null;
    }
  }

  // Signed-in user landing - clean, focused on Maya
  if (isSignedIn && messages.length <= 1 && showQuickActions) {
    return (
      <div className="maya-landing maya-landing-signed-in">
        <div className="maya-welcome">
          <div className="maya-welcome-avatar">M</div>
          <h1 className="maya-welcome-greeting">
            {firstName ? `Hey ${firstName}!` : 'Hey!'}
          </h1>
          <p className="maya-welcome-subtitle">
            {userProfile?.currentTitle
              ? `Ready to help with your ${userProfile.currentTitle} job search.`
              : "What can I help you with today?"}
          </p>

          {/* Voice toggle */}
          <button
            className={`voice-toggle-inline ${voiceEnabled ? 'active' : ''}`}
            onClick={() => setVoiceEnabled(!voiceEnabled)}
          >
            {voiceEnabled ? '🔊 Voice on' : '🔇 Voice off'}
          </button>

          {/* Quick actions for signed-in users */}
          <div className="maya-quick-grid">
            {quickActions.map((action, i) => (
              <button
                key={i}
                className="maya-quick-card"
                onClick={() => { setShowQuickActions(false); setTimeout(() => handleSend(action.prompt), 100); }}
              >
                <span className="quick-card-emoji">{action.emoji}</span>
                <span className="quick-card-label">{action.label}</span>
              </button>
            ))}
            <button
              className="maya-quick-card"
              onClick={() => { setShowQuickActions(false); setTimeout(() => handleSend("Can you check on my applications?"), 100); }}
            >
              <span className="quick-card-emoji">📊</span>
              <span className="quick-card-label">Check my progress</span>
            </button>
          </div>

          {/* Or just chat */}
          <div className="maya-chat-start">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Or tell me what's on your mind..."
              rows={2}
            />
            <button
              className="send-button"
              onClick={() => { setShowQuickActions(false); handleSend(); }}
              disabled={!input.trim()}
            >
              →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show intro/teaser for non-signed-in users who haven't started chatting
  if (!isSignedIn && messages.length <= 1 && showQuickActions) {
    return (
      <div className="maya-landing">
        <div className="maya-intro">
          <div className={`maya-intro-avatar ${isPlayingIntro ? 'speaking' : ''}`}>M</div>
          <h2 className="maya-intro-title">Meet Maya</h2>
          <p className="maya-intro-subtitle">Your AI career coach</p>

          {/* Play intro button or speaking indicator */}
          {!hasPlayedIntro ? (
            <button className="play-intro-btn" onClick={playIntro}>
              🔊 Hear Maya introduce herself
            </button>
          ) : isPlayingIntro ? (
            <button className="playing-intro-btn" onClick={stopSpeaking}>
              🎙️ Maya is speaking... (click to stop)
            </button>
          ) : null}

          {/* Quick action shortcuts - click to start chatting */}
          <div className="maya-intro-shortcuts">
            <p className="shortcuts-label">Try asking Maya:</p>
            {quickActions.map((action, i) => (
              <button
                key={i}
                className="intro-shortcut"
                onClick={() => { stopSpeaking(); setShowQuickActions(false); setTimeout(() => handleSend(action.prompt), 100); }}
              >
                <span className="shortcut-emoji">{action.emoji}</span>
                <span className="shortcut-text">{action.label}</span>
              </button>
            ))}
          </div>

          <div className="maya-intro-cta">
            <button
              className="try-maya-btn"
              onClick={() => { stopSpeaking(); setShowQuickActions(false); }}
            >
              Or start fresh →
            </button>
            <p className="maya-intro-hint">3 free messages, then sign up to continue</p>
          </div>

          <div className="maya-intro-auth">
            <span>Already have an account?</span>
            <SignInButton mode="modal">
              <button className="sign-in-link">Sign in</button>
            </SignInButton>
          </div>
        </div>
      </div>
    );
  }

  // Clear conversation history
  async function handleClearConversation() {
    if (!isSignedIn || !user?.id) return;

    const confirmed = window.confirm('Start fresh? This will clear your conversation history with Maya.');
    if (!confirmed) return;

    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/conversations/${user.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        // Clear local state
        localStorage.removeItem('maya_conversation_id');
        const greeting = getGreeting(firstName, isSignedIn, userProfile);
        setMessages([{ role: 'maya', content: greeting, timestamp: new Date() }]);
        setShowQuickActions(true);
        console.log('[Maya] Conversation cleared');
      }
    } catch (err) {
      console.error('[Maya] Failed to clear conversation:', err);
    }
  }

  return (
    <div className="maya-landing">
      {/* Minimal controls - no duplicate nav */}
      <div className="maya-controls">
        <button
          className={`voice-toggle ${voiceEnabled ? 'active' : ''}`}
          onClick={() => setVoiceEnabled(!voiceEnabled)}
          title={voiceEnabled ? 'Voice on' : 'Voice off'}
        >
          {voiceEnabled ? '🔊' : '🔇'}
        </button>
        {isSignedIn && messages.length > 2 && (
          <button
            className="clear-chat-btn"
            onClick={handleClearConversation}
            title="Start fresh"
          >
            🗑️
          </button>
        )}
        {!isSignedIn && (
          <SignInButton mode="modal">
            <button className="sign-in-subtle">Sign in</button>
          </SignInButton>
        )}
      </div>

      {/* The conversation - this IS the app */}
      <main className="maya-conversation">
        <div className="messages-container">
          {messages.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              {msg.role === 'maya' && (
                <div className="maya-avatar">M</div>
              )}
              <div className="message-content">
                {msg.content.split('\n').map((line, j) => (
                  <p key={j}>{line}</p>
                ))}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="message maya">
              <div className="maya-avatar">M</div>
              <div className="typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}

          {isSpeaking && (
            <button
              className="speaking-indicator"
              onClick={stopSpeaking}
              title="Click to interrupt"
            >
              <span className="speaking-icon">🎙️</span> Maya is speaking... (click to interrupt)
            </button>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick actions - shown only at start */}
        {showQuickActions && messages.length === 1 && (
          <div className="quick-actions">
            {quickActions.map((action, i) => (
              <button
                key={i}
                className="quick-action"
                onClick={() => handleSend(action.prompt)}
              >
                <span className="quick-emoji">{action.emoji}</span>
                <span className="quick-label">{action.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Signup prompt after free messages */}
        {showSignupPrompt && !isSignedIn && (
          <div className="signup-prompt">
            <div className="signup-prompt-content">
              <h3>Keep the conversation going 💙</h3>
              <p>Sign up free to unlock unlimited chats with Maya</p>
              <div className="signup-prompt-buttons">
                <SignUpButton mode="modal">
                  <button className="signup-btn-primary">Sign up free</button>
                </SignUpButton>
                <SignInButton mode="modal">
                  <button className="signup-btn-secondary">Sign in</button>
                </SignInButton>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Input - always visible, always inviting */}
      <footer className="maya-input-area">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />

        {uploadError && (
          <div className="upload-error">
            {uploadError}
            <button onClick={() => setUploadError(null)}>×</button>
          </div>
        )}

        <div className="input-container">
          {/* File upload button */}
          <button
            className={`attach-button ${isUploading ? 'uploading' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            disabled={isTyping || isUploading || showSignupPrompt}
            title="Upload CV (PDF, DOC, DOCX)"
          >
            {isUploading ? '⏳' : '📎'}
          </button>

          {/* Microphone button */}
          <button
            className={`mic-button ${isListening ? 'listening' : ''}`}
            onClick={isListening ? stopListening : startListening}
            disabled={isTyping || showSignupPrompt || isUploading}
            title={isListening ? 'Stop listening' : (isSpeaking ? 'Interrupt Maya' : 'Speak to Maya')}
          >
            {isListening ? '⏹️' : '🎤'}
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              showSignupPrompt
                ? "Sign up to continue chatting..."
                : isUploading
                  ? "Processing your CV..."
                  : isListening
                    ? "Listening..."
                    : "Tell Maya what's going on..."
            }
            rows={1}
            disabled={isTyping || isListening || showSignupPrompt || isUploading}
          />
          <button
            className="send-button"
            onClick={() => handleSend()}
            disabled={!input.trim() || isTyping || isListening || showSignupPrompt || isUploading}
          >
            →
          </button>
        </div>
        {!showSignupPrompt && (
          <p className="input-hint">
            {isListening
              ? "🎙️ Speak now... Maya is listening"
              : !isSignedIn
                ? `${FREE_MESSAGE_LIMIT - freeMessagesUsed} free messages left`
                : "Type, speak, or paste a rejection email. Maya's here."
            }
          </p>
        )}
      </footer>

    </div>
  );
}
