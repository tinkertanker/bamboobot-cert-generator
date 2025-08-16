import { useState, useEffect } from 'react';

export function useMobileDetection() {
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkMobile = () => {
      // Don't show mobile warning in test environment
      if (process.env.NODE_ENV === 'test' || typeof window === 'undefined') {
        setIsMobile(false);
        setIsLoading(false);
        return;
      }

      // Check screen size
      const isSmallScreen = window.innerWidth < 768;
      
      // Check user agent for mobile devices
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      
      // Only consider it mobile if:
      // 1. Screen is small (< 768px), OR
      // 2. User agent indicates a mobile device
      // Note: We removed touch capability check as many laptops have touchscreens
      setIsMobile(isSmallScreen || isMobileDevice);
      setIsLoading(false);
    };

    // Initial check
    checkMobile();

    // Listen for resize events
    const handleResize = () => {
      checkMobile();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { isMobile, isLoading };
}