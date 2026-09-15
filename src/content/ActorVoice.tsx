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
    'Scottish',
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

    { id: '6d147025-53bf-479b-a159-8a1510c6bb92', gender: 'non-binary', accent: 'French', description: 'Youthful and softspoken', volumeModifier: 1, tags: ['young'] },
    { id: 'f6e0ffd3-b512-4261-b4e4-e161391046fc', gender: 'female', accent: 'American', description: 'Fried and friendly', volumeModifier: 1, tags: ['vocal fry'] },
    { id: '77a6e53d-16c7-47d7-84cc-5ea307e3a11d', gender: 'female', accent: 'British', description: 'Saucy and bright', volumeModifier: 1, tags: ['playful'] },
    { id: '8c9b8c56-20e6-490e-b787-8efcff4e89f7', gender: 'female', accent: 'British', description: 'Haughty and catty', volumeModifier: 1, tags: ['posh', 'mean'] },
    { id: '1e0aa062-c5ee-4731-9fa1-c34c11097b03', gender: 'female', accent: 'French', description: 'Mature and warm', volumeModifier: 1, tags: ['noble'] },
    { id: 'bb3e5ef7-2eda-470c-b93b-32c39d285b0e', gender: 'female', accent: 'French', description: 'Soft and insecure', volumeModifier: 1, tags: ['timid'] },
    { id: '3383a73e-5a5b-4155-a741-5f0fe21b5b11', gender: 'female', accent: 'French', description: 'High and light', volumeModifier: 1, tags: ['tinny'] },
    { id: 'ae245bb9-83a9-4b34-9aa8-f670431b9c82', gender: 'female', accent: 'French', description: 'Low and breathy', volumeModifier: 1, tags: ['sultry'] },
    { id: '23626ae8-691f-45d4-9870-7fddea8a0184', gender: 'female', accent: 'French', description: 'Nasal and youthful', volumeModifier: 1, tags: ['young'] },
    { id: '9f882b0a-d0da-4d7d-ad0d-e868b851b6f1', gender: 'female', accent: 'French', description: 'Bright and confident', volumeModifier: 1, tags: [] },
    { id: '35b7e629-4df8-4c0e-a107-d037c594838a', gender: 'female', accent: 'French', description: 'Bright and warm', volumeModifier: 1, tags: [] },
    { id: '48d3008b-b1fd-4c36-81ea-d2f36413da9a', gender: 'female', accent: 'French', description: 'Light and airy', volumeModifier: 1, tags: ['delicate'] },
    { id: '3b46afa4-62a6-4ba7-9652-e5065d75db6e', gender: 'female', accent: 'Multilingual', description: 'Calm and low', volumeModifier: 1.6, tags: ['quiet'] },
    { id: 'a3a9a163-a283-4ba7-8535-d3f583ed342d', gender: 'female', accent: 'Slavic', description: 'Keen and direct', volumeModifier: 1, tags: [] },
    { id: 'bfb9b9b1-e25e-4c06-859a-1271e29cc9d4', gender: 'male', accent: 'British', description: 'Bold and whimsical', volumeModifier: 1, tags: ['theatrical'] },
    { id: '5004afbd-9f53-48af-8947-e8c31db03bd5', gender: 'male', accent: 'French', description: 'Low and commanding', volumeModifier: 1, tags: ['authoritative'] },
    { id: 'e735ff09-8ab1-4a74-bff6-7b17f0207e9b', gender: 'male', accent: 'French', description: 'Deep and resonant', volumeModifier: 1, tags: ['low'] },
    { id: '74bedcda-2fcf-43ab-9aee-66b2bad14f69', gender: 'male', accent: 'French', description: 'Light and relaxed', volumeModifier: 1, tags: [] },
    { id: '7fef668b-5cc4-47b1-b9ca-7dcadac15bf3', gender: 'male', accent: 'French', description: 'Deep and warm', volumeModifier: 1, tags: [] },
    { id: '825b8263-63ca-4729-82a6-78855b637214', gender: 'male', accent: 'French', description: 'Friendly and approachable', volumeModifier: 1.3, tags: ['quiet'] },

    { id: 'dbfdae01-cb99-4b72-b969-2d9221006369', gender: 'female', accent: 'French', description: 'Fried and crisp', volumeModifier: 1, tags: ['fried', 'crisp'] },
    { id: '049a0c40-cb2c-4c0c-9ff3-c51c73b38a5c', gender: 'female', accent: 'French', description: 'Soft and sibilant', volumeModifier: 1, tags: ['soft', 'sibilant'] },
    { id: '9faa7022-690e-4cbf-b89d-38357af3249b', gender: 'female', accent: 'French', description: 'Mature and raspy', volumeModifier: 1, tags: ['mature', 'raspy'] },
    { id: 'd534c4bc-b799-4652-8bb9-10ef17cbe814', gender: 'female', accent: 'French', description: 'Mature and androgynous', volumeModifier: 1, tags: ['mature', 'androgynous'] },
    { id: '75cc0825-68d1-4910-b777-f76f1b93e2bf', gender: 'male', accent: 'French', description: 'Resonant and playful', volumeModifier: 1, tags: ['resonant', 'playful'] },
    { id: 'ecd74a78-ec98-4dc0-b724-7a53b46ea688', gender: 'female', accent: 'French', description: 'Gentle and bubbly', volumeModifier: 1, tags: ['gentle', 'bubbly'] },
    { id: '205d9492-c99f-4de6-b4ef-64010f5649d8', gender: 'female', accent: 'French', description: 'Bright and childish', volumeModifier: 1, tags: ['bright', 'childish'] },
    { id: '4ee76277-169a-4eaf-922f-2f541e4af400', gender: 'female', accent: 'Slavic', description: 'Warm and playful', volumeModifier: 1, tags: ['warm', 'playful'] },
    { id: '33087abc-6867-47ea-976c-2328c35e9682', gender: 'female', accent: 'Scandinavian', description: 'Welcoming and direct', volumeModifier: 1, tags: ['welcoming', 'direct'] },
    { id: '05eb46e1-f952-4af3-8640-85184ed245fb', gender: 'female', accent: 'German', description: 'Light and playful', volumeModifier: 1, tags: ['light', 'playful'] },
    { id: 'c10d20f5-f983-4b3b-91fe-ac9bd60d4c80', gender: 'female', accent: 'German', description: 'Clear and confident', volumeModifier: 1, tags: ['clear', 'confident'] },
    { id: '101b72ff-2d24-4a6f-9137-1cd989729649', gender: 'male', accent: 'American', description: 'Clear and fried', volumeModifier: 1, tags: ['clear', 'fried', 'twangy'] },
    { id: '13330d90-93a3-4240-b087-7fe02247b137', gender: 'non-binary', accent: 'Italian', description: 'Low and lusty', volumeModifier: 1, tags: ['lusty', 'low', 'breathy'] },
    { id: '688cdabc-10ef-4088-b2d8-f9907dd91e0d', gender: 'male', accent: 'British', description: 'Confident and professional', volumeModifier: 1, tags: ['confident', 'professional'] },
    { id: 'ad05a121-e674-4a19-b698-60ce9d78a898', gender: 'female', accent: 'Australian', description: 'Bright and playful', volumeModifier: 1, tags: ['bright', 'playful'] },

    { id: '1a2511b4-4e46-48ed-b74d-02def9b196f2', gender: 'female', accent: 'German', description: 'Light and confident', volumeModifier: 1, tags: ['light', 'confident'] },
    { id: 'f184b6b1-6c9c-4fca-b25c-91899f59aa81', gender: 'female', accent: 'American', description: 'Pouty and youthful', volumeModifier: 1, tags: ['pouty', 'youthful'] },
    { id: 'c2ffaf44-10b4-411e-a1bb-e85e87058f40', gender: 'female', accent: 'German', description: 'Professional and confident', volumeModifier: 1, tags: ['professional', 'confident'] },
    { id: 'd94c3f6e-cda3-4750-b2a7-afdad61941b2', gender: 'female', accent: 'Australian', description: 'Warm and loving', volumeModifier: 1, tags: ['warm', 'loving'] },
    { id: '9e370917-9964-42b5-9d0b-5a8adfef1955', gender: 'female', accent: 'American', description: 'Playful and ditzy', volumeModifier: 1, tags: ['playful', 'ditzy'] },
    { id: 'b52d6608-66eb-4daa-87cb-541b0a63d830', gender: 'female', accent: 'American', description: 'Bratty and Nasal', volumeModifier: 1, tags: ['bratty', 'nasal'] },
    { id: '4d440d36-105a-4cb3-a836-a008c9fb5f0e', gender: 'female', accent: 'American', description: 'Rich and sassy', volumeModifier: 1, tags: ['rich', 'sassy'] },
    { id: '171ecd2a-c4d4-4a4e-99bb-43eff6deeb9c', gender: 'female', accent: 'American', description: 'Sharp and twangy', volumeModifier: 1, tags: ['sharp', 'twangy'] },
    { id: 'efd80f23-39dc-4d81-8030-66c72951dc54', gender: 'female', accent: 'Scottish', description: 'Warm and playful', volumeModifier: 1, tags: ['warm', 'playful'] },
    { id: '6a6cb9c6-f41f-492b-a9f2-49f1188949a7', gender: 'male', accent: 'German', description: 'Soft and kind', volumeModifier: 1, tags: ['soft', 'kind'] },
    { id: 'fc734b40-bf22-4c0a-b926-a5fbd5b85aa0', gender: 'female', accent: 'Australian', description: 'Bright and nerdy', volumeModifier: 1, tags: ['bright', 'nerdy'] },
    { id: '81972ea2-42c5-40b4-826d-a29d338f430e', gender: 'female', accent: 'Australian', description: 'Bright and youthful', volumeModifier: 1, tags: ['bright', 'youthful'] },
    { id: 'a97ec94e-84a6-4413-aee5-f5ce411089ae', gender: 'female', accent: 'American', description: 'Sarcastic and twangy', volumeModifier: 1, tags: ['sarcastic', 'twangy'] },
    { id: '7397e640-fbc7-4ecf-9508-cb11f3662d99', gender: 'female', accent: 'American', description: 'Bubbly and nervous', volumeModifier: 1, tags: ['bubbly', 'nervous'] },
    { id: '37cafa09-cdaf-4d0a-8cee-d81dc580617d', gender: 'female', accent: 'British', description: 'Mature and predatory', volumeModifier: 1, tags: ['mature', 'predatory'] },
    { id: 'ce6c77dc-10bb-4872-a209-905548885a2b', gender: 'female', accent: 'American', description: 'Soft and nervous - needs a boost', volumeModifier: 1, tags: ['soft', 'nervous'] },
    { id: '8ddffc90-2eaf-4df9-a3e4-2a34301107b9', gender: 'male', accent: 'American', description: 'Low and twangy', volumeModifier: 1, tags: ['low', 'twangy'] },
    { id: 'dfceb7ed-1dce-450f-8512-963f369e37d4', gender: 'female', accent: 'French', description: 'Confident and playful', volumeModifier: 1, tags: ['confident', 'playful'] },
    { id: '61cb21e2-bb49-4a9b-a4c8-b2215c844a0f', gender: 'male', accent: 'Australian', description: 'Warm and welcoming', volumeModifier: 1, tags: ['warm', 'welcoming'] },
    { id: '9cab115a-e345-4985-9d1d-462d6bc70b15', gender: 'male', accent: 'American', description: 'Commanding and twangy', volumeModifier: 1, tags: ['commanding', 'twangy'] },
    { id: '49f1fc7c-6718-4f0d-908d-2b0a4068f2ce', gender: 'male', accent: 'Australian', description: 'Confident and playful', volumeModifier: 1, tags: ['confident', 'playful'] },

    /* Another batch to add:
    -anniegulie - Female - German - 1a2511b4-4e46-48ed-b74d-02def9b196f2 - Light and confident
    -critterjitterisback - Female - American - f184b6b1-6c9c-4fca-b25c-91899f59aa81 - Pouty and youthful
    -IcyKaleidoscope85 - Female - German - c2ffaf44-10b4-411e-a1bb-e85e87058f40 - Professional and confident 
    -ravenvo_ - Female - Australian - d94c3f6e-cda3-4750-b2a7-afdad61941b2 - Warm and loving
    -arachnya - Female - American - 9e370917-9964-42b5-9d0b-5a8adfef1955 - Playful and ditzy
    -miss_lizzie - Female - American - b52d6608-66eb-4daa-87cb-541b0a63d830 - Bratty and Nasal
    -ReadByRanae - Female - American - 4d440d36-105a-4cb3-a836-a008c9fb5f0e - Rich and sassy
    -lumitooni - Female - American - 171ecd2a-c4d4-4a4e-99bb-43eff6deeb9c - Sharp and twangy
    -jesseTheVA - Female - Scottish - efd80f23-39dc-4d81-8030-66c72951dc54 - Warm and playful
    -CraftJustin64 - Male - German - 6a6cb9c6-f41f-492b-a9f2-49f1188949a7 - Soft and kind
    -JinxieRay - Female - Australian - fc734b40-bf22-4c0a-b926-a5fbd5b85aa0 - Bright and nerdy
    -LucieCannons - Female - Australian - 81972ea2-42c5-40b4-826d-a29d338f430e - Bright and youthful
    -erisserenity1 - Female - American - a97ec94e-84a6-4413-aee5-f5ce411089ae - Sarcastic and twangy
    -erisserenity2 - Female - American - 7397e640-fbc7-4ecf-9508-cb11f3662d99 - Bubbly and nervous
    -VauxiBox - Female - British - 37cafa09-cdaf-4d0a-8cee-d81dc580617d - Mature and predatory
    -Astrojade - Female - American - ce6c77dc-10bb-4872-a209-905548885a2b - Soft and nervous - needs a boost
    -NDW242 - Male - American - 8ddffc90-2eaf-4df9-a3e4-2a34301107b9 - Low and twangy
    -VanitysLair - Female - French - dfceb7ed-1dce-450f-8512-963f369e37d4 - Confident and playful
    -YourPersonalPrince-VA - Male - Australian - 61cb21e2-bb49-4a9b-a4c8-b2215c844a0f - Warm and welcoming
    -AdamRileyVO - Male - American - 9cab115a-e345-4985-9d1d-462d6bc70b15 - Commanding and twangy
    -Alot-of-axolotl - Male - Australian - 49f1fc7c-6718-4f0d-908d-2b0a4068f2ce - Confident and playful*/
];

export const getActorVoice = (voiceId: string | undefined): ActorVoice | undefined =>
    voiceId ? ACTOR_VOICES.find(voice => voice.id === voiceId) : undefined;

export const formatActorVoiceLabel = (voice: ActorVoice): string =>
    `${ACTOR_VOICE_GENDER_LABELS[voice.gender]} - ${voice.accent} - ${voice.description}`;

// Inherent per-voice loudness correction, applied when playing that voice.
export const getActorVoiceVolume = (voiceId: string | undefined): number => getActorVoice(voiceId)?.volumeModifier ?? 1;
