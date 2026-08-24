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

// Downscaled copies of source images, keyed by `${url}@${maxSize}`.
const thumbnailUrls = new Map<string, string>();
const pendingThumbnails = new Map<string, Promise<string>>();

const thumbnailKey = (url: string, maxSize: number) => `${url}@${maxSize}`;

function loadImageElement(url: string, crossOrigin: boolean): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        if (crossOrigin) {
            image.crossOrigin = 'anonymous';
        }
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
    });
}

async function renderThumbnail(url: string, maxSize: number): Promise<string> {
    // Anonymous CORS keeps the canvas untainted; retry without it so at least the original still displays.
    const image = await loadImageElement(url, true).catch(() => loadImageElement(url, false));
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height) {
        return url;
    }

    const scale = maxSize / Math.max(width, height);
    if (scale >= 1) {
        return url;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
        return url;
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob) {
        return url;
    }
    return URL.createObjectURL(blob);
}

/**
 * Produces (and caches) a downscaled copy of an image, sized so its longest edge is at most
 * `maxSize` pixels. Falls back to the original URL if the source is already small enough or
 * cannot be re-encoded (e.g. a cross-origin host without CORS headers).
 */
export function getThumbnailUrl(url?: string, maxSize = 128): Promise<string | undefined> {
    if (!url) {
        return Promise.resolve(undefined);
    }

    const key = thumbnailKey(url, maxSize);
    const cached = thumbnailUrls.get(key);
    if (cached) {
        return Promise.resolve(cached);
    }

    const pending = pendingThumbnails.get(key);
    if (pending) {
        return pending;
    }

    const promise = renderThumbnail(url, maxSize)
        .catch(() => url)
        .then(result => {
            thumbnailUrls.set(key, result);
            pendingThumbnails.delete(key);
            if (result !== url) {
                decodedUrls.add(result);
            }
            return result;
        });

    pendingThumbnails.set(key, promise);
    return promise;
}

/**
 * Returns a cached, downscaled version of the given image, or undefined until it is ready.
 * Use for portraits, markers, and other small renders of large source images so the browser
 * only keeps one full-size decode around instead of one per element.
 */
export function useThumbnailUrl(url?: string, maxSize = 128): string | undefined {
    const key = url ? thumbnailKey(url, maxSize) : undefined;
    const [displayUrl, setDisplayUrl] = useState<string | undefined>(() => (key ? thumbnailUrls.get(key) : undefined));

    useEffect(() => {
        if (!url || !key) {
            setDisplayUrl(undefined);
            return;
        }

        const cached = thumbnailUrls.get(key);
        if (cached) {
            setDisplayUrl(cached);
            return;
        }

        let cancelled = false;
        getThumbnailUrl(url, maxSize).then(result => {
            if (!cancelled) {
                setDisplayUrl(result);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [url, key, maxSize]);

    return displayUrl;
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
