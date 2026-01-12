import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import App from './App';
import './index.css';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';

// Render app - Clerk will handle missing key gracefully
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {PUBLISHABLE_KEY ? (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <App />
        <Analytics debug={true} />
        <SpeedInsights />
      </ClerkProvider>
    ) : (
      <>
        <App />
        <Analytics debug={true} />
        <SpeedInsights />
      </>
    )}
  </React.StrictMode>
);
