import React, { FC, useMemo, useState } from 'react';
import { AutoAwesome, Image as ImageIcon } from '@mui/icons-material';
import { ActorStat, ContextSegment, CustomSetting, Stage } from '../Stage';
import { Button, GlassPanel, TextInput, Title } from './UiComponents';
import { ImageUrlUploadField } from './ImageUrlUploadField';

interface GameManagementPanelProps {
    stage: () => Stage;
}

const cloneSegment = (segment: ContextSegment): ContextSegment => ({
    title: segment.title,
    body: typeof segment.body === 'string' ? segment.body : (segment.body || []).map(cloneSegment),
});

const cloneSetting = (setting: CustomSetting): CustomSetting => ({
    title: setting.title,
    description: setting.description,
    options: Object.fromEntries(
        Object.entries(setting.options || {}).map(([key, value]) => [key, cloneSegment(value)]),
    ),
});

const cloneActorStat = (stat: ActorStat): ActorStat => ({
    name: stat.name,
    description: stat.description,
    guidance: stat.guidance,
    default: Number.isFinite(stat.default) ? Number(stat.default) : 0,
    displayType: stat.displayType,
    min: Number.isFinite(stat.min) ? Number(stat.min) : undefined,
    max: Number.isFinite(stat.max) ? Number(stat.max) : undefined,
});

const defaultContextSegment = (): ContextSegment => ({
    title: 'New Context Block',
    body: 'Describe this context block.',
});

const defaultCustomSetting = (): CustomSetting => ({
    title: 'New Setting',
    description: 'Describe what this setting affects.',
    options: {
        Default: {
            title: 'Default',
            body: 'Describe the default selected option context.',
        },
    },
});

const defaultActorStat = (): ActorStat => ({
    name: 'Name',
    description: 'A user-facing description of this stat.',
    guidance: 'Guidance for the LLM on how this stat is applied or what a high or low score is or represents.',
    default: 50,
    displayType: 'percentage',
    min: 0,
    max: 100,
});

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

const renderSegmentBody = (segment: ContextSegment): string => {
    if (typeof segment.body === 'string') {
        return segment.body;
    }

    return (segment.body || []).map(child => `${child.title}: ${renderSegmentBody(child)}`).join('\n');
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
    const [contextSegments, setContextSegments] = useState<ContextSegment[]>(() =>
        (configuration.context || []).map(cloneSegment),
    );
    const [customSettings, setCustomSettings] = useState<CustomSetting[]>(() =>
        (configuration.settings || []).map(cloneSetting),
    );
    const [collapsedContextBlocks, setCollapsedContextBlocks] = useState<boolean[]>(() =>
        (configuration.context || []).map(() => true),
    );
    const [collapsedCustomSettings, setCollapsedCustomSettings] = useState<boolean[]>(() =>
        (configuration.settings || []).map(() => true),
    );
    const [collapsedActorStats, setCollapsedActorStats] = useState<boolean[]>(() =>
        (configuration.actorStats || save.agendaConfig?.actorStats || []).map(() => true),
    );
    const [actorStats, setActorStats] = useState<ActorStat[]>(() =>
        (configuration.actorStats || save.agendaConfig?.actorStats || []).map(cloneActorStat),
    );
    const [selectedSettings, setSelectedSettings] = useState<{ [key: string]: string }>(() => ({
        ...(save.agendaConfig?.selectedSettings || {}),
    }));

    const fieldLabelStyle: React.CSSProperties = {
        display: 'block',
        color: 'var(--agenda-inactive)',
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
        color: 'var(--agenda-inactive)',
        fontSize: '12px',
        marginBottom: 4,
    };

    const validSelections = useMemo(() => {
        const nextSelections: { [key: string]: string } = {};
        customSettings.forEach(setting => {
            const optionNames = Object.keys(setting.options || {});
            if (optionNames.length === 0) {
                return;
            }

            const current = selectedSettings[setting.title];
            nextSelections[setting.title] = current && optionNames.includes(current) ? current : optionNames[0];
        });

        return nextSelections;
    }, [customSettings, selectedSettings]);

    const saveGameConfiguration = () => {
        stageInstance.updateConfiguration({
            context: contextSegments,
            settings: customSettings,
            actorStats,
            title,
            titleImageUrl,
            titleImagePrompt: titleImagePrompt,
            backgroundImageUrl,
            backgroundImagePrompt: backgroundImagePrompt,
            startingDate,
        });

        const currentSave = stageInstance.getSave();
        currentSave.agendaConfig = {
            title: title,
            titleImageUrl: titleImageUrl,
            titleImagePrompt: titleImagePrompt,
            backgroundImageUrl: backgroundImageUrl,
            backgroundImagePrompt: backgroundImagePrompt,
            context: contextSegments.map(cloneSegment),
            settings: customSettings.map(cloneSetting),
            selectedSettings: validSelections,
            actorStats: actorStats.map(cloneActorStat),
            startingDate: startingDate,
        };

        const statNames = new Set(actorStats.map(stat => stat.name.trim()).filter(Boolean));
        Object.values(currentSave.actors || {}).forEach(actor => {
            if (!actor.statMap || typeof actor.statMap !== 'object') {
                actor.statMap = {};
            }

            actorStats.forEach(stat => {
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

        stageInstance.saveGame();
    };

    const handleTitleImageUpload = async (file: File) => {
        setIsUploadingTitleImage(true);
        try {
            const uploadedUrl = await stageInstance.uploadFile('game-title-image.png', file);
            setTitleImageUrl(uploadedUrl);
            stageInstance.showPriorityMessage('Title image uploaded. Save to keep this in configuration.');
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
                stageInstance.showPriorityMessage('Generated a new title image. Save to keep this in configuration.');
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
            stageInstance.showPriorityMessage('Background image uploaded. Save to keep this in configuration.');
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
                stageInstance.showPriorityMessage('Generated a new background image. Save to keep this in configuration.');
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

    const updateContextSegment = (index: number, patch: Partial<ContextSegment>) => {
        setContextSegments(prev => prev.map((segment, idx) => (
            idx === index ? { ...segment, ...patch } : segment
        )));
    };

    const removeContextSegment = (index: number) => {
        setContextSegments(prev => prev.filter((_, idx) => idx !== index));
        setCollapsedContextBlocks(prev => prev.filter((_, idx) => idx !== index));
    };

    const updateCustomSetting = (index: number, patch: Partial<CustomSetting>) => {
        setCustomSettings(prev => prev.map((setting, idx) => (
            idx === index ? { ...setting, ...patch } : setting
        )));
    };

    const removeCustomSetting = (index: number) => {
        setCustomSettings(prev => prev.filter((_, idx) => idx !== index));
        setCollapsedCustomSettings(prev => prev.filter((_, idx) => idx !== index));
    };

    const toggleContextBlock = (index: number) => {
        setCollapsedContextBlocks(prev => prev.map((isCollapsed, idx) => (
            idx === index ? !isCollapsed : isCollapsed
        )));
    };

    const toggleCustomSetting = (index: number) => {
        setCollapsedCustomSettings(prev => prev.map((isCollapsed, idx) => (
            idx === index ? !isCollapsed : isCollapsed
        )));
    };

    const updateActorStat = (index: number, patch: Partial<ActorStat>) => {
        setActorStats(prev => prev.map((stat, idx) => (
            idx === index ? { ...stat, ...patch } : stat
        )));
    };

    const removeActorStat = (index: number) => {
        setActorStats(prev => prev.filter((_, idx) => idx !== index));
        setCollapsedActorStats(prev => prev.filter((_, idx) => idx !== index));
    };

    const toggleActorStat = (index: number) => {
        setCollapsedActorStats(prev => prev.map((isCollapsed, idx) => (
            idx === index ? !isCollapsed : isCollapsed
        )));
    };

    const updateSettingOption = (settingIndex: number, optionName: string, segment: ContextSegment) => {
        setCustomSettings(prev => prev.map((setting, idx) => {
            if (idx !== settingIndex) {
                return setting;
            }

            return {
                ...setting,
                options: {
                    ...(setting.options || {}),
                    [optionName]: segment,
                },
            };
        }));
    };

    const renameSettingOption = (settingIndex: number, oldName: string, newName: string) => {
        const nextName = newName.trim();
        if (!nextName || oldName === nextName) {
            return;
        }

        setCustomSettings(prev => prev.map((setting, idx) => {
            if (idx !== settingIndex) {
                return setting;
            }

            const options = { ...(setting.options || {}) };
            const value = options[oldName];
            delete options[oldName];
            if (value) {
                options[nextName] = value;
            }

            return {
                ...setting,
                options,
            };
        }));

        setSelectedSettings(prev => {
            const current = prev[customSettings[settingIndex]?.title || ''];
            if (current !== oldName) {
                return prev;
            }

            return {
                ...prev,
                [customSettings[settingIndex]?.title || '']: nextName,
            };
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Game Settings</Title>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Game Title</label>
                        <TextInput
                            fullWidth
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Agenda VN"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Start Date</label>
                        <TextInput
                            fullWidth
                            type="date"
                            value={startingDate}
                            onChange={(e) => setStartingDate(e.target.value)}
                        />
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Title Image Prompt</label>
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
                            uploadButtonLabel="Upload Title Image"
                            previewBorder="3px solid var(--agenda-border-strong)"
                            previewBackgroundPosition="50% 40%"
                            previewPlaceholder={<ImageIcon style={{ fontSize: '46px', color: 'rgba(138, 176, 204, 0.35)' }} />}
                            onInvalidFile={() => stageInstance.showPriorityMessage('Please select a valid image file.')}
                        />
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Background Image Prompt</label>
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
                            uploadButtonLabel="Upload Background Image"
                            previewBorder="3px solid var(--agenda-border-strong)"
                            previewBackgroundPosition="50% 45%"
                            previewWidth="220px"
                            previewHeight="124px"
                            previewPlaceholder={<ImageIcon style={{ fontSize: '46px', color: 'rgba(138, 176, 204, 0.35)' }} />}
                            onInvalidFile={() => stageInstance.showPriorityMessage('Please select a valid image file.')}
                        />
                        {!backgroundImageUrl && (
                            <div style={{ color: 'var(--agenda-inactive)', fontSize: '12px', marginTop: 6 }}>
                                Falls back to the existing default background image until you set one.
                            </div>
                        )}
                        {backgroundImageUrl && backgroundImageUrl.trim() === defaultBackgroundImageUrl && (
                            <div style={{ color: 'var(--agenda-inactive)', fontSize: '12px', marginTop: 6 }}>
                                This matches the current built-in background image.
                            </div>
                        )}
                    </div>
                </div>
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Global Context Blocks</Title>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {contextSegments.map((segment, index) => (
                        <div key={`context-${index}`} style={{ border: '1px solid var(--agenda-border)', borderRadius: 8, padding: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                <div style={{ fontWeight: 600, color: 'var(--agenda-text)' }}>
                                    {segment.title?.trim() || `Context Block ${index + 1}`}
                                </div>
                                <Button variant="secondary" onClick={() => toggleContextBlock(index)}>
                                    {collapsedContextBlocks[index] ? 'Expand' : 'Collapse'}
                                </Button>
                            </div>

                            {!collapsedContextBlocks[index] && (
                                <>
                                    <div style={{ marginTop: 10 }}>
                                        <div style={inlineFieldStyle}>
                                            <label style={fieldLabelStyle}>Name</label>
                                            <TextInput
                                                fullWidth
                                                value={segment.title}
                                                onChange={(e) => updateContextSegment(index, { title: e.target.value })}
                                                placeholder="Context title"
                                            />
                                        </div>
                                        <div style={inlineFieldTopStyle}>
                                            <label style={fieldLabelStyle}>Context</label>
                                            <textarea
                                                className="input-base"
                                                value={renderSegmentBody(segment)}
                                                onChange={(e) => updateContextSegment(index, { body: e.target.value })}
                                                rows={4}
                                                style={{ width: '100%', resize: 'vertical' }}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ marginTop: 8 }}>
                                        <Button variant="danger" onClick={() => removeContextSegment(index)}>Remove Block</Button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setContextSegments(prev => [...prev, defaultContextSegment()]);
                            setCollapsedContextBlocks(prev => [...prev, false]);
                        }}
                    >
                        Add Context Block
                    </Button>
                </div>
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Custom Settings</Title>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {customSettings.map((setting, settingIndex) => {
                        const optionEntries = Object.entries(setting.options || {});
                        const selectedOption = validSelections[setting.title] || optionEntries[0]?.[0] || '';

                        return (
                            <div key={`setting-${settingIndex}`} style={{ border: '1px solid var(--agenda-border)', borderRadius: 8, padding: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                    <div style={{ fontWeight: 600, color: 'var(--agenda-text)' }}>
                                        {setting.title?.trim() || `Setting ${settingIndex + 1}`}
                                    </div>
                                    <Button variant="secondary" onClick={() => toggleCustomSetting(settingIndex)}>
                                        {collapsedCustomSettings[settingIndex] ? 'Expand' : 'Collapse'}
                                    </Button>
                                </div>

                                {!collapsedCustomSettings[settingIndex] && (
                                    <>
                                        <div style={{ marginTop: 10 }}>
                                            <div style={inlineFieldStyle}>
                                                <label style={fieldLabelStyle}>Name</label>
                                                <TextInput
                                                    fullWidth
                                                    value={setting.title}
                                                    onChange={(e) => updateCustomSetting(settingIndex, { title: e.target.value })}
                                                    placeholder="Setting title"
                                                />
                                            </div>
                                            <div style={inlineFieldTopStyle}>
                                                <label style={fieldLabelStyle}>Description</label>
                                                <textarea
                                                    className="input-base"
                                                    value={setting.description}
                                                    onChange={(e) => updateCustomSetting(settingIndex, { description: e.target.value })}
                                                    rows={2}
                                                    style={{ width: '100%', resize: 'vertical' }}
                                                />
                                            </div>

                                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                                <label style={fieldLabelStyle}>Default</label>
                                                <select
                                                    className="input-base"
                                                    value={selectedOption}
                                                    onChange={(e) => setSelectedSettings(prev => ({ ...prev, [setting.title]: e.target.value }))}
                                                >
                                                    {optionEntries.map(([name]) => (
                                                        <option key={name} value={name}>{name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {optionEntries.map(([optionName, segment]) => (
                                                    <div key={`${settingIndex}-${optionName}`} style={{ border: '1px solid var(--agenda-border)', borderRadius: 8, padding: 8 }}>
                                                        <div style={inlineFieldStyle}>
                                                            <label style={fieldLabelStyle}>Option Name</label>
                                                            <TextInput
                                                                fullWidth
                                                                defaultValue={optionName}
                                                                onBlur={(e) => renameSettingOption(settingIndex, optionName, e.target.value)}
                                                                placeholder="Option name"
                                                            />
                                                        </div>
                                                        <div style={inlineFieldStyle}>
                                                            <label style={fieldLabelStyle}>Context Name</label>
                                                            <TextInput
                                                                fullWidth
                                                                value={segment.title}
                                                                onChange={(e) => updateSettingOption(settingIndex, optionName, { ...segment, title: e.target.value })}
                                                                placeholder="Context title"
                                                            />
                                                        </div>
                                                        <div style={{ ...inlineFieldTopStyle, marginBottom: 0 }}>
                                                            <label style={fieldLabelStyle}>Context</label>
                                                            <textarea
                                                                className="input-base"
                                                                value={typeof segment.body === 'string' ? segment.body : renderSegmentBody(segment)}
                                                                onChange={(e) => updateSettingOption(settingIndex, optionName, { ...segment, body: e.target.value })}
                                                                rows={3}
                                                                style={{ width: '100%', resize: 'vertical' }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                            <Button
                                                variant="secondary"
                                                onClick={() => {
                                                    const baseName = `Option ${optionEntries.length + 1}`;
                                                    updateSettingOption(settingIndex, baseName, {
                                                        title: baseName,
                                                        body: 'Describe context for this option.',
                                                    });
                                                }}
                                            >
                                                Add Option
                                            </Button>
                                            <Button variant="danger" onClick={() => removeCustomSetting(settingIndex)}>Remove Setting</Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}

                    <Button
                        variant="secondary"
                        onClick={() => {
                            setCustomSettings(prev => [...prev, defaultCustomSetting()]);
                            setCollapsedCustomSettings(prev => [...prev, false]);
                        }}
                    >
                        Add Custom Setting
                    </Button>
                </div>
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Actor Stats</Title>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {actorStats.map((stat, statIndex) => (
                        <div key={`actor-stat-${statIndex}`} style={{ border: '1px solid var(--agenda-border)', borderRadius: 8, padding: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                <div style={{ fontWeight: 600, color: 'var(--agenda-text)' }}>
                                    {stat.name?.trim() || `Actor Stat ${statIndex + 1}`}
                                </div>
                                <Button variant="secondary" onClick={() => toggleActorStat(statIndex)}>
                                    {collapsedActorStats[statIndex] ? 'Expand' : 'Collapse'}
                                </Button>
                            </div>

                            {!collapsedActorStats[statIndex] && (
                                <>
                                    <div style={{ marginTop: 10 }}>
                                        <div style={inlineFieldStyle}>
                                            <label style={fieldLabelStyle}>Name</label>
                                            <TextInput
                                                fullWidth
                                                value={stat.name}
                                                onChange={(e) => updateActorStat(statIndex, { name: e.target.value })}
                                                placeholder="Stat name"
                                            />
                                        </div>

                                        <div style={inlineFieldTopStyle}>
                                            <label style={fieldLabelStyle}>Description</label>
                                            <textarea
                                                className="input-base"
                                                value={stat.description}
                                                onChange={(e) => updateActorStat(statIndex, { description: e.target.value })}
                                                rows={2}
                                                placeholder="Describe what this stat represents."
                                                style={{ width: '100%', resize: 'vertical' }}
                                            />
                                        </div>

                                        <div style={inlineFieldTopStyle}>
                                            <label style={fieldLabelStyle}>Guidance</label>
                                            <textarea
                                                className="input-base"
                                                value={stat.guidance}
                                                onChange={(e) => updateActorStat(statIndex, { guidance: e.target.value })}
                                                rows={2}
                                                placeholder="Guidance for using this stat in generated narrative."
                                                style={{ width: '100%', resize: 'vertical' }}
                                            />
                                        </div>

                                        <div style={{ ...inlineFieldTopStyle, marginBottom: 0 }}>
                                            <label style={fieldLabelStyle}>Properties</label>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                                                <div>
                                                    <div style={compactChipLabelStyle}>Default</div>
                                                    <TextInput
                                                        fullWidth
                                                        type="number"
                                                        value={String(stat.default)}
                                                        onChange={(e) => updateActorStat(statIndex, { default: Number(e.target.value) || 0 })}
                                                        placeholder="Default"
                                                    />
                                                </div>

                                                <div>
                                                    <div style={compactChipLabelStyle}>Min</div>
                                                    <TextInput
                                                        fullWidth
                                                        type="number"
                                                        value={typeof stat.min === 'number' ? String(stat.min) : ''}
                                                        onChange={(e) => updateActorStat(statIndex, { min: e.target.value === '' ? undefined : Number(e.target.value) })}
                                                        placeholder="Min"
                                                    />
                                                </div>

                                                <div>
                                                    <div style={compactChipLabelStyle}>Max</div>
                                                    <TextInput
                                                        fullWidth
                                                        type="number"
                                                        value={typeof stat.max === 'number' ? String(stat.max) : ''}
                                                        onChange={(e) => updateActorStat(statIndex, { max: e.target.value === '' ? undefined : Number(e.target.value) })}
                                                        placeholder="Max"
                                                    />
                                                </div>

                                                <div>
                                                    <div style={compactChipLabelStyle}>Display</div>
                                                    <select
                                                        className="input-base"
                                                        value={stat.displayType}
                                                        onChange={(e) => updateActorStat(statIndex, { displayType: e.target.value as ActorStat['displayType'] })}
                                                    >
                                                        <option value="number">number</option>
                                                        <option value="percentage">percentage</option>
                                                        <option value="stars">stars</option>
                                                        <option value="letter grade">letter grade</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: 10 }}>
                                        <Button variant="danger" onClick={() => removeActorStat(statIndex)}>Remove Actor Stat</Button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}

                    <Button
                        variant="secondary"
                        onClick={() => {
                            setActorStats(prev => [...prev, defaultActorStat()]);
                            setCollapsedActorStats(prev => [...prev, false]);
                        }}
                    >
                        Add Actor Stat
                    </Button>
                </div>
            </GlassPanel>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <Button variant="primary" onClick={saveGameConfiguration}>Save Game Settings</Button>
            </div>
        </div>
    );
};

export default GameManagementPanel;