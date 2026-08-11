import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { Stage } from '../Stage';
import {
    distillLocation,
    generateBaseLocationImage,
    generateLocationAlternativeImage,
    getLocationDescription,
    getLocationImagePrompt,
    getLinkedLocationLore,
    Location,
    updateLocationDescription,
    upsertLocationLoreEntry,
} from '../content/Location';
import { Add, ArrowDownward, ArrowUpward, Delete, ExpandMore, Image as ImageIcon, Place } from '@mui/icons-material';
import { buildHexColorSwatches, Button, ColorPickerInput, GlassPanel, TextArea, TextInput, Title } from '../components/UiComponents';
import { ImageUrlUploadField } from '../components/ImageUrlUploadField';
import { ConditionCollection } from '../content/Condition';
import { ConditionEditor } from '../components/ConditionEditor';
import { AlternativeImage, createAlternativeImage } from '../content/AlternativeImage';

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
        alternativeImages: AlternativeImage[];
        conditionCollections: ConditionCollection[];
        focalX: number;
        focalY: number;
    }>({
        name: location.name,
        category: location.category ?? '',
        description: getLocationDescription(location.id, stage()),
        themeColor: location.themeColor,
        imagePrompt: getLocationImagePrompt(location),
        imageUrl: location.imageUrl,
        alternativeImages: location.alternativeImages?.map(createAlternativeImage) || [],
        conditionCollections: (location.conditionCollections || []).map(collection => [...collection]),
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
    const [isUploadingAlternativeImages, setIsUploadingAlternativeImages] = useState<Record<number, boolean>>({});
    const [isGeneratingLocationDetails, setIsGeneratingLocationDetails] = useState(false);
    const [isGeneratingBaseImage, setIsGeneratingBaseImage] = useState(false);
    const [collapsedAlternativeImages, setCollapsedAlternativeImages] = useState<boolean[]>(() =>
        (location.alternativeImages || []).map(() => false)
    );
    const [isGeneratingAlternativeImages, setIsGeneratingAlternativeImages] = useState<Record<number, boolean>>({});
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
        location.alternativeImages = nextLocation.alternativeImages.map(createAlternativeImage);
        location.conditionCollections = nextLocation.conditionCollections.map(collection => [...collection]);
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
            alternativeImages: location.alternativeImages?.map(createAlternativeImage) || [],
            conditionCollections: (location.conditionCollections || []).map(collection => [...collection]),
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

    const handleInputChange = <K extends keyof typeof editedLocation,>(field: K, value: (typeof editedLocation)[K]) => {
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

    const updateAlternative = (index: number, patch: Partial<AlternativeImage>) => {
        setEditedLocation((current) => ({
            ...current,
            alternativeImages: current.alternativeImages?.map((alternative, alternativeIndex) => alternativeIndex === index
                ? { ...alternative, ...patch }
                : alternative) || [],
        }));
    };

    const moveAlternative = (index: number, offset: -1 | 1) => {
        const targetIndex = index + offset;
        if (targetIndex < 0 || targetIndex >= editedLocation.alternativeImages.length) {
            return;
        }

        setEditedLocation((current) => {
            const alternativeImages = [...current.alternativeImages];
            [alternativeImages[index], alternativeImages[targetIndex]] = [alternativeImages[targetIndex], alternativeImages[index]];
            return { ...current, alternativeImages };
        });
        setCollapsedAlternativeImages((current) => {
            const collapsed = [...current];
            [collapsed[index], collapsed[targetIndex]] = [collapsed[targetIndex], collapsed[index]];
            return collapsed;
        });
    };

    const handleAlternativeImageUpload = async (index: number, file: File) => {
        setIsUploadingAlternativeImages((current) => ({ ...current, [index]: true }));
        try {
            const uploadedUrl = await stage().uploadFile(`location-${location.id}-alternative-${index}.png`, file);
            updateAlternative(index, { imageUrl: uploadedUrl });
        } catch (error) {
            console.error('Failed to upload alternative location image:', error);
            stage().showPriorityMessage('Failed to upload alternative location image. Check console for details.');
        } finally {
            setIsUploadingAlternativeImages((current) => ({ ...current, [index]: false }));
        }
    };

    const handleGenerateAlternativeImage = async (index: number) => {
        if (isGeneratingAlternativeImages[index]) {
            return;
        }

        setIsGeneratingAlternativeImages((current) => ({ ...current, [index]: true }));
        try {
            persistLocation(editedLocationRef.current);
            if (!location.imageUrl) {
                await generateBaseLocationImage(location, stage());
            }

            const alternative = location.alternativeImages[index];
            const generatedImageUrl = await generateLocationAlternativeImage(location, alternative, stage(), true);
            if (!generatedImageUrl) {
                throw new Error('Failed to generate alternative location image.');
            }

            syncEditedLocationFromSource();
            stage().showPriorityMessage(`Generated alternative image for ${location.name || 'location'}.`);
        } catch (error) {
            console.error('Failed to generate alternative location image:', error);
            stage().showPriorityMessage('Failed to generate alternative location image. Check console for details.');
        } finally {
            setIsGeneratingAlternativeImages((current) => ({ ...current, [index]: false }));
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
            alternativeImages: location.alternativeImages.map(createAlternativeImage),
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
            location.alternativeImages = previousState.alternativeImages.map(createAlternativeImage);
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
    
        // Want to be certain we aren't deleting a lore entry that has erroneously become shared across actors.
        const locationsWithLoreId = Object.values(stage().getSave().atlas || {}).filter((a) => a !== location && a.loreId === linkedLore?.id);

        if (linkedLore && locationsWithLoreId.length === 0) {
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
                                    conditionCollections={editedLocation.conditionCollections}
                                    playerStats={stage().getConfiguration().playerStats || []}
                                    onChange={(conditionCollections) => setEditedLocation(current => ({ ...current, conditionCollections }))}
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
                                    This is the fallback image used when no alternative image conditions match.
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
                                    Alternative Images
                                </h2>
                                <p style={{ color: 'var(--agenda-text-muted)', fontSize: '13px', marginTop: '-8px', marginBottom: '14px' }}>
                                    The first alternative whose conditions pass replaces the base location image.
                                </p>
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        handleInputChange('alternativeImages', [...editedLocation.alternativeImages, createAlternativeImage()]);
                                        setCollapsedAlternativeImages(current => [...current, false]);
                                    }}
                                    style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '12px' }}
                                >
                                    <Add fontSize="small" /> Add Alternative
                                </Button>
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '16px' }}>
                                    {editedLocation.alternativeImages.map((alternative, index) => {
                                        const isUploadingVariant = isUploadingAlternativeImages[index];
                                        const isGeneratingVariant = isGeneratingAlternativeImages[index];
                                        const isCollapsed = Boolean(collapsedAlternativeImages[index]);

                                        return (
                                            <div
                                                key={index}
                                                style={{
                                                    padding: '14px',
                                                    borderRadius: '10px',
                                                    border: `1px solid color-mix(in srgb, ${editedLocation.themeColor || 'var(--agenda-line-strong)'} 42%, var(--agenda-line-subtle))`,
                                                    background: 'color-mix(in srgb, var(--agenda-surface-base) 86%, transparent)',
                                                }}
                                            >
                                                <div style={{ marginBottom: '10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                        <button
                                                            type="button"
                                                            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${alternative.description || `alternative ${index + 1}`}`}
                                                            aria-expanded={!isCollapsed}
                                                            onClick={() => setCollapsedAlternativeImages(current => current.map((collapsed, alternativeIndex) => alternativeIndex === index ? !collapsed : collapsed))}
                                                            style={{ display: 'grid', placeItems: 'center', padding: 0, border: 0, background: 'transparent', color: 'var(--agenda-text-primary)', cursor: 'pointer' }}
                                                        >
                                                            <ExpandMore style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 150ms ease' }} />
                                                        </button>
                                                    <button
                                                        type="button"
                                                        aria-label={`Move ${alternative.description || `alternative ${index + 1}`} up`}
                                                        title="Move up (higher priority)"
                                                        disabled={index === 0 || Object.values(isUploadingAlternativeImages).some(Boolean) || Object.values(isGeneratingAlternativeImages).some(Boolean)}
                                                        onClick={() => moveAlternative(index, -1)}
                                                        style={{ display: 'grid', placeItems: 'center', padding: 0, border: 0, background: 'transparent', color: 'var(--agenda-text-primary)', cursor: index === 0 ? 'default' : 'pointer', opacity: index === 0 ? 0.35 : 1 }}
                                                    >
                                                        <ArrowUpward fontSize="small" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        aria-label={`Move ${alternative.description || `alternative ${index + 1}`} down`}
                                                        title="Move down (lower priority)"
                                                        disabled={index === editedLocation.alternativeImages.length - 1 || Object.values(isUploadingAlternativeImages).some(Boolean) || Object.values(isGeneratingAlternativeImages).some(Boolean)}
                                                        onClick={() => moveAlternative(index, 1)}
                                                        style={{ display: 'grid', placeItems: 'center', padding: 0, border: 0, background: 'transparent', color: 'var(--agenda-text-primary)', cursor: index === editedLocation.alternativeImages.length - 1 ? 'default' : 'pointer', opacity: index === editedLocation.alternativeImages.length - 1 ? 0.35 : 1 }}
                                                    >
                                                        <ArrowDownward fontSize="small" />
                                                    </button>
                                                    <TextInput
                                                        fullWidth
                                                        value={alternative.description}
                                                        onChange={(event) => updateAlternative(index, { description: event.target.value })}
                                                        placeholder="Description, e.g. Morning or Flooded"
                                                    />
                                                        {!isCollapsed && <Button variant="danger" onClick={() => {
                                                            handleInputChange('alternativeImages', editedLocation.alternativeImages.filter((_, alternativeIndex) => alternativeIndex !== index));
                                                            setCollapsedAlternativeImages(current => current.filter((_, alternativeIndex) => alternativeIndex !== index));
                                                        }} style={{ padding: 7 }} aria-label="Delete alternative"><Delete fontSize="small" /></Button>}
                                                </div>
                                                    {!isCollapsed && (
                                                        <>
                                                            <div style={{ marginBottom: '12px' }}>
                                                                <TextArea
                                                                    value={alternative.imagePrompt}
                                                                    onChange={(e) => updateAlternative(index, { imagePrompt: e.target.value })}
                                                                    placeholder="Describe how the scene should change, or leave blank to generate from the description."
                                                                    style={{
                                                                        ...textareaStyle,
                                                                        minHeight: '88px',
                                                                    }}
                                                                />
                                                            </div>
                                                            <ImageUrlUploadField
                                                                imageUrl={alternative.imageUrl}
                                                                onImageUrlChange={(value) => updateAlternative(index, { imageUrl: value })}
                                                                onUploadFile={(file) => handleAlternativeImageUpload(index, file)}
                                                                isUploading={isUploadingVariant}
                                                                inputLabel="Alternative Image URL"
                                                                previewWidth="140px"
                                                                previewHeight="105px"
                                                                previewBorder={`2px solid ${editedLocation.themeColor || 'var(--agenda-line-strong)'}`}
                                                                previewBackgroundPosition={`${editedLocation.focalX * 100}% ${editedLocation.focalY * 100}%`}
                                                                previewPlaceholder={<Place style={{ fontSize: '36px', color: 'var(--agenda-accent-primary)' }} />}
                                                                previewUploadHint={isUploadingVariant ? 'Uploading...' : 'Click image to upload'}
                                                                onInvalidFile={() => stage().showPriorityMessage('Please select a valid image file.')}
                                                            />
                                                            <div style={{ marginTop: '12px' }}>
                                                                <ConditionEditor
                                                                    conditionCollections={alternative.conditionCollections}
                                                                    playerStats={stage().getConfiguration().playerStats || []}
                                                                    onChange={(conditionCollections) => updateAlternative(index, { conditionCollections })}
                                                                />
                                                            </div>
                                                            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                                                                <Button
                                                                    onClick={() => handleGenerateAlternativeImage(index)}
                                                                    disabled={isGeneratingVariant}
                                                                >
                                                                    {isGeneratingVariant ? 'Generating...' : `Generate`}
                                                                </Button>
                                                            </div>
                                                        </>
                                                    )}
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
