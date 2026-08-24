import React, { FC } from 'react';
import { Person } from '@mui/icons-material';
import { motion } from 'framer-motion';
import { Actor, getEmotionImage } from '../content/Actor';
import { Stage } from '../Stage';
import { CachedBackgroundUrl } from './CachedImage';

export interface ActorPortraitProps {
    actor?: Pick<Actor, 'id' | 'name' | 'outfitId' | 'outfits' | 'themeColor'> | null;
    stage?: Stage | (() => Stage);
    size?: number;
    borderRadius?: number | string;
    style?: React.CSSProperties;
    objectPosition?: string;
    fallbackText?: string;
    title?: string;
    showInitials?: boolean;
    ariaLabel?: string;
    /** Longest-edge pixel size of the cached downscale; defaults to twice the rendered size. */
    thumbnailSize?: number;
    hideUntilImageLoaded?: boolean;
    fadeInWhenLoaded?: boolean;
}

const resolveStage = (stage?: Stage | (() => Stage)) => typeof stage === 'function' ? stage() : stage;

export const ActorPortrait: FC<ActorPortraitProps> = ({
    actor,
    stage,
    size = 40,
    borderRadius = '50%',
    style,
    objectPosition = 'center 20%',
    fallbackText,
    title,
    showInitials = true,
    ariaLabel,
    thumbnailSize,
    hideUntilImageLoaded = false,
    fadeInWhenLoaded = false,
}) => {
    if (!actor) {
        return null;
    }

    const stageInstance = resolveStage(stage);
    const imageUrl = getEmotionImage(actor as Actor, 'neutral', stageInstance, actor.outfitId || '')
        || getEmotionImage(actor as Actor, 'base', stageInstance, actor.outfitId || '');
    const initials = (fallbackText || actor.name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase() ?? '')
        .join('') || '?';

    return (
        <CachedBackgroundUrl url={imageUrl} thumbnailSize={thumbnailSize ?? Math.round(size * 2)}>
            {(cachedImageUrl) => {
                if (imageUrl && hideUntilImageLoaded && !cachedImageUrl) {
                    return null;
                }

                return (
                    <motion.div
                        title={title ?? actor.name}
                        aria-label={ariaLabel ?? actor.name}
                        initial={fadeInWhenLoaded ? { opacity: 0 } : false}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        style={{
                            width: size,
                            height: size,
                            display: 'grid',
                            placeItems: 'center',
                            overflow: 'hidden',
                            borderRadius,
                            border: `2px solid ${actor.themeColor || 'var(--agenda-line-strong)'}`,
                            backgroundColor: 'var(--agenda-surface-base)',
                            backgroundImage: cachedImageUrl ? `url(${cachedImageUrl})` : 'none',
                            backgroundSize: 'cover',
                            backgroundPosition: objectPosition,
                            boxShadow: '0 3px 10px rgba(0, 0, 0, 0.38)',
                            color: 'var(--agenda-text-primary)',
                            fontSize: Math.max(11, Math.round(size * 0.34)),
                            fontWeight: 700,
                            flex: '0 0 auto',
                            position: 'relative',
                            ...style,
                        }}
                    >
                        {!cachedImageUrl && (showInitials ? (
                            <span>{initials}</span>
                        ) : (
                            <Person style={{ fontSize: Math.max(18, size * 0.5), color: 'var(--agenda-text-primary)' }} />
                        ))}
                    </motion.div>
                );
            }}
        </CachedBackgroundUrl>
    );
};
