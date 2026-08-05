import { buildPrompt } from '../utils/PromptBuilder.js';
import {
    buildStructuredExampleResponse,
    buildStructuredResponseFormat,
    StructuredFieldDefinition,
} from '../utils/StructuredResponse.js';

export type UiSettings = {
    interfaceFontFamily: string;
    displayFontFamily: string;
    textPrimaryColor: string;
    highlightColor: string;
    textMutedColor: string;
    accentColor: string;
    surfaceBaseColor: string;
    surfaceRaisedColor: string;
    surfaceElevatedColor: string;
    lineSubtleColor: string;
    lineStrongColor: string;
    atmosphereStartColor: string;
    atmosphereMidColor: string;
    atmosphereEndColor: string;
    panelSurfaceColor: string;
    panelBorderColor: string;
};

export const DEFAULT_UI_SETTINGS: UiSettings = {
    interfaceFontFamily: '"Geologica", sans-serif',
    displayFontFamily: '"Lora", Georgia, serif',
    accentColor: '#8ab0cc',
    highlightColor: '#89cd87',
    textPrimaryColor: '#edf2f2',
    textMutedColor: '#b9d2e3',
    surfaceBaseColor: '#1a1e30',
    surfaceRaisedColor: '#24293f',
    surfaceElevatedColor: '#2e354d',
    lineSubtleColor: 'rgba(138, 176, 204, 0.34)',
    lineStrongColor: 'rgba(137, 205, 135, 0.44)',
    atmosphereStartColor: 'rgba(10, 28, 37, 0.79)',
    atmosphereMidColor: 'rgba(21, 41, 30, 0.73)',
    atmosphereEndColor: 'rgba(35, 24, 56, 0.78)',
    panelSurfaceColor: 'rgba(28, 34, 52, 0.92)',
    panelBorderColor: 'rgba(138, 176, 204, 0.34)',
};

export const UI_SETTINGS_GENERATION_FIELDS: StructuredFieldDefinition[] = [
    { key: 'interface_font_family', label: 'INTERFACE FONT FAMILY', description: 'Primary UI font stack for controls and interface text.' },
    { key: 'display_font_family', label: 'DISPLAY FONT FAMILY', description: 'Secondary flavor font stack for decorative or narrative-forward headings/body copy.' },
    { key: 'text_primary_color', label: 'TEXT PRIMARY COLOR', description: 'Main readable UI text color for high-emphasis content.' },
    { key: 'text_muted_color', label: 'TEXT MUTED COLOR', description: 'Muted text color for secondary or de-emphasized UI text.' },
    { key: 'highlight_color', label: 'HIGHLIGHT COLOR', description: 'Highlight color for selected, active, or currently focused states.' },
    { key: 'accent_color', label: 'ACCENT COLOR', description: 'Accent color for icons, special labels, and differentiation points.' },
    { key: 'surface_base_color', label: 'SURFACE BASE COLOR', description: 'Deepest background layer color for base canvas and depth.' },
    { key: 'surface_raised_color', label: 'SURFACE RAISED COLOR', description: 'Middle background layer color for panels and transitions.' },
    { key: 'surface_elevated_color', label: 'SURFACE ELEVATED COLOR', description: 'Soft background layer color for elevated sections and gentle contrast.' },
    { key: 'line_subtle_color', label: 'LINE SUBTLE COLOR', description: 'Standard border color for panels and common framing.' },
    { key: 'line_strong_color', label: 'LINE STRONG COLOR', description: 'Stronger border color for key callouts and emphasized framing.' },
    { key: 'atmosphere_start_color', label: 'ATMOSPHERE START COLOR', description: 'Gradient overlay start color for full-screen atmosphere.' },
    { key: 'atmosphere_mid_color', label: 'ATMOSPHERE MID COLOR', description: 'Gradient overlay midpoint color for depth transitions.' },
    { key: 'atmosphere_end_color', label: 'ATMOSPHERE END COLOR', description: 'Gradient overlay end color for mood and finish.' },
    { key: 'panel_surface_color', label: 'PANEL SURFACE COLOR', description: 'Background color for shared cards and panel surfaces.' },
    { key: 'panel_border_color', label: 'PANEL BORDER COLOR', description: 'Border color for shared cards and panel surfaces.' },
];

export const UI_STYLE_FIELD_LABELS: Record<keyof UiSettings, string> = {
    interfaceFontFamily: 'UI Font Family',
    displayFontFamily: 'Flavor Font Family',
    textPrimaryColor: 'Primary Text',
    textMutedColor: 'Secondary Text',
    highlightColor: 'Interactive Highlight',
    accentColor: 'Accent',
    surfaceBaseColor: 'Surface Base',
    surfaceRaisedColor: 'Surface Raised',
    surfaceElevatedColor: 'Surface Elevated',
    lineSubtleColor: 'Line / Border',
    lineStrongColor: 'Line / Border Emphasis',
    atmosphereStartColor: 'Atmosphere Overlay A',
    atmosphereMidColor: 'Atmosphere Overlay B',
    atmosphereEndColor: 'Atmosphere Overlay C',
    panelSurfaceColor: 'Panel / Card Surface',
    panelBorderColor: 'Panel / Card Border',
};

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGBA_COLOR_REGEX = /^rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|0?\.\d+|1(?:\.0+)?))?\s*\)$/i;

export const cloneUiSettings = (settings?: Partial<UiSettings>): UiSettings => ({
    ...DEFAULT_UI_SETTINGS,
    ...(settings || {}),
});

export const renderContextSegment = (segment: any): string => {
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

export const applyUiSettingsToRoot = (uiSettings: UiSettings) => {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--agenda-accent-primary', uiSettings.accentColor);
    rootStyle.setProperty('--agenda-highlight', uiSettings.highlightColor);
    rootStyle.setProperty('--agenda-text-primary', uiSettings.textPrimaryColor);
    rootStyle.setProperty('--agenda-text-muted', uiSettings.textMutedColor);
    rootStyle.setProperty('--agenda-surface-base', uiSettings.surfaceBaseColor);
    rootStyle.setProperty('--agenda-surface-raised', uiSettings.surfaceRaisedColor);
    rootStyle.setProperty('--agenda-surface-elevated', uiSettings.surfaceElevatedColor);
    rootStyle.setProperty('--agenda-line-subtle', uiSettings.lineSubtleColor);
    rootStyle.setProperty('--agenda-line-strong', uiSettings.lineStrongColor);
    rootStyle.setProperty('--agenda-font-base', uiSettings.interfaceFontFamily);
    rootStyle.setProperty('--agenda-font-display', uiSettings.displayFontFamily);
    rootStyle.setProperty('--agenda-atmosphere-start', uiSettings.atmosphereStartColor);
    rootStyle.setProperty('--agenda-atmosphere-mid', uiSettings.atmosphereMidColor);
    rootStyle.setProperty('--agenda-atmosphere-end', uiSettings.atmosphereEndColor);
    rootStyle.setProperty('--agenda-panel-surface', uiSettings.panelSurfaceColor);
    rootStyle.setProperty('--agenda-panel-border', uiSettings.panelBorderColor);
};

const isValidHexColor = (value: string): boolean => HEX_COLOR_REGEX.test((value || '').trim());

const isValidCssColor = (value: string): boolean => {
    const normalized = (value || '').trim();
    return HEX_COLOR_REGEX.test(normalized) || RGBA_COLOR_REGEX.test(normalized);
};

const buildStyleUsageGuide = () => [
    'interfaceFontFamily: Main font for controls, labels, and core interface text.',
    'displayFontFamily: Flavor font for stylized tone, dramatic emphasis, and thematic text moments.',
    'textPrimaryColor: Main high-contrast text color.',
    'textMutedColor: Subdued text color for secondary information.',
    'highlightColor: Active/selected/highlight color for actionable or focused UI states.',
    'accentColor: Accent color for icons and visual differentiation.',
    'surfaceBaseColor: Deepest layer of the background palette.',
    'surfaceRaisedColor: Mid-layer background color supporting panel separation.',
    'surfaceElevatedColor: Soft elevated background tone for nearby surfaces.',
    'lineSubtleColor: Regular border stroke color.',
    'lineStrongColor: Strong border stroke color for emphasis.',
    'atmosphereStartColor: Atmosphere overlay gradient start (calendar and other full-screen overlays).',
    'atmosphereMidColor: Atmosphere overlay gradient midpoint (calendar and other full-screen overlays).',
    'atmosphereEndColor: Atmosphere overlay gradient end (calendar and other full-screen overlays).',
    'panelSurfaceColor: Shared panel/card fill color (used beyond the calendar where suitable).',
    'panelBorderColor: Shared panel/card border color (used beyond the calendar where suitable).',
].join('\n');

export type UiStyleGenerationInput = {
    gameTitle: string;
    worldContext: string;
    selectedSettingsContext: string;
    actorContext: string;
    locationContext: string;
    currentUiSettings: UiSettings;
};

export const buildUiSettingsGenerationPrompt = (input: UiStyleGenerationInput): string => {
    return buildPrompt()
        .addBlock(
            'Instructions',
            'This is a structured request for generating a complete UI style profile for a calendar-driven visual novel. ' +
            'Select font stacks and colors that match the game world and current cast/location tone. ' +
            'Return every field in the required format. ' +
            'Use valid CSS font-family values. ' +
            'For text/highlight/accent/surface fields, output hex colors (#RRGGBB preferred). ' +
            'For line/atmosphere/panel fields, output valid CSS colors (hex or rgba).',
        )
        .addBlock('Game Title', input.gameTitle || 'Agenda VN')
        .addBlock('World Context', input.worldContext || 'None provided.')
        .addBlock('Selected Settings Context', input.selectedSettingsContext || 'None selected.')
        .addBlock('Active Characters', input.actorContext || 'None.')
        .addBlock('Active Locations', input.locationContext || 'None.')
        .addBlock('Field Usage Guide', buildStyleUsageGuide())
        .addBlock('Current Style Values', JSON.stringify(input.currentUiSettings, null, 2))
        .addBlock('Response Format', buildStructuredResponseFormat(UI_SETTINGS_GENERATION_FIELDS, { includeEndTag: true }))
        .addBlock('Example Response', buildStructuredExampleResponse(UI_SETTINGS_GENERATION_FIELDS, {
            interface_font_family: '"Nunito Sans", "Segoe UI", sans-serif',
            display_font_family: '"Cormorant Garamond", "Times New Roman", serif',
            text_primary_color: '#f0f5f9',
            text_muted_color: '#adc2d3',
            highlight_color: '#8dd1a2',
            accent_color: '#9abed9',
            surface_base_color: '#141c2a',
            surface_raised_color: '#1f2a3d',
            surface_elevated_color: '#28344a',
            line_subtle_color: 'rgba(154, 190, 217, 0.35)',
            line_strong_color: 'rgba(141, 209, 162, 0.5)',
            atmosphere_start_color: 'rgba(11, 22, 37, 0.82)',
            atmosphere_mid_color: 'rgba(24, 41, 46, 0.74)',
            atmosphere_end_color: 'rgba(35, 27, 59, 0.79)',
            panel_surface_color: 'rgba(25, 33, 50, 0.92)',
            panel_border_color: 'rgba(154, 190, 217, 0.37)',
        }, { includeEndTag: true }))
        .format();
};

export const mergeGeneratedUiSettings = (current: UiSettings, parsed: { [key: string]: string }): UiSettings => ({
    ...current,
    interfaceFontFamily: (parsed.interface_font_family || current.interfaceFontFamily).trim() || current.interfaceFontFamily,
    displayFontFamily: (parsed.display_font_family || current.displayFontFamily).trim() || current.displayFontFamily,
    textPrimaryColor: isValidHexColor(parsed.text_primary_color || '') ? parsed.text_primary_color.trim() : current.textPrimaryColor,
    textMutedColor: isValidHexColor(parsed.text_muted_color || '') ? parsed.text_muted_color.trim() : current.textMutedColor,
    highlightColor: isValidHexColor(parsed.highlight_color || '') ? parsed.highlight_color.trim() : current.highlightColor,
    accentColor: isValidHexColor(parsed.accent_color || '') ? parsed.accent_color.trim() : current.accentColor,
    surfaceBaseColor: isValidHexColor(parsed.surface_base_color || '') ? parsed.surface_base_color.trim() : current.surfaceBaseColor,
    surfaceRaisedColor: isValidHexColor(parsed.surface_raised_color || '') ? parsed.surface_raised_color.trim() : current.surfaceRaisedColor,
    surfaceElevatedColor: isValidHexColor(parsed.surface_elevated_color || '') ? parsed.surface_elevated_color.trim() : current.surfaceElevatedColor,
    lineSubtleColor: isValidCssColor(parsed.line_subtle_color || '') ? parsed.line_subtle_color.trim() : current.lineSubtleColor,
    lineStrongColor: isValidCssColor(parsed.line_strong_color || '') ? parsed.line_strong_color.trim() : current.lineStrongColor,
    atmosphereStartColor: isValidCssColor(parsed.atmosphere_start_color || '') ? parsed.atmosphere_start_color.trim() : current.atmosphereStartColor,
    atmosphereMidColor: isValidCssColor(parsed.atmosphere_mid_color || '') ? parsed.atmosphere_mid_color.trim() : current.atmosphereMidColor,
    atmosphereEndColor: isValidCssColor(parsed.atmosphere_end_color || '') ? parsed.atmosphere_end_color.trim() : current.atmosphereEndColor,
    panelSurfaceColor: isValidCssColor(parsed.panel_surface_color || '') ? parsed.panel_surface_color.trim() : current.panelSurfaceColor,
    panelBorderColor: isValidCssColor(parsed.panel_border_color || '') ? parsed.panel_border_color.trim() : current.panelBorderColor,
});
