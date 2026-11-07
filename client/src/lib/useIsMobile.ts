import { useEffect, useState } from 'react';

const QUERY = '(max-width: 767px)';

const matches = () => (typeof window.matchMedia === 'function' ? window.matchMedia(QUERY).matches : false);

/** Verdadero por debajo de 768 px. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}
