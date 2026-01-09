import { useState } from 'react';
import { subscribe } from '../utils/api';

export function EmailCapture() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus('loading');
    setMessage('');

    const response = await subscribe(email);

    if (response.error) {
      setStatus('error');
      setMessage(response.error);
    } else {
      setStatus('success');
      setMessage('Thanks for subscribing!');
      setEmail('');
    }
  };

  return (
    <section className="email-capture">
      <div className="email-capture-content">
        <h2>Get rejection insights</h2>
        <p>Weekly tips on turning no's into opportunities.</p>

        {status === 'success' ? (
          <div className="success-message">{message}</div>
        ) : (
          <form className="email-form" onSubmit={handleSubmit}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              required
              disabled={status === 'loading'}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Subscribing...' : 'Subscribe'}
            </button>
          </form>
        )}

        {status === 'error' && (
          <div className="error-message">{message}</div>
        )}
      </div>
    </section>
  );
}
