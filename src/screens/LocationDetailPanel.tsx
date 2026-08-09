import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { Stage } from '../Stage';
import { CalendarTimeOfDay } from '../content/CalendarEvent';
import {
    distillLocation,
    generateBaseLocationImage,
    generateLocationImageForTimeOfDay,
    getLocationDescription,
    getLocationImagePrompt,
    getLocationTimeOfDayPrompt,
    getLinkedLocationLore,
    Location,
    LOCATION_TIME_OF_DAY_LABELS,
    LOCATION_TIME_OF_DAY_ORDER,
    updateLocationDescription,
    upsertLocationLoreEntry,
} from '../content/Location';
import { Image as ImageIcon, Place } from '@mui/icons-material';
import { buildHexColorSwatches, Button, ColorPickerInput, GlassPanel, TextArea, TextInput, Title } from './UiComponents';
import { ImageUrlUploadField } from './ImageUrlUploadField';
import { Condition } from '../content/Condition';
import { ConditionEditor } from './ConditionEditor';

interface LocationDetailPanelProps {
    location: Location;
    stage: () => Stage;
    onDeactivate?: (locationId: string) => void;
}

export const LocationDetailPanel: FC<LocationDetailPanelProps> = ({ location, stage, onDeactivate }) => {
    const linkedLoreEntry = getLinkedLocationLore(location, stage());
    const isDescriptionBackedByLore = !!linkedLoreEntry;

    const [editedLocation, setEditedLocation] = useState<{
        name: string;
        category: string;
        description: string;
        themeColor: string;
        imagePrompt: string;
        imageUrl: string;
        timeOfDayImagePrompts: Partial<Record<CalendarTimeOfDay, string>>;
        timeOfDayImageUrls: Partial<Record<CalendarTimeOfDay, string>>;
        conditions: Condition[];
        focalX: number;
        focalY: number;
    }>({
        name: location.name,
        category: location.category ?? '',
        description: getLocationDescription(location.id, stage()),
        themeColor: location.themeColor,
        imagePrompt: getLocationImagePrompt(location),
        imageUrl: location.imageUrl,
        timeOfDayImagePrompts: { ...(location.timeOfDayImagePrompts || {}) },
        timeOfDayImageUrls: { ...(location.timeOfDayImageUrls || {}) },
        conditions: [...(location.conditions || [])],
        focalX: location.focalPoint?.x ?? 0.5,
        focalY: location.focalPoint?.y ?? 0.5,
    });

    const categoryInputListId = `location-category-options-${location.id}`;
    const categorySuggestions = useMemo(() => {
        const seenCategories = new Set<string>();
        let hasUncategorized = false;

        for (const candidate of Object.values(stage().getSave().atlas || {})) {
            if (candidate.id === location.id) {
                continue;
            }
            if (candidate.active === false) {
                continue;
            }

            const normalizedCategory = (candidate.category || '').trim();
            if (!normalizedCategory) {
                hasUncategorized = true;
                continue;
            }

            const dedupeKey = normalizedCategory;
            if (!seenCategories.has(dedupeKey)) {
                seenCategories.add(dedupeKey);
            }
        }

        const values = Array.from(seenCategories).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        return {
            hasUncategorized,
            values,
        };
    }, [location.id, stage]);

    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [isUploadingTimeOfDayImages, setIsUploadingTimeOfDayImages] = useState<Record<CalendarTimeOfDay, boolean>>({
        morning: false,
        afternoon: false,
        evening: false,
        night: false,
    });
    const [isGeneratingLocationDetails, setIsGeneratingLocationDetails] = useState(false);
    const [isGeneratingBaseImage, setIsGeneratingBaseImage] = useState(false);
    const [isGeneratingTimeOfDayImages, setIsGeneratingTimeOfDayImages] = useState<Record<CalendarTimeOfDay, boolean>>({
        morning: false,
        afternoon: false,
        evening: false,
        night: false,
    });
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        title: string;
        message: string;
        actions?: Array<{ label: string; onClick: () => void; variant?: 'primary' | 'secondary' }>;
    }>({ open: false, title: '', message: '' });
    const editedLocationRef = useRef(editedLocation);
    const autoSaveTimeoutRef = useRef<number | null>(null);
    const didMountRef = useRef(false);

    const persistLocation = (
        nextLocation: typeof editedLocation
    ) => {

        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
            autoSaveTimeoutRef.current = null;
        }

        const oldName = location.name;
        location.name = nextLocation.name;
        location.category = nextLocation.category.trim();
        if (location.name !== oldName) {
            console.log(`Location name changed from "${oldName}" to "${location.name}". Updating linked lore entry.`);
            upsertLocationLoreEntry(location, oldName, stage());
        }
        updateLocationDescription(location.id, nextLocation.description, stage());
        location.themeColor = nextLocation.themeColor;
        location.imagePrompt = nextLocation.imagePrompt;
        location.imageUrl = nextLocation.imageUrl;
        location.timeOfDayImagePrompts = { ...(nextLocation.timeOfDayImagePrompts || {}) };
        location.timeOfDayImageUrls = { ...(nextLocation.timeOfDayImageUrls || {}) };
        location.conditions = [...nextLocation.conditions];
        location.focalPoint = { x: nextLocation.focalX, y: nextLocation.focalY };
    };

    const syncEditedLocationFromSource = () => {
        setEditedLocation({
            name: location.name,
            category: location.category ?? '',
            description: getLocationDescription(location.id, stage()),
            themeColor: location.themeColor,
            imagePrompt: location.imagePrompt,
            imageUrl: location.imageUrl,
            timeOfDayImagePrompts: { ...(location.timeOfDayImagePrompts || {}) },
            timeOfDayImageUrls: { ...(location.timeOfDayImageUrls || {}) },
            conditions: [...(location.conditions || [])],
            focalX: location.focalPoint?.x ?? 0.5,
            focalY: location.focalPoint?.y ?? 0.5,
        });
    };

    useEffect(() => {
        editedLocationRef.current = editedLocation;
    }, [editedLocation]);

    useEffect(() => {
        if (!didMountRef.current) {
            didMountRef.current = true;
            return;
        }

        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
        }

        autoSaveTimeoutRef.current = window.setTimeout(() => {
            persistLocation(editedLocationRef.current);
        }, 300);

        return () => {
            if (autoSaveTimeoutRef.current) {
                clearTimeout(autoSaveTimeoutRef.current);
            }
        };
    }, [editedLocation]);

    useEffect(() => {
        return () => {
            if (autoSaveTimeoutRef.current) {
                persistLocation(editedLocationRef.current);
            }
        };
    }, []);

    const handleInputChange = (field: string, value: string | number | boolean) => {
        setEditedLocation(prev => ({ ...prev, [field]: value }));
    };

    const handleLocationImageUpload = async (file: File) => {
        setIsUploadingImage(true);
        try {
            const uploadedUrl = await stage().uploadFile(`location-${location.id}.png`, file);
            handleInputChange('imageUrl', uploadedUrl);
            location.imageUrl = uploadedUrl;
        } catch (error) {
            console.error('Failed to upload location image:', error);
            stage().showPriorityMessage('Failed to upload location image. Check console for details.');
        } finally {
            setIsUploadingImage(false);
        }
    };

    const handleImagePromptChange = (value: string) => {
        setEditedLocation((current) => {
            location.imagePrompt = value;
            return { ...current, imagePrompt: value };
        });
    };

    const handleGenerateBaseImage = async () => {
        if (isGeneratingBaseImage) {
            return;
        }

        setIsGeneratingBaseImage(true);
        try {
            const generatedImageUrl = await generateBaseLocationImage(location, stage(), true);
            if (!generatedImageUrl) {
                throw new Error('Failed to generate base location image.');
            }

            syncEditedLocationFromSource();
            stage().showPriorityMessage(`Generated base image for ${location.name || 'location'}.`);
        } catch (error) {
            console.error('Failed to generate base location image:', error);
            stage().showPriorityMessage('Failed to generate base location image. Check console for details.');
        } finally {
            setIsGeneratingBaseImage(false);
        }
    };

    const handleTimeOfDayPromptChange = (timeOfDay: CalendarTimeOfDay, value: string) => {
        setEditedLocation((current) => {
            const nextTimeOfDayImagePrompts = { ...(current.timeOfDayImagePrompts || {}), [timeOfDay]: value };
            location.timeOfDayImagePrompts = nextTimeOfDayImagePrompts;
            return { ...current, timeOfDayImagePrompts: nextTimeOfDayImagePrompts };
        });
    };

    const handleTimeOfDayImageUpload = async (timeOfDay: CalendarTimeOfDay, file: File) => {
        setIsUploadingTimeOfDayImages((current) => ({ ...current, [timeOfDay]: true }));
        try {
            const uploadedUrl = await stage().uploadFile(`location-${location.id}-${timeOfDay}.png`, file);
            setEditedLocation((current) => {
                const nextTimeOfDayImageUrls = { ...(current.timeOfDayImageUrls || {}), [timeOfDay]: uploadedUrl };
                location.timeOfDayImageUrls = nextTimeOfDayImageUrls;
                return { ...current, timeOfDayImageUrls: nextTimeOfDayImageUrls };
            });
        } catch (error) {
            console.error(`Failed to upload ${timeOfDay} location image:`, error);
            stage().showPriorityMessage(`Failed to upload ${timeOfDay} location image. Check console for details.`);
        } finally {
            setIsUploadingTimeOfDayImages((current) => ({ ...current, [timeOfDay]: false }));
        }
    };

    const handleGenerateTimeOfDayImage = async (timeOfDay: CalendarTimeOfDay) => {
        if (isGeneratingTimeOfDayImages[timeOfDay]) {
            return;
        }

        setIsGeneratingTimeOfDayImages((current) => ({ ...current, [timeOfDay]: true }));
        try {
            if (!location.imageUrl) {
                await generateBaseLocationImage(location, stage());
                syncEditedLocationFromSource();
            }

            const generatedImageUrl = await generateLocationImageForTimeOfDay(location, timeOfDay, stage(), true);
            if (!generatedImageUrl) {
                throw new Error(`Failed to generate ${timeOfDay} location image.`);
            }

            syncEditedLocationFromSource();
            stage().showPriorityMessage(`Generated ${LOCATION_TIME_OF_DAY_LABELS[timeOfDay].toLowerCase()} image for ${location.name || 'location'}.`);
        } catch (error) {
            console.error(`Failed to generate ${timeOfDay} location image:`, error);
            stage().showPriorityMessage(`Failed to generate ${timeOfDay} location image. Check console for details.`);
        } finally {
            setIsGeneratingTimeOfDayImages((current) => ({ ...current, [timeOfDay]: false }));
        }
    };

    const handleGenerateLocationDetails = async () => {
        if (isGeneratingLocationDetails) {
            return;
        }

        const nextLocation = editedLocationRef.current;
        persistLocation(nextLocation);

        const linkedLore = getLinkedLocationLore(location, stage());
        const previousState = {
            name: location.name,
            category: location.category,
            description: location.description,
            themeColor: location.themeColor,
            imagePrompt: location.imagePrompt,
            imageUrl: location.imageUrl,
            timeOfDayImageUrls: { ...(location.timeOfDayImageUrls || {}) },
            focalPoint: location.focalPoint ? { ...location.focalPoint } : { x: 0.5, y: 0.5 },
            linkedLore: linkedLore
                ? {
                    title: linkedLore.title,
                    content: linkedLore.content,
                }
                : null,
        };

        setIsGeneratingLocationDetails(true);

        try {
            const distilledLocation = await distillLocation(location, {
                name: nextLocation.name,
                category: nextLocation.category,
                description: nextLocation.description,
                themeColor: nextLocation.themeColor,
            }, stage());

            if (!distilledLocation) {
                throw new Error('Location distillation returned no location.');
            }

            syncEditedLocationFromSource();
            stage().showPriorityMessage(`Generated new details for ${location.name}.`);
        } catch (error) {
            location.name = previousState.name;
            location.category = previousState.category;
            location.description = previousState.description;
            location.themeColor = previousState.themeColor;
            location.imagePrompt = previousState.imagePrompt;
            location.imageUrl = previousState.imageUrl;
            location.timeOfDayImageUrls = { ...(previousState.timeOfDayImageUrls || {}) };
            location.focalPoint = previousState.focalPoint;

            const restoredLore = getLinkedLocationLore(location, stage());
            if (restoredLore && previousState.linkedLore) {
                restoredLore.title = previousState.linkedLore.title;
                restoredLore.content = previousState.linkedLore.content;
            }

            syncEditedLocationFromSource();
            console.error('Failed to generate location details:', error);
            stage().showPriorityMessage('Failed to generate location details. Check console for details.');
        } finally {
            setIsGeneratingLocationDetails(false);
        }
    };

    const handleDeactivateLocation = () => {
        const linkedLore = getLinkedLocationLore(location, stage());
        location.active = false;

        if (linkedLore) {
            const save = stage().getSave();
            save.lorebook = (save.lorebook || []).filter((entry) => entry.id !== linkedLore.id);
        }

        stage().showPriorityMessage(`${location.name || 'Location'} is now inactive and hidden from management.`);
        onDeactivate?.(location.id);
    };

    const clampedCoord = (value: string): number => {
        const n = parseFloat(value);
        if (isNaN(n)) return 0;
        return Math.min(1, Math.max(0, n));
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        color: 'var(--agenda-highlight)',
        fontSize: '14px',
        fontWeight: 'bold',
        marginBottom: '8px',
    };

    const sectionHeadingStyle: React.CSSProperties = {
        color: 'var(--agenda-highlight)',
        fontSize: '18px',
        fontWeight: 'bold',
        marginBottom: '15px',
        borderBottom: '2px solid var(--agenda-line-strong)',
        paddingBottom: '5px',
    };

    const textareaStyle: React.CSSProperties = {
        width: '100%',
        minHeight: '100px',
        padding: '12px',
        fontSize: '14px',
        backgroundColor: 'color-mix(in srgb, var(--agenda-surface-base) 82%, transparent)',
        border: '2px solid var(--agenda-line-strong)',
        borderRadius: '5px',
        color: 'var(--agenda-text-primary)',
        fontFamily: 'inherit',
        resize: 'vertical',
    };

    const sliderRowStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: '12px',
    };

    const sliderStyle: React.CSSProperties = {
        width: '100%',
        accentColor: 'var(--agenda-highlight)',
        cursor: 'pointer',
    };

    const sliderValueStyle: React.CSSProperties = {
        minWidth: '56px',
        textAlign: 'right',
        color: 'var(--agenda-text-primary)',
        fontSize: '13px',
        fontVariantNumeric: 'tabular-nums',
        opacity: 0.9,
    };

    const locationThemeColorSwatches = useMemo(() => {
        const locations = Object.values(stage().getSave().atlas || {});
        const activeLocations = locations.filter((candidate) => candidate.active !== false);
        const targetCategory = (editedLocation.category || '').trim().toLowerCase();

        const sameCategoryThemeColors = activeLocations
            .filter((candidate) => candidate.id !== location.id)
            .filter((candidate) => (candidate.category || '').trim().toLowerCase() === targetCategory)
            .map((candidate) => candidate.themeColor);

        const otherThemeColors = activeLocations
            .filter((candidate) => candidate.id !== location.id)
            .filter((candidate) => (candidate.category || '').trim().toLowerCase() !== targetCategory)
            .map((candidate) => candidate.themeColor);

        return buildHexColorSwatches([
            editedLocation.themeColor,
            ...sameCategoryThemeColors,
            ...otherThemeColors,
        ]);
    }, [editedLocation.category, editedLocation.themeColor, location.id, stage]);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                style={{
                    position: 'relative',
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'stretch',
                    justifyContent: 'center',
                    zIndex: 'auto',
                    padding: '0',
                    width: '100%',
                    height: '100%',
                    minHeight: 0,
                }}
            >
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        width: '100%',
                        maxWidth: 'none',
                        maxHeight: 'none',
                        height: '100%',
                        minHeight: 0,
                    }}
                >
                    <GlassPanel
                        variant="default"
                        style={{
                            height: '100%',
                            overflow: 'auto',
                            position: 'relative',
                            padding: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            minHeight: 0,
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            marginBottom: '20px',
                            position: 'static',
                            top: 'auto',
                            background: 'transparent',
                            backdropFilter: 'none',
                            padding: '0',
                            zIndex: 'auto',
                        }}>
                            <Title variant="glow" style={{ fontSize: '24px', margin: 0 }}>
                                Location Details: {editedLocation.name}
                            </Title>
                        </div>

                        {/* Form */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', flex: 1 }}>

                            {/* Basic Information */}
                            <section>
                                <h2 style={sectionHeadingStyle}>Basic Information</h2>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    <div>
                                        <label style={labelStyle}>Name</label>
                                        <TextInput
                                            fullWidth
                                            value={editedLocation.name}
                                            onChange={(e) => handleInputChange('name', e.target.value)}
                                            placeholder="Location name"
                                        />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Category</label>
                                        <TextInput
                                            fullWidth
                                            value={editedLocation.category}
                                            onChange={(e) => handleInputChange('category', e.target.value)}
                                            placeholder="Choose or type a category (leave blank for Uncategorized)"
                                            list={categoryInputListId}
                                        />
                                        <datalist id={categoryInputListId}>
                                            {categorySuggestions.hasUncategorized && (
                                                <option value="">Uncategorized</option>
                                            )}
                                            {categorySuggestions.values.map((category) => (
                                                <option key={category} value={category} />
                                            ))}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>
                                            Description{isDescriptionBackedByLore ? ' (From Lorebook)' : ''}
                                        </label>
                                        <TextArea
                                            value={editedLocation.description}
                                            onChange={(e) => handleInputChange('description', e.target.value)}
                                            placeholder="A description of this location"
                                            style={textareaStyle}
                                        />
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h2 style={sectionHeadingStyle}>Availability</h2>
                                <ConditionEditor
                                    conditions={editedLocation.conditions}
                                    playerStats={stage().getConfiguration().playerStats || []}
                                    onChange={(conditions) => setEditedLocation(current => ({ ...current, conditions }))}
                                />
                            </section>

                            {/* Visual Theme */}
                            <section>
                                <h2 style={sectionHeadingStyle}>Visual Theme</h2>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div>
                                        <label style={labelStyle}>Theme Color</label>
                                        <ColorPickerInput
                                            value={editedLocation.themeColor}
                                            onChange={(value) => handleInputChange('themeColor', value)}
                                            placeholder="#RRGGBB"
                                            popoverTitle="Choose theme color"
                                            swatches={locationThemeColorSwatches}
                                            inputStyle={{ flex: 1 }}
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* Positioning */}
                            <section>
                                <h2 style={sectionHeadingStyle}>Positioning</h2>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div>
                                        <label style={labelStyle}>Focal Point X <span style={{ fontWeight: 'normal', opacity: 0.7 }}>(0–1)</span></label>
                                        <div style={sliderRowStyle}>
                                            <input
                                                type="range"
                                                value={editedLocation.focalX}
                                                min={0}
                                                max={1}
                                                step={0.01}
                                                onChange={(e) => handleInputChange('focalX', clampedCoord(e.target.value))}
                                                style={sliderStyle}
                                            />
                                            <span style={sliderValueStyle}>{editedLocation.focalX.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Focal Point Y <span style={{ fontWeight: 'normal', opacity: 0.7 }}>(0–1)</span></label>
                                        <div style={sliderRowStyle}>
                                            <input
                                                type="range"
                                                value={editedLocation.focalY}
                                                min={0}
                                                max={1}
                                                step={0.01}
                                                onChange={(e) => handleInputChange('focalY', clampedCoord(e.target.value))}
                                                style={sliderStyle}
                                            />
                                            <span style={sliderValueStyle}>{editedLocation.focalY.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Location Image */}
                            <section>
                                <h2 style={{ ...sectionHeadingStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <ImageIcon />
                                    Base Location Image
                                </h2>
                                <p style={{ color: 'var(--agenda-text-muted)', fontSize: '13px', marginTop: '-8px', marginBottom: '14px' }}>
                                    This is the fallback image used when no time-of-day variant is available.
                                </p>
                                <ImageUrlUploadField
                                    imageUrl={editedLocation.imageUrl}
                                    onImageUrlChange={(value) => handleInputChange('imageUrl', value)}
                                    onUploadFile={handleLocationImageUpload}
                                    isUploading={isUploadingImage}
                                    previewBorder={`3px solid ${editedLocation.themeColor || 'var(--agenda-line-strong)'}`}
                                    previewBackgroundPosition={`${editedLocation.focalX * 100}% ${editedLocation.focalY * 100}%`}
                                    previewPlaceholder={<Place style={{ fontSize: '48px', color: 'var(--agenda-accent-primary)' }} />}
                                    previewUploadHint={isUploadingImage ? 'Uploading...' : 'Click image to upload'}
                                    onInvalidFile={() => stage().showPriorityMessage('Please select a valid image file.')}
                                />
                                <div style={{ marginTop: '12px' }}>
                                    <label style={labelStyle}>Base Image Prompt</label>
                                    <TextArea
                                        value={editedLocation.imagePrompt}
                                        onChange={(e) => handleImagePromptChange(e.target.value)}
                                        placeholder="Describe the base image to generate for this location"
                                        style={textareaStyle}
                                    />
                                    <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                                        <Button
                                            onClick={handleGenerateBaseImage}
                                            disabled={isGeneratingBaseImage}
                                        >
                                            {isGeneratingBaseImage ? 'Generating...' : 'Generate Base Image'}
                                        </Button>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h2 style={{ ...sectionHeadingStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <ImageIcon />
                                    Time of Day Variants
                                </h2>
                                <p style={{ color: 'var(--agenda-text-muted)', fontSize: '13px', marginTop: '-8px', marginBottom: '14px' }}>
                                    Each variant can be uploaded directly or generated from the base location image.
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                                    {LOCATION_TIME_OF_DAY_ORDER.map((timeOfDay) => {
                                        const variantImageUrl = editedLocation.timeOfDayImageUrls?.[timeOfDay] || '';
                                        const variantPromptValue = editedLocation.timeOfDayImagePrompts?.[timeOfDay] ?? getLocationTimeOfDayPrompt(location, timeOfDay);
                                        const isUploadingVariant = isUploadingTimeOfDayImages[timeOfDay];
                                        const isGeneratingVariant = isGeneratingTimeOfDayImages[timeOfDay];

                                        return (
                                            <div
                                                key={timeOfDay}
                                                style={{
                                                    padding: '14px',
                                                    borderRadius: '10px',
                                                    border: `1px solid color-mix(in srgb, ${editedLocation.themeColor || 'var(--agenda-line-strong)'} 42%, var(--agenda-line-subtle))`,
                                                    background: 'color-mix(in srgb, var(--agenda-surface-base) 86%, transparent)',
                                                }}
                                            >
                                                <div style={{ marginBottom: '10px', color: 'var(--agenda-highlight)', fontWeight: 700, letterSpacing: '0.04em' }}>
                                                    {LOCATION_TIME_OF_DAY_LABELS[timeOfDay]}
                                                </div>
                                                <div style={{ marginBottom: '12px' }}>
                                                    <label style={labelStyle}>Prompt</label>
                                                    <TextArea
                                                        value={variantPromptValue || ''}
                                                        onChange={(e) => handleTimeOfDayPromptChange(timeOfDay, e.target.value)}
                                                        placeholder={`Describe how the scene should change for ${LOCATION_TIME_OF_DAY_LABELS[timeOfDay].toLowerCase()}`}
                                                        style={{
                                                            ...textareaStyle,
                                                            minHeight: '88px',
                                                        }}
                                                    />
                                                </div>
                                                <ImageUrlUploadField
                                                    imageUrl={variantImageUrl}
                                                    onImageUrlChange={(value) => {
                                                        setEditedLocation((current) => {
                                                            const nextTimeOfDayImageUrls = { ...(current.timeOfDayImageUrls || {}), [timeOfDay]: value };
                                                            location.timeOfDayImageUrls = nextTimeOfDayImageUrls;
                                                            return { ...current, timeOfDayImageUrls: nextTimeOfDayImageUrls };
                                                        });
                                                    }}
                                                    onUploadFile={(file) => handleTimeOfDayImageUpload(timeOfDay, file)}
                                                    isUploading={isUploadingVariant}
                                                    inputLabel={`${LOCATION_TIME_OF_DAY_LABELS[timeOfDay]} Image URL`}
                                                    previewWidth="140px"
                                                    previewHeight="105px"
                                                    previewBorder={`2px solid ${editedLocation.themeColor || 'var(--agenda-line-strong)'}`}
                                                    previewBackgroundPosition={`${editedLocation.focalX * 100}% ${editedLocation.focalY * 100}%`}
                                                    previewPlaceholder={<Place style={{ fontSize: '36px', color: 'var(--agenda-accent-primary)' }} />}
                                                    previewUploadHint={isUploadingVariant ? 'Uploading...' : 'Click image to upload'}
                                                    onInvalidFile={() => stage().showPriorityMessage('Please select a valid image file.')}
                                                />
                                                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                                                    <Button
                                                        onClick={() => handleGenerateTimeOfDayImage(timeOfDay)}
                                                        disabled={isGeneratingVariant}
                                                    >
                                                        {isGeneratingVariant ? 'Generating...' : `Generate ${LOCATION_TIME_OF_DAY_LABELS[timeOfDay]} Image`}
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>

                            <div
                                style={{
                                    position: 'sticky',
                                    bottom: 0,
                                    display: 'flex',
                                    justifyContent: 'flex-end',
                                    gap: '10px',
                                    marginTop: '10px',
                                    paddingTop: '12px',
                                    paddingBottom: '4px',
                                    background: 'color-mix(in srgb, var(--agenda-surface-base) 92%, transparent)',
                                    backdropFilter: 'blur(6px)',
                                    borderTop: '1px solid var(--agenda-line-subtle)',
                                    zIndex: 1,
                                }}
                            >
                                <Button
                                    onClick={() => {
                                        setConfirmDialog({
                                            open: true,
                                            title: `Delete Location: ${editedLocation.name || location.name}`,
                                            message: 'This will mark this location as inactive (soft delete), hide it from management lists, and delete its linked lorebook entry. Existing references remain intact in past content. Continue?',
                                            actions: [
                                                {
                                                    label: 'Delete Location',
                                                    onClick: () => {
                                                        setConfirmDialog((prev) => ({ ...prev, open: false }));
                                                        handleDeactivateLocation();
                                                    },
                                                    variant: 'primary',
                                                },
                                            ],
                                        });
                                    }}
                                    variant="secondary"
                                >
                                    Delete
                                </Button>
                                <Button
                                    onClick={() => {
                                        if (isGeneratingLocationDetails) {
                                            return;
                                        }

                                        setConfirmDialog({
                                            open: true,
                                            title: 'Generate Location Details',
                                            message: 'Warning: this will replace existing details for this location.',
                                            actions: [
                                                {
                                                    label: isGeneratingLocationDetails ? 'Generating...' : 'Generate',
                                                    onClick: async () => {
                                                        setConfirmDialog((prev) => ({ ...prev, open: false }));
                                                        await handleGenerateLocationDetails();
                                                    },
                                                    variant: 'primary',
                                                },
                                            ],
                                        });
                                    }}
                                    disabled={isGeneratingLocationDetails}
                                >
                                    {isGeneratingLocationDetails ? 'Generating...' : 'Generate'}
                                </Button>
                            </div>

                        </div>
                    </GlassPanel>
                </div>
            </motion.div>

            <Dialog
                open={confirmDialog.open}
                onClose={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
                slotProps={{
                    paper: {
                        style: {
                            backgroundColor: 'var(--agenda-surface-base)',
                            backdropFilter: 'blur(10px)',
                            border: '2px solid var(--agenda-line-strong)',
                            borderRadius: '8px',
                            color: 'var(--agenda-text-primary)',
                            minWidth: '400px',
                        },
                    },
                }}
            >
                <DialogTitle style={{
                    color: 'var(--agenda-highlight)',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    borderBottom: '2px solid var(--agenda-line-strong)',
                    paddingBottom: '10px',
                }}>
                    {confirmDialog.title}
                </DialogTitle>
                <DialogContent style={{ paddingTop: '20px' }}>
                    <div style={{
                        color: 'var(--agenda-text-primary)',
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
        </AnimatePresence>
    );
};
