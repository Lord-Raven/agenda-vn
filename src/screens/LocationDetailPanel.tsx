import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Stage } from '../Stage';
import { getLocationDescription, Location, updateLocationDescription } from '../content/Location';
import { Image as ImageIcon, Place } from '@mui/icons-material';
import { buildHexColorSwatches, Button, ColorPickerInput, GlassPanel, TextInput, Title } from './UiComponents';
import { ImageUrlUploadField } from './ImageUrlUploadField';

interface LocationDetailPanelProps {
    location: Location;
    stage: () => Stage;
}

export const LocationDetailPanel: FC<LocationDetailPanelProps> = ({ location, stage }) => {
    const [editedLocation, setEditedLocation] = useState<{
        name: string;
        category: string;
        description: string;
        themeColor: string;
        lightColor: string;
        imageUrl: string;
        focalX: number;
        focalY: number;
    }>({
        name: location.name,
        category: location.category ?? '',
        description: getLocationDescription(location.id, stage()),
        themeColor: location.themeColor,
        lightColor: location.lightColor,
        imageUrl: location.imageUrl,
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

        location.name = nextLocation.name;
        location.category = nextLocation.category.trim();
        updateLocationDescription(location.id, nextLocation.description, stage());
        location.themeColor = nextLocation.themeColor;
        location.lightColor = nextLocation.lightColor;
        location.imageUrl = nextLocation.imageUrl;
        location.focalPoint = { x: nextLocation.focalX, y: nextLocation.focalY };

        stage().saveGame();
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
            stage().saveGame();
        } catch (error) {
            console.error('Failed to upload location image:', error);
            stage().showPriorityMessage('Failed to upload location image. Check console for details.');
        } finally {
            setIsUploadingImage(false);
        }
    };

    const clampedCoord = (value: string): number => {
        const n = parseFloat(value);
        if (isNaN(n)) return 0;
        return Math.min(1, Math.max(0, n));
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        color: '#00ff88',
        fontSize: '14px',
        fontWeight: 'bold',
        marginBottom: '8px',
    };

    const sectionHeadingStyle: React.CSSProperties = {
        color: '#00ff88',
        fontSize: '18px',
        fontWeight: 'bold',
        marginBottom: '15px',
        borderBottom: '2px solid rgba(0, 255, 136, 0.3)',
        paddingBottom: '5px',
    };

    const textareaStyle: React.CSSProperties = {
        width: '100%',
        minHeight: '100px',
        padding: '12px',
        fontSize: '14px',
        backgroundColor: 'rgba(0, 20, 40, 0.6)',
        border: '2px solid rgba(0, 255, 136, 0.3)',
        borderRadius: '5px',
        color: '#e0f0ff',
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
        accentColor: '#00ff88',
        cursor: 'pointer',
    };

    const sliderValueStyle: React.CSSProperties = {
        minWidth: '56px',
        textAlign: 'right',
        color: '#e0f0ff',
        fontSize: '13px',
        fontVariantNumeric: 'tabular-nums',
        opacity: 0.9,
    };

    const locationThemeColorSwatches = useMemo(() => {
        const locations = Object.values(stage().getSave().atlas || {});
        const targetCategory = (editedLocation.category || '').trim().toLowerCase();

        const sameCategoryThemeColors = locations
            .filter((candidate) => candidate.id !== location.id)
            .filter((candidate) => (candidate.category || '').trim().toLowerCase() === targetCategory)
            .map((candidate) => candidate.themeColor);

        const otherThemeColors = locations
            .filter((candidate) => candidate.id !== location.id)
            .filter((candidate) => (candidate.category || '').trim().toLowerCase() !== targetCategory)
            .map((candidate) => candidate.themeColor);

        return buildHexColorSwatches([
            editedLocation.themeColor,
            ...sameCategoryThemeColors,
            ...otherThemeColors,
        ]);
    }, [editedLocation.category, editedLocation.themeColor, location.id, stage]);

    const locationLightColorSwatches = useMemo(() => {
        const locations = Object.values(stage().getSave().atlas || {});
        const targetCategory = (editedLocation.category || '').trim().toLowerCase();

        const sameCategoryLightColors = locations
            .filter((candidate) => candidate.id !== location.id)
            .filter((candidate) => (candidate.category || '').trim().toLowerCase() === targetCategory)
            .map((candidate) => candidate.lightColor);

        const otherLightColors = locations
            .filter((candidate) => candidate.id !== location.id)
            .filter((candidate) => (candidate.category || '').trim().toLowerCase() !== targetCategory)
            .map((candidate) => candidate.lightColor);

        return buildHexColorSwatches([
            editedLocation.lightColor,
            ...sameCategoryLightColors,
            ...otherLightColors,
        ]);
    }, [editedLocation.category, editedLocation.lightColor, location.id, stage]);

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
                }}
            >
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        width: '100%',
                        maxWidth: 'none',
                        maxHeight: 'none',
                        height: '100%',
                    }}
                >
                    <GlassPanel
                        variant="default"
                        style={{
                            height: '100%',
                            overflow: 'auto',
                            position: 'relative',
                            padding: '20px',
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>

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
                                        <label style={labelStyle}>Description</label>
                                        <textarea
                                            value={editedLocation.description}
                                            onChange={(e) => handleInputChange('description', e.target.value)}
                                            placeholder="A description of this location"
                                            style={textareaStyle}
                                        />
                                    </div>
                                </div>
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
                                    <div>
                                        <label style={labelStyle}>Light Color</label>
                                        <ColorPickerInput
                                            value={editedLocation.lightColor}
                                            onChange={(value) => handleInputChange('lightColor', value)}
                                            placeholder="#RRGGBB"
                                            popoverTitle="Choose light color"
                                            swatches={locationLightColorSwatches}
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
                                    Location Image
                                </h2>
                                <ImageUrlUploadField
                                    imageUrl={editedLocation.imageUrl}
                                    onImageUrlChange={(value) => handleInputChange('imageUrl', value)}
                                    onUploadFile={handleLocationImageUpload}
                                    isUploading={isUploadingImage}
                                    previewBorder={`3px solid ${editedLocation.themeColor || 'rgba(0, 255, 136, 0.3)'}`}
                                    previewBackgroundPosition={`${editedLocation.focalX * 100}% ${editedLocation.focalY * 100}%`}
                                    previewPlaceholder={<Place style={{ fontSize: '48px', color: 'rgba(0, 255, 136, 0.3)' }} />}
                                    onInvalidFile={() => stage().showPriorityMessage('Please select a valid image file.')}
                                />
                            </section>

                        </div>
                    </GlassPanel>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
