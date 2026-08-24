import { FC, useState } from 'react';
import { resolveActorSchedule } from '../content/Actor';
import { Stage } from '../Stage';
import { ActorPortrait } from './ActorPortrait';

interface LocationActorPortraitsProps {
    locationId: string;
    stage: Stage;
    size?: number;
    onHoverChange?: (hovering: boolean) => void;
}

export const LocationActorPortraits: FC<LocationActorPortraitsProps> = ({ locationId, stage, size = 36, onHoverChange }) => {
    const [hoveredActorId, setHoveredActorId] = useState<string | null>(null);
    const save = stage.getSave();
    const scheduleContext = stage.getScheduleContext(save);
    const actors = Object.values(save.actors || {})
        .filter(actor => actor.id !== save.playerId && actor.active !== false)
        .filter(actor => resolveActorSchedule(actor, scheduleContext) === locationId);

    if (actors.length === 0) {
        return null;
    }

    const overlap = Math.round(size * 0.32);

    const handleEnter = (actorId: string) => {
        setHoveredActorId(actorId);
        onHoverChange?.(true);
    };

    const handleLeave = () => {
        setHoveredActorId(null);
        onHoverChange?.(false);
    };

    return (
        <div aria-label={`Characters at this location: ${actors.map(actor => actor.name).join(', ')}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {actors.map((actor, index) => {
                const isHovered = hoveredActorId === actor.id;
                return (
                    <div
                        key={actor.id}
                        onMouseEnter={() => handleEnter(actor.id)}
                        onMouseLeave={handleLeave}
                        style={{ position: 'relative', display: 'flex', alignItems: 'center', marginLeft: index === 0 ? 0 : -overlap, zIndex: isHovered ? actors.length + 1 : actors.length - index, pointerEvents: 'auto' }}
                    >
                        <ActorPortrait
                            actor={actor}
                            stage={stage}
                            size={size}
                            borderRadius="50%"
                            objectPosition="center 20%"
                            hideUntilImageLoaded
                            fadeInWhenLoaded
                            style={{
                                border: '2px solid var(--agenda-text-primary)',
                                boxShadow: isHovered ? '0 3px 14px rgba(0,0,0,.7)' : '0 3px 10px rgba(0,0,0,.55)',
                                transform: isHovered ? 'scale(1.12)' : 'scale(1)',
                                transition: 'transform 0.15s ease-out, box-shadow 0.15s ease-out',
                            }}
                            title={actor.name}
                        />
                        {isHovered && (
                            <span
                                style={{
                                    position: 'absolute',
                                    left: '100%',
                                    marginLeft: 6,
                                    whiteSpace: 'nowrap',
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    color: 'var(--agenda-text-primary)',
                                    background: 'color-mix(in srgb, var(--agenda-surface-base) 88%, transparent)',
                                    border: '1px solid var(--agenda-line-strong)',
                                    boxShadow: '0 3px 10px rgba(0,0,0,.55)',
                                    pointerEvents: 'none',
                                }}
                            >
                                {actor.name}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
};