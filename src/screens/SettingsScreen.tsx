import { FC, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CustomSetting, SaveType, Stage } from '../Stage';
import { GlassPanel, Title, Button, ColorPickerInput, TextInput } from './UiComponents';
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
    betaMode: boolean;
    language: string;
}

const resolveActiveCustomSettings = (stageInstance: Stage): CustomSetting[] => {
    const saveSettings = stageInstance.getSave()?.agendaConfig?.settings || [];
    if (saveSettings.length > 0) {
        return saveSettings;
    }

    return stageInstance.getConfiguration()?.settings || [];
};

const buildSelectedCustomSettings = (
    settings: CustomSetting[],
    preferredSelections: { [key: string]: string },
): { [key: string]: string } => {
    const nextSelectedSettings: { [key: string]: string } = {};

    settings.forEach((setting) => {
        const optionNames = Object.keys(setting.options || {});
        if (optionNames.length === 0) {
            return;
        }

        const preferred = preferredSelections[setting.title];
        nextSelectedSettings[setting.title] = preferred && optionNames.includes(preferred)
            ? preferred
            : optionNames[0];
    });

    return nextSelectedSettings;
};

const ensureAgendaConfig = (saveData: SaveType, stageInstance: Stage) => {
    if (saveData.agendaConfig) {
        return;
    }

    const configuration = stageInstance.getConfiguration();
    saveData.agendaConfig = {
        title: configuration.title || 'Agenda VN',
        titleImageUrl: configuration.titleImageUrl || '',
        titleImagePrompt: configuration.titleImagePrompt || '',
        startingDate: configuration.startingDate,
        context: configuration.context || [],
        settings: configuration.settings || [],
        selectedSettings: {},
        actorStats: configuration.actorStats || [],
    };
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
        betaMode: (stageInstance.getSave()?.betaMode ?? false),
        language: stageInstance.getSave()?.language || 'English',
    });

    const [customSettings] = useState<CustomSetting[]>(() => resolveActiveCustomSettings(stageInstance));
    const [selectedCustomSettings, setSelectedCustomSettings] = useState<{ [key: string]: string }>(() => {
        const saveSelectedSettings = stageInstance.getSave()?.agendaConfig?.selectedSettings || {};
        return buildSelectedCustomSettings(resolveActiveCustomSettings(stageInstance), saveSelectedSettings);
    });

    const [languageSuggestions, setLanguageSuggestions] = useState<string[]>([]);
    const [showLanguageSuggestions, setShowLanguageSuggestions] = useState(false);
    const resolvedPlayerThemeColor = resolvePlayerThemeColor(settings.playerColor);

    const handleSave = () => {
        console.log('Saving settings:', settings);
        const playerThemeColor = resolvePlayerThemeColor(settings.playerColor);
        const resolvedSelectedCustomSettings = buildSelectedCustomSettings(customSettings, selectedCustomSettings);
        
        if (isNewGame) {
            console.log('Starting new game with settings');
            stageInstance.startNewGame({
                name: settings.playerName,
                themeColor: playerThemeColor,
                data: {
                    textToSpeech: settings.textToSpeech,
                    disableImpersonation: settings.disableImpersonation,
                    betaMode: settings.betaMode,
                    language: settings.language,
                },
                personality: settings.playerDescription,
            });

            const newSave = stageInstance.getSave();
            ensureAgendaConfig(newSave, stageInstance);
            newSave.agendaConfig!.selectedSettings = resolvedSelectedCustomSettings;
            setScreenType(ScreenType.LOADING);
        } else {
            console.log('Updating settings');
            const saveData = stageInstance.getSave();

            saveData.textToSpeech = settings.textToSpeech;
            saveData.disableImpersonation = settings.disableImpersonation;
            saveData.betaMode = settings.betaMode;
            saveData.language = settings.language;
            ensureAgendaConfig(saveData, stageInstance);
            saveData.agendaConfig!.selectedSettings = resolvedSelectedCustomSettings;

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

    const handleCustomSettingChange = (settingTitle: string, optionName: string) => {
        setSelectedCustomSettings(prev => ({
            ...prev,
            [settingTitle]: optionName,
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
                    background: 'rgba(10, 14, 24, 0.84)',
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
                                    color: 'rgba(138, 176, 204, 0.75)',
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
                                            color: '#b9d2e3',
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
                                            color: '#b9d2e3',
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
                                        color: '#b9d2e3',
                                        fontSize: '14px',
                                        fontWeight: 'bold',
                                        marginBottom: '8px',
                                    }}
                                >
                                    Player Description
                                </label>
                                <textarea
                                    id="player-description"
                                    className="input-base"
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

                            {customSettings.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <label
                                        style={{
                                            display: 'block',
                                            color: '#b9d2e3',
                                            fontSize: '14px',
                                            fontWeight: 'bold',
                                            marginBottom: '4px'
                                        }}
                                    >
                                        Scenario Settings
                                    </label>

                                    {customSettings.map((setting) => {
                                        const optionNames = Object.keys(setting.options || {});
                                        const selectedOptionName = buildSelectedCustomSettings(
                                            [setting],
                                            selectedCustomSettings,
                                        )[setting.title] || '';
                                        const selectedOption = setting.options?.[selectedOptionName];

                                        return (
                                            <div
                                                key={setting.title}
                                                style={{
                                                    padding: '12px',
                                                    borderRadius: '8px',
                                                    background: 'rgba(28, 34, 52, 0.8)',
                                                    border: '2px solid rgba(138, 176, 204, 0.34)',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '8px',
                                                }}
                                            >
                                                <div style={{ color: '#edf2f2', fontSize: '14px', fontWeight: 700 }}>
                                                    {setting.title}
                                                </div>
                                                <div style={{ color: 'rgba(185, 210, 227, 0.8)', fontSize: '13px' }}>
                                                    {setting.description}
                                                </div>

                                                {optionNames.length > 0 ? (
                                                    <>
                                                        <select
                                                            className="input-base"
                                                            value={selectedOptionName}
                                                            onChange={(e) => handleCustomSettingChange(setting.title, e.target.value)}
                                                            style={{ fontSize: '13px' }}
                                                        >
                                                            {optionNames.map((optionName) => (
                                                                <option key={optionName} value={optionName}>
                                                                    {optionName}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {selectedOption?.title && (
                                                            <div style={{ color: 'rgba(237, 242, 242, 0.72)', fontSize: '12px' }}>
                                                                {selectedOption.title}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div style={{ color: 'rgba(237, 242, 242, 0.72)', fontSize: '12px' }}>
                                                        No options available for this setting.
                                                    </div>
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
                                        color: '#b9d2e3',
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
                                                ? 'rgba(137, 205, 135, 0.18)'
                                                : 'rgba(28, 34, 52, 0.8)',
                                            border: settings.textToSpeech
                                                ? '2px solid rgba(137, 205, 135, 0.5)'
                                                : '2px solid rgba(138, 176, 204, 0.34)',
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
                                                background: settings.textToSpeech ? '#89cd87' : 'rgba(255, 255, 255, 0.1)',
                                                border: '2px solid ' + (settings.textToSpeech ? '#89cd87' : 'rgba(138, 176, 204, 0.35)'),
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
                                                        color: '#FFFFFF',
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
                                                color: settings.textToSpeech ? '#89cd87' : 'rgba(237, 242, 242, 0.72)',
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
                                                ? 'rgba(137, 205, 135, 0.18)'
                                                : 'rgba(28, 34, 52, 0.8)',
                                            border: settings.disableImpersonation
                                                ? '2px solid rgba(137, 205, 135, 0.5)'
                                                : '2px solid rgba(138, 176, 204, 0.34)',
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
                                                background: settings.disableImpersonation ? '#89cd87' : 'rgba(255, 255, 255, 0.1)',
                                                border: '2px solid ' + (settings.disableImpersonation ? '#89cd87' : 'rgba(138, 176, 204, 0.35)'),
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
                                                        color: '#FFFFFF',
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
                                                color: settings.disableImpersonation ? '#89cd87' : 'rgba(237, 242, 242, 0.72)',
                                                fontSize: '13px',
                                                fontWeight: settings.disableImpersonation ? 'bold' : 'normal',
                                            }}
                                        >
                                            Disable Impersonation
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
                                                ? 'rgba(205, 169, 89, 0.18)'
                                                : 'rgba(28, 34, 52, 0.8)',
                                            border: settings.betaMode
                                                ? '2px solid rgba(205, 169, 89, 0.5)'
                                                : '2px solid rgba(138, 176, 204, 0.34)',
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
                                                background: settings.betaMode ? '#cda959' : 'rgba(255, 255, 255, 0.1)',
                                                border: '2px solid ' + (settings.betaMode ? '#cda959' : 'rgba(138, 176, 204, 0.35)'),
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
                                                        color: '#FFFFFF',
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
                                                color: settings.betaMode ? '#cda959' : 'rgba(237, 242, 242, 0.72)',
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
                                                color: '#b9d2e3',
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
                                                            background: 'rgba(26, 32, 49, 0.97)',
                                                            border: '2px solid rgba(138, 176, 204, 0.5)',
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
                                                                    color: 'rgba(255, 255, 255, 0.8)',
                                                                    fontSize: '13px',
                                                                    transition: 'all 0.15s ease',
                                                                    borderBottom: index < languageSuggestions.length - 1 
                                                                        ? '1px solid rgba(138, 176, 204, 0.14)' 
                                                                        : 'none',
                                                                }}
                                                                onMouseEnter={(e) => {
                                                                    e.currentTarget.style.background = 'rgba(138, 176, 204, 0.17)';
                                                                    e.currentTarget.style.color = '#8ab0cc';
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                    e.currentTarget.style.background = 'transparent';
                                                                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
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
