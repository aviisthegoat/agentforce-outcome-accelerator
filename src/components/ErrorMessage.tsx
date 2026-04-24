import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ErrorMessageProps {
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ 
  message, 
  onDismiss,
  className = '' 
}) => {
  return (
    <div className={`p-3 text-sm text-red-700 bg-red-50 rounded-lg border border-red-100 flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-2 text-red-700 hover:text-red-900"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default ErrorMessage;


