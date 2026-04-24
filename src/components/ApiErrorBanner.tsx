import React, { useState, useEffect, useRef } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { getApiErrorEventName } from '../services/api.js';

const SUPPRESS_MS = 30000; // Don't show again for 30s after dismiss

export const ApiErrorBanner: React.FC = () => {
  const [message, setMessage] = useState<string | null>(null);
  const suppressUntilRef = useRef(0);

  useEffect(() => {
    const eventName = getApiErrorEventName();
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string }>).detail;
      if (detail?.message && Date.now() >= suppressUntilRef.current) {
        setMessage(detail.message);
      }
    };
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, []);

  const handleDismiss = () => {
    setMessage(null);
    suppressUntilRef.current = Date.now() + SUPPRESS_MS;
  };

  if (!message) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] max-w-md animate-in slide-in-from-bottom-4 fade-in"
      role="alert"
    >
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 shadow-lg">
        <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-800">{message}</p>
          <p className="text-xs text-red-600 mt-1">Set VITE_API_URL and CORS_ORIGIN on your host, then redeploy the frontend.</p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 p-1 rounded-lg text-red-600 hover:bg-red-100 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};
