export enum Emotion {
    neutral = 'neutral',
    approval = 'approval', // admiration, amusement
    anger = 'anger',
    confusion = 'confusion',
    desire = 'desire',
    disappointment = 'disappointment', // annoyance, disapproval
    disgust = 'disgust',
    embarrassment = 'embarrassment',
    ecstasy = 'ecstasy',
    exhaustion = 'exhaustion',
    fear = 'fear', // surprised (unpleasant)
    grief = 'grief',
    guilt = 'guilt', // remorse
    injury = 'injury',
    intrigue = 'intrigue', // curiosity
    joy = 'joy',
    kindness = 'kindness', // caring, gratitude
    love = 'love',
    mischief = 'mischief', // brattiness
    nervousness = 'nervousness',
    pride = 'pride',
    sadness = 'sadness',
    wonder = 'wonder', // realization, optimism, excitement, surprised (pleasant)
}

// Map these emotions to base emotions
// teasing = 

export const EMOTION_SYNONYMS: {[key in Emotion]: string[]} = {
    neutral: ['calm', 'placid', 'serene', 'tranquil', 'stoic', 'neutrality', 'composed', 'composure', 'unemotional', 'impassive', 'impassivity', 'detached', 'detachment',
        'indifferent', 'indifference', 'apathy', 'dispassionate', 'dispassion', 'unaffected', 'unaffectedness'],
    approval: ['content', 'amusement', 'amused', 'pleased', 'appreciative', 'appreciation', 'satisfaction', 'satisfied', 'enjoyment', 'enjoying', 'content', 
        'contentedness', 'contentment', 'cheerfulness', 'cheerful'],
    anger: ['angry', 'furious', 'fury', 'enraged', 'livid', 'wrath', 'wrathful', 'frustration', 'ire', 'rage'],
    confusion: ['confused', 'puzzled', 'baffled', 'stunned', 'confounded', 'perplexed', 'bewilderment', 'perplexity'],
    desire: ['seductive', 'sexy', 'desirous', 'longing', 'lust', 'lusting', 'lusty', 'yearning', 'passion', 'passionate',
        'arousal', 'aroused', 'saucy', 'provocative', 'provocation', 'temptation', 'tempting', 'alluring', 'enticing'],
    disappointment: ['annoyed', 'annoyance', 'irritation', 'irritated', 'disapproval', 'dismayed', 'suspicious', 'suspicion', 'distrust', 'resentment',
        'defensiveness', 'mockery', 'mocking', 'skepticism', 'skeptical', 'disbelief', 'restless', 'restlessness'],
    disgust: ['disgusted', 'grossed_out', 'sickened', 'grossed out', 'sick', 'revolted', 'revulsion', 'disdain', 'contempt', 'rivulsion', 'irritation'],
    embarrassment: ['embarrassed', 'shame', 'ashamed', 'sheepish', 'chagrin', 'mortification', 'abashment', 'selfconsciousness', 'self-consciousness', 'shy', 'shyness', 
        'bashfulness', 'bashful', 'flustered', 'fluster', 'awkwardness', 'awkward', 'discomfiture', 'discomfited', 'discomfort'],
    ecstasy: ['ecstasy', 'ecstatic', 'orgasm', 'orgasmic', 'finishing', 'coming', 'euphoria', 'euphoric', 'mania', 'manic'],
    exhaustion: ['exhausted', 'tired', 'weary', 'fatigued', 'drained', 'burned out', 'burnt out', 'worn out', 'sleepy', 'sleepiness', 'exhaustion', 'fatigue', 'weariness', 'sapped', 'enervation', 'enervated'],
    fear: ['shocked', 'terrified', 'terror', 'panic', 'alarm', 'alarmed', 'frightened', 'horror', 'horrified', 'shock'],
    grief: ['sad', 'upset', 'depressed', 'depression', 'sobbing', 'desperation', 'sorrow', 'despair'],
    guilt: ['remorseful', 'remorse', 'repentant', 'regretful', 'regretting', 'guiltridden', 'penitent', 'penitence', 'concern', 'pensive', 'pensiveness', 'resignation', 'resigned', 'reflective', 'reflection', 'solemn', 'solemness', 'solemnity'],
    injury: ['injured', 'wounded', 'hurt', 'pain', 'pained', 'injury', 'wound', 'harmed', 'bruised', 'shaken'],
    intrigue: ['intrigued', 'curious', 'curiosity', 'interest', 'absorbed', 'absorbing', 'engrossed', 'engrossing', 'suspicious', 'suspecting', 'vigilant', 'watchful', 'vigilance', 'alert', 'thoughtful'],
    joy: ['happy', 'happiness', 'joyful', 'joyfulness', 'thrilled', 'delighted', 'elated', 'jubilant', 'elation', 'humor', 'playfulness', 'playful', 'fun', 'delight', 'enthusiasm', 'pleasure',
        'cheer', 'cheery', 'jovial', 'joviality', 'wry humor', 'wry', 'humor', 'humorous', 'glee', 'gleeful', 'giddy'],
    kindness: ['grateful', 'caring', 'thankful', 'sweet', 'affectionate', 'tender', 'tenderness', 'care', 'fondness', 'warm', 'warmth', 'soft', 'softness', 'trust',
        'compassion', 'compassionate', 'encouragement', 'encouraging', 'moved', 'thoughtful', 'patient', 'patience', 'forbearing'],
    love: ['lovestruck', 'adoration', 'adoring', 'devotion', 'devoted', 'infatuated', 'infatuation', 'romantic', 'romance', 'affection', 'affectionate'],
    mischief: ['mischief', 'mischievous', 'mischievousness', 'sly', 'scheming', 'bratty', 'brattiness', 'naughty', 'naughtiness', 'trickery', 'trickster', 'tricky', 'tricking',
        'prank', 'prankster', 'pranking', 'teasing', 'tease', 'impish', 'impishness'],
    nervousness: ['nervous', 'anxious', 'uncertain', 'jittery', 'uneasy', 'unease', 'worry', 'worrying', 'vulnerability', 'vulnerable',
        'reluctance', 'reluctant', 'hesitance', 'anxiety', 'caution', 'cautious', 'apprehension', 'guarded'],
    pride: ['proud', 'pridefulness', 'challenge', 'arrogance', 'arrogant', 'self-confidence', 'triumph', 'triumphant', 'confidence', 'confident', 'ego', 'egotism', 
        'egotistical', 'smug', 'smugness', 'determination', 'determined', 'collected', 'cool', 'composed', 'composure', 'focus', 'composed'],
    sadness: ['sad', 'upset', 'distress', 'sorrow', 'unhappiness', 'melancholy', 'gloom', 'dejection', 'dejected', 'wistful', 'wistfulness'],
    wonder: ['excited', 'optimistic', 'surprised', 'surprise', 'realization', 'excitement', 'relief', 'hope', 'fascinated', 'fascination', 'awe', 'awe-struck',
        'amazement', 'amazed', 'inspired', 'inspiration', 'anticipation', 'admiration', 'reverence', 'eager', 'eagerness'],
}

// Mapping from synonym to Emotion, built from EMOTION_SYNONYMS
export const EMOTION_MAPPING: {[key: string]: Emotion} = Object.entries(EMOTION_SYNONYMS).reduce((acc, [emotion, synonyms]) => {
    synonyms.forEach((synonym) => {
        acc[synonym] = emotion as Emotion;
    });
    return acc;
}, {} as {[key: string]: Emotion});

export type EmotionPromptMap = {[emotion in Emotion]: string};

// Full image-edit prompt used by Actor.generateEmotionImage.
export const EMOTION_PROMPTS: EmotionPromptMap = {
    neutral: 'a typical expression and pose for this character',
    approval: 'approving or pleased',
    anger: 'markedly aggravated or hostile',
    confusion: 'stunned, baffled, or perplexed',
    desire: 'coy, flirty, or overtly alluring',
    disappointment: 'unhappy, annoyed, or deflated',
    disgust: 'disgusted, grossed-out, or repulsed',
    embarrassment: 'embarrassed, awkward, or self-conscious',
    ecstasy: 'euphoric, orgasmic, or inappropriately lusty',
    exhaustion: 'exhausted, weary, or slumped',
    fear: 'shocked, terrified, or defensive',
    grief: 'extremely distressed, sobbing, or mournful',
    guilt: 'remorseful, apologetic, or contrite',
    injury: 'pained, hurt, or bruised',
    intrigue: 'curious, intrigued, or attentive',
    joy: 'happy, smiling, or joyful',
    kindness: 'kind, grateful, or caring',
    love: 'adoring, lovestruck, or affectionate',
    mischief: 'bratty, naughty, or up to no good',
    nervousness: 'anxious, uncertain, or uneasy',
    pride: 'proud, confident, or triumphant',
    sadness: 'sad, upset, or dejected',
    wonder: 'inspired, wondrous, or amazed',
};

export type EmotionPack = {[key: string]: string};
