// Component to display usage limits and upgrade prompts
import React from 'react';
import { useUserTier } from '@/hooks/useUserTier';
import { COLORS } from '@/utils/styles';

interface UsageLimitsProps {
  feature?: 'pdf' | 'email' | 'project';
  onUpgrade?: () => void;
}

export const UsageLimits: React.FC<UsageLimitsProps> = ({ feature, onUpgrade }) => {
  const { tier, limits, usage, canGenerate, canEmail, canCreateProject } = useUserTier();
  
  // Don't show for unlimited tiers
  if (tier === 'admin' || tier === 'super_admin') {
    return null;
  }
  
  const renderProgressBar = (current: number, limit: number | null, label: string) => {
    if (limit === null) return null;
    
    const percentage = Math.min(100, (current / limit) * 100);
    const isNearLimit = percentage >= 80;
    const isAtLimit = percentage >= 100;
    
    return (
      <div className="mb-3">
        <div className="flex justify-between text-sm mb-1">
          <span className="font-medium">{label}</span>
          <span className={isAtLimit ? 'text-red-500 font-semibold' : ''}>
            {current} / {limit === 0 ? 'Not available' : limit}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isAtLimit ? 'bg-red-500' : isNearLimit ? 'bg-yellow-500' : 'bg-blue-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };
  
  const showPdfLimit = !feature || feature === 'pdf';
  const showEmailLimit = !feature || feature === 'email';
  
  return (
    <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          {tier === 'free' ? 'Free Plan' : 'Plus Plan'} Usage
        </h3>
        {tier === 'free' && (
          <button
            onClick={onUpgrade}
            className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Upgrade
          </button>
        )}
      </div>
      
      {showPdfLimit && renderProgressBar(
        usage.dailyPdfCount,
        limits.dailyPdfLimit,
        'PDF Generation'
      )}
      
      {showEmailLimit && renderProgressBar(
        usage.dailyEmailCount,
        limits.dailyEmailLimit,
        'Email Sending'
      )}
      
      {tier === 'free' && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-600">
            {limits.dailyEmailLimit === 0 ? (
              <>Email sending is not available on the free plan. </>
            ) : null}
            <button
              onClick={onUpgrade}
              className="text-blue-500 hover:underline font-medium"
            >
              Upgrade to Plus
            </button>
            {' for unlimited PDFs and 100 emails/day.'}
          </p>
        </div>
      )}
      
      {!canGenerate && feature === 'pdf' && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-700">
            You've reached your daily PDF generation limit.
            {tier === 'free' && (
              <>
                {' '}
                <button
                  onClick={onUpgrade}
                  className="text-red-800 underline font-medium"
                >
                  Upgrade to Plus
                </button>
                {' for unlimited generation.'}
              </>
            )}
          </p>
        </div>
      )}
      
      {!canEmail && feature === 'email' && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-700">
            {tier === 'free' 
              ? 'Email sending is not available on the free plan.'
              : "You've reached your daily email sending limit."
            }
            {tier === 'free' && (
              <>
                {' '}
                <button
                  onClick={onUpgrade}
                  className="text-red-800 underline font-medium"
                >
                  Upgrade to Plus
                </button>
                {' to send emails.'}
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
};