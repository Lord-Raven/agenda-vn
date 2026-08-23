import { FC } from 'react';
import { resolveActorSchedule } from '../content/Actor';
import { Stage } from '../Stage';
import { ActorPortrait } from './ActorPortrait';

interface LocationActorPortraitsProps {
    locationId: string;
    stage: Stage;
    size?: number;
}

export const LocationActorPortraits: FC<LocationActorPortraitsProps> = ({ locationId, stage, size = 36 }) => {
    const save = stage.getSave();
    const scheduleContext = stage.getScheduleContext(save);
    const actors = Object.values(save.actors || {})
        .filter(actor => actor.id !== save.playerId && actor.active !== false)
        .filter(actor => resolveActorSchedule(actor, scheduleContext) === locationId);

    if (actors.length === 0) {
        return null;
    }

    const overlap = Math.round(size * 0.32);

    return (
        <div aria-label={`Characters at this location: ${actors.map(actor => actor.name).join(', ')}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            {actors.map((actor, index) => (
                <div key={actor.id} style={{ marginLeft: index === 0 ? 0 : -overlap, zIndex: actors.length - index }}>
                    <ActorPortrait
                        actor={actor}
                        stage={stage}
                        size={size}
                        borderRadius="50%"
                        objectPosition="center 20%"
                        style={{
                            border: '2px solid var(--agenda-text-primary)',
                            boxShadow: '0 3px 10px rgba(0,0,0,.55)',
                        }}
                        title={actor.name}
                    />
                </div>
            ))}
        </div>
    );
};