import React, { FC, useState } from 'react';
import { Stage, UiSettings } from '../Stage';
import { Button, GlassPanel, TextInput, Title } from './UiComponents';

interface StyleManagementPanelProps {
    stage: () => Stage;
}

const applyUiSettingsToRoot = (uiSettings: UiSettings) => {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--agenda-accent', uiSettings.accentColor);
    rootStyle.setProperty('--agenda-active', uiSettings.activeColor);
    rootStyle.setProperty('--agenda-primary', uiSettings.primaryColor);
    rootStyle.setProperty('--agenda-inactive', uiSettings.inactiveColor);
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

    rootStyle.setProperty('--agenda-fog', uiSettings.primaryColor);
    rootStyle.setProperty('--agenda-verdant', uiSettings.activeColor);
    rootStyle.setProperty('--agenda-mist', uiSettings.accentColor);
    rootStyle.setProperty('--agenda-text-secondary', uiSettings.inactiveColor);
};

export const StyleManagementPanel: FC<StyleManagementPanelProps> = ({ stage }) => {
    const stageInstance = stage();
    const [uiSettings, setUiSettings] = useState<UiSettings>(() => ({ ...stageInstance.getUiSettings() }));

    const saveStyleSettings = () => {
        stageInstance.updateUiSettings(uiSettings);
        applyUiSettingsToRoot(uiSettings);
        stageInstance.saveGame();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>UI Theme</Title>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Game Title</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.gameTitle}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, gameTitle: e.target.value }))}
                            placeholder="Agenda VN"
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>UI Font Family</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.uiFontFamily}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, uiFontFamily: e.target.value }))}
                            placeholder='"Geologica", sans-serif'
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Flavor Font Family</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.flavorFontFamily}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, flavorFontFamily: e.target.value }))}
                            placeholder='"Lora", Georgia, serif'
                        />
                    </div>

                    {[
                        ['Primary Text', 'primaryColor'],
                        ['Secondary Text', 'inactiveColor'],
                        ['Active Text', 'activeColor'],
                        ['Accent Text', 'accentColor'],
                        ['Background Deep', 'bgDeepColor'],
                        ['Background Mid', 'bgMidColor'],
                        ['Background Soft', 'bgSoftColor'],
                    ].map(([label, key]) => (
                        <div key={key as keyof UiSettings}>
                            <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>{label}</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '58px 1fr', gap: '8px', alignItems: 'center' }}>
                                <input
                                    type="color"
                                    value={uiSettings[key as keyof UiSettings] as string}
                                    onChange={(e) => setUiSettings(prev => ({ ...prev, [key as keyof UiSettings]: e.target.value }))}
                                    style={{ width: '58px', height: '36px', border: '1px solid var(--agenda-border)', borderRadius: 8, background: 'transparent' }}
                                />
                                <TextInput
                                    fullWidth
                                    value={uiSettings[key as keyof UiSettings] as string}
                                    onChange={(e) => setUiSettings(prev => ({ ...prev, [key as keyof UiSettings]: e.target.value }))}
                                />
                            </div>
                        </div>
                    ))}

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Border Color</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.borderColor}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, borderColor: e.target.value }))}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Border Strong Color</label>
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
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Overlay Start</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.calendarOverlayStart}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, calendarOverlayStart: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Overlay Mid</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.calendarOverlayMid}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, calendarOverlayMid: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Overlay End</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.calendarOverlayEnd}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, calendarOverlayEnd: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Card Background</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.calendarCardBackground}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, calendarCardBackground: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Card Border</label>
                        <TextInput
                            fullWidth
                            value={uiSettings.calendarCardBorder}
                            onChange={(e) => setUiSettings(prev => ({ ...prev, calendarCardBorder: e.target.value }))}
                        />
                    </div>
                </div>
            </GlassPanel>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <Button variant="primary" onClick={saveStyleSettings}>Save Style</Button>
            </div>
        </div>
    );
};

export default StyleManagementPanel;