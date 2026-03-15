'use client';

import { useState, useRef, useCallback, forwardRef } from 'react';
import { buildProxyImageUrl } from '../../services/imageProxy';

interface ReaderImageProps {
  originalUrl: string;
  index: number;
  visible?: boolean;
}

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 1500;

const ReaderImage = forwardRef<HTMLDivElement, ReaderImageProps>(
  function ReaderImage({ originalUrl, index, visible = true }, ref) {
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);
    const retriesRef = useRef(0);
    const imgRef = useRef<HTMLImageElement | null>(null);

    const src = buildProxyImageUrl(originalUrl);

    const handleLoad = useCallback(() => {
      setLoaded(true);
      setFailed(false);
    }, []);

    const handleError = useCallback(() => {
      if (retriesRef.current < MAX_RETRIES) {
        retriesRef.current += 1;
        const delay = BASE_RETRY_DELAY * Math.pow(2, retriesRef.current - 1); // 1.5s, 3s, 6s
        setTimeout(() => {
          if (imgRef.current) {
            imgRef.current.src = '';
            imgRef.current.src = `${src}${src.includes('?') ? '&' : '?'}r=${retriesRef.current}`;
          }
        }, delay);
      } else {
        setFailed(true);
      }
    }, [src]);

    const handleRetry = useCallback(() => {
      retriesRef.current = 0;
      setFailed(false);
      setLoaded(false);
      if (imgRef.current) {
        imgRef.current.src = '';
        imgRef.current.src = src;
      }
    }, [src]);

    // Don't render <img> until visible — just show placeholder
    if (!visible && !loaded) {
      return (
        <div ref={ref} className="relative w-full" data-page-index={index}>
          <div className="flex h-[60vh] items-center justify-center bg-zinc-900" />
        </div>
      );
    }

    return (
      <div ref={ref} className="relative w-full" data-page-index={index}>
        {!loaded && !failed && (
          <div className="flex h-[60vh] items-center justify-center bg-zinc-900">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-border border-t-ink-cyan" />
          </div>
        )}
        {failed && (
          <button
            type="button"
            onClick={handleRetry}
            className="flex h-[60vh] w-full items-center justify-center bg-zinc-900 text-zinc-400"
          >
            <div className="text-center">
              <p className="text-sm">Failed to load image</p>
              <p className="mt-1 text-xs text-ink-cyan">Tap to retry</p>
            </div>
          </button>
        )}
        <img
          ref={imgRef}
          src={src}
          alt={`Page ${index + 1}`}
          onLoad={handleLoad}
          onError={handleError}
          className={`w-full max-w-full transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0 absolute inset-0'
          }`}
          style={!loaded ? { position: 'absolute', top: 0, left: 0 } : undefined}
        />
      </div>
    );
  },
);

export default ReaderImage;
