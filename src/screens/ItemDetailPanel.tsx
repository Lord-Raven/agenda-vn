import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Add, Delete, ExpandLess, ExpandMore, Image as ImageIcon, Inventory2 } from '@mui/icons-material';
import { Stage } from '../Stage';
import {
    getItemDescription,
    getItemImagePrompt,
    getLinkedItemLore,
    Item,
    updateItemDescription,
    upsertItemLoreEntry,
} from '../content/Item';
import { AlternativeImage, createAlternativeImage } from '../content/AlternativeImage';
import { ConditionCollection } from '../content/Condition';
import { cloneFunctionScriptOverrideMap, FunctionScriptOverrideMap, isFunctionStatType, resolveFunctionScript, Stat, StatValue, normalizeStatValue, resolveStatDefault } from '../content/Stat';
import { buildHexColorSwatches, Button, ColorPickerInput, GlassPanel, TextArea, TextInput, TextInputWithOptions, Title } from '../components/UiComponents';
import { ImageUrlUploadField } from '../components/ImageUrlUploadField';
import { ConditionEditor } from '../components/ConditionEditor';
import { StatValueInput } from '../components/StatValueInput';
import { StatFunctionEditor } from '../components/StatFunctionEditor';

const createInitialItemStatMap = (item: Item, itemStats: Stat[]): { [key: string]: StatValue } => {
    const nextMap: { [key: string]: StatValue } = {};
    itemStats.forEach((stat) => {
        nextMap[stat.id] = normalizeStatValue(item.statMap?.[stat.id], stat);
    });
    return nextMap;
};

interface ItemDetailPanelProps {
    item: Item;
    stage: () => Stage;
    isCreatorMode: boolean;
    onUpdate?: () => void;
    onDeactivate?: (itemId: string) => void;
}

export const ItemDetailPanel: FC<ItemDetailPanelProps> = ({ item, stage, isCreatorMode, onUpdate, onDeactivate }) => {
    const itemStats = useMemo(() => {
        const configured = stage().getConfiguration().itemStats || [];
        const uniqueStatMap: { [name: string]: Stat } = {};
        configured.forEach((stat) => {
            const name = stat?.name?.trim();
            if (!name || uniqueStatMap[name]) {
                return;
            }
            const normalizedStat = { ...stat, name };
            uniqueStatMap[name] = {
                ...normalizedStat,
                default: resolveStatDefault(normalizedStat),
            };
        });
        return Object.values(uniqueStatMap);
    }, [stage]);

    const scalarItemStats = useMemo(() => itemStats.filter((stat) => !isFunctionStatType(stat.type)), [itemStats]);
    const functionItemStats = useMemo(() => itemStats.filter((stat) => isFunctionStatType(stat.type)), [itemStats]);

    const locationOptions = useMemo(() => Object.values(stage().getSave().atlas || {})
        .filter((candidate) => candidate.active !== false), [stage]);
    const actorOptions = useMemo(() => (isCreatorMode ? stage().getConfiguration().actors || [] : Object.values(stage().getSave().actors || {}))
        .filter((candidate) => candidate.active !== false), [stage, isCreatorMode]);
    const itemOptions = useMemo(() => (isCreatorMode ? stage().getConfiguration().items || [] : stage().getSave().inventory || [])
        .filter((candidate) => candidate.active !== false), [stage, isCreatorMode]);

    const [editedItem, setEditedItem] = useState({
        name: item.name,
        category: item.category ?? '',
        description: getItemDescription(item.id, stage(), isCreatorMode),
        themeColor: item.themeColor,
        imagePrompt: getItemImagePrompt(item),
        imageUrl: item.imageUrl,
        alternativeImages: item.alternativeImages?.map(createAlternativeImage) || [],
        availabilityConditions: (item.availabilityConditions || []).map((collection) => [...collection] as ConditionCollection),
    });
    const [editedStatMap, setEditedStatMap] = useState<{ [key: string]: StatValue }>(() => createInitialItemStatMap(item, scalarItemStats));
    const [editedFunctionScriptOverrides, setEditedFunctionScriptOverrides] = useState<FunctionScriptOverrideMap>(() => cloneFunctionScriptOverrideMap(item.functionScriptOverrides));
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [isUploadingAlternativeImages, setIsUploadingAlternativeImages] = useState<Record<number, boolean>>({});
    const [collapsedAlternativeImages, setCollapsedAlternativeImages] = useState<boolean[]>(() =>
        (item.alternativeImages || []).map(() => false),
    );
    const [expandedStatIds, setExpandedStatIds] = useState<Set<string>>(new Set());
    const editedItemRef = useRef(editedItem);
    const editedStatMapRef = useRef(editedStatMap);
    const editedFunctionScriptOverridesRef = useRef(editedFunctionScriptOverrides);
    const autoSaveTimeoutRef = useRef<number | null>(null);
    const didMountRef = useRef(false);

    const persistItem = (nextItem: typeof editedItem, nextStatMap: { [key: string]: StatValue }, nextFunctionScriptOverrides: FunctionScriptOverrideMap = editedFunctionScriptOverridesRef.current) => {
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
            autoSaveTimeoutRef.current = null;
        }

        const persistedItem = new Item(item);
        const oldName = persistedItem.name;
        persistedItem.name = nextItem.name;
        persistedItem.category = nextItem.category.trim();
        persistedItem.description = nextItem.description;
        persistedItem.themeColor = nextItem.themeColor;
        persistedItem.imagePrompt = nextItem.imagePrompt;
        persistedItem.imageUrl = nextItem.imageUrl;
        persistedItem.alternativeImages = nextItem.alternativeImages.map(createAlternativeImage);
        persistedItem.availabilityConditions = nextItem.availabilityConditions.map((collection) => [...collection]);
        persistedItem.statMap = persistedItem.statMap && typeof persistedItem.statMap === 'object' ? { ...persistedItem.statMap } : {};
        persistedItem.functionScriptOverrides = cloneFunctionScriptOverrideMap(nextFunctionScriptOverrides);
        const activeFunctionStatIds = new Set(functionItemStats.map((stat) => stat.id));
        Object.keys(persistedItem.functionScriptOverrides).forEach((statId) => {
            if (!activeFunctionStatIds.has(statId)) {
                delete persistedItem.functionScriptOverrides[statId];
            }
        });

        const activeStatIds = new Set<string>();
        scalarItemStats.forEach((stat) => {
            activeStatIds.add(stat.id);
            persistedItem.statMap[stat.id] = normalizeStatValue(nextStatMap[stat.id], stat);
        });

        Object.keys(persistedItem.statMap).forEach((statId) => {
            if (!activeStatIds.has(statId)) {
                delete persistedItem.statMap[statId];
            }
        });

        Object.assign(item, persistedItem);
        if (persistedItem.name !== oldName) {
            upsertItemLoreEntry(item, oldName, stage(), isCreatorMode);
        }
        updateItemDescription(item.id, nextItem.description, stage(), isCreatorMode);

        if (isCreatorMode) {
            stage().updateConfiguration({
                items: (stage().getConfiguration().items || []).map((candidate) =>
                    candidate.id === item.id ? new Item(item) : candidate,
                ),
            });
        } else {
            const save = stage().getSave();
            save.inventory = (save.inventory || []).map((candidate) =>
                candidate.id === item.id ? new Item(item) : candidate,
            );
            stage().saveGame();
        }

        onUpdate?.();
    };

    useEffect(() => {
        editedItemRef.current = editedItem;
    }, [editedItem]);

    useEffect(() => {
        editedStatMapRef.current = editedStatMap;
    }, [editedStatMap]);

    useEffect(() => {
        editedFunctionScriptOverridesRef.current = editedFunctionScriptOverrides;
    }, [editedFunctionScriptOverrides]);

    useEffect(() => {
        setEditedStatMap(createInitialItemStatMap(item, scalarItemStats));
        setEditedFunctionScriptOverrides(cloneFunctionScriptOverrideMap(item.functionScriptOverrides));
    }, [item, scalarItemStats]);

    useEffect(() => {
        if (!didMountRef.current) {
            didMountRef.current = true;
            return;
        }

        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
        }

        autoSaveTimeoutRef.current = window.setTimeout(() => {
            persistItem(editedItemRef.current, editedStatMapRef.current, editedFunctionScriptOverridesRef.current);
        }, 300);

        return () => {
            if (autoSaveTimeoutRef.current) {
                clearTimeout(autoSaveTimeoutRef.current);
            }
        };
    }, [editedItem, editedStatMap, editedFunctionScriptOverrides]);

    useEffect(() => {
        return () => {
            if (autoSaveTimeoutRef.current) {
                persistItem(editedItemRef.current, editedStatMapRef.current, editedFunctionScriptOverridesRef.current);
            }
        };
    }, []);

    const handleInputChange = <K extends keyof typeof editedItem,>(field: K, value: (typeof editedItem)[K]) => {
        setEditedItem(prev => ({ ...prev, [field]: value }));
    };

    const handleImageUpload = async (file: File) => {
        setIsUploadingImage(true);
        try {
            const uploadedUrl = await stage().uploadFile(`item-${item.id}.png`, file);
            handleInputChange('imageUrl', uploadedUrl);
            item.imageUrl = uploadedUrl;
        } catch (error) {
            console.error('Failed to upload item image:', error);
            stage().showPriorityMessage('Failed to upload item image. Check console for details.');
        } finally {
            setIsUploadingImage(false);
        }
    };

    const updateAlternative = (index: number, patch: Partial<AlternativeImage>) => {
        setEditedItem((current) => ({
            ...current,
            alternativeImages: current.alternativeImages.map((alternative, alternativeIndex) => alternativeIndex === index
                ? { ...alternative, ...patch }
                : alternative),
        }));
    };

    const handleAlternativeImageUpload = async (index: number, file: File) => {
        setIsUploadingAlternativeImages((current) => ({ ...current, [index]: true }));
        try {
            const uploadedUrl = await stage().uploadFile(`item-${item.id}-alternative-${index}.png`, file);
            updateAlternative(index, { imageUrl: uploadedUrl });
        } catch (error) {
            console.error('Failed to upload alternative item image:', error);
            stage().showPriorityMessage('Failed to upload alternative item image. Check console for details.');
        } finally {
            setIsUploadingAlternativeImages((current) => ({ ...current, [index]: false }));
        }
    };

    const handleDeactivateItem = () => {
        const linkedLore = getLinkedItemLore(item, stage(), isCreatorMode);
        item.active = false;

        const itemsWithLoreId = (isCreatorMode ? stage().getConfiguration().items || [] : stage().getSave().inventory || [])
            .filter((candidate) => candidate !== item && candidate.loreId === linkedLore?.id);

        if (linkedLore && itemsWithLoreId.length === 0) {
            if (isCreatorMode) {
                stage().updateConfiguration({ lorebook: (stage().getConfiguration().lorebook || []).filter((entry) => entry.id !== linkedLore.id) });
            } else {
                const save = stage().getSave();
                save.lorebook = (save.lorebook || []).filter((entry) => entry.id !== linkedLore.id);
                stage().saveGame();
            }
        }

        if (isCreatorMode) {
            stage().updateConfiguration({
                items: (stage().getConfiguration().items || []).map((candidate) => candidate.id === item.id ? new Item(item) : candidate),
            });
        } else {
            const save = stage().getSave();
            save.inventory = (save.inventory || []).map((candidate) => candidate.id === item.id ? new Item(item) : candidate);
            stage().saveGame();
        }

        stage().showPriorityMessage(`${item.name || 'Item'} is now inactive and hidden from management.`);
        onDeactivate?.(item.id);
    };

    const handleApplyToSave = () => {
        const applied = stage().applyConfigurationItemToSave(item.id);
        stage().showPriorityMessage(applied
            ? `${item.name || 'Item'} applied to the active save.`
            : `${item.name || 'Item'} does not exist in the active save yet.`);
    };

    const categorySuggestions = useMemo(() => {
        const seenCategories = new Set<string>();
        let hasUncategorized = false;

        for (const candidate of (isCreatorMode ? stage().getConfiguration().items || [] : stage().getSave().inventory || [])) {
            if (candidate.id === item.id || candidate.active === false) {
                continue;
            }

            const normalizedCategory = (candidate.category || '').trim();
            if (!normalizedCategory) {
                hasUncategorized = true;
                continue;
            }
            seenCategories.add(normalizedCategory);
        }

        return {
            hasUncategorized,
            values: Array.from(seenCategories).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
        };
    }, [item.id, stage, isCreatorMode]);

    const categoryOptions = useMemo(() => [
        ...(categorySuggestions.hasUncategorized ? [{ value: '', label: 'Uncategorized' }] : []),
        ...categorySuggestions.values.map((category) => ({ value: category })),
    ], [categorySuggestions]);

    const itemThemeColorSwatches = useMemo(() => {
        const activeItems = (isCreatorMode ? stage().getConfiguration().items || [] : stage().getSave().inventory || [])
            .filter((candidate) => candidate.active !== false);
        const targetCategory = (editedItem.category || '').trim().toLowerCase();
        const sameCategoryThemeColors = activeItems
            .filter((candidate) => candidate.id !== item.id)
            .filter((candidate) => (candidate.category || '').trim().toLowerCase() === targetCategory)
            .map((candidate) => candidate.themeColor);
        const otherThemeColors = activeItems
            .filter((candidate) => candidate.id !== item.id)
            .filter((candidate) => (candidate.category || '').trim().toLowerCase() !== targetCategory)
            .map((candidate) => candidate.themeColor);

        return buildHexColorSwatches([
            editedItem.themeColor,
            ...sameCategoryThemeColors,
            ...otherThemeColors,
        ]);
    }, [editedItem.category, editedItem.themeColor, item.id, stage, isCreatorMode]);

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

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                style={{ position: 'relative', width: '100%', minHeight: 0 }}
            >
                <GlassPanel variant="default" style={{ overflow: 'visible', position: 'relative', padding: '20px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div style={{ marginBottom: '20px' }}>
                        <Title variant="glow" style={{ fontSize: '24px', margin: 0 }}>
                            Item Details: {editedItem.name}
                        </Title>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', flex: 1 }}>
                        <section>
                            <h2 style={sectionHeadingStyle}>Basic Information</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div>
                                    <label style={labelStyle}>Name</label>
                                    <TextInput
                                        fullWidth
                                        value={editedItem.name}
                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                        placeholder="Item name"
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Category</label>
                                    <TextInputWithOptions
                                        fullWidth
                                        value={editedItem.category}
                                        onValueChange={(value) => handleInputChange('category', value)}
                                        placeholder="Choose or type a category (leave blank for Uncategorized)"
                                        options={categoryOptions}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Description</label>
                                    <TextArea
                                        value={editedItem.description}
                                        onChange={(e) => handleInputChange('description', e.target.value)}
                                        placeholder="Describe the item"
                                        style={textareaStyle}
                                    />
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 style={sectionHeadingStyle}>Availability</h2>
                            <ConditionEditor
                                conditionCollections={editedItem.availabilityConditions}
                                globalStats={stage().getConfiguration().globalStats || []}
                                actorStats={stage().getConfiguration().actorStats || []}
                                actors={Object.values(stage().getSave().actors || {})}
                                items={itemOptions}
                                locations={locationOptions}
                                onChange={(availabilityConditions) => setEditedItem(current => ({ ...current, availabilityConditions }))}
                            />
                        </section>

                        {scalarItemStats.length > 0 && (
                            <section>
                                <h2 style={sectionHeadingStyle}>Item Stats</h2>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {scalarItemStats.map((stat) => {
                                        const isExpanded = expandedStatIds.has(stat.id);
                                        return (
                                            <div
                                                key={stat.id}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '8px',
                                                    border: '1px solid color-mix(in srgb, var(--agenda-highlight) 18%, transparent)',
                                                    borderRadius: '6px',
                                                    padding: '10px',
                                                    backgroundColor: 'color-mix(in srgb, var(--agenda-surface-base) 68%, transparent)',
                                                }}
                                            >
                                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(180px, 260px)', gap: '12px', alignItems: 'center' }}>
                                                    <Button
                                                        variant="secondary"
                                                        onClick={() => setExpandedStatIds((current) => {
                                                            const next = new Set(current);
                                                            if (next.has(stat.id)) {
                                                                next.delete(stat.id);
                                                            } else {
                                                                next.add(stat.id);
                                                            }
                                                            return next;
                                                        })}
                                                        aria-label={isExpanded ? `Collapse ${stat.name} details` : `Expand ${stat.name} details`}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            padding: 0,
                                                            minWidth: 0,
                                                            background: 'transparent',
                                                            border: 'none',
                                                            borderRadius: 0,
                                                            boxShadow: 'none',
                                                            textTransform: 'none',
                                                            letterSpacing: 'normal',
                                                            justifyContent: 'flex-start',
                                                        }}
                                                    >
                                                        {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                                                        <span style={{ color: 'var(--agenda-text-primary)', fontSize: '14px', fontWeight: 700 }}>
                                                            {stat.name}
                                                        </span>
                                                    </Button>

                                                    <StatValueInput
                                                        stat={stat}
                                                        value={editedStatMap[stat.id]}
                                                        onChange={(value) => setEditedStatMap((current) => ({ ...current, [stat.id]: value }))}
                                                        actors={actorOptions}
                                                        items={itemOptions}
                                                        locations={locationOptions}
                                                        stage={stage}
                                                    />
                                                </div>
                                                {isExpanded && !!stat.description?.trim() && (
                                                    <div style={{ color: 'color-mix(in srgb, var(--agenda-text-primary) 75%, transparent)', fontSize: '12px' }}>
                                                        {stat.description}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {functionItemStats.length > 0 && (
                            <section>
                                <h2 style={sectionHeadingStyle}>Item Functions</h2>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    {functionItemStats.map((stat) => {
                                        const hasOverride = !!(editedFunctionScriptOverrides[stat.id] || '').trim();
                                        const activeScript = resolveFunctionScript(stat, editedFunctionScriptOverrides);
                                        return (
                                            <div
                                                key={stat.id}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '8px',
                                                    border: '1px solid color-mix(in srgb, var(--agenda-highlight) 18%, transparent)',
                                                    borderRadius: '6px',
                                                    padding: '10px',
                                                    backgroundColor: 'color-mix(in srgb, var(--agenda-surface-base) 68%, transparent)',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                                    <span style={{ color: 'var(--agenda-text-primary)', fontSize: '14px', fontWeight: 700 }}>{stat.name}</span>
                                                    {hasOverride && (
                                                        <Button
                                                            variant="secondary"
                                                            onClick={() => setEditedFunctionScriptOverrides((current) => {
                                                                const next = { ...current };
                                                                delete next[stat.id];
                                                                return next;
                                                            })}
                                                        >
                                                            Reset to Default
                                                        </Button>
                                                    )}
                                                </div>
                                                {!!stat.description?.trim() && (
                                                    <div style={{ color: 'color-mix(in srgb, var(--agenda-text-primary) 75%, transparent)', fontSize: '12px' }}>
                                                        {stat.description}
                                                    </div>
                                                )}
                                                <span style={{ color: 'var(--agenda-text-muted)', fontSize: '11px' }}>
                                                    {hasOverride ? "This item overrides the stat's default script." : "Using the stat's default script; editing below creates an override for this item."}
                                                </span>
                                                <StatFunctionEditor
                                                    script={activeScript}
                                                    onScriptChange={(script) => setEditedFunctionScriptOverrides((current) => ({ ...current, [stat.id]: script }))}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        <section>
                            <h2 style={sectionHeadingStyle}>Visual Theme</h2>
                            <div>
                                <label style={labelStyle}>Theme Color</label>
                                <ColorPickerInput
                                    value={editedItem.themeColor}
                                    onChange={(value) => handleInputChange('themeColor', value)}
                                    placeholder="#RRGGBB"
                                    popoverTitle="Choose theme color"
                                    swatches={itemThemeColorSwatches}
                                    inputStyle={{ flex: 1 }}
                                />
                            </div>
                        </section>

                        <section>
                            <h2 style={{ ...sectionHeadingStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ImageIcon />
                                Base Item Image
                            </h2>
                            <ImageUrlUploadField
                                imageUrl={editedItem.imageUrl}
                                onImageUrlChange={(value) => handleInputChange('imageUrl', value)}
                                onUploadFile={handleImageUpload}
                                isUploading={isUploadingImage}
                                previewWidth="140px"
                                previewHeight="140px"
                                previewBorder={`3px solid ${editedItem.themeColor || 'var(--agenda-line-strong)'}`}
                                previewPlaceholder={<Inventory2 style={{ fontSize: '48px', color: 'var(--agenda-accent-primary)' }} />}
                                previewUploadHint={isUploadingImage ? 'Uploading...' : 'Click image to upload'}
                                onInvalidFile={() => stage().showPriorityMessage('Please select a valid image file.')}
                            />
                            <div style={{ marginTop: '12px' }}>
                                <label style={labelStyle}>Base Image Prompt</label>
                                <TextArea
                                    value={editedItem.imagePrompt}
                                    onChange={(e) => handleInputChange('imagePrompt', e.target.value)}
                                    placeholder="Describe the base image to generate for this item"
                                    style={textareaStyle}
                                />
                            </div>
                        </section>

                        <section>
                            <h2 style={{ ...sectionHeadingStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ImageIcon />
                                Alternative Images
                            </h2>
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    handleInputChange('alternativeImages', [...editedItem.alternativeImages, createAlternativeImage()]);
                                    setCollapsedAlternativeImages(current => [...current, false]);
                                }}
                                style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '12px' }}
                            >
                                <Add fontSize="small" /> Add Alternative
                            </Button>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '16px' }}>
                                {editedItem.alternativeImages.map((alternative, index) => {
                                    const isCollapsed = Boolean(collapsedAlternativeImages[index]);
                                    const isUploadingVariant = isUploadingAlternativeImages[index];

                                    return (
                                        <div
                                            key={index}
                                            style={{
                                                padding: '14px',
                                                borderRadius: '10px',
                                                border: `1px solid color-mix(in srgb, ${editedItem.themeColor || 'var(--agenda-line-strong)'} 42%, var(--agenda-line-subtle))`,
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
                                                    {isCollapsed ? <ExpandMore fontSize="small" /> : <ExpandLess fontSize="small" />}
                                                </button>
                                                <strong style={{ color: 'var(--agenda-text-primary)', flex: 1 }}>
                                                    {alternative.description || `Alternative ${index + 1}`}
                                                </strong>
                                                <Button
                                                    variant="danger"
                                                    onClick={() => {
                                                        handleInputChange('alternativeImages', editedItem.alternativeImages.filter((_, alternativeIndex) => alternativeIndex !== index));
                                                        setCollapsedAlternativeImages(current => current.filter((_, alternativeIndex) => alternativeIndex !== index));
                                                    }}
                                                    style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
                                                >
                                                    <Delete fontSize="small" /> Remove
                                                </Button>
                                            </div>

                                            {!isCollapsed && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    <div>
                                                        <label style={labelStyle}>Description</label>
                                                        <TextInput
                                                            fullWidth
                                                            value={alternative.description}
                                                            onChange={(event) => updateAlternative(index, { description: event.target.value })}
                                                            placeholder="Variant description"
                                                        />
                                                    </div>
                                                    <ImageUrlUploadField
                                                        imageUrl={alternative.imageUrl}
                                                        onImageUrlChange={(imageUrl) => updateAlternative(index, { imageUrl })}
                                                        onUploadFile={(file) => handleAlternativeImageUpload(index, file)}
                                                        isUploading={isUploadingVariant}
                                                        previewWidth="120px"
                                                        previewHeight="120px"
                                                        previewBorder={`2px solid ${editedItem.themeColor || 'var(--agenda-line-strong)'}`}
                                                        previewPlaceholder={<Inventory2 style={{ fontSize: '36px', color: 'var(--agenda-accent-primary)' }} />}
                                                        previewUploadHint={isUploadingVariant ? 'Uploading...' : 'Click image to upload'}
                                                        onInvalidFile={() => stage().showPriorityMessage('Please select a valid image file.')}
                                                    />
                                                    <div>
                                                        <label style={labelStyle}>Image Prompt</label>
                                                        <TextArea
                                                            value={alternative.imagePrompt}
                                                            onChange={(e) => updateAlternative(index, { imagePrompt: e.target.value })}
                                                            placeholder="Describe this alternative item image"
                                                            style={textareaStyle}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label style={labelStyle}>Conditions</label>
                                                        <ConditionEditor
                                                            conditionCollections={alternative.conditionCollections || []}
                                                            globalStats={stage().getConfiguration().globalStats || []}
                                                            actorStats={stage().getConfiguration().actorStats || []}
                                                            actors={Object.values(stage().getSave().actors || {})}
                                                            items={itemOptions}
                                                            locations={locationOptions}
                                                            onChange={(conditionCollections) => updateAlternative(index, { conditionCollections })}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    </div>
                    <div style={{
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
                    }}>
                        {isCreatorMode && <Button variant="secondary" onClick={handleApplyToSave}>Apply to Save</Button>}
                        <Button variant="danger" onClick={handleDeactivateItem}>Deactivate</Button>
                    </div>
                </GlassPanel>
            </motion.div>
        </AnimatePresence>
    );
};
