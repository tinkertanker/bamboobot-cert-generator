import { useState } from 'react';
import LoadingMockup1Enhanced from '@/components/LoadingMockup1Enhanced';
import LoadingMockup2 from '@/components/LoadingMockup2';
import LoadingMockup3 from '@/components/LoadingMockup3';

export default function LoadingMockupsPage() {
  const [activeTab, setActiveTab] = useState<1 | 2 | 3>(1);

  return (
    <div style={{ backgroundColor: '#F8FAF5', minHeight: '100vh', padding: '20px' }}>
      {/* Tab Navigation */}
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        marginBottom: '20px',
        justifyContent: 'center'
      }}>
        <button
          onClick={() => setActiveTab(1)}
          style={{
            padding: '10px 20px',
            backgroundColor: activeTab === 1 ? '#1B4332' : '#fff',
            color: activeTab === 1 ? '#fff' : '#1B4332',
            border: '2px solid #1B4332',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: 'all 0.2s'
          }}
        >
          Mockup 1: Minimal Skeleton
        </button>
        <button
          onClick={() => setActiveTab(2)}
          style={{
            padding: '10px 20px',
            backgroundColor: activeTab === 2 ? '#1B4332' : '#fff',
            color: activeTab === 2 ? '#fff' : '#1B4332',
            border: '2px solid #1B4332',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: 'all 0.2s'
          }}
        >
          Mockup 2: Playful Spinners
        </button>
        <button
          onClick={() => setActiveTab(3)}
          style={{
            padding: '10px 20px',
            backgroundColor: activeTab === 3 ? '#1B4332' : '#fff',
            color: activeTab === 3 ? '#fff' : '#1B4332',
            border: '2px solid #1B4332',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: 'all 0.2s'
          }}
        >
          Mockup 3: Premium Shimmer
        </button>
      </div>

      {/* Mockup Display */}
      <div style={{ 
        backgroundColor: '#F8FAF5',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        {activeTab === 1 && <LoadingMockup1Enhanced />}
        {activeTab === 2 && <LoadingMockup2 />}
        {activeTab === 3 && <LoadingMockup3 />}
      </div>

      {/* Description */}
      <div style={{ 
        marginTop: '20px', 
        padding: '20px',
        backgroundColor: '#fff',
        borderRadius: '8px',
        maxWidth: '800px',
        margin: '20px auto'
      }}>
        <h2 style={{ color: '#1B4332', marginBottom: '10px' }}>
          {activeTab === 1 && 'Mockup 1: Minimal Skeleton Loaders'}
          {activeTab === 2 && 'Mockup 2: Playful Animated Spinners'}
          {activeTab === 3 && 'Mockup 3: Premium Shimmer Effects'}
        </h2>
        <p style={{ color: '#6B7280', lineHeight: 1.6 }}>
          {activeTab === 1 && 'Clean and minimal skeleton loaders with subtle pulse animations. Perfect for a professional, understated loading experience.'}
          {activeTab === 2 && 'Dynamic spinners and bouncing dots create a friendly, engaging loading experience. Great for keeping users entertained while waiting.'}
          {activeTab === 3 && 'Sophisticated shimmer waves and gradient effects provide a premium feel. Ideal for creating a high-end user experience.'}
        </p>
      </div>
    </div>
  );
}