import React, { FC } from 'react';
import { Place } from '@mui/icons-material';
import { Location, getLocationImageUrl } from '../content/Location';
import { Stage } from '../Stage';

export type LocationLike = Pick<Location, 'id' | 'name'>
    & Partial<Pick<Location, 'imageUrl' | 'alternativeImages' | 'focalPoint' | 'themeColor'>>;

export interface LocationPortraitProps {
    location?: LocationLike | null;
    stage?: Stage | (() => Stage);
    width?: number | string;
    height?: number | string;
    borderRadius?: number | string;
    style?: React.CSSProperties;
    title?: string;
    ariaLabel?: string;
    highlighted?: boolean;
}

const resolveStage = (stage?: Stage | (() => Stage)) => typeof stage === 'function' ? stage() : stage;

export const LocationPortrait: FC<LocationPortraitProps> = ({
    location,
    stage,
    width = 64,
    height = 48,
    borderRadius = '6px',
    style,
    title,
    ariaLabel,
    highlighted = false,
}) => {
    if (!location) {
        return null;
    }

    const imageUrl = getLocationImageUrl(location as Location, resolveStage(stage));
    const iconSize = typeof height === 'number' ? Math.max(14, Math.round(height * 0.42)) : 20;

    return (
        <div
            title={title ?? location.name}
            aria-label={ariaLabel ?? location.name}
            style={{
                width,
                height,
                borderRadius,
                border: `2px solid ${highlighted ? 'var(--agenda-highlight)' : (location.themeColor || 'var(--agenda-line-strong)')}`,
                backgroundColor: 'color-mix(in srgb, var(--agenda-surface-base) 86%, transparent)',
                backgroundImage: imageUrl ? `url(${imageUrl})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: `${(location.focalPoint?.x ?? 0.5) * 100}% ${(location.focalPoint?.y ?? 0.5) * 100}%`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flex: '0 0 auto',
                ...style,
            }}
        >
            {!imageUrl && <Place style={{ fontSize: `${iconSize}px`, color: 'var(--agenda-accent-primary)' }} />}
        </div>
    );
};
