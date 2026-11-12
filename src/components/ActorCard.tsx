import { CSSProperties, FC } from 'react';
import { Stage } from '../Stage';
import { Actor } from '../content/Actor';
import { ContentCardControl } from './ContentCardControl';

interface ActorCardProps {
    actor?: Actor;
    stage: () => Stage;
    style?: CSSProperties;
    className?: string;
}

export const ActorCard: FC<ActorCardProps> = ({ actor, stage, style, className }) => {
    if (!actor) return null;
    const control = stage().getCardControl('actor');
    return control ? <ContentCardControl stage={stage} control={control} kind="actor" id={actor.id}
        orientation="vertical" style={style} className={className} /> : null;
};
