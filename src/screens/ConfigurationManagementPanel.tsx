import React, { FC, useMemo, useState } from 'react';
import { Stage, ContextSegment, CustomSetting, UiSettings } from '../Stage';
import { Button, GlassPanel, TextInput, Title } from './UiComponents';

interface ConfigurationManagementPanelProps {
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

const renderSegmentBody = (segment: ContextSegment): string => {
    if (typeof segment.body === 'string') {
        return segment.body;
    }

    return (segment.body || []).map(child => `${child.title}: ${renderSegmentBody(child)}`).join('\n');
};

export const ConfigurationManagementPanel: FC<ConfigurationManagementPanelProps> = ({ stage }) => {
    const stageInstance = stage();
    const save = stageInstance.getSave();
    const configuration = stageInstance.getConfiguration();

    const [uiSettings, setUiSettings] = useState<UiSettings>(() => ({ ...stage().getUiSettings() }));
    const [contextSegments, setContextSegments] = useState<ContextSegment[]>(() =>
        (configuration.context || []).map(cloneSegment),
    );
    const [customSettings, setCustomSettings] = useState<CustomSetting[]>(() =>
        (configuration.settings || []).map(cloneSetting),
    );
    const [selectedSettings, setSelectedSettings] = useState<{ [key: string]: string }>(() => ({
        ...(save.agendaConfig?.selectedSettings || {}),
    }));

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

    const saveConfiguration = () => {
        stageInstance.updateConfiguration({
            context: contextSegments,
            settings: customSettings,
        });

        const currentSave = stageInstance.getSave();
        currentSave.agendaConfig = {
            context: contextSegments.map(cloneSegment),
            settings: customSettings.map(cloneSetting),
            selectedSettings: validSelections,
        };
        stageInstance.updateUiSettings(uiSettings);
        stageInstance.saveGame();

        const rootStyle = document.documentElement.style;
        rootStyle.setProperty('--agenda-mist', uiSettings.mistColor);
        rootStyle.setProperty('--agenda-verdant', uiSettings.verdantColor);
        rootStyle.setProperty('--agenda-fog', uiSettings.fogColor);
        rootStyle.setProperty('--agenda-text-secondary', uiSettings.textSecondaryColor);
        rootStyle.setProperty('--agenda-bg-deep', uiSettings.bgDeepColor);
        rootStyle.setProperty('--agenda-bg-mid', uiSettings.bgMidColor);
        rootStyle.setProperty('--agenda-bg-soft', uiSettings.bgSoftColor);
        rootStyle.setProperty('--agenda-border', uiSettings.borderColor);
        rootStyle.setProperty('--agenda-border-strong', uiSettings.borderStrongColor);
        rootStyle.setProperty('--agenda-font-ui', uiSettings.uiFontFamily);
        rootStyle.setProperty('--agenda-font-flavor', uiSettings.flavorFontFamily);
        rootStyle.setProperty('--agenda-calendar-overlay-start', uiSettings.calendarOverlayStart);
        rootStyle.setProperty('--agenda-calendar-overlay-mid', uiSettings.calendarOverlayMid);
        rootStyle.setProperty('--agenda-calendar-overlay-end', uiSettings.calendarOverlayEnd);
        rootStyle.setProperty('--agenda-calendar-card-bg', uiSettings.calendarCardBackground);
        rootStyle.setProperty('--agenda-calendar-card-border', uiSettings.calendarCardBorder);
    };

    const updateContextSegment = (index: number, patch: Partial<ContextSegment>) => {
        setContextSegments(prev => prev.map((segment, idx) =>
            idx === index ? { ...segment, ...patch } : segment,
        ));
    };

    const removeContextSegment = (index: number) => {
        setContextSegments(prev => prev.filter((_, idx) => idx !== index));
    };

    const updateCustomSetting = (index: number, patch: Partial<CustomSetting>) => {
        setCustomSettings(prev => prev.map((setting, idx) =>
            idx === index ? { ...setting, ...patch } : setting,
        ));
    };

    const removeCustomSetting = (index: number) => {
        setCustomSettings(prev => prev.filter((_, idx) => idx !== index));
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
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>UI Theme</Title>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', color: 'var(--agenda-text-secondary)', marginBottom: 6 }}>Game Title</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.gameTitle}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, gameTitle: e.target.value }))}
                            placeholder="Agenda VN"
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-secondary)', marginBottom: 6 }}>UI Font Family</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.uiFontFamily}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, uiFontFamily: e.target.value }))}
                            placeholder='"Geologica", sans-serif'
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-secondary)', marginBottom: 6 }}>Flavor Font Family</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.flavorFontFamily}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, flavorFontFamily: e.target.value }))}
                            placeholder='"Lora", Georgia, serif'
                        />
                    </div>

                    {[
                        ['Mist', 'mistColor'],
                        ['Verdant', 'verdantColor'],
                        ['Fog', 'fogColor'],
                        ['Text Secondary', 'textSecondaryColor'],
                        ['Background Deep', 'bgDeepColor'],
                        ['Background Mid', 'bgMidColor'],
                        ['Background Soft', 'bgSoftColor'],
                    ].map(([label, key]) => (
                        <div key={key as string}>
                            <label style={{ display: 'block', color: 'var(--agenda-text-secondary)', marginBottom: 6 }}>{label}</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '58px 1fr', gap: '8px', alignItems: 'center' }}>
                                <input
                                    type="color"
                                    value={(uiSettings as any)[key as string]}
                                    onChange={(e) => setUiSettings(prev => ({ ...prev, [key as string]: e.target.value }))}
                                    style={{ width: '58px', height: '36px', border: '1px solid var(--agenda-border)', borderRadius: 8, background: 'transparent' }}
                                />
                                <TextInput
                                    fullWidth
                                    value={(uiSettings as any)[key as string]}
                                    onChange={(e) => setUiSettings(prev => ({ ...prev, [key as string]: e.target.value }))}
                                />
                            </div>
                        </div>
                    ))}

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-secondary)', marginBottom: 6 }}>Border Color</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.borderColor}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, borderColor: e.target.value }))}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-secondary)', marginBottom: 6 }}>Border Strong Color</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.borderStrongColor}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, borderStrongColor: e.target.value }))}
                        />
                    </div>
                </div>
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Calendar Styling</Title>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-secondary)', marginBottom: 6 }}>Overlay Start</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.calendarOverlayStart}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, calendarOverlayStart: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-secondary)', marginBottom: 6 }}>Overlay Mid</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.calendarOverlayMid}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, calendarOverlayMid: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-secondary)', marginBottom: 6 }}>Overlay End</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.calendarOverlayEnd}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, calendarOverlayEnd: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-secondary)', marginBottom: 6 }}>Card Background</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.calendarCardBackground}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, calendarCardBackground: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-text-secondary)', marginBottom: 6 }}>Card Border</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.calendarCardBorder}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, calendarCardBorder: e.target.value }))}
                        />
                    </div>
                </div>
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Global Context Blocks</Title>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {contextSegments.map((segment, index) => (
                        <div key={`context-${index}`} style={{ border: '1px solid var(--agenda-border)', borderRadius: 8, padding: 10 }}>
                            <TextInput
                                fullWidth
                                value={segment.title}
                                onChange={(e) => updateContextSegment(index, { title: e.target.value })}
                                placeholder="Context title"
                                style={{ marginBottom: 8 }}
                            />
                            <textarea
                                className="input-base"
                                value={renderSegmentBody(segment)}
                                onChange={(e) => updateContextSegment(index, { body: e.target.value })}
                                rows={4}
                                style={{ width: '100%', resize: 'vertical' }}
                            />
                            <div style={{ marginTop: 8 }}>
                                <Button variant="danger" onClick={() => removeContextSegment(index)}>Remove Block</Button>
                            </div>
                        </div>
                    ))}
                    <Button variant="secondary" onClick={() => setContextSegments(prev => [...prev, defaultContextSegment()])}>Add Context Block</Button>
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
                                <TextInput
                                    fullWidth
                                    value={setting.title}
                                    onChange={(e) => updateCustomSetting(settingIndex, { title: e.target.value })}
                                    placeholder="Setting title"
                                    style={{ marginBottom: 8 }}
                                />
                                <textarea
                                    className="input-base"
                                    value={setting.description}
                                    onChange={(e) => updateCustomSetting(settingIndex, { description: e.target.value })}
                                    rows={2}
                                    style={{ width: '100%', resize: 'vertical', marginBottom: 8 }}
                                />

                                <label style={{ display: 'block', color: 'var(--agenda-text-secondary)', marginBottom: 6 }}>Selected Option</label>
                                <select
                                    className="input-base"
                                    value={selectedOption}
                                    onChange={(e) => setSelectedSettings(prev => ({ ...prev, [setting.title]: e.target.value }))}
                                    style={{ marginBottom: 10 }}
                                >
                                    {optionEntries.map(([name]) => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {optionEntries.map(([optionName, segment]) => (
                                        <div key={`${settingIndex}-${optionName}`} style={{ border: '1px solid var(--agenda-border)', borderRadius: 8, padding: 8 }}>
                                            <TextInput
                                                fullWidth
                                                defaultValue={optionName}
                                                onBlur={(e) => renameSettingOption(settingIndex, optionName, e.target.value)}
                                                placeholder="Option name"
                                                style={{ marginBottom: 6 }}
                                            />
                                            <TextInput
                                                fullWidth
                                                value={segment.title}
                                                onChange={(e) => updateSettingOption(settingIndex, optionName, { ...segment, title: e.target.value })}
                                                placeholder="Context title"
                                                style={{ marginBottom: 6 }}
                                            />
                                            <textarea
                                                className="input-base"
                                                value={typeof segment.body === 'string' ? segment.body : renderSegmentBody(segment)}
                                                onChange={(e) => updateSettingOption(settingIndex, optionName, { ...segment, body: e.target.value })}
                                                rows={3}
                                                style={{ width: '100%', resize: 'vertical' }}
                                            />
                                        </div>
                                    ))}
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
                            </div>
                        );
                    })}

                    <Button variant="secondary" onClick={() => setCustomSettings(prev => [...prev, defaultCustomSetting()])}>Add Custom Setting</Button>
                </div>
            </GlassPanel>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <Button variant="primary" onClick={saveConfiguration}>Save Configuration</Button>
            </div>
        </div>
    );
};

export default ConfigurationManagementPanel;
