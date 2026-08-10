import { FC, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ActorStat, SaveType, Stage } from '../Stage';
import { GlassPanel, Title, Button, ColorPickerInput, TextArea, TextInput } from './UiComponents';
import { Close, Forum, VoiceChat } from '@mui/icons-material';
import { useTooltip } from './TooltipContext';
import { ScreenType } from './BaseScreen';

export const DEFAULT_PLAYER_THEME_COLOR = '#66bbee';

const isValidHexColor = (value: string): boolean => /^#[0-9a-f]{6}$/i.test(value.trim());

const resolvePlayerThemeColor = (value: string): string => (
    isValidHexColor(value) ? value : DEFAULT_PLAYER_THEME_COLOR
);

interface SettingsScreenProps {
    stage: () => Stage;
    onCancel: () => void;
    onConfirm: () => void;
    isNewGame?: boolean;
    setScreenType: (type: ScreenType) => void;
}

interface SettingsData {
    playerName: string;
    playerDescription: string;
    playerColor: string;
    textToSpeech: boolean;
    disableImpersonation: boolean;
    disableFontEffects: boolean;
    betaMode: boolean;
    language: string;
}

const resolveActivePlayerStats = (stageInstance: Stage): ActorStat[] => {

    return stageInstance.getConfiguration()?.playerStats || [];
};

const resolveStatDefaultValue = (stat: ActorStat): number | string => {
    if (stat.displayType === 'option') {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        if (typeof stat.default === 'string' && optionNames.includes(stat.default)) {
            return stat.default;
        }
        return optionNames[0] || '';
    }

    if (stat.displayType === 'text') {
        return typeof stat.default === 'string' ? stat.default : '';
    }

    return Number.isFinite(stat.default) ? Number(stat.default) : 0;
};

const normalizePlayerStatValue = (value: unknown, stat: ActorStat): number | string => {
    if (stat.displayType === 'option') {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        if (typeof value === 'string' && optionNames.includes(value)) {
            return value;
        }
        return resolveStatDefaultValue(stat);
    }

    if (stat.displayType === 'text') {
        if (typeof value === 'string') {
            return value;
        }
        return resolveStatDefaultValue(stat);
    }

    let resolved = Number.isFinite(value) ? Number(value) : Number(resolveStatDefaultValue(stat)) || 0;
    if (typeof stat.min === 'number') {
        resolved = Math.max(stat.min, resolved);
    }
    if (typeof stat.max === 'number') {
        resolved = Math.min(stat.max, resolved);
    }
    return resolved;
};

const buildPlayerStatValues = (
    stats: ActorStat[],
    preferredValues: { [key: string]: number | string },
): { [key: string]: number | string } => {
    const nextValues: { [key: string]: number | string } = {};

    stats.forEach((stat) => {
        const statName = (stat.name || '').trim();
        if (!statName) {
            return;
        }

        nextValues[statName] = normalizePlayerStatValue(preferredValues[statName], stat);
    });

    return nextValues;
};

export const SettingsScreen: FC<SettingsScreenProps> = ({ stage, onCancel, onConfirm, isNewGame = false, setScreenType }) => {
    const { setTooltip, clearTooltip } = useTooltip();
    const stageInstance = stage();

    // Common languages for autocomplete
    const commonLanguages = [
        'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Russian', 'Japanese',
        'Korean', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Arabic', 'Hindi', 'Bengali',
        'Urdu', 'Indonesian', 'Turkish', 'Vietnamese', 'Thai', 'Polish', 'Dutch', 'Swedish',
        'Norwegian', 'Danish', 'Finnish', 'Greek', 'Hebrew', 'Czech', 'Hungarian', 'Romanian',
        'Ukrainian', 'Catalan', 'Serbian', 'Croatian', 'Bulgarian', 'Slovak', 'Lithuanian',
        'Latvian', 'Estonian', 'Slovenian', 'Malay', 'Tagalog', 'Swahili', 'Afrikaans', 'Catalan'
    ];

    // Load existing settings or use defaults
    const [settings, setSettings] = useState<SettingsData>({
        playerName: stageInstance.getPlayerActor()?.name || stageInstance.primaryUser?.name || 'Player',
        playerDescription: stageInstance.getPlayerActor()?.profile || stageInstance.primaryUser?.chatProfile || 'An enigmatic individual.',
        playerColor: resolvePlayerThemeColor(stageInstance.getPlayerActor()?.themeColor || ''),
        textToSpeech: (stageInstance.getSave()?.textToSpeech ?? true),
        disableImpersonation: (stageInstance.getSave()?.disableImpersonation ?? false),
        disableFontEffects: (stageInstance.getSave()?.disableFontEffects ?? false),
        betaMode: (stageInstance.getSave()?.betaMode ?? false),
        language: stageInstance.getSave()?.language || 'English',
    });

    const [playerStats] = useState<ActorStat[]>(() => resolveActivePlayerStats(stageInstance));
    const [playerStatValues, setPlayerStatValues] = useState<{ [key: string]: number | string }>(() => {
        const savePlayerStatValues = stageInstance.getSave()?.playerStatValues || {};
        return buildPlayerStatValues(resolveActivePlayerStats(stageInstance), savePlayerStatValues);
    });

    const [languageSuggestions, setLanguageSuggestions] = useState<string[]>([]);
    const [showLanguageSuggestions, setShowLanguageSuggestions] = useState(false);
    const resolvedPlayerThemeColor = resolvePlayerThemeColor(settings.playerColor);

    const handleSave = () => {
        console.log('Saving settings:', settings);
        const playerThemeColor = resolvePlayerThemeColor(settings.playerColor);
        const resolvedPlayerStatValues = buildPlayerStatValues(playerStats, playerStatValues);
        
        if (isNewGame) {
            console.log('Starting new game with settings');
            stageInstance.startNewGame({
                name: settings.playerName,
                themeColor: playerThemeColor,
                data: {
                    textToSpeech: settings.textToSpeech,
                    disableImpersonation: settings.disableImpersonation,
                    disableFontEffects: settings.disableFontEffects,
                    betaMode: settings.betaMode,
                    language: settings.language,
                },
                personality: settings.playerDescription,
            });

            const newSave = stageInstance.getSave();
            newSave.playerStatValues = resolvedPlayerStatValues;
            setScreenType(ScreenType.LOADING);
        } else {
            console.log('Updating settings');
            const saveData = stageInstance.getSave();

            saveData.textToSpeech = settings.textToSpeech;
            saveData.disableImpersonation = settings.disableImpersonation;
            saveData.disableFontEffects = settings.disableFontEffects;
            saveData.betaMode = settings.betaMode;
            saveData.language = settings.language;
            saveData.playerStatValues = resolvedPlayerStatValues;

            const player = stageInstance.getPlayerActor();
            player.name = settings.playerName;
            player.profile = settings.playerDescription;
            player.themeColor = playerThemeColor;
        }

        stageInstance.saveGame();
        onConfirm();
    };

    const handleInputChange = (field: keyof SettingsData, value: string) => {
        setSettings(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handlePlayerColorChange = (value: string) => {
        setSettings(prev => ({
            ...prev,
            playerColor: value,
        }));
    };

    const handleLanguageChange = (value: string) => {
        setSettings(prev => ({ ...prev, language: value }));
        
        // Filter and update suggestions
        if (value.trim()) {
            const filtered = commonLanguages.filter(lang => 
                lang.toLowerCase().includes(value.toLowerCase())
            ).slice(0, 8); // Limit to 8 suggestions
            setLanguageSuggestions(filtered);
            setShowLanguageSuggestions(filtered.length > 0);
        } else {
            setLanguageSuggestions([]);
            setShowLanguageSuggestions(false);
        }
    };

    const selectLanguage = (language: string) => {
        setSettings(prev => ({ ...prev, language }));
        setShowLanguageSuggestions(false);
    };

    const handlePlayerStatValueChange = (stat: ActorStat, nextValue: string | number) => {
        const statName = (stat.name || '').trim();
        if (!statName) {
            return;
        }

        const normalized = normalizePlayerStatValue(nextValue, stat);
        setPlayerStatValues(prev => ({
            ...prev,
            [statName]: normalized,
        }));
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'color-mix(in srgb, var(--agenda-surface-base) 76%, #000)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '20px',
                }}
                onClick={(e) => {
                    // Close if clicking backdrop (but not during new game setup)
                    // Don't close if user is selecting text
                    const selection = window.getSelection();
                    const hasSelection = selection && selection.toString().length > 0;
                    
                    if (e.target === e.currentTarget && !isNewGame && !hasSelection) {
                        onCancel();
                    }
                }}
            >
                <motion.div
                    initial={{ scale: 0.9, y: 50 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 50 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ position: 'relative', zIndex: 10 }}
                >
                    <GlassPanel 
                        variant="bright"
                        style={{
                            width: '80vw',
                            maxHeight: '85vh',
                            overflow: 'auto',
                            position: 'relative',
                            padding: '30px',
                        }}
                    >
                        {/* Header with close button */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '20px'
                        }}>
                            <Title variant="glow" style={{ fontSize: '24px', margin: 0 }}>
                                {isNewGame ? 'New Game Setup' : 'Settings'}
                            </Title>
                            <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={onCancel}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'color-mix(in srgb, var(--agenda-accent-primary) 75%, transparent)',
                                    cursor: 'pointer',
                                    fontSize: '24px',
                                    padding: '5px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <Close />
                            </motion.button>
                        </div>

                        {/* Settings Form */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* Player Name + Color */}
                            <div
                                style={{
                                    display: 'flex',
                                    gap: '12px',
                                    alignItems: 'flex-end',
                                    flexWrap: 'wrap',
                                }}
                            >
                                <div style={{ flex: '1 1 280px', minWidth: '220px' }}>
                                    <label 
                                        htmlFor="player-name"
                                        style={{
                                            display: 'block',
                                            color: 'var(--agenda-text-muted)',
                                            fontSize: '14px',
                                            fontWeight: 'bold',
                                            marginBottom: '8px',
                                        }}
                                    >
                                        Player Name
                                    </label>
                                    <TextInput
                                        id="player-name"
                                        fullWidth
                                        value={settings.playerName}
                                        onChange={(e) => handleInputChange('playerName', e.target.value)}
                                        placeholder="Enter your name"
                                        style={{ fontSize: '16px' }}
                                    />
                                </div>

                                <div style={{ flex: '0 1 220px', minWidth: '180px' }}>
                                    <label
                                        style={{
                                            display: 'block',
                                            color: 'var(--agenda-text-muted)',
                                            fontSize: '14px',
                                            fontWeight: 'bold',
                                            marginBottom: '8px',
                                        }}
                                    >
                                        Player Color
                                    </label>
                                    <ColorPickerInput
                                        value={resolvedPlayerThemeColor}
                                        onChange={handlePlayerColorChange}
                                        placeholder="#RRGGBB"
                                        popoverTitle="Choose player color"
                                        inputStyle={{ fontSize: '13px' }}
                                    />
                                </div>
                            </div>

                            {/* Player Description */}
                            <div>
                                <label 
                                    htmlFor="player-description"
                                    style={{
                                        display: 'block',
                                        color: 'var(--agenda-text-muted)',
                                        fontSize: '14px',
                                        fontWeight: 'bold',
                                        marginBottom: '8px',
                                    }}
                                >
                                    Player Description
                                </label>
                                <TextArea
                                    id="player-description"
                                    value={settings.playerDescription}
                                    onChange={(e) => handleInputChange('playerDescription', e.target.value)}
                                    placeholder="Describe your character..."
                                    rows={4}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        fontSize: '14px',
                                        resize: 'vertical',
                                    }}
                                />
                            </div>

                            {playerStats.filter((stat) => stat.exposed).length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <label
                                        style={{
                                            display: 'block',
                                            color: 'var(--agenda-text-muted)',
                                            fontSize: '14px',
                                            fontWeight: 'bold',
                                            marginBottom: '4px'
                                        }}
                                    >
                                        Player Settings
                                    </label>

                                    {playerStats
                                        .filter((stat) => stat.exposed)
                                        .map((stat) => {
                                        const statName = (stat.name || '').trim();
                                        const selectedValue = normalizePlayerStatValue(playerStatValues[statName], stat);
                                        const optionEntries = stat.options || [];
                                        const isNumericDisplay = ['number', 'percentage', 'stars', 'letter grade'].includes(stat.displayType);

                                        return (
                                            <div
                                                key={statName}
                                                style={{
                                                    padding: '12px',
                                                    borderRadius: '8px',
                                                    background: 'color-mix(in srgb, var(--agenda-panel-surface) 86%, transparent)',
                                                    border: '2px solid var(--agenda-panel-border)',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '8px',
                                                }}
                                            >
                                                <div style={{ color: 'var(--agenda-text-primary)', fontSize: '14px', fontWeight: 700 }}>
                                                    {statName}
                                                </div>
                                                <div style={{ color: 'color-mix(in srgb, var(--agenda-text-muted) 80%, transparent)', fontSize: '13px' }}>
                                                    {stat.description}
                                                </div>

                                                {stat.displayType === 'option' && optionEntries.length > 0 && (
                                                    <select
                                                        className="input-base"
                                                        value={typeof selectedValue === 'string' ? selectedValue : ''}
                                                        onChange={(e) => handlePlayerStatValueChange(stat, e.target.value)}
                                                        style={{ fontSize: '13px' }}
                                                    >
                                                        {optionEntries.map((option, optionIndex) => (
                                                            <option key={`${statName}-option-${optionIndex}`} value={option.name}>
                                                                {option.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}

                                                {stat.displayType === 'option' && optionEntries.length === 0 && (
                                                    <div style={{ color: 'color-mix(in srgb, var(--agenda-text-primary) 72%, transparent)', fontSize: '12px' }}>
                                                        No options configured for this setting.
                                                    </div>
                                                )}

                                                {stat.displayType === 'text' && (
                                                    <TextArea
                                                        value={typeof selectedValue === 'string' ? selectedValue : ''}
                                                        onChange={(e) => handlePlayerStatValueChange(stat, e.target.value)}
                                                        rows={2}
                                                        style={{ width: '100%', resize: 'vertical', fontSize: '13px' }}
                                                    />
                                                )}

                                                {isNumericDisplay && (
                                                    <>
                                                        <TextInput
                                                            fullWidth
                                                            type="number"
                                                            value={String(selectedValue)}
                                                            onChange={(e) => handlePlayerStatValueChange(stat, Number(e.target.value) || 0)}
                                                            style={{ fontSize: '13px' }}
                                                        />
                                                        {(typeof stat.min === 'number' || typeof stat.max === 'number') && (
                                                            <div style={{ color: 'color-mix(in srgb, var(--agenda-text-primary) 72%, transparent)', fontSize: '12px' }}>
                                                                Range: {typeof stat.min === 'number' ? stat.min : '-inf'} to {typeof stat.max === 'number' ? stat.max : '+inf'}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Generation Settings */}
                            <div>
                                <label 
                                    style={{
                                        display: 'block',
                                        color: 'var(--agenda-text-muted)',
                                        fontSize: '14px',
                                        fontWeight: 'bold',
                                        marginBottom: '12px',
                                    }}
                                >
                                    Generation Settings
                                </label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {/* Text-to-Speech Toggle */}
                                    <motion.div
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.99 }}
                                        onClick={() => setSettings(prev => ({ ...prev, textToSpeech: !prev.textToSpeech }))}
                                        onMouseEnter={() => setTooltip('Disable Text-to-Speech to conserve credits.', VoiceChat)}
                                        onMouseLeave={clearTooltip}
                                        style={{
                                            padding: '12px',
                                            background: settings.textToSpeech
                                                ? 'color-mix(in srgb, var(--agenda-highlight) 18%, transparent)'
                                                : 'color-mix(in srgb, var(--agenda-panel-surface) 86%, transparent)',
                                            border: settings.textToSpeech
                                                ? '2px solid color-mix(in srgb, var(--agenda-highlight) 50%, transparent)'
                                                : '2px solid var(--agenda-panel-border)',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: '20px',
                                                height: '20px',
                                                borderRadius: '4px',
                                                background: settings.textToSpeech ? 'var(--agenda-highlight)' : 'color-mix(in srgb, var(--agenda-text-primary) 10%, transparent)',
                                                border: '2px solid ' + (settings.textToSpeech ? 'var(--agenda-highlight)' : 'color-mix(in srgb, var(--agenda-accent-primary) 35%, transparent)'),
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                                transition: 'all 0.2s ease',
                                            }}
                                        >
                                            {settings.textToSpeech && (
                                                <motion.span
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    style={{
                                                        color: 'var(--agenda-text-primary)',
                                                        fontSize: '14px',
                                                        fontWeight: 'bold',
                                                    }}
                                                >
                                                    ✓
                                                </motion.span>
                                            )}
                                        </div>
                                        <span
                                            style={{
                                                color: settings.textToSpeech ? 'var(--agenda-highlight)' : 'color-mix(in srgb, var(--agenda-text-primary) 72%, transparent)',
                                                fontSize: '13px',
                                                fontWeight: settings.textToSpeech ? 'bold' : 'normal',
                                            }}
                                        >
                                            Text-to-Speech
                                        </span>
                                    </motion.div>

                                    {/* Impersonation Toggle */}
                                    <motion.div
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.99 }}
                                        onClick={() => setSettings(prev => ({ ...prev, disableImpersonation: !prev.disableImpersonation }))}
                                        onMouseEnter={() => setTooltip('Prevent the game from incorporating your actions; this will reduce response sizes.', Forum)}
                                        onMouseLeave={clearTooltip}
                                        style={{
                                            padding: '12px',
                                            background: settings.disableImpersonation
                                                ? 'color-mix(in srgb, var(--agenda-highlight) 18%, transparent)'
                                                : 'color-mix(in srgb, var(--agenda-panel-surface) 86%, transparent)',
                                            border: settings.disableImpersonation
                                                ? '2px solid color-mix(in srgb, var(--agenda-highlight) 50%, transparent)'
                                                : '2px solid var(--agenda-panel-border)',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: '20px',
                                                height: '20px',
                                                borderRadius: '4px',
                                                background: settings.disableImpersonation ? 'var(--agenda-highlight)' : 'color-mix(in srgb, var(--agenda-text-primary) 10%, transparent)',
                                                border: '2px solid ' + (settings.disableImpersonation ? 'var(--agenda-highlight)' : 'color-mix(in srgb, var(--agenda-accent-primary) 35%, transparent)'),
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                                transition: 'all 0.2s ease',
                                            }}
                                        >
                                            {settings.disableImpersonation && (
                                                <motion.span
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    style={{
                                                        color: 'var(--agenda-text-primary)',
                                                        fontSize: '14px',
                                                        fontWeight: 'bold',
                                                    }}
                                                >
                                                    ✓
                                                </motion.span>
                                            )}
                                        </div>
                                        <span
                                            style={{
                                                color: settings.disableImpersonation ? 'var(--agenda-highlight)' : 'color-mix(in srgb, var(--agenda-text-primary) 72%, transparent)',
                                                fontSize: '13px',
                                                fontWeight: settings.disableImpersonation ? 'bold' : 'normal',
                                            }}
                                        >
                                            Disable Impersonation
                                        </span>
                                    </motion.div>

                                    {/* Disable Font Effects Toggle */}
                                    <motion.div
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.99 }}
                                        onClick={() => setSettings(prev => ({ ...prev, disableFontEffects: !prev.disableFontEffects }))}
                                        onMouseEnter={() => setTooltip('Prevent the game from applying font effects to text.', Forum)}
                                        onMouseLeave={clearTooltip}
                                        style={{
                                            padding: '12px',
                                            background: settings.disableFontEffects
                                                ? 'color-mix(in srgb, var(--agenda-highlight) 18%, transparent)'
                                                : 'color-mix(in srgb, var(--agenda-panel-surface) 86%, transparent)',
                                            border: settings.disableFontEffects
                                                ? '2px solid color-mix(in srgb, var(--agenda-highlight) 50%, transparent)'
                                                : '2px solid var(--agenda-panel-border)',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: '20px',
                                                height: '20px',
                                                borderRadius: '4px',
                                                background: settings.disableFontEffects ? 'var(--agenda-highlight)' : 'color-mix(in srgb, var(--agenda-text-primary) 10%, transparent)',
                                                border: '2px solid ' + (settings.disableFontEffects ? 'var(--agenda-highlight)' : 'color-mix(in srgb, var(--agenda-accent-primary) 35%, transparent)'),
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                                transition: 'all 0.2s ease',
                                            }}
                                        >
                                            {settings.disableFontEffects && (
                                                <motion.span
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    style={{
                                                        color: 'var(--agenda-text-primary)',
                                                        fontSize: '14px',
                                                        fontWeight: 'bold',
                                                    }}
                                                >
                                                    ✓
                                                </motion.span>
                                            )}
                                        </div>
                                        <span
                                            style={{
                                                color: settings.disableFontEffects ? 'var(--agenda-highlight)' : 'color-mix(in srgb, var(--agenda-text-primary) 72%, transparent)',
                                                fontSize: '13px',
                                                fontWeight: settings.disableFontEffects ? 'bold' : 'normal',
                                            }}
                                        >
                                            Disable Font Effects
                                        </span>
                                    </motion.div>

                                    {/* Beta Mode Toggle */}
                                    <motion.div
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.99 }}
                                        onClick={() => setSettings(prev => ({ ...prev, betaMode: !prev.betaMode }))}
                                        style={{
                                            padding: '12px',
                                            background: settings.betaMode
                                                ? 'color-mix(in srgb, var(--agenda-warning) 18%, transparent)'
                                                : 'color-mix(in srgb, var(--agenda-panel-surface) 86%, transparent)',
                                            border: settings.betaMode
                                                ? '2px solid color-mix(in srgb, var(--agenda-warning) 50%, transparent)'
                                                : '2px solid var(--agenda-panel-border)',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: '20px',
                                                height: '20px',
                                                borderRadius: '4px',
                                                background: settings.betaMode ? 'var(--agenda-warning)' : 'color-mix(in srgb, var(--agenda-text-primary) 10%, transparent)',
                                                border: '2px solid ' + (settings.betaMode ? 'var(--agenda-warning)' : 'color-mix(in srgb, var(--agenda-accent-primary) 35%, transparent)'),
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                                transition: 'all 0.2s ease',
                                            }}
                                        >
                                            {settings.betaMode && (
                                                <motion.span
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    style={{
                                                        color: 'var(--agenda-text-primary)',
                                                        fontSize: '14px',
                                                        fontWeight: 'bold',
                                                    }}
                                                >
                                                    ✓
                                                </motion.span>
                                            )}
                                        </div>
                                        <span
                                            style={{
                                                color: settings.betaMode ? 'var(--agenda-warning)' : 'color-mix(in srgb, var(--agenda-text-primary) 72%, transparent)',
                                                fontSize: '13px',
                                                fontWeight: settings.betaMode ? 'bold' : 'normal',
                                            }}
                                        >
                                            Beta Mode (Not Recommended)
                                        </span>
                                    </motion.div>

                                    {/* Language Input */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label
                                            htmlFor="language-input"
                                            style={{
                                                display: 'block',
                                                color: 'var(--agenda-text-muted)',
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                                marginBottom: '12px'
                                            }}
                                        >
                                            Language
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                            <TextInput
                                                id="language-input"
                                                fullWidth
                                                value={settings.language}
                                                onChange={(e) => handleLanguageChange(e.target.value)}
                                                onFocus={() => {
                                                    if (settings.language.trim()) {
                                                        handleLanguageChange(settings.language);
                                                    }
                                                }}
                                                onBlur={() => {
                                                    // Delay to allow clicking on suggestions
                                                    setTimeout(() => setShowLanguageSuggestions(false), 200);
                                                }}
                                                placeholder="Enter any language or style..."
                                                style={{ fontSize: '13px' }}
                                            />
                                            {/* Language suggestions dropdown */}
                                            <AnimatePresence>
                                                {showLanguageSuggestions && languageSuggestions.length > 0 && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -10 }}
                                                        transition={{ duration: 0.15 }}
                                                        style={{
                                                            position: 'absolute',
                                                            top: '100%',
                                                            left: 0,
                                                            right: 0,
                                                            marginTop: '4px',
                                                            background: 'color-mix(in srgb, var(--agenda-surface-base) 92%, var(--agenda-surface-raised))',
                                                            border: '2px solid color-mix(in srgb, var(--agenda-accent-primary) 50%, transparent)',
                                                            borderRadius: '8px',
                                                            overflow: 'hidden',
                                                            zIndex: 1000,
                                                            maxHeight: '200px',
                                                            overflowY: 'auto',
                                                        }}
                                                    >
                                                        {languageSuggestions.map((lang, index) => (
                                                            <motion.div
                                                                key={lang}
                                                                initial={{ opacity: 0, x: -10 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                transition={{ delay: index * 0.02 }}
                                                                onClick={() => selectLanguage(lang)}
                                                                onMouseDown={(e) => e.preventDefault()} // Prevent blur
                                                                style={{
                                                                    padding: '10px 12px',
                                                                    cursor: 'pointer',
                                                                    color: 'color-mix(in srgb, var(--agenda-text-primary) 80%, transparent)',
                                                                    fontSize: '13px',
                                                                    transition: 'all 0.15s ease',
                                                                    borderBottom: index < languageSuggestions.length - 1 
                                                                        ? '1px solid color-mix(in srgb, var(--agenda-accent-primary) 14%, transparent)' 
                                                                        : 'none',
                                                                }}
                                                                onMouseEnter={(e) => {
                                                                    e.currentTarget.style.background = 'color-mix(in srgb, var(--agenda-accent-primary) 17%, transparent)';
                                                                    e.currentTarget.style.color = 'var(--agenda-accent-primary)';
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                    e.currentTarget.style.background = 'transparent';
                                                                    e.currentTarget.style.color = 'color-mix(in srgb, var(--agenda-text-primary) 80%, transparent)';
                                                                }}
                                                            >
                                                                {lang}
                                                            </motion.div>
                                                        ))}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>

                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div 
                                style={{
                                    display: 'flex',
                                    gap: '12px',
                                    marginTop: '20px',
                                    justifyContent: 'flex-end',
                                }}
                            >
                                <Button
                                    variant="secondary"
                                    onClick={onCancel}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={handleSave}
                                >
                                    {isNewGame ? 'Start Game' : 'Save Settings'}
                                </Button>
                            </div>
                        </div>
                    </GlassPanel>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
