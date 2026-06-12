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

    const response = await subscribe(email, 'founding_user');

    if (response.error) {
      setStatus('error');
      setMessage(response.error);
    } else {
      setStatus('success');
      setMessage("You're in. We'll be in touch with early access and updates.");
      setEmail('');
    }
  };

  return (
    <section className="email-capture">
      <div className="email-capture-content">
        <h2>Join Founding Users</h2>
        <ul className="email-capture-benefits">
          <li>Free Diagnosis Reports during beta</li>
          <li>Early access to new features</li>
          <li>Company intelligence launch access</li>
          <li>Founding-user pricing</li>
        </ul>

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
              {status === 'loading' ? 'Joining...' : 'Join'}
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
