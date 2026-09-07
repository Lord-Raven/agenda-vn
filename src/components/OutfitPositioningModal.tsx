import { FC, useRef, useState, useEffect, useCallback } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { Actor, Outfit } from '../content/Actor';
import { Button, TextInput } from './UiComponents';
import { motion } from 'framer-motion';

interface OutfitPositioningModalProps {
    open: boolean;
    actor: Actor;
    outfit: Outfit;
    otherActors: Actor[];
    onClose: () => void;
    onUpdate: (updates: Partial<Outfit>) => void;
}

interface InteractiveImageState {
    offsetX: number;
    offsetY: number;
    scaleX: number;
    scaleY: number;
    isDragging: boolean;
    dragStartX: number;
    dragStartY: number;
    dragStartOffsetX: number;
    dragStartOffsetY: number;
}

const DEFAULT_IMAGE_WIDTH = 400;
const DEFAULT_IMAGE_HEIGHT = 600;

export const OutfitPositioningModal: FC<OutfitPositioningModalProps> = ({
    open,
    actor,
    outfit,
    otherActors,
    onClose,
    onUpdate,
}) => {
    const [referenceActorId, setReferenceActorId] = useState<string>(otherActors[0]?.id || '');
    
    const [imageState, setImageState] = useState<InteractiveImageState>({
        offsetX: outfit.offsetX ?? 0,
        offsetY: outfit.offsetY ?? 0,
        scaleX: outfit.scaleX ?? 1,
        scaleY: outfit.scaleY ?? 1,
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        dragStartOffsetX: 0,
        dragStartOffsetY: 0,
    });

    // Sync state when outfit changes
    useEffect(() => {
        if (open) {
            setImageState(prev => ({
                ...prev,
                offsetX: outfit.offsetX ?? 0,
                offsetY: outfit.offsetY ?? 0,
                scaleX: outfit.scaleX ?? 1,
                scaleY: outfit.scaleY ?? 1,
            }));
        }
    }, [open, outfit]);

    const containerRef = useRef<HTMLDivElement>(null);
    const adjustedImageRef = useRef<HTMLImageElement>(null);

    const getReferenceActor = useCallback(() => {
        return otherActors.find(a => a.id === referenceActorId);
    }, [referenceActorId, otherActors]);

    const getNeutralImage = useCallback((targetActor: Actor) => {
        const outfits = targetActor.outfits || [];
        if (outfits.length > 0) {
            const outfit = outfits.find(o => o.id === targetActor.outfitId) || outfits[0];
            return outfit.emotionPack?.['neutral'] || outfit.emotionPack?.['base'] || '';
        }
        return '';
    }, []);

    const outfitImageUrl = outfit.emotionPack?.['neutral'] || outfit.emotionPack?.['base'] || '';

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;
        
        setImageState(prev => ({
            ...prev,
            isDragging: true,
            dragStartX: e.clientX,
            dragStartY: e.clientY,
            dragStartOffsetX: prev.offsetX,
            dragStartOffsetY: prev.offsetY,
        }));
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!imageState.isDragging || !containerRef.current) return;

        const deltaX = e.clientX - imageState.dragStartX;
        const deltaY = e.clientY - imageState.dragStartY;

        // Convert pixel movement to percentage of scaled image
        const scaledWidth = (adjustedImageRef.current?.offsetWidth || DEFAULT_IMAGE_WIDTH) * imageState.scaleX;
        const scaledHeight = (adjustedImageRef.current?.offsetHeight || DEFAULT_IMAGE_HEIGHT) * imageState.scaleY;

        const percentDeltaX = (deltaX / scaledWidth) * 100;
        const percentDeltaY = (deltaY / scaledHeight) * 100;

        setImageState(prev => ({
            ...prev,
            offsetX: Math.max(-50, Math.min(50, prev.dragStartOffsetX + percentDeltaX)),
            offsetY: Math.max(-50, Math.min(50, prev.dragStartOffsetY + percentDeltaY)),
        }));
    }, [imageState.isDragging, imageState.dragStartX, imageState.dragStartY, imageState.scaleX, imageState.scaleY]);

    const handleMouseUp = useCallback(() => {
        setImageState(prev => ({ ...prev, isDragging: false }));
    }, []);

    useEffect(() => {
        if (imageState.isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [imageState.isDragging, handleMouseMove, handleMouseUp]);

    const handleScaleChange = (axis: 'X' | 'Y', value: number) => {
        const clampedValue = Math.max(0.5, Math.min(2, value));
        setImageState(prev => ({
            ...prev,
            [`scale${axis}`]: clampedValue,
        }));
    };

    const handleOffsetChange = (axis: 'X' | 'Y', value: number) => {
        const clampedValue = Math.max(-50, Math.min(50, value));
        setImageState(prev => ({
            ...prev,
            [`offset${axis}`]: clampedValue,
        }));
    };

    const handleSave = () => {
        onUpdate({
            scaleX: imageState.scaleX,
            scaleY: imageState.scaleY,
            offsetX: imageState.offsetX,
            offsetY: imageState.offsetY,
        });
        onClose();
    };

    const handleReset = () => {
        setImageState(prev => ({
            ...prev,
            offsetX: 0,
            offsetY: 0,
            scaleX: 1,
            scaleY: 1,
        }));
    };

    const referenceActor = getReferenceActor();
    const referenceImageUrl = referenceActor ? getNeutralImage(referenceActor) : '';

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="xl"
            fullWidth
            slotProps={{
                paper: {
                    style: {
                        backgroundColor: 'color-mix(in srgb, var(--agenda-surface-raised) 94%, var(--agenda-surface-base))',
                        backdropFilter: 'blur(10px)',
                        border: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                        borderRadius: '8px',
                        color: 'var(--agenda-text-primary)',
                    }
                }
            }}
        >
            <DialogTitle style={{
                color: 'var(--agenda-highlight)',
                fontSize: '18px',
                fontWeight: 'bold',
                borderBottom: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                paddingBottom: '10px',
            }}>
                Configure Positioning - {outfit.name}
            </DialogTitle>
            <DialogContent style={{ paddingTop: '20px' }}>
                <div style={{ display: 'grid', gap: '20px' }}>
                    {/* Three Images Display */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '20px',
                        alignItems: 'start',
                    }}>
                        {/* Original Image */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            alignItems: 'center',
                        }}>
                            <h3 style={{ color: 'var(--agenda-highlight)', margin: '0 0 10px 0' }}>
                                Original
                            </h3>
                            <div style={{
                                width: `${DEFAULT_IMAGE_WIDTH}px`,
                                height: `${DEFAULT_IMAGE_HEIGHT}px`,
                                backgroundColor: 'var(--agenda-surface-base)',
                                border: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                position: 'relative',
                            }}>
                                {outfitImageUrl ? (
                                    <img
                                        src={outfitImageUrl}
                                        alt="Original"
                                        style={{
                                            position: 'absolute',
                                            bottom: 0,
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            height: '100%',
                                            width: 'auto',
                                            maxWidth: 'none',
                                        }}
                                    />
                                ) : (
                                    <span style={{ color: 'var(--agenda-text-secondary)' }}>
                                        No image
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Adjusted Image (Interactive) */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            alignItems: 'center',
                        }}>
                            <h3 style={{ color: 'var(--agenda-highlight)', margin: '0 0 10px 0' }}>
                                Adjusted
                            </h3>
                            <motion.div
                                ref={containerRef}
                                onMouseDown={handleMouseDown}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                style={{
                                    width: `${DEFAULT_IMAGE_WIDTH}px`,
                                    height: `${DEFAULT_IMAGE_HEIGHT}px`,
                                    backgroundColor: 'var(--agenda-surface-base)',
                                    border: `2px solid ${imageState.isDragging ? 'var(--agenda-accent-primary)' : 'color-mix(in srgb, var(--agenda-highlight) 30%, transparent)'}`,
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    cursor: imageState.isDragging ? 'grabbing' : 'grab',
                                    userSelect: 'none',
                                    transition: imageState.isDragging ? 'none' : 'border-color 0.2s',
                                }}
                            >
                                {outfitImageUrl ? (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            bottom: 0,
                                            left: '50%',
                                            height: '100%',
                                            transform: 'translateX(-50%)',
                                        }}
                                    >
                                        <img
                                            ref={adjustedImageRef}
                                            src={outfitImageUrl}
                                            alt="Adjusted"
                                            style={{
                                                display: 'block',
                                                height: '100%',
                                                width: 'auto',
                                                maxWidth: 'none',
                                                pointerEvents: 'none',
                                                // Scale first, then offset, so offsets read as a percentage of the scaled image.
                                                transform: `scale(${imageState.scaleX}, ${imageState.scaleY}) translate(${imageState.offsetX}%, ${imageState.offsetY}%)`,
                                                transformOrigin: 'bottom center',
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <span style={{ color: 'var(--agenda-text-secondary)' }}>
                                        No image
                                    </span>
                                )}
                            </motion.div>
                        </div>

                        {/* Reference Image */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            alignItems: 'center',
                        }}>
                            <h3 style={{ color: 'var(--agenda-highlight)', margin: '0 0 10px 0' }}>
                                Reference
                            </h3>
                            <div style={{
                                width: `${DEFAULT_IMAGE_WIDTH}px`,
                                height: `${DEFAULT_IMAGE_HEIGHT}px`,
                                backgroundColor: 'var(--agenda-surface-base)',
                                border: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                position: 'relative',
                            }}>
                                {referenceImageUrl ? (
                                    <img
                                        src={referenceImageUrl}
                                        alt="Reference"
                                        style={{
                                            position: 'absolute',
                                            bottom: 0,
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            height: '100%',
                                            width: 'auto',
                                            maxWidth: 'none',
                                        }}
                                    />
                                ) : (
                                    <span style={{ color: 'var(--agenda-text-secondary)' }}>
                                        No image
                                    </span>
                                )}
                            </div>
                            <div style={{ width: '100%' }}>
                                <select
                                    value={referenceActorId}
                                    onChange={(e) => setReferenceActorId(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        backgroundColor: 'var(--agenda-surface-base)',
                                        color: 'var(--agenda-text-primary)',
                                        border: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                                        borderRadius: '4px',
                                        fontSize: '14px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <option value="">-- Select Actor --</option>
                                    {otherActors.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.displayName || a.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '20px',
                        borderTop: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                        paddingTop: '20px',
                    }}>
                        {/* Scaling Controls */}
                        <div style={{ display: 'grid', gap: '12px' }}>
                            <h4 style={{ color: 'var(--agenda-highlight)', margin: '0 0 8px 0' }}>
                                Scale
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--agenda-text-secondary)' }}>
                                        Scale X: {imageState.scaleX.toFixed(2)}
                                    </label>
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="2"
                                        step="0.05"
                                        value={imageState.scaleX}
                                        onChange={(e) => handleScaleChange('X', parseFloat(e.target.value))}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--agenda-text-secondary)' }}>
                                        Scale Y: {imageState.scaleY.toFixed(2)}
                                    </label>
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="2"
                                        step="0.05"
                                        value={imageState.scaleY}
                                        onChange={(e) => handleScaleChange('Y', parseFloat(e.target.value))}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Offset Controls */}
                        <div style={{ display: 'grid', gap: '12px' }}>
                            <h4 style={{ color: 'var(--agenda-highlight)', margin: '0 0 8px 0' }}>
                                Position
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--agenda-text-secondary)' }}>
                                        Offset X: {imageState.offsetX.toFixed(1)}%
                                    </label>
                                    <input
                                        type="range"
                                        min="-50"
                                        max="50"
                                        step="1"
                                        value={imageState.offsetX}
                                        onChange={(e) => handleOffsetChange('X', parseFloat(e.target.value))}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--agenda-text-secondary)' }}>
                                        Offset Y: {imageState.offsetY.toFixed(1)}%
                                    </label>
                                    <input
                                        type="range"
                                        min="-50"
                                        max="50"
                                        step="1"
                                        value={imageState.offsetY}
                                        onChange={(e) => handleOffsetChange('Y', parseFloat(e.target.value))}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Help Text */}
                    <div style={{
                        backgroundColor: 'color-mix(in srgb, var(--agenda-accent-primary) 10%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--agenda-accent-primary) 30%, transparent)',
                        borderRadius: '4px',
                        padding: '12px',
                        fontSize: '13px',
                        color: 'var(--agenda-text-secondary)',
                    }}>
                        <strong>Tips:</strong> Drag the center image to adjust position. Use sliders to fine-tune scale and offset values. The reference image helps you maintain consistency across actors.
                    </div>
                </div>
            </DialogContent>
            <DialogActions style={{
                borderTop: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                padding: '15px 20px',
                gap: '10px',
            }}>
                <Button variant="secondary" onClick={handleReset}>
                    Reset
                </Button>
                <div style={{ flex: 1 }} />
                <Button variant="secondary" onClick={onClose}>
                    Cancel
                </Button>
                <Button onClick={handleSave}>
                    Save Changes
                </Button>
            </DialogActions>
        </Dialog>
    );
};
