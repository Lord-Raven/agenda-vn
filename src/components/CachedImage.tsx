import { FC, ImgHTMLAttributes } from 'react';
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

export default CachedImage;
