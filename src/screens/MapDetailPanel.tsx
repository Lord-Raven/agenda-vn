import { FC, PointerEvent, useEffect, useRef, useState } from 'react';
import { AspectRatio } from '@chub-ai/stages-ts';
import { Add, ArrowDownward, ArrowUpward, AutoAwesome, Delete, ExpandMore, Image as ImageIcon, Map as MapIcon, Place } from '@mui/icons-material';
import { generateMapAlternativeImage, Map as GameMap, MapLink } from '../content/Map';
import { Stage } from '../Stage';
import { Button, TextArea, TextInput } from '../components/UiComponents';
import { ImageUrlUploadField } from '../components/ImageUrlUploadField';
import { ConditionEditor } from '../components/ConditionEditor';
import { SearchableOptionPicker } from '../components/SearchableOptionPicker';
import { AlternativeImage, createAlternativeImage } from '../content/AlternativeImage';
import { getLocationName } from '../content/Location';

interface MapDetailPanelProps {
    map: GameMap;
    stage: () => Stage;
    onChange: () => void;
    onDeactivate: () => void;
}

const clampCoordinate = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

type MapDraft = Pick<GameMap, 'name' | 'description' | 'priority' | 'category' | 'imagePrompt' | 'imageUrl' | 'alternativeImages'>;

const createMapDraft = (map: GameMap): MapDraft => ({
    name: map.name,
    description: map.description,
    priority: map.priority,
    category: map.category,
    imagePrompt: map.imagePrompt,
    imageUrl: map.imageUrl,
    alternativeImages: map.alternativeImages?.map(createAlternativeImage) || [],
});

export const MapDetailPanel: FC<MapDetailPanelProps> = ({ map, stage, onChange, onDeactivate }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [collapsedAlternativeImages, setCollapsedAlternativeImages] = useState<boolean[]>(() =>
        (map.alternativeImages || []).map(() => false)
    );
    const [isUploadingVariants, setIsUploadingVariants] = useState<Record<number, boolean>>({});
    const [isGeneratingVariants, setIsGeneratingVariants] = useState<Record<number, boolean>>({});
    const [previewSelection, setPreviewSelection] = useState<'base' | number>('base');
    const [isLinksCollapsed, setIsLinksCollapsed] = useState(true);
    const [draft, setDraft] = useState<MapDraft>(() => createMapDraft(map));
    const draftRef = useRef(draft);
    const previewRef = useRef<HTMLDivElement>(null);
    const autoSaveTimeoutRef = useRef<number | null>(null);
    const structuralSaveTimeoutRef = useRef<number | null>(null);
    const structuralSyncRef = useRef<() => void>(() => {});
    const didMountRef = useRef(false);
    const stageInstance = stage();
    const save = stageInstance.getSave();
    const activeMaps = (save.maps || []).filter(candidate => candidate.active !== false && candidate.id !== map.id);
    const activeLocations = Object.values(save.atlas || {}).filter(location => location.active !== false);

    const syncConfiguration = () => {
        stageInstance.updateConfiguration({ maps: save.maps || [] });
    };
    structuralSyncRef.current = () => {
        syncConfiguration();
        onChange();
    };

    const persist = (update: () => void) => {
        update();
        onChange();

        if (structuralSaveTimeoutRef.current) {
            clearTimeout(structuralSaveTimeoutRef.current);
        }
        structuralSaveTimeoutRef.current = window.setTimeout(() => {
            structuralSaveTimeoutRef.current = null;
            structuralSyncRef.current();
        }, 300);
    };

    const persistDraft = (nextDraft: MapDraft) => {
        map.name = nextDraft.name;
        map.description = nextDraft.description;
        map.category = nextDraft.category.trim();
        map.imagePrompt = nextDraft.imagePrompt;
        map.imageUrl = nextDraft.imageUrl;
        map.alternativeImages = nextDraft.alternativeImages.map(createAlternativeImage);

        const nextPriority = Number.isFinite(nextDraft.priority) ? nextDraft.priority : 0;
        const conflict = (save.maps || []).find(candidate => candidate.id !== map.id && candidate.active !== false && candidate.priority === nextPriority);
        if (conflict) {
            conflict.priority = map.priority;
        }
        map.priority = nextPriority;
        syncConfiguration();
        onChange();
    };

    useEffect(() => {
        draftRef.current = draft;

        if (!didMountRef.current) {
            didMountRef.current = true;
            return;
        }

        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
        }

        autoSaveTimeoutRef.current = window.setTimeout(() => {
            autoSaveTimeoutRef.current = null;
            persistDraft(draftRef.current);
        }, 300);

        return () => {
            if (autoSaveTimeoutRef.current) {
                clearTimeout(autoSaveTimeoutRef.current);
            }
        };
    }, [draft]);

    useEffect(() => () => {
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
            persistDraft(draftRef.current);
        }
        if (structuralSaveTimeoutRef.current) {
            clearTimeout(structuralSaveTimeoutRef.current);
            structuralSyncRef.current();
        }
    }, []);

    useEffect(() => {
        if (previewSelection !== 'base' && previewSelection >= draft.alternativeImages.length) {
            setPreviewSelection('base');
        }
    }, [draft.alternativeImages.length, previewSelection]);

    const updateDraft = <K extends keyof MapDraft>(field: K, value: MapDraft[K]) => {
        setDraft(current => ({ ...current, [field]: value }));
    };

    const addLink = () => {
        const firstTarget = activeLocations[0]?.id || activeMaps[0]?.id;
        if (!firstTarget) {
            stageInstance.showPriorityMessage('Create another map or location before adding a link.');
            return;
        }
        persist(() => {
            map.links.push({ parentId: map.id, childId: firstTarget, coordinates: { x: 0.5, y: 0.5 }, conditionCollections: [] });
        });
    };

    const updateLink = (index: number, patch: Partial<MapLink>) => {
        persist(() => {
            map.links[index] = {
                ...map.links[index],
                ...patch,
                parentId: map.id,
                coordinates: patch.coordinates
                    ? { x: clampCoordinate(patch.coordinates.x), y: clampCoordinate(patch.coordinates.y) }
                    : map.links[index].coordinates,
            };
        });
    };

    const uploadImage = async (file: File) => {
        setIsUploading(true);
        try {
            const imageUrl = await stageInstance.uploadFile(`map-${map.id}.png`, file);
            updateDraft('imageUrl', imageUrl);
            stageInstance.showPriorityMessage('Map image uploaded.');
        } catch (error) {
            console.error('Failed to upload map image:', error);
            stageInstance.showPriorityMessage('Failed to upload map image. Check console for details.');
        } finally {
            setIsUploading(false);
        }
    };

    const generateImage = async () => {
        if (!draft.imagePrompt.trim() || isGenerating) {
            if (!draft.imagePrompt.trim()) {
                stageInstance.showPriorityMessage('Add a map image prompt before generating.');
            }
            return;
        }
        setIsGenerating(true);
        try {
            const imageUrl = await stageInstance.makeImage({
                prompt: draft.imagePrompt,
                aspect_ratio: AspectRatio.WIDESCREEN_HORIZONTAL,
            }, draft.imageUrl);

            const qwenifiedUrl = imageUrl ? await stageInstance.makeImageFromImage({
                image: imageUrl,
                prompt: draft.imagePrompt
            }, imageUrl) : ''

            updateDraft('imageUrl', qwenifiedUrl ?? imageUrl);
            stageInstance.showPriorityMessage('Generated a new map image.');
        } catch (error) {
            console.error('Failed to generate map image:', error);
            stageInstance.showPriorityMessage('Failed to generate map image. Check console for details.');
        } finally {
            setIsGenerating(false);
        }
    };

    const updateAlternative = (index: number, patch: Partial<AlternativeImage>) => {
        setDraft(current => ({
            ...current,
            alternativeImages: current.alternativeImages?.map((alternative, alternativeIndex) => alternativeIndex === index
                ? { ...alternative, ...patch }
                : alternative) || [],
        }));
    };

    const moveAlternative = (index: number, offset: -1 | 1) => {
        const targetIndex = index + offset;
        if (targetIndex < 0 || targetIndex >= draft.alternativeImages.length) {
            return;
        }

        setDraft(current => {
            const alternativeImages = [...current.alternativeImages];
            [alternativeImages[index], alternativeImages[targetIndex]] = [alternativeImages[targetIndex], alternativeImages[index]];
            return { ...current, alternativeImages };
        });
        setCollapsedAlternativeImages(current => {
            const collapsed = [...current];
            [collapsed[index], collapsed[targetIndex]] = [collapsed[targetIndex], collapsed[index]];
            return collapsed;
        });
    };

    const uploadVariantImage = async (index: number, file: File) => {
        setIsUploadingVariants(current => ({ ...current, [index]: true }));
        try {
            const imageUrl = await stageInstance.uploadFile(`map-${map.id}-alternative-${index}.png`, file);
            updateAlternative(index, { imageUrl });
            stageInstance.showPriorityMessage('Alternative map image uploaded.');
        } catch (error) {
            console.error('Failed to upload alternative map image:', error);
            stageInstance.showPriorityMessage('Failed to upload alternative map image. Check console for details.');
        } finally {
            setIsUploadingVariants(current => ({ ...current, [index]: false }));
        }
    };

    const generateVariantImage = async (index: number) => {
        if (!draft.imageUrl.trim() || isGeneratingVariants[index]) {
            if (!draft.imageUrl.trim()) {
                stageInstance.showPriorityMessage('Add a base map image before generating an alternative.');
            }
            return;
        }

        setIsGeneratingVariants(current => ({ ...current, [index]: true }));
        try {
            persistDraft(draftRef.current);
            const alternative = map.alternativeImages[index];
            const imageUrl = await generateMapAlternativeImage(map, alternative, stageInstance);
            if (!imageUrl) {
                throw new Error('Failed to generate alternative map image.');
            }
            setDraft(createMapDraft(map));
            stageInstance.showPriorityMessage('Generated alternative map image.');
        } catch (error) {
            console.error('Failed to generate alternative map image:', error);
            stageInstance.showPriorityMessage('Failed to generate alternative map image. Check console for details.');
        } finally {
            setIsGeneratingVariants(current => ({ ...current, [index]: false }));
        }
    };

    const resolveTargetName = (childId: string) => {
        const mapTarget = activeMaps.find(candidate => candidate.id === childId);
        if (mapTarget) {
            return mapTarget.name;
        }

        const locationTarget = activeLocations.find(location => location.id === childId);
        if (locationTarget) {
            return getLocationName(locationTarget.id, stageInstance);
        }

        return 'Missing target';
    };

    const updateLinkFromPointer = (index: number, event: PointerEvent<HTMLElement>) => {
        const previewBounds = previewRef.current?.getBoundingClientRect();
        if (!previewBounds) {
            return;
        }

        updateLink(index, {
            coordinates: {
                x: (event.clientX - previewBounds.left) / previewBounds.width,
                y: (event.clientY - previewBounds.top) / previewBounds.height,
            },
        });
    };

    const previewTabStyle = (isActive: boolean): React.CSSProperties => ({
        padding: '6px 12px',
        fontSize: '13px',
        borderRadius: '999px',
        border: `1px solid ${isActive ? 'var(--agenda-highlight)' : 'var(--agenda-line-subtle)'}`,
        background: isActive ? 'var(--agenda-active)' : 'color-mix(in srgb, var(--agenda-surface-base) 86%, transparent)',
        color: 'var(--agenda-text-primary)',
        cursor: 'pointer',
    });

    const previewImageUrl = previewSelection === 'base'
        ? draft.imageUrl
        : draft.alternativeImages[previewSelection]?.imageUrl || draft.imageUrl;

    return (
        <div style={{ padding: '20px', display: 'grid', gap: '16px', flex: 1, minHeight: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 130px', gap: '12px' }}>
                <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>
                    Name
                    <TextInput fullWidth value={draft.name} onChange={event => updateDraft('name', event.target.value)} />
                </label>
                <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>
                    Priority
                    <TextInput fullWidth type="number" value={draft.priority} onChange={event => updateDraft('priority', Number(event.target.value))} />
                </label>
            </div>
            <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>
                Category
                <TextInput fullWidth value={draft.category} onChange={event => updateDraft('category', event.target.value)} />
            </label>
            <label style={{ color: 'var(--agenda-text-muted)', fontSize: '13px' }}>
                Description
                <TextArea fullWidth rows={3} value={draft.description} onChange={event => updateDraft('description', event.target.value)} />
            </label>

            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <button
                        type="button"
                        aria-label={`${isLinksCollapsed ? 'Expand' : 'Collapse'} Links`}
                        aria-expanded={!isLinksCollapsed}
                        onClick={() => setIsLinksCollapsed(current => !current)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 0, border: 0, background: 'transparent', color: 'var(--agenda-text-primary)', cursor: 'pointer' }}
                    >
                        <ExpandMore style={{ transform: isLinksCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 150ms ease' }} />
                        <strong>Links</strong>
                    </button>
                    <Button variant="secondary" onClick={addLink} style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '6px 10px' }}><Add fontSize="small" /> Add</Button>
                </div>
                {!isLinksCollapsed && (
                    <div style={{ display: 'grid', gap: 8 }}>
                        {map.links.map((link, index) => (
                            <div key={`${link.childId}-${index}`} style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid var(--agenda-line-subtle)', borderRadius: 8 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) 90px 90px auto', gap: 8, alignItems: 'center' }}>
                                    <SearchableOptionPicker
                                        value={link.childId}
                                        onChange={nextValue => updateLink(index, { childId: (nextValue as string) || link.childId })}
                                        options={[
                                            ...activeLocations.map(location => ({ key: location.id, label: getLocationName(location.id, stageInstance), imageUrl: location.imageUrl, icon: Place, description: 'Location' })),
                                            ...activeMaps.map(candidate => ({ key: candidate.id, label: candidate.name, imageUrl: candidate.imageUrl, icon: MapIcon, description: 'Map' })),
                                        ]}
                                        title="Choose link target"
                                        placeholder="Search locations and maps"
                                    />
                                    <TextInput type="number" min="0" max="1" step="0.01" aria-label="X coordinate" value={link.coordinates.x} onChange={event => updateLink(index, { coordinates: { ...link.coordinates, x: Number(event.target.value) } })} />
                                    <TextInput type="number" min="0" max="1" step="0.01" aria-label="Y coordinate" value={link.coordinates.y} onChange={event => updateLink(index, { coordinates: { ...link.coordinates, y: Number(event.target.value) } })} />
                                    <Button variant="danger" onClick={() => persist(() => map.links.splice(index, 1))} style={{ padding: 7 }}><Delete fontSize="small" /></Button>
                                </div>
                                <ConditionEditor
                                    conditionCollections={link.conditionCollections || []}
                                    globalStats={stageInstance.getConfiguration().globalStats || []}
                                    actorStats={stageInstance.getConfiguration().actorStats || []}
                                    actors={Object.values(stageInstance.getSave().actors || {})}
                                    allowVariableActorTarget
                                    onChange={(conditionCollections) => updateLink(index, { conditionCollections })}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div>
                <strong style={{ display: 'block', color: 'var(--agenda-text-primary)', marginBottom: 8 }}>Preview</strong>
                <div ref={previewRef} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: 'color-mix(in srgb, var(--agenda-surface-base) 88%, transparent)', backgroundImage: previewImageUrl ? `url(${previewImageUrl})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', border: '1px solid var(--agenda-line-strong)', borderRadius: 8, overflow: 'hidden', touchAction: 'none', marginBottom: 10 }}>
                    {map.links.map((link, index) => {
                        const locationImageUrl = activeLocations.find(location => location.id === link.childId)?.imageUrl;
                        return (
                            <div
                                key={`${link.childId}-marker-${index}`}
                                role="button"
                                tabIndex={0}
                                aria-label={`Drag ${resolveTargetName(link.childId)} marker`}
                                title={`Drag to position ${resolveTargetName(link.childId)}`}
                                onPointerDown={event => {
                                    event.currentTarget.setPointerCapture(event.pointerId);
                                    updateLinkFromPointer(index, event);
                                }}
                                onPointerMove={event => {
                                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                                        updateLinkFromPointer(index, event);
                                    }
                                }}
                                style={{ position: 'absolute', left: `${link.coordinates.x * 100}%`, top: `${link.coordinates.y * 100}%`, transform: 'translate(-50%, -50%)', display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: '50%', color: 'var(--agenda-text-primary)', backgroundColor: 'var(--agenda-active)', backgroundImage: locationImageUrl ? `url(${locationImageUrl})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', border: '2px solid var(--agenda-text-primary)', boxShadow: '0 2px 8px rgba(0,0,0,.65)', cursor: 'grab', userSelect: 'none' }}
                            >
                                {!locationImageUrl && <Place style={{ fontSize: 18 }} />}
                            </div>
                        );
                    })}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => setPreviewSelection('base')}
                        style={previewTabStyle(previewSelection === 'base')}
                    >
                        Base
                    </button>
                    {draft.alternativeImages.map((alternative, index) => (
                        <button
                            key={index}
                            type="button"
                            onClick={() => setPreviewSelection(index)}
                            style={previewTabStyle(previewSelection === index)}
                        >
                            {alternative.description || `Alternative ${index + 1}`}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label style={{ display: 'block', color: 'var(--agenda-text-muted)', fontSize: '13px', marginBottom: 6 }}>Map Image Prompt</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start' }}>
                    <TextInput fullWidth value={draft.imagePrompt} onChange={event => updateDraft('imagePrompt', event.target.value)} placeholder="Describe the map layout, landmarks, and visual style." />
                    <Button variant="secondary" onClick={generateImage} disabled={isGenerating} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <AutoAwesome style={{ fontSize: 18 }} /> {isGenerating ? 'Generating...' : 'Generate'}
                    </Button>
                </div>
            </div>
            <ImageUrlUploadField
                imageUrl={draft.imageUrl}
                onImageUrlChange={value => updateDraft('imageUrl', value)}
                onUploadFile={uploadImage}
                isUploading={isUploading}
                inputLabel="Map Image URL"
                previewWidth="220px"
                previewHeight="124px"
                previewPlaceholder={<ImageIcon style={{ fontSize: 46, color: 'var(--agenda-text-muted)' }} />}
                previewUploadHint={isUploading ? 'Uploading...' : 'Click image to upload'}
                onInvalidFile={() => stageInstance.showPriorityMessage('Please select a valid image file.')}
            />

            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <strong style={{ color: 'var(--agenda-text-primary)' }}>Alternative Images</strong>
                    <Button variant="secondary" onClick={() => {
                        updateDraft('alternativeImages', [...draft.alternativeImages, createAlternativeImage()]);
                        setCollapsedAlternativeImages(current => [...current, false]);
                    }} style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '6px 10px' }}><Add fontSize="small" /> Add</Button>
                </div>
                <p style={{ color: 'var(--agenda-text-muted)', fontSize: 13, margin: '0 0 12px' }}>The first alternative whose conditions pass replaces the base map image.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
                    {draft.alternativeImages.map((alternative, index) => {
                        const isUploadingVariant = Boolean(isUploadingVariants[index]);
                        const isGeneratingVariant = Boolean(isGeneratingVariants[index]);
                        const isCollapsed = Boolean(collapsedAlternativeImages[index]);
                        return (
                            <div key={index} style={{ display: 'grid', gap: 10, padding: 12, border: '1px solid var(--agenda-line-subtle)', borderRadius: 8 }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                                        disabled={index === 0 || Object.values(isUploadingVariants).some(Boolean) || Object.values(isGeneratingVariants).some(Boolean)}
                                        onClick={() => moveAlternative(index, -1)}
                                        style={{ display: 'grid', placeItems: 'center', padding: 0, border: 0, background: 'transparent', color: 'var(--agenda-text-primary)', cursor: index === 0 ? 'default' : 'pointer', opacity: index === 0 ? 0.35 : 1 }}
                                    >
                                        <ArrowUpward fontSize="small" />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`Move ${alternative.description || `alternative ${index + 1}`} down`}
                                        title="Move down (lower priority)"
                                        disabled={index === draft.alternativeImages.length - 1 || Object.values(isUploadingVariants).some(Boolean) || Object.values(isGeneratingVariants).some(Boolean)}
                                        onClick={() => moveAlternative(index, 1)}
                                        style={{ display: 'grid', placeItems: 'center', padding: 0, border: 0, background: 'transparent', color: 'var(--agenda-text-primary)', cursor: index === draft.alternativeImages.length - 1 ? 'default' : 'pointer', opacity: index === draft.alternativeImages.length - 1 ? 0.35 : 1 }}
                                    >
                                        <ArrowDownward fontSize="small" />
                                    </button>
                                    <TextInput fullWidth value={alternative.description} onChange={event => updateAlternative(index, { description: event.target.value })} placeholder="Description, e.g. Morning or Flooded" />
                                    {!isCollapsed && <Button variant="danger" onClick={() => {
                                        updateDraft('alternativeImages', draft.alternativeImages.filter((_, alternativeIndex) => alternativeIndex !== index));
                                        setCollapsedAlternativeImages(current => current.filter((_, alternativeIndex) => alternativeIndex !== index));
                                    }} style={{ padding: 7 }} aria-label="Delete alternative"><Delete fontSize="small" /></Button>}
                                </div>
                                {!isCollapsed && (
                                    <>
                                        <TextArea
                                            fullWidth
                                            rows={3}
                                            value={alternative.imagePrompt}
                                            onChange={event => updateAlternative(index, { imagePrompt: event.target.value })}
                                            placeholder="Describe how the map image should change, or leave blank to generate from the description."
                                        />
                                        <ImageUrlUploadField
                                            imageUrl={alternative.imageUrl}
                                            onImageUrlChange={value => updateAlternative(index, { imageUrl: value })}
                                            onUploadFile={file => uploadVariantImage(index, file)}
                                            isUploading={isUploadingVariant}
                                            inputLabel="Alternative Image URL"
                                            previewWidth="180px"
                                            previewHeight="101px"
                                            previewPlaceholder={<ImageIcon style={{ fontSize: 38, color: 'var(--agenda-text-muted)' }} />}
                                            previewUploadHint={isUploadingVariant ? 'Uploading...' : 'Click image to upload'}
                                            onInvalidFile={() => stageInstance.showPriorityMessage('Please select a valid image file.')}
                                        />
                                        <ConditionEditor
                                            conditionCollections={alternative.conditionCollections}
                                            globalStats={stageInstance.getConfiguration().globalStats || []}
                                            actorStats={stageInstance.getConfiguration().actorStats || []}
                                            actors={Object.values(stageInstance.getSave().actors || {})}
                                            allowVariableActorTarget
                                            onChange={conditionCollections => updateAlternative(index, { conditionCollections })}
                                        />
                                        <Button variant="secondary" onClick={() => generateVariantImage(index)} disabled={isGeneratingVariant} style={{ justifySelf: 'end', display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <AutoAwesome style={{ fontSize: 18 }} /> {isGeneratingVariant ? 'Generating...' : 'Generate'}
                                        </Button>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <Button variant="danger" onClick={() => persist(() => { map.active = false; onDeactivate(); })} style={{ justifySelf: 'end' }}>Deactivate Map</Button>
        </div>
    );
};