import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AutoAwesome, Image as ImageIcon } from '@mui/icons-material';
import { Stage } from '../Stage';
import { ActorStat, ActorStatType, ActorStatValue, isNumericDisplayType } from '../content/ActorStat';
import { Button, GlassPanel, TextArea, TextInput, Title } from '../components/UiComponents';
import { ImageUrlUploadField } from '../components/ImageUrlUploadField';
import { buildCreatorNotesHtml } from './CreatorNotesHtml';

interface GameManagementPanelProps {
    stage: () => Stage;
}

const cloneActorStat = (stat: ActorStat): ActorStat => ({
    name: stat.name,
    description: stat.description,
    guidance: stat.guidance,
    default: typeof stat.default === 'number' || typeof stat.default === 'string' ? stat.default : 0,
    type: stat.type,
    options: (stat.options || []).map((option) => ({
        name: option.name,
        description: option.description,
    })),
    min: Number.isFinite(stat.min) ? Number(stat.min) : undefined,
    max: Number.isFinite(stat.max) ? Number(stat.max) : undefined,
    setByPlayer: stat.setByPlayer === true || stat.exposed === true,
    exposed: stat.exposed === true,
});

const resolveStatDefaultValue = (stat: ActorStat): ActorStatValue => {
    if (stat.type === 'option') {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        if (typeof stat.default === 'string' && optionNames.includes(stat.default)) {
            return stat.default;
        }
        return optionNames[0] || '';
    }

    if (stat.type === 'text' || stat.type === 'location') {
        return typeof stat.default === 'string' ? stat.default : '';
    }

    if (stat.type === 'checkbox') {
        return typeof stat.default === 'boolean' ? stat.default : false;
    }

    return Number.isFinite(stat.default) ? Number(stat.default) : 0;
};

const normalizeStatValue = (value: unknown, stat: ActorStat): ActorStatValue => {
    if (stat.type === 'option') {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        if (typeof value === 'string' && optionNames.includes(value)) {
            return value;
        }
        return resolveStatDefaultValue(stat);
    }

    if (stat.type === 'text' || stat.type === 'location') {
        if (typeof value === 'string') {
            return value;
        }
        return resolveStatDefaultValue(stat);
    }

    if (stat.type === 'checkbox') {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            const lowered = value.trim().toLowerCase();
            if (lowered === 'true') return true;
            if (lowered === 'false') return false;
        }
        return (resolveStatDefaultValue(stat) as boolean);
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

const clampStatValue = (value: number, stat: ActorStat): number => {
    let resolved = Number.isFinite(value) ? Number(value) : Number(stat.default) || 0;
    if (typeof stat.min === 'number') {
        resolved = Math.max(stat.min, resolved);
    }
    if (typeof stat.max === 'number') {
        resolved = Math.min(stat.max, resolved);
    }
    return resolved;
};

export const GameManagementPanel: FC<GameManagementPanelProps> = ({ stage }) => {
    const stageInstance = stage();
    const save = stageInstance.getSave();
    const configuration = stageInstance.getConfiguration();
    const defaultBackgroundImageUrl = 'https://avatars.charhub.io/avatars/uploads/images/gallery/file/5c990a43-3e56-455f-ba19-ba487eec4972/1a9f6a36-676f-4dc1-85ae-29bf7a97e538.png';

    const [title, setTitle] = useState<string>(() => configuration.title || '');
    const [titleImageUrl, setTitleImageUrl] = useState<string>(() => configuration.titleImageUrl || '');
    const [titleImagePrompt, setTitleImagePrompt] = useState<string>(() => configuration.titleImagePrompt || '');
    const [isUploadingTitleImage, setIsUploadingTitleImage] = useState(false);
    const [isGeneratingTitleImage, setIsGeneratingTitleImage] = useState(false);
    const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>(() => configuration.backgroundImageUrl || '');
    const [backgroundImagePrompt, setBackgroundImagePrompt] = useState<string>(() => configuration.backgroundImagePrompt || '');
    const [isUploadingBackgroundImage, setIsUploadingBackgroundImage] = useState(false);
    const [isGeneratingBackgroundImage, setIsGeneratingBackgroundImage] = useState(false);
    const [startingDate, setStartingDate] = useState<string>(() => configuration.startingDate || '');
    const [artStyle, setArtStyle] = useState<string>(() => configuration.artStyle || '');
    const [playerStats, setPlayerStats] = useState<ActorStat[]>(() =>
        (configuration.playerStats || []).map(cloneActorStat),
    );
    const [actorStats, setActorStats] = useState<ActorStat[]>(() =>
        (configuration.actorStats || []).map(cloneActorStat),
    );
    const [playerStatValues, setPlayerStatValues] = useState<{ [key: string]: ActorStatValue }>(() => ({
        ...configuration.playerStatValues,
        ...save.playerStatValues,
    }));
    const [isCopyingConfigurationJson, setIsCopyingConfigurationJson] = useState(false);
    const [isCopyingCreatorNotesHtml, setIsCopyingCreatorNotesHtml] = useState(false);
    const autoSaveTimeoutRef = useRef<number | null>(null);
    const didMountRef = useRef(false);
    const saveGameConfigurationRef = useRef<() => void>(() => {});

    const fieldLabelStyle: React.CSSProperties = {
        display: 'block',
        color: 'var(--agenda-text-muted)',
        marginBottom: 0,
        fontSize: '13px',
        lineHeight: 1.1,
    };

    const inlineFieldStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: '120px minmax(0, 1fr)',
        gap: '10px',
        alignItems: 'center',
        marginBottom: 8,
    };

    const inlineFieldTopStyle: React.CSSProperties = {
        ...inlineFieldStyle,
        alignItems: 'start',
    };

    const compactChipLabelStyle: React.CSSProperties = {
        color: 'var(--agenda-text-muted)',
        fontSize: '12px',
        marginBottom: 4,
    };

    const validPlayerStatValues = useMemo(() => {
        const nextValues: { [key: string]: ActorStatValue } = {};

        playerStats.forEach((stat) => {
            const statName = (stat.name || '').trim();
            if (!statName) {
                return;
            }

            nextValues[statName] = normalizeStatValue(playerStatValues[statName], stat);
        });

        return nextValues;
    }, [playerStatValues, playerStats]);

    const activeActors = useMemo(() => {
        return Object.values(save.actors || {})
            .filter(actor => actor.id !== save.playerId)
            .filter(actor => actor.active !== false)
            .map(actor => JSON.parse(JSON.stringify(actor)));
    }, [save.actors, save.playerId]);

    const activeLocations = useMemo(() => {
        return Object.values(save.atlas || {})
            .filter(location => location.active !== false)
            .map(location => JSON.parse(JSON.stringify(location)));
    }, [save.atlas]);

    const activeMaps = useMemo(() => {
        return (save.maps || [])
            .filter(map => map.active !== false)
            .map(map => JSON.parse(JSON.stringify(map)));
    }, [save.maps]);

    const managedCalendarEvents = useMemo(() => {
        return stageInstance.getManagedCalendarEvents().map(event => JSON.parse(JSON.stringify(event)));
    }, [stageInstance, save.upcomingEvents, save.currentDate, save.currentTimeOfDay]);

    const portableGameConfiguration = useMemo(() => {
        return {
            title,
            titleImageUrl,
            titleImagePrompt,
            backgroundImageUrl,
            backgroundImagePrompt,
            startingDate,
            actorStats: actorStats.map(cloneActorStat),
            playerStats: playerStats.map(cloneActorStat),
            playerStatValues: { ...validPlayerStatValues },
            actors: activeActors,
            locations: activeLocations,
            maps: activeMaps,
            lorebook: (save.lorebook || []).map(entry => JSON.parse(JSON.stringify(entry))),
            calendarEvents: managedCalendarEvents,
            uiSettings: JSON.parse(JSON.stringify(stageInstance.getUiSettings())),
        };
    }, [
        activeActors,
        activeLocations,
        activeMaps,
        actorStats,
        backgroundImagePrompt,
        backgroundImageUrl,
        managedCalendarEvents,
        playerStats,
        validPlayerStatValues,
        save.lorebook,
        stageInstance,
        startingDate,
        title,
        titleImagePrompt,
        titleImageUrl,
    ]);

    const portableGameConfigurationJson = useMemo(
        () => JSON.stringify(portableGameConfiguration, null, 2),
        [portableGameConfiguration],
    );
    const creatorNotesHtml = useMemo(
        () => buildCreatorNotesHtml({
            stage: stageInstance,
            title,
            artStyle,
            backgroundImageUrl,
            titleImageUrl,
            activeActors,
            activeLocations,
        }),
        [activeActors, activeLocations, artStyle, backgroundImageUrl, stageInstance, title, titleImageUrl],
    );


    const copyConfigurationJson = useCallback(async () => {
        if (isCopyingConfigurationJson) {
            return;
        }

        setIsCopyingConfigurationJson(true);
        try {
            await navigator.clipboard.writeText(portableGameConfigurationJson);
            stageInstance.showPriorityMessage('Copied GameConfiguration JSON to clipboard.');
        } catch (error) {
            console.error('Failed to copy GameConfiguration JSON:', error);
            stageInstance.showPriorityMessage('Failed to copy GameConfiguration JSON. Check console for details.');
        } finally {
            setIsCopyingConfigurationJson(false);
        }
    }, [isCopyingConfigurationJson, portableGameConfigurationJson, stageInstance]);

    const copyCreatorNotesHtml = useCallback(async () => {
        if (isCopyingCreatorNotesHtml) {
            return;
        }

        setIsCopyingCreatorNotesHtml(true);
        try {
            await navigator.clipboard.writeText(creatorNotesHtml);
            stageInstance.showPriorityMessage('Copied creator notes HTML to clipboard.');
        } catch (error) {
            console.error('Failed to copy creator notes HTML:', error);
            stageInstance.showPriorityMessage('Failed to copy creator notes HTML. Check console for details.');
        } finally {
            setIsCopyingCreatorNotesHtml(false);
        }
    }, [creatorNotesHtml, isCopyingCreatorNotesHtml, stageInstance]);

    const saveGameConfiguration = useCallback(() => {
        stageInstance.updateConfiguration({
            actors: activeActors,
            locations: activeLocations,
            maps: activeMaps,
            lorebook: (save.lorebook || []).map(entry => JSON.parse(JSON.stringify(entry))),
            calendarEvents: managedCalendarEvents,
            actorStats,
            playerStats,
            playerStatValues: validPlayerStatValues,
            uiSettings: stageInstance.getUiSettings(),
            title,
            titleImageUrl,
            titleImagePrompt: titleImagePrompt,
            backgroundImageUrl,
            backgroundImagePrompt: backgroundImagePrompt,
            startingDate,
            artStyle,
        });

        const currentSave = stageInstance.getSave();

        const statNames = new Set(
            actorStats
                .filter(stat => isNumericDisplayType(stat.type) && !stat.perActor)
                .map(stat => stat.name.trim())
                .filter(Boolean),
        );
        Object.values(currentSave.actors || {}).forEach(actor => {
            if (!actor.statMap || typeof actor.statMap !== 'object') {
                actor.statMap = {};
            }

            actorStats.filter(stat => isNumericDisplayType(stat.type) && !stat.perActor).forEach(stat => {
                const statName = stat.name.trim();
                if (!statName) {
                    return;
                }
                const existing = actor.statMap[statName];
                const fallback = Number.isFinite(stat.default) ? Number(stat.default) : 0;
                const value = Number.isFinite(existing) ? Number(existing) : fallback;
                actor.statMap[statName] = clampStatValue(value, stat);
            });

            Object.keys(actor.statMap).forEach(statName => {
                if (!statNames.has(statName)) {
                    delete actor.statMap[statName];
                }
            });
        });

    }, [activeActors, activeLocations, activeMaps, actorStats, backgroundImagePrompt, backgroundImageUrl, managedCalendarEvents, playerStats, save, stageInstance, startingDate, title, titleImagePrompt, titleImageUrl, validPlayerStatValues]);

    useEffect(() => {
        saveGameConfigurationRef.current = saveGameConfiguration;
    }, [saveGameConfiguration]);

    useEffect(() => {
        if (!didMountRef.current) {
            didMountRef.current = true;
            return;
        }

        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
        }

        autoSaveTimeoutRef.current = window.setTimeout(() => {
            saveGameConfigurationRef.current();
        }, 300);

        return () => {
            if (autoSaveTimeoutRef.current) {
                clearTimeout(autoSaveTimeoutRef.current);
            }
        };
    }, [saveGameConfiguration]);

    useEffect(() => {
        return () => {
            if (autoSaveTimeoutRef.current) {
                saveGameConfigurationRef.current();
            }
        };
    }, []);

    const handleTitleImageUpload = async (file: File) => {
        setIsUploadingTitleImage(true);
        try {
            const uploadedUrl = await stageInstance.uploadFile('game-title-image.png', file);
            setTitleImageUrl(uploadedUrl);
            stageInstance.showPriorityMessage('Title image uploaded and will be saved automatically.');
        } catch (error) {
            console.error('Failed to upload title image:', error);
            stageInstance.showPriorityMessage('Failed to upload title image. Check console for details.');
        } finally {
            setIsUploadingTitleImage(false);
        }
    };

    const handleGenerateTitleImage = async () => {
        if (isGeneratingTitleImage) {
            return;
        }

        setIsGeneratingTitleImage(true);
        try {
            // Keep generation aligned with unsaved local edits before calling stage generation.
            stageInstance.updateConfiguration({
                title,
                titleImagePrompt,
            });

            const generatedUrl = await stageInstance.generateTitleImage();
            if (generatedUrl?.trim()) {
                setTitleImageUrl(generatedUrl);
                stageInstance.showPriorityMessage('Generated a new title image and will save it automatically.');
            } else {
                stageInstance.showPriorityMessage('No title image was generated. Try adjusting the prompt.');
            }
        } catch (error) {
            console.error('Failed to generate title image:', error);
            stageInstance.showPriorityMessage('Failed to generate title image. Check console for details.');
        } finally {
            setIsGeneratingTitleImage(false);
        }
    };

    const handleBackgroundImageUpload = async (file: File) => {
        setIsUploadingBackgroundImage(true);
        try {
            const uploadedUrl = await stageInstance.uploadFile('game-background-image.png', file);
            setBackgroundImageUrl(uploadedUrl);
            stageInstance.showPriorityMessage('Background image uploaded and will be saved automatically.');
        } catch (error) {
            console.error('Failed to upload background image:', error);
            stageInstance.showPriorityMessage('Failed to upload background image. Check console for details.');
        } finally {
            setIsUploadingBackgroundImage(false);
        }
    };

    const handleGenerateBackgroundImage = async () => {
        if (isGeneratingBackgroundImage) {
            return;
        }

        setIsGeneratingBackgroundImage(true);
        try {
            stageInstance.updateConfiguration({
                title,
                backgroundImagePrompt,
            });

            const generatedUrl = await stageInstance.generateBackgroundImage();
            if (generatedUrl?.trim()) {
                setBackgroundImageUrl(generatedUrl);
                stageInstance.showPriorityMessage('Generated a new background image and will save it automatically.');
            } else {
                stageInstance.showPriorityMessage('No background image was generated. Try adjusting the prompt.');
            }
        } catch (error) {
            console.error('Failed to generate background image:', error);
            stageInstance.showPriorityMessage('Failed to generate background image. Check console for details.');
        } finally {
            setIsGeneratingBackgroundImage(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Game Settings</Title>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>Game Title</label>
                        <TextInput
                            fullWidth
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Agenda VN"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>Start Date</label>
                        <TextInput
                            fullWidth
                            type="date"
                            value={startingDate}
                            onChange={(e) => setStartingDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>Art Style</label>
                        <TextInput
                            fullWidth
                            value={artStyle}
                            onChange={(e) => setArtStyle(e.target.value)}
                            placeholder="Describe the art style for image generation."
                        />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>Title Image Prompt</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start' }}>
                            <TextInput
                                fullWidth
                                value={titleImagePrompt}
                                onChange={(e) => setTitleImagePrompt(e.target.value)}
                                placeholder="Describe the title image style, atmosphere, and composition."
                            />
                            <Button
                                variant="secondary"
                                onClick={handleGenerateTitleImage}
                                disabled={isGeneratingTitleImage}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', justifySelf: 'stretch' }}
                            >
                                <AutoAwesome style={{ fontSize: '18px' }} />
                                {isGeneratingTitleImage ? 'Generating...' : 'Generate'}
                            </Button>
                        </div>
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <ImageUrlUploadField
                            imageUrl={titleImageUrl}
                            onImageUrlChange={setTitleImageUrl}
                            onUploadFile={handleTitleImageUpload}
                            isUploading={isUploadingTitleImage}
                            inputLabel="Title Image URL"
                            previewBorder="3px solid var(--agenda-line-strong)"
                            previewBackgroundPosition="50% 45%"
                            previewWidth="220px"
                            previewHeight="124px"
                            previewPlaceholder={<ImageIcon style={{ fontSize: '46px', color: 'rgba(138, 176, 204, 0.35)' }} />}
                            previewUploadHint={isUploadingTitleImage ? 'Uploading...' : 'Click image to upload'}
                            onInvalidFile={() => stageInstance.showPriorityMessage('Please select a valid image file.')}
                        />
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>Background Image Prompt</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start' }}>
                            <TextInput
                                fullWidth
                                value={backgroundImagePrompt}
                                onChange={(e) => setBackgroundImagePrompt(e.target.value)}
                                placeholder="Describe the menu and calendar background atmosphere, setting, and composition."
                            />
                            <Button
                                variant="secondary"
                                onClick={handleGenerateBackgroundImage}
                                disabled={isGeneratingBackgroundImage}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', justifySelf: 'stretch' }}
                            >
                                <AutoAwesome style={{ fontSize: '18px' }} />
                                {isGeneratingBackgroundImage ? 'Generating...' : 'Generate'}
                            </Button>
                        </div>
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <ImageUrlUploadField
                            imageUrl={backgroundImageUrl}
                            onImageUrlChange={setBackgroundImageUrl}
                            onUploadFile={handleBackgroundImageUpload}
                            isUploading={isUploadingBackgroundImage}
                            inputLabel="Background Image URL"
                            previewBorder="3px solid var(--agenda-line-strong)"
                            previewBackgroundPosition="50% 45%"
                            previewWidth="220px"
                            previewHeight="124px"
                            previewPlaceholder={<ImageIcon style={{ fontSize: '46px', color: 'rgba(138, 176, 204, 0.35)' }} />}
                            previewUploadHint={isUploadingBackgroundImage ? 'Uploading...' : 'Click image to upload'}
                            onInvalidFile={() => stageInstance.showPriorityMessage('Please select a valid image file.')}
                        />
                        {!backgroundImageUrl && (
                            <div style={{ color: 'var(--agenda-text-muted)', fontSize: '12px', marginTop: 6 }}>
                                Falls back to the existing default background image until you set one.
                            </div>
                        )}
                        {backgroundImageUrl && backgroundImageUrl.trim() === defaultBackgroundImageUrl && (
                            <div style={{ color: 'var(--agenda-text-muted)', fontSize: '12px', marginTop: 6 }}>
                                This matches the current built-in background image.
                            </div>
                        )}
                    </div>
                </div>
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                    <Title variant="glow" style={{ fontSize: '20px', margin: 0 }}>Creator Notes HTML Export</Title>
                    <Button
                        variant="secondary"
                        onClick={copyCreatorNotesHtml}
                        disabled={isCopyingCreatorNotesHtml}
                    >
                        {isCopyingCreatorNotesHtml ? 'Copying...' : 'Copy HTML'}
                    </Button>
                </div>

                <div style={{ color: 'var(--agenda-text-muted)', fontSize: '12px', marginBottom: '8px' }}>
                    Generates a creator-notes layout from active actors and location images, using hover tooltips for character backgrounds.
                </div>

                <TextArea
                    readOnly
                    value={creatorNotesHtml}
                    rows={20}
                    style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
                />
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                    <Title variant="glow" style={{ fontSize: '20px', margin: 0 }}>GameConfiguration JSON Export</Title>
                    <Button
                        variant="secondary"
                        onClick={copyConfigurationJson}
                        disabled={isCopyingConfigurationJson}
                    >
                        {isCopyingConfigurationJson ? 'Copying...' : 'Copy JSON'}
                    </Button>
                </div>

                <div style={{ color: 'var(--agenda-text-muted)', fontSize: '12px', marginBottom: '8px' }}>
                    Includes active actors and locations, plus current settings, styles, lorebook, and calendar event series.
                </div>

                <TextArea
                    readOnly
                    value={portableGameConfigurationJson}
                    rows={20}
                    style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
                />
            </GlassPanel>
        </div>
    );
};

export default GameManagementPanel;