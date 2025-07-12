import LoadingMockup1Enhanced from '@/components/LoadingMockup1Enhanced';
import LoadingMockup2 from '@/components/LoadingMockup2';
import LoadingMockup3 from '@/components/LoadingMockup3';

export default function LoadingMockupsAllPage() {
  return (
    <div style={{ backgroundColor: '#F8FAF5', minHeight: '100vh', padding: '40px 20px' }}>
      <h1 style={{ 
        textAlign: 'center', 
        fontSize: '32px', 
        fontWeight: 'bold', 
        color: '#1B4332',
        marginBottom: '40px'
      }}>
        Loading State Mockups
      </h1>

      {/* Mockup 1 */}
      <div style={{ marginBottom: '60px' }}>
        <h2 style={{ 
          fontSize: '24px', 
          fontWeight: 'bold', 
          color: '#1B4332',
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          Option 1: Minimal Skeleton Loaders
        </h2>
        <p style={{ 
          textAlign: 'center', 
          color: '#6B7280', 
          marginBottom: '20px',
          maxWidth: '600px',
          margin: '0 auto 20px'
        }}>
          Clean and minimal skeleton loaders with subtle pulse animations. Perfect for a professional, understated loading experience.
        </p>
        <div style={{ 
          backgroundColor: '#F8FAF5',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          border: '1px solid #E5E7EB'
        }}>
          <LoadingMockup1Enhanced />
        </div>
      </div>

      {/* Mockup 2 */}
      <div style={{ marginBottom: '60px' }}>
        <h2 style={{ 
          fontSize: '24px', 
          fontWeight: 'bold', 
          color: '#1B4332',
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          Option 2: Playful Animated Spinners
        </h2>
        <p style={{ 
          textAlign: 'center', 
          color: '#6B7280', 
          marginBottom: '20px',
          maxWidth: '600px',
          margin: '0 auto 20px'
        }}>
          Dynamic spinners and bouncing dots create a friendly, engaging loading experience. Great for keeping users entertained while waiting.
        </p>
        <div style={{ 
          backgroundColor: '#F8FAF5',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          border: '1px solid #E5E7EB'
        }}>
          <LoadingMockup2 />
        </div>
      </div>

      {/* Mockup 3 */}
      <div style={{ marginBottom: '60px' }}>
        <h2 style={{ 
          fontSize: '24px', 
          fontWeight: 'bold', 
          color: '#1B4332',
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          Option 3: Premium Shimmer Effects
        </h2>
        <p style={{ 
          textAlign: 'center', 
          color: '#6B7280', 
          marginBottom: '20px',
          maxWidth: '600px',
          margin: '0 auto 20px'
        }}>
          Sophisticated shimmer waves and gradient effects provide a premium feel. Ideal for creating a high-end user experience.
        </p>
        <div style={{ 
          backgroundColor: '#F8FAF5',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          border: '1px solid #E5E7EB'
        }}>
          <LoadingMockup3 />
        </div>
      </div>
    </div>
  );
}