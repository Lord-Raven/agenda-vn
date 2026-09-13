export type VoiceModulation = {
    rate: number;
    warmth: number;
    brightness: number;
    nasality: number;
}

export const DEFAULT_VOICE_MODULATION: VoiceModulation = {
    rate: 1,
    warmth: 0,
    brightness: 0,
    nasality: 0,
};

export const normalizeVoiceModulation = (value: unknown): VoiceModulation => {
    const source = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : { rate: value };
    const finiteOrDefault = (key: keyof VoiceModulation): number => {
        const rawValue = source[key];
        const parsed = typeof rawValue === 'number' || (typeof rawValue === 'string' && rawValue.trim())
            ? Number(rawValue)
            : Number.NaN;
        return Number.isFinite(parsed) ? parsed : DEFAULT_VOICE_MODULATION[key];
    };

    return {
        rate: Math.min(1.2, Math.max(0.8, finiteOrDefault('rate'))),
        warmth: Math.min(12, Math.max(-12, finiteOrDefault('warmth'))),
        brightness: Math.min(12, Math.max(-12, finiteOrDefault('brightness'))),
        nasality: Math.min(12, Math.max(-12, finiteOrDefault('nasality'))),
    };
};

export const ACTOR_VOICE_ACCENTS = [
    'African',
    'American',
    'American (Southern)',
    'Australian',
    'British',
    'Caribbean',
    'Chinese',
    'French',
    'German',
    'Indian',
    'Italian',
    'Japanese',
    'Korean',
    'Latin American',
    'Middle Eastern',
    'Multilingual',
    'Scandinavian',
    'Slavic',
    'Spanish',
] as const;
export type ActorVoiceAccent = typeof ACTOR_VOICE_ACCENTS[number];

export type ActorVoiceGender = 'male' | 'female' | 'non-binary';

export const ACTOR_VOICE_GENDER_LABELS: Record<ActorVoiceGender, string> = {
    male: 'Masculine',
    female: 'Feminine',
    'non-binary': 'Androgynous',
};

export interface ActorVoice {
    id: string; // This maps to the voice ID in Chub, where these voices are hosted.
    description: string;
    gender: ActorVoiceGender;
    accent: ActorVoiceAccent;
    volumeModifier: number; // This is a modifier to volume that is inherent to this voice (as some voices are recorded more quietly than others)
    tags?: string[]; // Extra search keywords (age, tone, character archetype) for the voice picker.
}

// The catalog of voices available for TTS; also presented to the AI so it can choose an ID from a character profile.
export const ACTOR_VOICES: ActorVoice[] = [
    { id: '03a438b7-ebfa-4f72-9061-f086d8f1fca6', gender: 'female', accent: 'American', description: 'Warm and soothing', volumeModifier: 1, tags: ['mature', 'calm'] },
    { id: 'a2533977-83cb-4c10-9955-0277e047538f', gender: 'female', accent: 'American', description: 'Energetic and youthful', volumeModifier: 1, tags: ['young', 'bubbly'] },
    { id: '057d53b3-bb28-47f1-9c19-a85a79851863', gender: 'female', accent: 'American', description: 'Low and warm', volumeModifier: 1, tags: ['husky', 'mature'] },
    { id: '6e6619ba-4880-4cf3-a5df-d0697ba46656', gender: 'female', accent: 'American', description: 'High and soft', volumeModifier: 1, tags: ['shy', 'young'] },
    { id: 'd6e05564-eea9-4181-aee9-fa0d7315f67d', gender: 'male', accent: 'American', description: 'Cool and confident', volumeModifier: 1, tags: ['smooth'] },
    { id: 'e6b74abb-f4b2-4a84-b9ef-c390512f2f47', gender: 'male', accent: 'British', description: 'Posh and articulate', volumeModifier: 1, tags: ['stock', 'refined'] },
    { id: 'bright_female_20s', gender: 'female', accent: 'American', description: 'Bright and cheerful', volumeModifier: 1, tags: ['20s', 'young'] },
    { id: 'resonant_male_40s', gender: 'male', accent: 'American', description: 'Resonant and mature', volumeModifier: 1, tags: ['40s', 'deep'] },
    { id: 'gentle_female_30s', gender: 'female', accent: 'American', description: 'Gentle and caring', volumeModifier: 1, tags: ['30s', 'nurturing'] },
    { id: 'whispery_female_40s', gender: 'female', accent: 'American', description: 'Whispery and mysterious', volumeModifier: 1, tags: ['40s', 'breathy'] },
    { id: 'formal_female_30s', gender: 'female', accent: 'American', description: 'Formal and reedy', volumeModifier: 1, tags: ['30s', 'strict'] },
    { id: 'professional_female_30s', gender: 'female', accent: 'American', description: 'Professional and direct', volumeModifier: 1, tags: ['30s', 'business'] },
    { id: 'calm_female_20s', gender: 'female', accent: 'American', description: 'Calm and soothing', volumeModifier: 1, tags: ['20s', 'relaxed'] },
    { id: 'light_male_20s', gender: 'male', accent: 'American', description: 'Light and thoughtful', volumeModifier: 1, tags: ['20s', 'young'] },
    { id: 'animated_male_20s', gender: 'male', accent: 'American', description: 'Hip and lively', volumeModifier: 1, tags: ['20s', 'young'] },

    { id: '6d147025-53bf-479b-a159-8a1510c6bb92', gender: 'non-binary', accent: 'French', description: 'Youthful and softspoken', volumeModifier: 1, tags: ['Pikatchoum', 'young'] },
    { id: 'f6e0ffd3-b512-4261-b4e4-e161391046fc', gender: 'female', accent: 'American', description: 'Fried and youthful', volumeModifier: 1, tags: ['Daisy4Dayz', 'vocal fry'] },
    { id: '77a6e53d-16c7-47d7-84cc-5ea307e3a11d', gender: 'female', accent: 'British', description: 'Saucy and bright', volumeModifier: 1, tags: ['BretonBrat', 'playful'] },
    { id: '8c9b8c56-20e6-490e-b787-8efcff4e89f7', gender: 'female', accent: 'British', description: 'Haughty and catty', volumeModifier: 1, tags: ['Ilithya', 'posh', 'mean'] },
    { id: '1e0aa062-c5ee-4731-9fa1-c34c11097b03', gender: 'female', accent: 'French', description: 'Mature and warm', volumeModifier: 1, tags: ['Madame LaMarquise', 'noble'] },
    { id: 'bb3e5ef7-2eda-470c-b93b-32c39d285b0e', gender: 'female', accent: 'French', description: 'Soft and insecure', volumeModifier: 1, tags: ['ohPaytriarchy', 'timid'] },
    { id: '3383a73e-5a5b-4155-a741-5f0fe21b5b11', gender: 'female', accent: 'French', description: 'High and light', volumeModifier: 1, tags: ['chocolatine_va', 'tinny'] },
    { id: 'ae245bb9-83a9-4b34-9aa8-f670431b9c82', gender: 'female', accent: 'French', description: 'Low and breathy', volumeModifier: 1, tags: ['VenusDeVelours', 'sultry'] },
    { id: '23626ae8-691f-45d4-9870-7fddea8a0184', gender: 'female', accent: 'French', description: 'Nasal and youthful', volumeModifier: 1, tags: ['Solene-Cherie', 'young'] },
    { id: '9f882b0a-d0da-4d7d-ad0d-e868b851b6f1', gender: 'female', accent: 'French', description: 'Bright and confident', volumeModifier: 1, tags: ['RosalinaKinks'] },
    { id: '35b7e629-4df8-4c0e-a107-d037c594838a', gender: 'female', accent: 'French', description: 'Bright and warm', volumeModifier: 1, tags: ['EllyHart456'] },
    { id: '48d3008b-b1fd-4c36-81ea-d2f36413da9a', gender: 'female', accent: 'French', description: 'Light and airy', volumeModifier: 1, tags: ['hummingael', 'delicate'] },
    { id: '3b46afa4-62a6-4ba7-9652-e5065d75db6e', gender: 'female', accent: 'Multilingual', description: 'Calm and low', volumeModifier: 1.6, tags: ['youronlynora', 'quiet'] },
    { id: 'a3a9a163-a283-4ba7-8535-d3f583ed342d', gender: 'female', accent: 'Slavic', description: 'Keen and direct', volumeModifier: 1, tags: ['audio_allure'] },
    { id: 'bfb9b9b1-e25e-4c06-859a-1271e29cc9d4', gender: 'male', accent: 'British', description: 'Bold and whimsical', volumeModifier: 1, tags: ['Matt Berry', 'theatrical'] },
    { id: '5004afbd-9f53-48af-8947-e8c31db03bd5', gender: 'male', accent: 'French', description: 'Low and commanding', volumeModifier: 1, tags: ['candeur', 'authoritative'] },
    { id: 'e735ff09-8ab1-4a74-bff6-7b17f0207e9b', gender: 'male', accent: 'French', description: 'Deep and resonant', volumeModifier: 1, tags: ['audioByDominic'] },
    { id: '74bedcda-2fcf-43ab-9aee-66b2bad14f69', gender: 'male', accent: 'French', description: 'Light and relaxed', volumeModifier: 1, tags: ['Elias23h47'] },
    { id: '7fef668b-5cc4-47b1-b9ca-7dcadac15bf3', gender: 'male', accent: 'French', description: 'Deep and warm', volumeModifier: 1, tags: ['daddydeep'] },
    { id: '825b8263-63ca-4729-82a6-78855b637214', gender: 'male', accent: 'French', description: 'Friendly and approachable', volumeModifier: 1.3, tags: ['mercadien', 'quiet'] },

    { id: 'dbfdae01-cb99-4b72-b969-2d9221006369', gender: 'female', accent: 'French', description: 'Fried and crisp', volumeModifier: 1, tags: ['la capitaine', 'fried', 'crisp'] },
    { id: '049a0c40-cb2c-4c0c-9ff3-c51c73b38a5c', gender: 'female', accent: 'French', description: 'Soft and sibilant', volumeModifier: 1, tags: ['efferus_doll', 'soft', 'sibilant'] },
    { id: '9faa7022-690e-4cbf-b89d-38357af3249b', gender: 'female', accent: 'French', description: 'Mature and raspy', volumeModifier: 1, tags: ['sandytaboo', 'mature', 'raspy'] },
    { id: 'd534c4bc-b799-4652-8bb9-10ef17cbe814', gender: 'female', accent: 'French', description: 'Mature and androgynous', volumeModifier: 1, tags: ['maitresse_h', 'mature', 'androgynous'] },
    { id: '75cc0825-68d1-4910-b777-f76f1b93e2bf', gender: 'male', accent: 'French', description: 'Resonant and playful', volumeModifier: 1, tags: ['useless_timidity', 'resonant', 'playful'] },
    { id: 'ecd74a78-ec98-4dc0-b724-7a53b46ea688', gender: 'female', accent: 'French', description: 'Gentle and bubbly', volumeModifier: 1, tags: ['yoursexyranger', 'gentle', 'bubbly'] },
    { id: '205d9492-c99f-4de6-b4ef-64010f5649d8', gender: 'female', accent: 'French', description: 'Bright and childish', volumeModifier: 1, tags: ['jm_delphi', 'bright', 'childish'] },
    { id: '4ee76277-169a-4eaf-922f-2f541e4af400', gender: 'female', accent: 'Slavic', description: 'Warm and playful', volumeModifier: 1, tags: ['Financial-Dig4285', 'warm', 'playful'] },
    { id: '33087abc-6867-47ea-976c-2328c35e9682', gender: 'female', accent: 'Scandinavian', description: 'Welcoming and direct', volumeModifier: 1, tags: ['cosmicvice', 'welcoming', 'direct'] },
    { id: '05eb46e1-f952-4af3-8640-85184ed245fb', gender: 'female', accent: 'German', description: 'Light and playful', volumeModifier: 1, tags: ['ellasmet', 'light', 'playful'] },
    { id: 'c10d20f5-f983-4b3b-91fe-ac9bd60d4c80', gender: 'female', accent: 'German', description: 'Clear and confident', volumeModifier: 1, tags: ['goblinsluut', 'clear', 'confident'] },
    { id: '101b72ff-2d24-4a6f-9137-1cd989729649', gender: 'male', accent: 'American (Southern)', description: 'Clear and fried', volumeModifier: 1, tags: ['urfavvoice', 'clear', 'fried'] },
    { id: '13330d90-93a3-4240-b087-7fe02247b137', gender: 'female', accent: 'Italian', description: 'Lusty and androgynous', volumeModifier: 1, tags: ['italian maneater', 'lusty', 'androgynous'] },
    { id: '688cdabc-10ef-4088-b2d8-f9907dd91e0d', gender: 'male', accent: 'British', description: 'Confident and professional', volumeModifier: 1, tags: ['night in cimrson', 'confident', 'professional'] },
    { id: 'ad05a121-e674-4a19-b698-60ce9d78a898', gender: 'female', accent: 'Australian', description: 'Bright and playful', volumeModifier: 1, tags: ['YuukoVT', 'bright', 'playful'] },
];

export const getActorVoice = (voiceId: string | undefined): ActorVoice | undefined =>
    voiceId ? ACTOR_VOICES.find(voice => voice.id === voiceId) : undefined;

export const formatActorVoiceLabel = (voice: ActorVoice): string =>
    `${ACTOR_VOICE_GENDER_LABELS[voice.gender]} - ${voice.accent} - ${voice.description}`;

// Inherent per-voice loudness correction, applied when playing that voice.
export const getActorVoiceVolume = (voiceId: string | undefined): number => getActorVoice(voiceId)?.volumeModifier ?? 1;
