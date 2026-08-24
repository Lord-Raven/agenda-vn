import React, { FC } from 'react';
import { Person } from '@mui/icons-material';
import { Actor, getEmotionImage } from '../content/Actor';
import { Stage } from '../Stage';
import { CachedImage } from './CachedImage';

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
        <div
            title={title ?? actor.name}
            aria-label={ariaLabel ?? actor.name}
            style={{
                width: size,
                height: size,
                display: 'grid',
                placeItems: 'center',
                overflow: 'hidden',
                borderRadius,
                border: `2px solid ${actor.themeColor || 'var(--agenda-line-strong)'}`,
                background: actor.themeColor || 'var(--agenda-surface-base)',
                boxShadow: '0 3px 10px rgba(0, 0, 0, 0.38)',
                color: 'var(--agenda-text-primary)',
                fontSize: Math.max(11, Math.round(size * 0.34)),
                fontWeight: 700,
                flex: '0 0 auto',
                position: 'relative',
                ...style,
            }}
        >
            {imageUrl ? (
                <CachedImage
                    src={imageUrl}
                    thumbnailSize={thumbnailSize ?? Math.round(size * 2)}
                    alt={actor.name}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition,
                        display: 'block',
                    }}
                />
            ) : showInitials ? (
                <span>{initials}</span>
            ) : (
                <Person style={{ fontSize: Math.max(18, size * 0.5), color: 'var(--agenda-text-primary)' }} />
            )}
        </div>
    );
};
