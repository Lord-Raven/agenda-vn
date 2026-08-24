import { FC, ImgHTMLAttributes, ReactNode } from 'react';
import { useCachedImageUrl, useThumbnailUrl } from '../utils/ImageCache';

export interface CachedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
    src?: string;
    /** Longest-edge pixel size of a downscaled copy to render instead of the full-size source. */
    thumbnailSize?: number;
}

/**
 * Drop-in replacement for <img> that keeps showing the previously decoded image while a new
 * src is loading/decoding, instead of flashing blank and re-decoding on every render.
 */
export const CachedImage: FC<CachedImageProps> = ({ src, thumbnailSize, ...imgProps }) => {
    const thumbnailSrc = useThumbnailUrl(thumbnailSize ? src : undefined, thumbnailSize);
    const cachedSrc = useCachedImageUrl(thumbnailSize ? undefined : src);
    const resolvedSrc = thumbnailSize ? thumbnailSrc : cachedSrc;

    if (!resolvedSrc) {
        return null;
    }

    return <img src={resolvedSrc} {...imgProps} />;
};

export interface CachedBackgroundUrlProps {
    url?: string;
    /** Longest-edge pixel size of a downscaled copy to render instead of the full-size source. */
    thumbnailSize?: number;
    children: (cachedUrl: string | undefined) => ReactNode;
}

/**
 * Render-prop wrapper that resolves a cached/decoded URL for use in a background-image style.
 * Use this for items rendered inside a .map() loop, where hooks can't be called directly.
 */
export const CachedBackgroundUrl: FC<CachedBackgroundUrlProps> = ({ url, thumbnailSize, children }) => {
    const thumbnailUrl = useThumbnailUrl(thumbnailSize ? url : undefined, thumbnailSize);
    const cachedUrl = useCachedImageUrl(thumbnailSize ? undefined : url);
    return <>{children(thumbnailSize ? thumbnailUrl : cachedUrl)}</>;
};

export default CachedImage;
