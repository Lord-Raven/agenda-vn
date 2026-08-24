import { useEffect, useState } from 'react';

// Module-level cache so decoded images stay warm across component mounts/unmounts.
const decodedUrls = new Set<string>();
const pendingDecodes = new Map<string, Promise<void>>();

export function isImageDecoded(url?: string): boolean {
    return !url || decodedUrls.has(url);
}

/**
 * Loads and fully decodes an image off-screen exactly once per URL, caching the result so
 * later renders of the same URL can paint immediately instead of decoding again.
 */
export function preloadImage(url?: string): Promise<void> {
    if (!url || decodedUrls.has(url)) {
        return Promise.resolve();
    }

    const pending = pendingDecodes.get(url);
    if (pending) {
        return pending;
    }

    const image = new Image();
    image.src = url;
    const decode = image.decode
        ? image.decode()
        : new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = reject;
        });

    const promise = decode
        .catch(() => { /* Treat a failed decode as resolved so callers don't hang on broken URLs. */ })
        .finally(() => {
            decodedUrls.add(url);
            pendingDecodes.delete(url);
        });

    pendingDecodes.set(url, promise);
    return promise;
}

/**
 * Returns a URL that only updates once it has been preloaded/decoded, holding onto the
 * previously displayed URL in the meantime to avoid a blank flash or re-decode pop-in.
 */
export function useCachedImageUrl(url?: string): string | undefined {
    const [displayUrl, setDisplayUrl] = useState<string | undefined>(() => (url && isImageDecoded(url) ? url : undefined));

    useEffect(() => {
        if (!url) {
            setDisplayUrl(undefined);
            return;
        }

        if (isImageDecoded(url)) {
            setDisplayUrl(url);
            return;
        }

        let cancelled = false;
        preloadImage(url).then(() => {
            if (!cancelled) {
                setDisplayUrl(url);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [url]);

    return displayUrl;
}
