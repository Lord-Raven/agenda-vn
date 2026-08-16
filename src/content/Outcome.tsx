export enum OutcomeType {
    LORE_UPDATE = 'LORE_UPDATE',
    ACTOR_STAT = 'ACTOR_STAT',
    ACTOR_STATUS = 'ACTOR_STATUS',
    PLAYER_STAT = 'PLAYER_STAT',
    NEW_EVENT = 'NEW_EVENT',
    NEW_ACTOR = 'NEW_ACTOR',
    OTHER = 'OTHER',
}

export class Outcome {
    type: OutcomeType = OutcomeType.OTHER;
    description: string = ''; // Description of the outcome, e.g. "Found a mysterious key", "Increased strength by 2"
    details: any = {}; // Additional details relevant to the outcome, structure can vary based on type

    constructor(props: any) {
        Object.assign(this, props);
    }
}