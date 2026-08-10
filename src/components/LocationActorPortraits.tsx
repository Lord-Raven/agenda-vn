import { FC } from 'react';
import { getEmotionImage, resolveActorSchedule } from '../content/Actor';
import { Stage } from '../Stage';

interface LocationActorPortraitsProps {
    locationId: string;
    stage: Stage;
    size?: number;
}

export const LocationActorPortraits: FC<LocationActorPortraitsProps> = ({ locationId, stage, size = 36 }) => {
    const save = stage.getSave();
    const actors = Object.values(save.actors || {})
        .filter(actor => actor.id !== save.playerId && actor.active !== false)
        .filter(actor => resolveActorSchedule(actor, save) === locationId);

    if (actors.length === 0) {
        return null;
    }

    return (
        <div aria-label={`Characters at this location: ${actors.map(actor => actor.name).join(', ')}`} style={{ display: 'flex', alignItems: 'center', paddingLeft: Math.min(actors.length - 1, 3) * 8, pointerEvents: 'none' }}>
            {actors.map((actor, index) => {
                const imageUrl = getEmotionImage(actor, 'neutral', stage, actor.outfitId) || getEmotionImage(actor, 'base', stage, actor.outfitId);
                return (
                    <span
                        key={actor.id}
                        title={actor.name}
                        style={{
                            width: size,
                            height: size,
                            marginLeft: index === 0 ? 0 : -8,
                            display: 'grid',
                            placeItems: 'center',
                            flex: `0 0 ${size}px`,
                            overflow: 'hidden',
                            borderRadius: '50%',
                            border: '2px solid var(--agenda-text-primary)',
                            background: actor.themeColor || 'var(--agenda-surface-base)',
                            boxShadow: '0 3px 10px rgba(0,0,0,.55)',
                            color: 'white',
                            fontSize: Math.max(11, Math.round(size * 0.34)),
                            fontWeight: 700,
                        }}
                    >
                        {imageUrl
                            ? <img src={imageUrl} alt={actor.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }} />
                            : actor.name.trim().slice(0, 1).toUpperCase()}
                    </span>
                );
            })}
        </div>
    );
};