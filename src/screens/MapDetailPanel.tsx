import { FC, PointerEvent, useEffect, useRef, useState } from 'react';
import { AspectRatio } from '@chub-ai/stages-ts';
import { Add, AutoAwesome, Delete, Image as ImageIcon, Place } from '@mui/icons-material';
import { Map as GameMap, MapLink } from '../content/Map';
import { Stage } from '../Stage';
import { Button, TextArea, TextInput } from './UiComponents';
import { ImageUrlUploadField } from './ImageUrlUploadField';

interface MapDetailPanelProps {
    map: GameMap;
    stage: () => Stage;
    onChange: () => void;
    onDeactivate: () => void;
}

const clampCoordinate = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

type MapDraft = Pick<GameMap, 'name' | 'description' | 'priority' | 'category' | 'imagePrompt' | 'imageUrl'>;

const createMapDraft = (map: GameMap): MapDraft => ({
    name: map.name,
    description: map.description,
    priority: map.priority,
    category: map.category,
    imagePrompt: map.imagePrompt,
    imageUrl: map.imageUrl,
});

export const MapDetailPanel: FC<MapDetailPanelProps> = ({ map, stage, onChange, onDeactivate }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
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
            map.links.push({ parentId: map.id, childId: firstTarget, coordinates: { x: 0.5, y: 0.5 } });
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
            updateDraft('imageUrl', imageUrl);
            stageInstance.showPriorityMessage('Generated a new map image.');
        } catch (error) {
            console.error('Failed to generate map image:', error);
            stageInstance.showPriorityMessage('Failed to generate map image. Check console for details.');
        } finally {
            setIsGenerating(false);
        }
    };

    const resolveTargetName = (childId: string) =>
        activeMaps.find(candidate => candidate.id === childId)?.name
        || activeLocations.find(location => location.id === childId)?.name
        || 'Missing target';

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

    return (
        <div style={{ padding: '20px', overflowY: 'auto', display: 'grid', gap: '16px', flex: 1, minHeight: 0 }}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ color: 'var(--agenda-text-primary)' }}>Links</strong>
                    <Button variant="secondary" onClick={addLink} style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '6px 10px' }}><Add fontSize="small" /> Add</Button>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                    {map.links.map((link, index) => (
                        <div key={`${link.childId}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) 90px 90px auto', gap: 8, alignItems: 'center' }}>
                            <select value={link.childId} onChange={event => updateLink(index, { childId: event.target.value })} style={{ minHeight: 38, background: 'var(--agenda-surface-base)', color: 'var(--agenda-text-primary)', border: '1px solid var(--agenda-line-subtle)', borderRadius: 6, padding: '0 8px' }}>
                                <optgroup label="Locations">{activeLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</optgroup>
                                <optgroup label="Maps">{activeMaps.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</optgroup>
                            </select>
                            <TextInput type="number" min="0" max="1" step="0.01" aria-label="X coordinate" value={link.coordinates.x} onChange={event => updateLink(index, { coordinates: { ...link.coordinates, x: Number(event.target.value) } })} />
                            <TextInput type="number" min="0" max="1" step="0.01" aria-label="Y coordinate" value={link.coordinates.y} onChange={event => updateLink(index, { coordinates: { ...link.coordinates, y: Number(event.target.value) } })} />
                            <Button variant="danger" onClick={() => persist(() => map.links.splice(index, 1))} style={{ padding: 7 }}><Delete fontSize="small" /></Button>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <strong style={{ display: 'block', color: 'var(--agenda-text-primary)', marginBottom: 8 }}>Preview</strong>
                <div ref={previewRef} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: 'color-mix(in srgb, var(--agenda-surface-base) 88%, transparent)', backgroundImage: draft.imageUrl ? `url(${draft.imageUrl})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', border: '1px solid var(--agenda-line-strong)', borderRadius: 8, overflow: 'hidden', touchAction: 'none' }}>
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
            </div>

            <Button variant="danger" onClick={() => persist(() => { map.active = false; onDeactivate(); })} style={{ justifySelf: 'end' }}>Deactivate Map</Button>
        </div>
    );
};