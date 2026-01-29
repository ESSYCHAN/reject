import { useState, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { agentService, AGENTS, ChatMessage, UserAgentContext, computeUserAgentContext } from '../services/agentService';
import { ApplicationRecord } from '../types/pro';
import './AgentChat.css';

interface AgentChatProps {
  initialAgent?: string;
  initialContext?: {
    cvText?: string;
    jobDescription?: string;
    targetRole?: string;
  };
  /** Applications from the synced tracker - ensures consistency with tracker display */
  applications?: ApplicationRecord[];
}

export function AgentChat({ initialAgent = 'career_coach', initialContext, applications }: AgentChatProps) {
  useAuth(); // Hook required for Clerk context
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(initialAgent);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [uploadedCV, setUploadedCV] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute user context from applications prop (ensures sync with tracker)
  const userContext = useMemo<UserAgentContext | null>(() => {
    if (!applications || applications.length === 0) {
      console.log('[AgentChat] No applications provided, context will be null');
      return null;
    }
    const context = computeUserAgentContext(applications);
    if (context) {
      console.log('[AgentChat] Computed context from', applications.length, 'applications:', context.successMetrics.totalApplications, 'tracked');
    }
    return context;
  }, [applications]);

  useEffect(() => {
    agentService.healthCheck().then(setIsConnected);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const agent = AGENTS.find(a => a.id === selectedAgent);
    if (agent && messages.length === 0) {
      const welcomeMessages: Record<string, string> = {
        career_coach: "Hi! I'm your AI career coach. I can help you with building CVs, finding jobs, analyzing job descriptions, preparing for interviews, and understanding rejection emails.\n\nWhat would you like help with today?",
        cv_builder: "I'll help you tailor your CV for a specific job application.\n\nFirst, upload your current CV (use the 📎 button) or paste it here. Then share the job description you're applying to, and I'll tell you exactly what to change.",
        resume_coach: "I'll analyze your CV and give you specific feedback to improve it.\n\nPaste your CV text below, and let me know if you're targeting a specific role.",
        career_agent: "I can help you find jobs that match your profile.\n\nWhat role are you looking for, and where?",
        job_advisor: "I'll analyze any job description and tell you if it's worth applying.\n\nPaste a job description and I'll break down the red flags, requirements, and fit.",
        interview_coach: "Let's prepare for your interview! I can run mock interviews, practice specific questions, and give feedback.\n\nWhat role and company are you interviewing for?",
        rejection_decoder: "I'll help you understand what that rejection really means and what to do next.\n\nPaste your rejection email and I'll decode it for you."
      };

      setMessages([{
        id: crypto.randomUUID(),
        role: 'assistant',
        content: welcomeMessages[selectedAgent] || `I'm the ${agent.name}. How can I help you?`,
        agent: selectedAgent,
        timestamp: new Date()
      }]);
    }
  }, [selectedAgent, messages.length]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      console.log('[AgentChat] Sending message to agent:', selectedAgent);
      // Build context with user data for personalized responses
      const enrichedContext = {
        ...initialContext,
        cvText: uploadedCV || initialContext?.cvText,
        userContext: userContext || undefined
      };
      console.log('[AgentChat] Context being sent:', userContext ? `${userContext.successMetrics.totalApplications} apps tracked` : 'NO CONTEXT (user has no tracked applications)');

      const response = await agentService.chat({
        message: userMessage.content,
        agent: selectedAgent,
        context: enrichedContext
      });
      console.log('[AgentChat] Response received:', response);

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.response,
        agent: response.agent_used,
        timestamp: new Date()
      }]);

      // Auto-detect agent routing from response and switch agents
      const responseText = response.response.toLowerCase();
      const routingPatterns: Record<string, string> = {
        'resume coach': 'resume_coach',
        'cv builder': 'cv_builder',
        'interview coach': 'interview_coach',
        'career agent': 'career_agent',
        'job advisor': 'job_advisor',
        'rejection decoder': 'rejection_decoder',
      };

      for (const [pattern, agentId] of Object.entries(routingPatterns)) {
        if ((responseText.includes('route') || responseText.includes('pass') || responseText.includes('hand'))
            && responseText.includes(pattern) && selectedAgent !== agentId) {
          console.log('[AgentChat] Auto-routing to:', agentId);
          // Delay the switch slightly so user sees the routing message
          setTimeout(() => {
            setSelectedAgent(agentId);
            agentService.resetConversation();
          }, 1500);
          break;
        }
      }
    } catch (error) {
      console.error('[AgentChat] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Agent error: ${errorMessage}\n\nIf this looks like a connection issue, make sure the agents server is running.\n\nRun: cd agents && source venv/bin/activate && python server.py`,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAgentChange = (agentId: string) => {
    setSelectedAgent(agentId);
    setMessages([]);
    agentService.resetConversation();
    setShowAgentPicker(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await agentService.uploadCV(file);
      setUploadedCV(result.text);

      // Add a message showing the CV was uploaded
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'user',
        content: `[Uploaded CV: ${result.filename}]`,
        timestamp: new Date()
      }]);

      // Auto-send to the agent for analysis
      const response = await agentService.chat({
        message: `Here's my CV to review:\n\n${result.text}`,
        agent: selectedAgent,
        context: { cvText: result.text }
      });

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.response,
        agent: response.agent_used,
        timestamp: new Date()
      }]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('CV upload error:', error);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Failed to upload file: ${errorMessage}\n\nMake sure:\n• The file is a PDF or DOCX\n• The agents server is running (port 8080)\n• The file isn't too large`,
        timestamp: new Date()
      }]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const currentAgent = AGENTS.find(a => a.id === selectedAgent);

  const formatContent = (content: string) => {
    // Simple formatting - just render text cleanly
    return content.split('\n').map((line, i) => {
      // Remove markdown bold markers entirely for cleaner display
      const cleanLine = line.replace(/\*\*/g, '');

      if (!cleanLine.trim()) {
        return <p key={i}>&nbsp;</p>;
      }
      return <p key={i}>{cleanLine}</p>;
    });
  };

  const quickActions: Record<string, Array<{label: string; prompt: string}>> = {
    career_coach: [
      { label: 'Build my CV', prompt: 'Help me build a CV from scratch' },
      { label: 'Review my CV', prompt: 'I want you to review my CV' },
      { label: 'Find jobs', prompt: 'Help me find jobs that match my skills' },
      { label: 'Interview prep', prompt: 'I have an interview coming up' },
    ],
    cv_builder: [
      { label: 'Tailor for job', prompt: 'I have my CV and a job description - help me tailor it' },
      { label: 'ATS optimize', prompt: 'Help me optimize my CV for ATS systems' },
      { label: 'Career change', prompt: 'I\'m changing careers - help me reframe my experience' },
    ],
    resume_coach: [
      { label: 'General review', prompt: 'Please review my CV for any role' },
      { label: 'ATS check', prompt: 'Check if my CV is ATS-friendly' },
    ],
    career_agent: [
      { label: 'Remote jobs', prompt: 'Find me remote software engineering jobs' },
      { label: 'London jobs', prompt: 'Find me product manager jobs in London' },
      { label: 'Entry level', prompt: 'Find me entry level marketing jobs' },
    ],
    job_advisor: [
      { label: 'Analyze JD', prompt: 'I have a job description to analyze' },
      { label: 'Red flags', prompt: 'What red flags should I look for in job descriptions?' },
    ],
    interview_coach: [
      { label: 'Mock interview', prompt: 'Start a mock interview for a product manager role' },
      { label: 'Behavioral Qs', prompt: 'Practice behavioral interview questions with me' },
      { label: 'STAR method', prompt: 'Teach me the STAR method for answering questions' },
    ],
    rejection_decoder: [
      { label: 'Decode email', prompt: 'I have a rejection email to decode' },
      { label: 'Pattern analysis', prompt: 'Help me understand patterns in my rejections' },
    ],
  };

  return (
    <div className="agent-chat">
      <div className="beta-notice">
        <span className="beta-badge">BETA</span>
        <span>AI Coach is in testing. We're actively improving it based on your feedback.</span>
      </div>
      {isConnected === false && (
        <div className="offline-banner">
          <strong>AI Coach is temporarily unavailable.</strong> We're working on it! Your other features still work normally.
        </div>
      )}
      <div className="chat-header">
        <div className="header-left">
          <button className="agent-selector-btn" onClick={() => setShowAgentPicker(!showAgentPicker)}>
            <span className="agent-avatar">{currentAgent?.icon}</span>
            <div className="agent-info">
              <span className="agent-name">{currentAgent?.name}</span>
              <span className="agent-desc">{currentAgent?.description}</span>
            </div>
            <span className="dropdown-icon">{showAgentPicker ? '▲' : '▼'}</span>
          </button>
        </div>
        <div className="header-right">
          {isConnected === false && <span className="status-badge status-offline">Offline</span>}
          {isConnected === true && <span className="status-badge status-online">Online</span>}
          <button className="new-chat-btn" onClick={() => { setMessages([]); agentService.resetConversation(); }} title="New conversation">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      </div>

      {showAgentPicker && (
        <>
          <div className="agent-picker-overlay" onClick={() => setShowAgentPicker(false)} />
          <div className="agent-picker">
            <div className="agent-picker-header">Choose an AI Agent</div>
            <div className="agent-picker-list">
              {AGENTS.map(agent => (
                <button key={agent.id} className={`agent-option ${agent.id === selectedAgent ? 'active' : ''}`} onClick={() => handleAgentChange(agent.id)}>
                  <span className="agent-avatar">{agent.icon}</span>
                  <div className="agent-details">
                    <span className="agent-name">{agent.name}</span>
                    <span className="agent-desc">{agent.description}</span>
                  </div>
                  {agent.id === selectedAgent && <span className="check-icon">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="chat-messages">
        {messages.map(message => (
          <div key={message.id} className={`message-wrapper ${message.role}`}>
            {message.role === 'assistant' && (
              <div className="avatar">{AGENTS.find(a => a.id === message.agent)?.icon || '🤖'}</div>
            )}
            <div className={`message ${message.role}`}>
              <div className="message-content">{formatContent(message.content)}</div>
              <div className="message-time">{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message-wrapper assistant">
            <div className="avatar">{currentAgent?.icon}</div>
            <div className="message assistant">
              <div className="typing-indicator"><span></span><span></span><span></span></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {messages.length <= 1 && quickActions[selectedAgent] && (
        <div className="quick-actions">
          <span className="quick-label">Quick actions</span>
          <div className="quick-buttons">
            {quickActions[selectedAgent]?.map((action, i) => (
              <button key={i} onClick={() => { setInput(action.prompt); inputRef.current?.focus(); }}>{action.label}</button>
            ))}
          </div>
        </div>
      )}

      <div className="chat-input-container">
        {uploadedCV && (
          <div className="uploaded-cv-badge">
            <span>CV loaded</span>
            <button onClick={() => setUploadedCV(null)} title="Remove CV">×</button>
          </div>
        )}
        <div className="chat-input-wrapper">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf,.docx"
            style={{ display: 'none' }}
          />
          <button
            className="attach-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading}
            title="Upload CV (PDF/DOCX)"
          >
            {isUploading ? (
              <span className="upload-spinner"></span>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            )}
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px'; }}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${currentAgent?.name}...`}
            rows={1}
            disabled={isLoading}
          />
          <button className="send-button" onClick={handleSend} disabled={!input.trim() || isLoading} aria-label="Send message">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </button>
        </div>
        <p className="input-hint">Press Enter to send, Shift+Enter for new line • Attach CV with 📎</p>
      </div>
    </div>
  );
}
