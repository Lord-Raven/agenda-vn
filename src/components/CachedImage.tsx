import { FC, ImgHTMLAttributes, ReactNode } from 'react';
import { useCachedImageUrl } from '../utils/ImageCache';

export interface CachedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
    src?: string;
}

/**
 * Drop-in replacement for <img> that keeps showing the previously decoded image while a new
 * src is loading/decoding, instead of flashing blank and re-decoding on every render.
 */
export const CachedImage: FC<CachedImageProps> = ({ src, ...imgProps }) => {
    const cachedSrc = useCachedImageUrl(src);

    if (!cachedSrc) {
        return null;
    }

    return <img src={cachedSrc} {...imgProps} />;
};

export interface CachedBackgroundUrlProps {
    url?: string;
    children: (cachedUrl: string | undefined) => ReactNode;
}

/**
 * Render-prop wrapper that resolves a cached/decoded URL for use in a background-image style.
 * Use this for items rendered inside a .map() loop, where hooks can't be called directly.
 */
export const CachedBackgroundUrl: FC<CachedBackgroundUrlProps> = ({ url, children }) => {
    const cachedUrl = useCachedImageUrl(url);
    return <>{children(cachedUrl)}</>;
};

export default CachedImage;
