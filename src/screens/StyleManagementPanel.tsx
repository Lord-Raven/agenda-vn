import React, { FC, useEffect, useMemo, useRef, useState } from 'react';
import { AutoAwesome } from '@mui/icons-material';
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { Stage, UiSettings } from '../Stage';
import { buildPrompt } from '../utils/PromptBuilder.js';
import {
    buildStructuredExampleResponse,
    buildStructuredResponseFormat,
    parseStructuredResponse,
    StructuredFieldDefinition,
} from '../utils/StructuredResponse.js';
import { AlphaColorPickerInput, buildHexColorSwatches, Button, ColorPickerInput, GlassPanel, TextInput, Title } from './UiComponents';

interface StyleManagementPanelProps {
    stage: () => Stage;
}

const UI_SETTINGS_GENERATION_FIELDS: StructuredFieldDefinition[] = [
    { key: 'ui_font_family', label: 'UI FONT FAMILY', description: 'Primary UI font stack for controls and interface text.' },
    { key: 'flavor_font_family', label: 'FLAVOR FONT FAMILY', description: 'Secondary flavor font stack for decorative or narrative-forward headings/body copy.' },
    { key: 'primary_color', label: 'PRIMARY COLOR', description: 'Main readable UI text color for high-emphasis content.' },
    { key: 'inactive_color', label: 'INACTIVE COLOR', description: 'Muted text color for secondary or de-emphasized UI text.' },
    { key: 'active_color', label: 'ACTIVE COLOR', description: 'Highlight color for selected, active, or currently focused states.' },
    { key: 'accent_color', label: 'ACCENT COLOR', description: 'Accent color for icons, special labels, and differentiation points.' },
    { key: 'bg_deep_color', label: 'BG DEEP COLOR', description: 'Deepest background layer color for base canvas and depth.' },
    { key: 'bg_mid_color', label: 'BG MID COLOR', description: 'Middle background layer color for panels and transitions.' },
    { key: 'bg_soft_color', label: 'BG SOFT COLOR', description: 'Soft background layer color for elevated sections and gentle contrast.' },
    { key: 'border_color', label: 'BORDER COLOR', description: 'Standard border color for panels and common framing.' },
    { key: 'border_strong_color', label: 'BORDER STRONG COLOR', description: 'Stronger border color for key callouts and emphasized framing.' },
    { key: 'calendar_overlay_start', label: 'CALENDAR OVERLAY START', description: 'Gradient overlay start color for the calendar background atmosphere.' },
    { key: 'calendar_overlay_mid', label: 'CALENDAR OVERLAY MID', description: 'Gradient overlay midpoint color for calendar depth transitions.' },
    { key: 'calendar_overlay_end', label: 'CALENDAR OVERLAY END', description: 'Gradient overlay end color for calendar finish and mood.' },
    { key: 'calendar_card_background', label: 'CALENDAR CARD BACKGROUND', description: 'Background color for calendar day/event cards.' },
    { key: 'calendar_card_border', label: 'CALENDAR CARD BORDER', description: 'Border color for calendar day/event cards.' },
];

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGBA_COLOR_REGEX = /^rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|0?\.\d+|1(?:\.0+)?))?\s*\)$/i;

const renderContextSegment = (segment: any): string => {
    if (typeof segment?.body === 'string') {
        return segment.body;
    }
    if (Array.isArray(segment?.body)) {
        return segment.body
            .map((child: any) => `${child.title}:\n${renderContextSegment(child)}`)
            .join('\n\n');
    }
    return '';
};

const isValidHexColor = (value: string): boolean => HEX_COLOR_REGEX.test((value || '').trim());

const isValidCssColor = (value: string): boolean => {
    const normalized = (value || '').trim();
    return HEX_COLOR_REGEX.test(normalized) || RGBA_COLOR_REGEX.test(normalized);
};

const buildStyleUsageGuide = () => [
    'uiFontFamily: Main font for controls, labels, and core interface text.',
    'flavorFontFamily: Flavor font for stylized tone, dramatic emphasis, and thematic text moments.',
    'primaryColor: Main high-contrast text color.',
    'inactiveColor: Subdued text color for secondary information.',
    'activeColor: Active/selected/highlight color for actionable or focused UI states.',
    'accentColor: Accent color for icons and visual differentiation.',
    'bgDeepColor: Deepest layer of the background palette.',
    'bgMidColor: Mid-layer background color supporting panel separation.',
    'bgSoftColor: Soft elevated background tone for nearby surfaces.',
    'borderColor: Regular border stroke color.',
    'borderStrongColor: Strong border stroke color for emphasis.',
    'calendarOverlayStart: Calendar atmospheric overlay gradient start.',
    'calendarOverlayMid: Calendar atmospheric overlay gradient midpoint.',
    'calendarOverlayEnd: Calendar atmospheric overlay gradient end.',
    'calendarCardBackground: Calendar card fill color.',
    'calendarCardBorder: Calendar card border color.',
].join('\n');

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
    const [isGeneratingStyles, setIsGeneratingStyles] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        title: string;
        message: string;
        actions?: Array<{ label: string; onClick: () => void; variant?: 'primary' | 'secondary' }>;
    }>({ open: false, title: '', message: '' });
    const hasInitializedAutoSave = useRef(false);

    const styleColorFields: Array<{ label: string; key: keyof UiSettings }> = [
        { label: 'Primary Text', key: 'primaryColor' },
        { label: 'Secondary Text', key: 'inactiveColor' },
        { label: 'Active Text', key: 'activeColor' },
        { label: 'Accent Text', key: 'accentColor' },
        { label: 'Background Deep', key: 'bgDeepColor' },
        { label: 'Background Mid', key: 'bgMidColor' },
        { label: 'Background Soft', key: 'bgSoftColor' },
    ];

    const groupedStyleSwatches = useMemo(() => ({
        text: buildHexColorSwatches([
            uiSettings.primaryColor,
            uiSettings.inactiveColor,
            uiSettings.activeColor,
            uiSettings.accentColor,
        ]),
        background: buildHexColorSwatches([
            uiSettings.bgDeepColor,
            uiSettings.bgMidColor,
            uiSettings.bgSoftColor,
        ]),
        all: buildHexColorSwatches([
            uiSettings.primaryColor,
            uiSettings.inactiveColor,
            uiSettings.activeColor,
            uiSettings.accentColor,
            uiSettings.bgDeepColor,
            uiSettings.bgMidColor,
            uiSettings.bgSoftColor,
        ]),
    }), [
        uiSettings.activeColor,
        uiSettings.accentColor,
        uiSettings.bgDeepColor,
        uiSettings.bgMidColor,
        uiSettings.bgSoftColor,
        uiSettings.inactiveColor,
        uiSettings.primaryColor,
    ]);

    const getSwatchesForStyleKey = (key: keyof UiSettings): string[] => {
        if (key === 'primaryColor' || key === 'inactiveColor' || key === 'activeColor' || key === 'accentColor') {
            return groupedStyleSwatches.text;
        }

        if (key === 'bgDeepColor' || key === 'bgMidColor' || key === 'bgSoftColor') {
            return groupedStyleSwatches.background;
        }

        return groupedStyleSwatches.all;
    };

    useEffect(() => {
        if (!hasInitializedAutoSave.current) {
            hasInitializedAutoSave.current = true;
            return;
        }

        const saveTimer = window.setTimeout(() => {
            stageInstance.updateUiSettings(uiSettings);
            applyUiSettingsToRoot(uiSettings);
        }, 200);

        return () => window.clearTimeout(saveTimer);
    }, [stageInstance, uiSettings]);

    const handleGenerateStyles = async () => {
        if (isGeneratingStyles) {
            return;
        }

        setIsGeneratingStyles(true);

        try {
            const configuration = stageInstance.getConfiguration();
            const save = stageInstance.getSave();
            const activeActors = Object.values(save.actors || {}).filter(actor => actor.active !== false && actor.id !== save.playerId);
            const activeLocations = Object.values(save.atlas || {}).filter(location => location.active !== false);
            const contextText = (configuration.context || [])
                .map((segment) => `${segment.title}:\n${renderContextSegment(segment)}`)
                .join('\n\n') || 'None provided.';

            const selectedSettingContext = (configuration.settings || []).map((setting) => {
                const selectedOptionName = configuration.selectedSettings?.[setting.title] || '';
                if (!selectedOptionName) {
                    return '';
                }

                const selectedSegment = setting.options?.[selectedOptionName];
                if (!selectedSegment) {
                    return `${setting.title}: ${selectedOptionName}`;
                }

                return `${setting.title}: ${selectedOptionName}\n${renderContextSegment(selectedSegment)}`;
            }).filter(Boolean).join('\n\n') || 'None selected.';

            const actorContext = activeActors.slice(0, 12).map((actor) =>
                `${actor.name}: ${actor.profile || actor.description || 'No profile available.'}`,
            ).join('\n') || 'None.';

            const locationContext = activeLocations.slice(0, 12).map((location) =>
                `${location.name}${location.category ? ` (${location.category})` : ''}: ${location.description || 'No description available.'}`,
            ).join('\n') || 'None.';

            const response = await stageInstance.generateText(
                buildPrompt()
                    .addBlock(
                        'Instructions',
                        'This is a structured request for generating a complete UI style profile for a calendar-driven visual novel. ' +
                        'Select font stacks and colors that match the game world and current cast/location tone. ' +
                        'Return every field in the required format. ' +
                        'Use valid CSS font-family values. ' +
                        'For primary/inactive/active/accent/background fields, output hex colors (#RRGGBB preferred). ' +
                        'For border and calendar overlay/card fields, output valid CSS colors (hex or rgba).',
                    )
                    .addBlock('Game Title', configuration.title || 'Agenda VN')
                    .addBlock('World Context', contextText)
                    .addBlock('Selected Settings Context', selectedSettingContext)
                    .addBlock('Active Characters', actorContext)
                    .addBlock('Active Locations', locationContext)
                    .addBlock('Field Usage Guide', buildStyleUsageGuide())
                    .addBlock('Current Style Values', JSON.stringify(uiSettings, null, 2))
                    .addBlock('Response Format', buildStructuredResponseFormat(UI_SETTINGS_GENERATION_FIELDS, { includeEndTag: true }))
                    .addBlock('Example Response', buildStructuredExampleResponse(UI_SETTINGS_GENERATION_FIELDS, {
                        ui_font_family: '"Nunito Sans", "Segoe UI", sans-serif',
                        flavor_font_family: '"Cormorant Garamond", "Times New Roman", serif',
                        primary_color: '#f0f5f9',
                        inactive_color: '#adc2d3',
                        active_color: '#8dd1a2',
                        accent_color: '#9abed9',
                        bg_deep_color: '#141c2a',
                        bg_mid_color: '#1f2a3d',
                        bg_soft_color: '#28344a',
                        border_color: 'rgba(154, 190, 217, 0.35)',
                        border_strong_color: 'rgba(141, 209, 162, 0.5)',
                        calendar_overlay_start: 'rgba(11, 22, 37, 0.82)',
                        calendar_overlay_mid: 'rgba(24, 41, 46, 0.74)',
                        calendar_overlay_end: 'rgba(35, 27, 59, 0.79)',
                        calendar_card_background: 'rgba(25, 33, 50, 0.92)',
                        calendar_card_border: 'rgba(154, 190, 217, 0.37)',
                    }, { includeEndTag: true }))
                    .format(),
                80,
                550,
            );

            const parsed = parseStructuredResponse(response, UI_SETTINGS_GENERATION_FIELDS);

            const nextSettings: UiSettings = {
                ...uiSettings,
                uiFontFamily: (parsed.ui_font_family || uiSettings.uiFontFamily).trim() || uiSettings.uiFontFamily,
                flavorFontFamily: (parsed.flavor_font_family || uiSettings.flavorFontFamily).trim() || uiSettings.flavorFontFamily,
                primaryColor: isValidHexColor(parsed.primary_color || '') ? parsed.primary_color.trim() : uiSettings.primaryColor,
                inactiveColor: isValidHexColor(parsed.inactive_color || '') ? parsed.inactive_color.trim() : uiSettings.inactiveColor,
                activeColor: isValidHexColor(parsed.active_color || '') ? parsed.active_color.trim() : uiSettings.activeColor,
                accentColor: isValidHexColor(parsed.accent_color || '') ? parsed.accent_color.trim() : uiSettings.accentColor,
                bgDeepColor: isValidHexColor(parsed.bg_deep_color || '') ? parsed.bg_deep_color.trim() : uiSettings.bgDeepColor,
                bgMidColor: isValidHexColor(parsed.bg_mid_color || '') ? parsed.bg_mid_color.trim() : uiSettings.bgMidColor,
                bgSoftColor: isValidHexColor(parsed.bg_soft_color || '') ? parsed.bg_soft_color.trim() : uiSettings.bgSoftColor,
                borderColor: isValidCssColor(parsed.border_color || '') ? parsed.border_color.trim() : uiSettings.borderColor,
                borderStrongColor: isValidCssColor(parsed.border_strong_color || '') ? parsed.border_strong_color.trim() : uiSettings.borderStrongColor,
                calendarOverlayStart: isValidCssColor(parsed.calendar_overlay_start || '') ? parsed.calendar_overlay_start.trim() : uiSettings.calendarOverlayStart,
                calendarOverlayMid: isValidCssColor(parsed.calendar_overlay_mid || '') ? parsed.calendar_overlay_mid.trim() : uiSettings.calendarOverlayMid,
                calendarOverlayEnd: isValidCssColor(parsed.calendar_overlay_end || '') ? parsed.calendar_overlay_end.trim() : uiSettings.calendarOverlayEnd,
                calendarCardBackground: isValidCssColor(parsed.calendar_card_background || '') ? parsed.calendar_card_background.trim() : uiSettings.calendarCardBackground,
                calendarCardBorder: isValidCssColor(parsed.calendar_card_border || '') ? parsed.calendar_card_border.trim() : uiSettings.calendarCardBorder,
            };

            setUiSettings(nextSettings);
            stageInstance.updateUiSettings(nextSettings);
            applyUiSettingsToRoot(nextSettings);
            stageInstance.showPriorityMessage('Generated style palette and font settings from game context.');
        } catch (error) {
            console.error('Failed to generate style settings:', error);
            stageInstance.showPriorityMessage('Failed to generate style settings. Check console for details.');
        } finally {
            setIsGeneratingStyles(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                    <Title variant="glow" style={{ fontSize: '20px', margin: 0 }}>UI Theme</Title>
                    <Button
                        onClick={() => {
                            if (isGeneratingStyles) {
                                return;
                            }

                            setConfirmDialog({
                                open: true,
                                title: 'Generate UI Theme',
                                message: 'Warning: this will overwrite all current font and color settings on this screen.',
                                actions: [
                                    {
                                        label: isGeneratingStyles ? 'Generating...' : 'Generate',
                                        onClick: async () => {
                                            setConfirmDialog((prev) => ({ ...prev, open: false }));
                                            await handleGenerateStyles();
                                        },
                                        variant: 'primary',
                                    },
                                ],
                            });
                        }}
                        disabled={isGeneratingStyles}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <AutoAwesome style={{ fontSize: '18px' }} />
                        {isGeneratingStyles ? 'Generating...' : 'Generate'}
                    </Button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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

                    {styleColorFields.map(({ label, key }) => (
                        <div key={key}>
                            <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>{label}</label>
                            <ColorPickerInput
                                value={uiSettings[key] as string}
                                onChange={(value) => setUiSettings(prev => ({ ...prev, [key]: value }))}
                                popoverTitle={`Choose ${label}`}
                                swatches={getSwatchesForStyleKey(key)}
                                inputStyle={{ width: '100%' }}
                            />
                        </div>
                    ))}

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Border Color</label>
                        <AlphaColorPickerInput
                            value={uiSettings.borderColor}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, borderColor: value }))}
                            popoverTitle="Choose Border Color"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Border Strong Color</label>
                        <AlphaColorPickerInput
                            value={uiSettings.borderStrongColor}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, borderStrongColor: value }))}
                            popoverTitle="Choose Border Strong Color"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>
                </div>
            </GlassPanel>

            <GlassPanel variant="default" style={{ padding: '18px' }}>
                <Title variant="glow" style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Calendar Styling</Title>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Overlay Start</label>
                        <AlphaColorPickerInput
                            value={uiSettings.calendarOverlayStart}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, calendarOverlayStart: value }))}
                            popoverTitle="Choose Overlay Start"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Overlay Mid</label>
                        <AlphaColorPickerInput
                            value={uiSettings.calendarOverlayMid}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, calendarOverlayMid: value }))}
                            popoverTitle="Choose Overlay Mid"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Overlay End</label>
                        <AlphaColorPickerInput
                            value={uiSettings.calendarOverlayEnd}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, calendarOverlayEnd: value }))}
                            popoverTitle="Choose Overlay End"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Card Background</label>
                        <AlphaColorPickerInput
                            value={uiSettings.calendarCardBackground}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, calendarCardBackground: value }))}
                            popoverTitle="Choose Card Background"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>Card Border</label>
                        <AlphaColorPickerInput
                            value={uiSettings.calendarCardBorder}
                            onChange={(value) => setUiSettings(prev => ({ ...prev, calendarCardBorder: value }))}
                            popoverTitle="Choose Card Border"
                            swatches={groupedStyleSwatches.all}
                            inputStyle={{ width: '100%' }}
                        />
                    </div>
                </div>
            </GlassPanel>

            <Dialog
                open={confirmDialog.open}
                onClose={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
                slotProps={{
                    paper: {
                        style: {
                            backgroundColor: 'rgba(0, 20, 40, 0.95)',
                            backdropFilter: 'blur(10px)',
                            border: '2px solid rgba(0, 255, 136, 0.3)',
                            borderRadius: '8px',
                            color: '#e0f0ff',
                            minWidth: '400px',
                        },
                    },
                }}
            >
                <DialogTitle style={{
                    color: '#00ff88',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    borderBottom: '2px solid rgba(0, 255, 136, 0.3)',
                    paddingBottom: '10px',
                }}>
                    {confirmDialog.title}
                </DialogTitle>
                <DialogContent style={{ paddingTop: '20px' }}>
                    <div style={{
                        color: '#e0f0ff',
                        fontSize: '14px',
                        lineHeight: '1.6',
                    }}>
                        {confirmDialog.message}
                    </div>
                </DialogContent>
                <DialogActions style={{ padding: '15px 20px', display: 'flex', gap: '10px' }}>
                    <Button
                        onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
                        variant="secondary"
                    >
                        Cancel
                    </Button>
                    {confirmDialog.actions?.map((action, index) => (
                        <Button
                            key={index}
                            onClick={action.onClick}
                            variant={action.variant || 'primary'}
                        >
                            {action.label}
                        </Button>
                    ))}
                </DialogActions>
            </Dialog>
        </div>
    );
};

export default StyleManagementPanel;