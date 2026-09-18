import React, { FC } from 'react';
import { Inventory2 } from '@mui/icons-material';
import { Item, getItemImageUrl } from '../content/Item';
import { Stage } from '../Stage';
import { useThumbnailUrl } from '../utils/ImageCache';

export type ItemLike = Pick<Item, 'id' | 'name'>
    & Partial<Pick<Item, 'category' | 'imageUrl' | 'alternativeImages' | 'themeColor'>>;

export interface ItemPortraitProps {
    item?: ItemLike | null;
    stage?: Stage | (() => Stage);
    width?: number | string;
    height?: number | string;
    borderRadius?: number | string;
    style?: React.CSSProperties;
    title?: string;
    ariaLabel?: string;
    highlighted?: boolean;
    thumbnailSize?: number;
}

const resolveStage = (stage?: Stage | (() => Stage)) => typeof stage === 'function' ? stage() : stage;

export const ItemPortrait: FC<ItemPortraitProps> = ({
    item,
    stage,
    width = 56,
    height = 56,
    borderRadius = '8px',
    style,
    title,
    ariaLabel,
    highlighted = false,
    thumbnailSize,
}) => {
    const renderedSize = Math.max(typeof width === 'number' ? width : 0, typeof height === 'number' ? height : 0) || 128;
    const imageUrl = useThumbnailUrl(
        item ? getItemImageUrl(item as Item, resolveStage(stage)?.getSave()) : undefined,
        thumbnailSize ?? Math.round(renderedSize * 2),
    );

    if (!item) {
        return null;
    }

    const iconSize = typeof height === 'number' ? Math.max(16, Math.round(height * 0.42)) : 22;

    return (
        <div
            title={title ?? item.name}
            aria-label={ariaLabel ?? item.name}
            style={{
                width,
                height,
                borderRadius,
                border: `2px solid ${highlighted ? 'var(--agenda-highlight)' : (item.themeColor || 'var(--agenda-line-strong)')}`,
                backgroundColor: 'color-mix(in srgb, var(--agenda-surface-base) 86%, transparent)',
                backgroundImage: imageUrl ? `url(${imageUrl})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: '50% 50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flex: '0 0 auto',
                ...style,
            }}
        >
            {!imageUrl && <Inventory2 style={{ fontSize: `${iconSize}px`, color: 'var(--agenda-accent-primary)' }} />}
        </div>
    );
};
