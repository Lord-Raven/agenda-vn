import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { ActorStat, Stage } from '../Stage';
import { v4 as generateUuid } from 'uuid';
import { Actor, distillActor, generateBaseActorImage, generateEmotionImage, generateOutfitEmotionPrompt, VOICE_MAP, Outfit, getLinkedActorLore, updateActorLore, upsertActorLoreEntry } from '../content/Actor';
import { Emotion } from '../content/Emotion';
import { Image as ImageIcon, ArrowBackIosNew, ArrowForwardIos } from '@mui/icons-material';
import { buildHexColorSwatches, Button, Chip, ColorPickerInput, GlassPanel, TextArea, TextInput, Title } from './UiComponents';
import { ActorStatStars } from './ActorStatStars';

interface ActorDetailPanelProps {
    actor: Actor;
    stage: () => Stage;
    onDeactivate?: (actorId: string) => void;
}

const ORIGINAL_OUTFIT_NAME = 'Original Outfit';

const clampActorStatValue = (value: number, stat: ActorStat): number => {
    let resolved = Number.isFinite(value) ? Number(value) : Number(stat.default) || 0;
    if (typeof stat.min === 'number') {
        resolved = Math.max(stat.min, resolved);
    }
    if (typeof stat.max === 'number') {
        resolved = Math.min(stat.max, resolved);
    }
    return resolved;
};

const resolveActorStatRange = (stat: ActorStat): { min: number; max: number; step: number; hasRange: boolean } => {
    if (typeof stat.min === 'number' && typeof stat.max === 'number' && stat.max > stat.min) {
        return { min: stat.min, max: stat.max, step: 1, hasRange: true };
    }

    if (stat.displayType === 'percentage') {
        return { min: 0, max: 100, step: 1, hasRange: true };
    }

    if (stat.displayType === 'stars') {
        return {
            min: 0,
            max: Number.isFinite(stat.max) ? Math.max(1, Math.round(Number(stat.max))) : 5,
            step: 1,
            hasRange: true,
        };
    }

    if (stat.displayType === 'letter grade') {
        return { min: 0, max: 100, step: 1, hasRange: true };
    }

    return { min: 0, max: 100, step: 1, hasRange: false };
};

const buildLetterGradeOptions = (stat: ActorStat): Array<{ label: string; value: number }> => {
    const { min, max } = resolveActorStatRange(stat);
    const labels = ['F', 'D', 'C', 'B', 'A', 'S'];
    const span = Math.max(1, max - min);

    return labels.map((label, index) => {
        const ratio = index / (labels.length - 1);
        const value = min + (span * ratio);
        return {
            label,
            value: Number(value.toFixed(2)),
        };
    });
};

const createInitialActorStatMap = (actor: Actor, actorStats: ActorStat[]): { [key: string]: number } => {
    const nextMap: { [key: string]: number } = {};
    actorStats.forEach((stat) => {
        const currentValue = Number(actor.statMap?.[stat.name]);
        const fallback = Number.isFinite(stat.default) ? Number(stat.default) : 0;
        const resolved = Number.isFinite(currentValue) ? currentValue : fallback;
        nextMap[stat.name] = clampActorStatValue(resolved, stat);
    });
    return nextMap;
};

export const ActorDetailPanel: FC<ActorDetailPanelProps> = ({ actor, stage, onDeactivate }) => {
    type ImageTarget = 'base' | Emotion;
    type BaseRegenSource = 'description' | `outfit:${string}`;
    const linkedLoreEntry = getLinkedActorLore(actor.name, stage());
    const isProfileBackedByLore = !!linkedLoreEntry;
    const actorStats = useMemo(() => {
        const configured = stage().getConfiguration().actorStats || [];
        const uniqueStatMap: { [name: string]: ActorStat } = {};
        configured.forEach((stat) => {
            const name = stat?.name?.trim();
            if (!name || uniqueStatMap[name]) {
                return;
            }
            uniqueStatMap[name] = {
                ...stat,
                name,
                default: Number.isFinite(stat.default) ? Number(stat.default) : 0,
            };
        });
        return Object.values(uniqueStatMap);
    }, [stage]);

    const getClonedOutfits = (): Outfit[] => {
        const sourceOutfits: Outfit[] = Array.isArray(actor.outfits) && actor.outfits.length > 0
            ? actor.outfits
            : [{
                id: actor.outfitId || generateUuid(),
                name: ORIGINAL_OUTFIT_NAME,
                description: 'This is the default outfit for the actor, generated from their description and avatar. Edit the description or upload a custom avatar to change this outfit.',
                prompts: {},
                emotionPack: {},
            }];

        return sourceOutfits.map((outfit) => ({
            ...outfit,
            prompts: { ...(outfit.prompts || {}) },
            emotionPack: { ...(outfit.emotionPack || {}) },
        }));
    };

    // Local state for editable fields
    const [editedActor, setEditedActor] = useState<{
        name: string;
        category: string;
        description: string;
        profile: string;
        lore: string;
        voiceId: string;
        themeColor: string;
        themeFontFamily: string;
    }>({
        name: actor.name,
        category: actor.category ?? '',
        description: actor.description || '',
        profile: actor.profile || '',
        lore: linkedLoreEntry?.content || '',
        voiceId: actor.voiceId,
        themeColor: actor.themeColor,
        themeFontFamily: actor.themeFontFamily,
    });

    const categoryInputListId = `actor-category-options-${actor.id}`;
    const categorySuggestions = useMemo(() => {
        const seenCategories = new Set<string>();
        let hasUncategorized = false;

        for (const candidate of Object.values(stage().getSave().actors || {})) {
            if (candidate.id === actor.id) {
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

            if (!seenCategories.has(normalizedCategory)) {
                seenCategories.add(normalizedCategory);
            }
        }

        const values = Array.from(seenCategories).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        return {
            hasUncategorized,
            values,
        };
    }, [actor.id, stage]);
    const [editedOutfits, setEditedOutfits] = useState<Outfit[]>(() => getClonedOutfits());
    const [editedStatMap, setEditedStatMap] = useState<{ [key: string]: number }>(() =>
        createInitialActorStatMap(actor, actorStats),
    );
    const [selectedOutfitId, setSelectedOutfitId] = useState<string>(() => {
        const outfits = getClonedOutfits();
        if (actor.outfitId && outfits.some((outfit) => outfit.id === actor.outfitId)) {
            return actor.outfitId;
        }
        return outfits[0]?.id || '';
    });

    const [regeneratingImages, setRegeneratingImages] = useState<Set<string>>(new Set());
    const [isFillingMissingEmotions, setIsFillingMissingEmotions] = useState(false);
    const [isGeneratingActorDetails, setIsGeneratingActorDetails] = useState(false);
    const [, forceUpdate] = useState({});
    const imageUploadInputRef = useRef<HTMLInputElement>(null);
    const [imageDialog, setImageDialog] = useState<{
        open: boolean;
        target: ImageTarget | null;
    }>({ open: false, target: null });
    const [baseRegenSource, setBaseRegenSource] = useState<BaseRegenSource>('description');
    const [emotionPromptDraft, setEmotionPromptDraft] = useState('');
    const [isImageDropActive, setIsImageDropActive] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [outfitsObjectExport, setOutfitsObjectExport] = useState('');
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        title: string;
        message: string;
        actions?: Array<{ label: string; onClick: () => void; variant?: 'primary' | 'secondary' }>;
        onConfirm?: () => void;
    }>({ open: false, title: '', message: '' });
    const editedActorRef = useRef(editedActor);
    const editedOutfitsRef = useRef(editedOutfits);
    const editedStatMapRef = useRef(editedStatMap);
    const autoSaveTimeoutRef = useRef<number | null>(null);
    const didMountRef = useRef(false);

    const cloneOutfits = (outfits: Outfit[]) => outfits.map((outfit) => ({
        ...outfit,
        prompts: { ...(outfit.prompts || {}) },
        emotionPack: { ...(outfit.emotionPack || {}) },
    }));

    const persistActor = (
        nextEditedActor: typeof editedActor,
        nextEditedOutfits: Outfit[],
        nextEditedStatMap: { [key: string]: number }
    ) => {

        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
            autoSaveTimeoutRef.current = null;
        }

        const persistedOutfits = (nextEditedOutfits.length > 0
            ? nextEditedOutfits
            : [{
                id: generateUuid(),
                name: ORIGINAL_OUTFIT_NAME,
                description: '',
                prompts: {},
                emotionPack: {},
            }]).map((outfit) => ({
                ...outfit,
                prompts: { ...(outfit.prompts || {}) },
                emotionPack: { ...(outfit.emotionPack || {}) },
            }));

        const oldName = actor.name;
        actor.name = nextEditedActor.name;
        actor.category = nextEditedActor.category.trim();
        actor.description = nextEditedActor.description;
        if (isProfileBackedByLore) {
            updateActorLore(actor.id, nextEditedActor.lore, stage());
        } else {
            actor.profile = nextEditedActor.profile;
        }
        actor.voiceId = nextEditedActor.voiceId;
        actor.themeColor = nextEditedActor.themeColor;
        actor.themeFontFamily = nextEditedActor.themeFontFamily;
        actor.outfits = persistedOutfits;
        actor.statMap = actor.statMap && typeof actor.statMap === 'object' ? { ...actor.statMap } : {};

        if (actor.name !== oldName) {
            console.log(`Actor name changed from "${oldName}" to "${actor.name}". Updating linked lore entry.`);
            upsertActorLoreEntry(actor, oldName, stage());
        }

        const activeStatNames = new Set<string>();
        actorStats.forEach((stat) => {
            activeStatNames.add(stat.name);
            const candidateValue = Number(nextEditedStatMap[stat.name]);
            const fallbackValue = Number.isFinite(stat.default) ? Number(stat.default) : 0;
            const resolvedValue = Number.isFinite(candidateValue) ? candidateValue : fallbackValue;
            actor.statMap[stat.name] = clampActorStatValue(resolvedValue, stat);
        });

        Object.keys(actor.statMap).forEach((statName) => {
            if (!activeStatNames.has(statName)) {
                delete actor.statMap[statName];
            }
        });

        stage().saveGame();
    };

    useEffect(() => {
        actor.outfits = editedOutfits;
    }, [actor, editedOutfits]);

    useEffect(() => {
        editedActorRef.current = editedActor;
    }, [editedActor]);

    useEffect(() => {
        editedOutfitsRef.current = editedOutfits;
    }, [editedOutfits]);

    useEffect(() => {
        editedStatMapRef.current = editedStatMap;
    }, [editedStatMap]);

    useEffect(() => {
        setEditedStatMap((prev) => {
            const next = createInitialActorStatMap(actor, actorStats);
            actorStats.forEach((stat) => {
                const previousValue = Number(prev[stat.name]);
                if (Number.isFinite(previousValue)) {
                    next[stat.name] = clampActorStatValue(previousValue, stat);
                }
            });

            const prevKeys = Object.keys(prev);
            const nextKeys = Object.keys(next);
            if (prevKeys.length !== nextKeys.length) {
                return next;
            }

            const hasDiff = nextKeys.some((key) => Number(prev[key]) !== Number(next[key]));
            return hasDiff ? next : prev;
        });
    }, [actor, actorStats]);

    useEffect(() => {
        if (!didMountRef.current) {
            didMountRef.current = true;
            return;
        }

        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
        }

        autoSaveTimeoutRef.current = window.setTimeout(() => {
            persistActor(editedActorRef.current, editedOutfitsRef.current, editedStatMapRef.current);
        }, 300);

        return () => {
            if (autoSaveTimeoutRef.current) {
                clearTimeout(autoSaveTimeoutRef.current);
            }
        };
    }, [editedActor, editedOutfits, editedStatMap]);

    useEffect(() => {
        return () => {
            if (autoSaveTimeoutRef.current) {
                persistActor(editedActorRef.current, editedOutfitsRef.current, editedStatMapRef.current);
            }
        };
    }, []);

    const selectedOutfit = editedOutfits.find((outfit) => outfit.id === selectedOutfitId) || editedOutfits[0] || null;
    const getSelectedOutfitImageUrl = (emotion: Emotion | 'base'): string => selectedOutfit?.emotionPack?.[emotion] || '';

    const syncEditedOutfitsFromActor = () => {
        setEditedOutfits(cloneOutfits(actor.outfits));
    };

    const syncEditedFieldsFromActor = () => {
        const latestLinkedLoreEntry = getLinkedActorLore(actor.name, stage());
        setEditedActor({
            name: actor.name,
            category: actor.category ?? '',
            description: actor.description || '',
            profile: actor.profile || '',
            lore: latestLinkedLoreEntry?.content || '',
            voiceId: actor.voiceId,
            themeColor: actor.themeColor,
            themeFontFamily: actor.themeFontFamily,
        });
        setEditedStatMap(createInitialActorStatMap(actor, actorStats));
        const nextOutfits = cloneOutfits(actor.outfits);
        setEditedOutfits(nextOutfits);
        setSelectedOutfitId(() => {
            if (actor.outfitId && nextOutfits.some((outfit) => outfit.id === actor.outfitId)) {
                return actor.outfitId;
            }
            return nextOutfits[0]?.id || '';
        });
    };

    const replaceOutfits = (nextOutfits: Outfit[]) => {
        setEditedOutfits(nextOutfits);
        actor.outfits = cloneOutfits(nextOutfits);
    };

    const updateEmotionPrompt = (emotion: Emotion, prompt: string): string => {
        if (!selectedOutfitId) {
            return prompt.trim();
        }

        const trimmedPrompt = prompt.trim();
        const nextOutfits = editedOutfits.map((outfit) => (
            outfit.id === selectedOutfitId
                ? {
                    ...outfit,
                    prompts: {
                        ...(outfit.prompts || {}),
                        [emotion]: trimmedPrompt,
                    },
                }
                : outfit
        ));
        replaceOutfits(nextOutfits);
        return trimmedPrompt;
    };

    const handleInputChange = (field: string, value: string | number) => {
        setEditedActor(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleOutfitChange = (field: 'name' | 'description', value: string) => {
        if (!selectedOutfitId) return;
        setEditedOutfits((prev) => prev.map((outfit) => (
            outfit.id === selectedOutfitId
                ? { ...outfit, [field]: value }
                : outfit
        )));
    };

    const handleActorStatValueChange = (stat: ActorStat, value: number) => {
        const normalized = clampActorStatValue(value, stat);
        setEditedStatMap((prev) => ({
            ...prev,
            [stat.name]: normalized,
        }));
    };

    const actorThemeColorSwatches = useMemo(() => {
        const otherActorThemeColors = Object.values(stage().getSave().actors || {})
            .filter((candidate) => candidate.id !== actor.id)
            .filter((candidate) => candidate.active !== false)
            .map((candidate) => candidate.themeColor);

        return buildHexColorSwatches([
            editedActor.themeColor,
            ...otherActorThemeColors,
        ]);
    }, [actor.id, editedActor.themeColor, stage]);

    const handleSelectOutfit = (outfitId: string) => {
        setSelectedOutfitId(outfitId);
    };

    const getNextOutfitName = (): string => {
        let nextIndex = editedOutfits.length + 1;
        let candidate = `Outfit ${nextIndex}`;
        const usedNames = new Set(editedOutfits.map((outfit) => outfit.name.toLowerCase()));
        while (usedNames.has(candidate.toLowerCase())) {
            nextIndex += 1;
            candidate = `Outfit ${nextIndex}`;
        }
        return candidate;
    };

    const handleCreateOutfit = () => {
        const newOutfit: Outfit = {
            id: generateUuid(),
            name: getNextOutfitName(),
            description: '',
            prompts: {},
            emotionPack: {},
        };
        setEditedOutfits((prev) => [...prev, newOutfit]);
        setSelectedOutfitId(newOutfit.id);
    };

    const handleDeleteOutfit = () => {
        if (!selectedOutfit || editedOutfits.length <= 1) {
            return;
        }

        if (selectedOutfit.id === actor.outfitId) {
            console.warn('Cannot delete the actor\'s currently selected outfit.');
            return;
        }

        setConfirmDialog({
            open: true,
            title: `Delete Outfit: ${selectedOutfit.name}`,
            message: 'This will remove the selected outfit and all of its emotion images. This cannot be undone. Continue?',
            actions: [
                {
                    label: 'Delete Outfit',
                    onClick: () => {
                        setConfirmDialog((prev) => ({ ...prev, open: false }));
                        setEditedOutfits((prev) => {
                            const next = prev.filter((outfit) => outfit.id !== selectedOutfit.id);
                            const replacement = next[0]?.id || '';
                            setSelectedOutfitId(replacement);
                            return next;
                        });
                    },
                    variant: 'primary',
                },
            ],
        });
    };

    const buildOutfitsExport = () => ({
        outfits: editedOutfits.map((outfit) => ({
            id: outfit.name,
            name: outfit.name,
            description: outfit.description,
            prompts: { ...(outfit.prompts || {}) },
            emotionPack: { ...(outfit.emotionPack || {}) },
        })),
    });

    const formatAsJavascriptObject = (value: unknown, indentLevel = 0): string => {
        const indent = '  '.repeat(indentLevel);
        const childIndent = '  '.repeat(indentLevel + 1);

        if (value === null) return 'null';
        if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);

        if (Array.isArray(value)) {
            if (value.length === 0) return '[]';
            const items = value.map((item) => `${childIndent}${formatAsJavascriptObject(item, indentLevel + 1)}`);
            return `[
${items.join(',\n')}
${indent}]`;
        }

        if (typeof value === 'object') {
            const entries = Object.entries(value as Record<string, unknown>);
            if (entries.length === 0) return '{}';

            const objectEntries = entries.map(([key, entryValue]) => {
                const isValidIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
                const displayKey = isValidIdentifier ? key : `'${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
                return `${childIndent}${displayKey}: ${formatAsJavascriptObject(entryValue, indentLevel + 1)}`;
            });

            return `{
${objectEntries.join(',\n')}
${indent}}`;
        }

        return 'undefined';
    };

    const handleGenerateOutfitsExport = () => {
        setOutfitsObjectExport(formatAsJavascriptObject(buildOutfitsExport()));
    };

    const handleGenerateActorDetails = async () => {
        if (isGeneratingActorDetails) {
            return;
        }

        const nextEditedActor = editedActorRef.current;
        const nextEditedOutfits = editedOutfitsRef.current;
        const nextEditedStatMap = editedStatMapRef.current;
        persistActor(nextEditedActor, nextEditedOutfits, nextEditedStatMap);

        const generationDefinition = {
            name: nextEditedActor.name.trim() || actor.name,
            personality: [
                nextEditedActor.description,
                isProfileBackedByLore ? nextEditedActor.lore : nextEditedActor.profile,
                nextEditedOutfits.map((outfit) => `${outfit.name}: ${outfit.description}`)
                    .filter((entry) => entry.replace(/^[^:]*:/, '').trim().length > 0)
                    .join('\n'),
            ].filter((value) => value?.trim()).join('\n\n'),
            voice_id: nextEditedActor.voiceId,
        };

        setIsGeneratingActorDetails(true);

        const previousGeneratedState = {
            name: actor.name,
            description: actor.description,
            profile: actor.profile,
            voiceId: actor.voiceId,
            themeColor: actor.themeColor,
            themeFontFamily: actor.themeFontFamily,
            outfitId: actor.outfitId,
            outfits: cloneOutfits(actor.outfits),
            statMap: { ...(actor.statMap || {}) },
        };

        try {
            const lore = getLinkedActorLore(actor.name, stage());
            actor.description = '';
            actor.profile = '';
            actor.voiceId = '';
            actor.themeColor = '';
            actor.themeFontFamily = '';
            actor.outfitId = '';
            actor.outfits = [];
            actor.statMap = {};
            const distilledActor = await distillActor(actor, generationDefinition, stage());
            if (!distilledActor) {
                throw new Error('Actor distillation returned no actor.');
            }
            if (lore) {
                // Update lore properties
                lore.title = distilledActor.name;
                lore.content = distilledActor.profile;
                // Update triggers, removing words that were part of the previous name and adding words from the new name
                lore.triggers = [...lore.triggers.filter((trigger) => !previousGeneratedState.name.includes(trigger)), ...distilledActor.name.split(' ')];
            }

            syncEditedFieldsFromActor();
            stage().saveGame();
            forceUpdate({});
            stage().showPriorityMessage(`Generated new details for ${actor.name}.`);
        } catch (error) {
            actor.description = previousGeneratedState.description;
            actor.profile = previousGeneratedState.profile;
            actor.voiceId = previousGeneratedState.voiceId;
            actor.themeColor = previousGeneratedState.themeColor;
            actor.themeFontFamily = previousGeneratedState.themeFontFamily;
            actor.outfitId = previousGeneratedState.outfitId;
            actor.outfits = previousGeneratedState.outfits;
            actor.statMap = previousGeneratedState.statMap;
            syncEditedFieldsFromActor();
            console.error('Failed to generate actor details:', error);
            stage().showPriorityMessage('Failed to generate actor details. Check console for details.');
        } finally {
            setIsGeneratingActorDetails(false);
        }
    };

    const handleDeactivateActor = () => {
        const linkedLore = getLinkedActorLore(actor.name, stage());
        actor.active = false;

        if (linkedLore) {
            const save = stage().getSave();
            save.lorebook = (save.lorebook || []).filter((entry) => entry.id !== linkedLore.id);
        }

        stage().saveGame();
        stage().showPriorityMessage(`${actor.name || 'Actor'} is now inactive and hidden from management.`);
        onDeactivate?.(actor.id);
    };

    const handleRegenerateEmotion = async (emotion: Emotion, promptDraft: string) => {
        if (regeneratingImages.has(emotion)) return;
        
        setConfirmDialog({
            open: true,
            title: `Regenerate ${emotion} Image`,
            message: `This will regenerate the ${emotion} emotion image and replace the existing one. Continue?`,
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, open: false }));

                if (!await persistEmotionPrompt(emotion, promptDraft)) {
                    return;
                }

                setRegeneratingImages(prev => new Set(prev).add(emotion));
                
                try {
                    console.log('Regenerating emotion image with prompt:', getEmotionPrompt(emotion));
                    await generateEmotionImage(actor, emotion, stage(), true, selectedOutfitId);
                    syncEditedOutfitsFromActor();
                    // Force a re-render to show the new image
                    forceUpdate({});
                } catch (error) {
                    console.error(`Failed to regenerate ${emotion} emotion:`, error);
                    stage().showPriorityMessage(`Failed to regenerate ${emotion} emotion. Check console for details.`);
                } finally {
                    setRegeneratingImages(prev => {
                        const next = new Set(prev);
                        next.delete(emotion);
                        return next;
                    });
                }
            }
        });
    };

    const getEmotionPrompt = (emotion: Emotion): string => {
        return selectedOutfit?.prompts?.[emotion] || '';
    };

    const persistEmotionPrompt = async (emotion: Emotion, prompt: string) => {
        if (!selectedOutfitId) {
            stage().showPriorityMessage('Select an outfit before editing prompts.');
            return false;
        }

        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt) {
            try {
                const generatedPrompt = await generateOutfitEmotionPrompt(actor, emotion, stage(), selectedOutfitId);
                if (!generatedPrompt) {
                    stage().showPriorityMessage('Failed to generate an emotion prompt.');
                    return false;
                }
                syncEditedOutfitsFromActor();
                setEmotionPromptDraft(generatedPrompt);
                forceUpdate({});
                return true;
            } catch (error) {
                console.error(`Failed to generate ${emotion} prompt:`, error);
                stage().showPriorityMessage(`Failed to generate ${emotion} prompt. Check console for details.`);
                return false;
            }
        }

        updateEmotionPrompt(emotion, trimmedPrompt);
        stage().saveGame();
        return true;
    };

    const handleEmotionPromptDraftChange = (value: string) => {
        setEmotionPromptDraft(value);

        const target = imageDialog.target;
        if (target && target !== 'base') {
            updateEmotionPrompt(target, value);
        }
    };

    const handleOpenImageDialog = (target: ImageTarget) => {
        setImageDialog({ open: true, target });
        if (target === 'base') {
            setBaseRegenSource('description');
            setEmotionPromptDraft('');
        } else {
            setEmotionPromptDraft(getEmotionPrompt(target));
        }
        setIsImageDropActive(false);
    };

    const handleCloseImageDialog = () => {
        setImageDialog({ open: false, target: null });
        setIsImageDropActive(false);
    };

    const handleImageFile = async (file: File, target: ImageTarget) => {
        if (!file.type.startsWith('image/')) {
            stage().showPriorityMessage('Please select a valid image file.');
            return;
        }

        if (!selectedOutfitId) {
            stage().showPriorityMessage('Select an outfit before uploading images.');
            return;
        }

        setIsUploadingImage(true);
        try {
            const uploadedUrl = await stage().uploadFile(`${actor.id}-${selectedOutfitId}-${target}.png`, file);
            const nextOutfits = editedOutfits.map((outfit) => (
                outfit.id === selectedOutfitId
                    ? {
                        ...outfit,
                        prompts: { ...(outfit.prompts || {}) },
                        emotionPack: {
                            ...(outfit.emotionPack || {}),
                            [target]: uploadedUrl,
                        },
                    }
                    : outfit
            ));
            setEditedOutfits(nextOutfits);
            actor.outfits = nextOutfits.map((outfit) => ({
                ...outfit,
                prompts: { ...(outfit.prompts || {}) },
                emotionPack: { ...(outfit.emotionPack || {}) },
            }));
            stage().saveGame();
            forceUpdate({});
        } catch (error) {
            console.error(`Failed to upload ${target} image:`, error);
            stage().showPriorityMessage(`Failed to upload ${target} image. Check console for details.`);
        } finally {
            setIsUploadingImage(false);
            if (imageUploadInputRef.current) {
                imageUploadInputRef.current.value = '';
            }
        }
    };

    const handleRegenerateBase = async (source: BaseRegenSource) => {
        if (regeneratingImages.has('base')) return;

        const sourceOutfitId = source.startsWith('outfit:') ? source.slice('outfit:'.length) : '';
        const sourceOutfit = editedOutfits.find((outfit) => outfit.id === sourceOutfitId);
        const sourceImageUrl = sourceOutfit?.emotionPack?.base || '';
        const selectedLabel = source === 'description'
                ? 'Description Only'
                : `Outfit: ${sourceOutfit?.name || 'Unknown Outfit'}`;

        if (source.startsWith('outfit:') && !sourceImageUrl) {
            stage().showPriorityMessage('The selected outfit does not have an original sample.');
            return;
        }

        const regenerateBase = async () => {
            setConfirmDialog(prev => ({ ...prev, open: false }));
            setRegeneratingImages(prev => new Set(prev).add('base'));
            
            try {
                await generateBaseActorImage(
                    actor,
                    stage(),
                    true,
                    source !== 'description',
                    selectedOutfitId,
                    source.startsWith('outfit:') ? sourceImageUrl : ''
                );
                syncEditedOutfitsFromActor();
                // Force a re-render to show the new image
                forceUpdate({});
            } catch (error) {
                console.error('Failed to regenerate original sample:', error);
                stage().showPriorityMessage('Failed to regenerate original sample. Check console for details.');
            } finally {
                setRegeneratingImages(prev => {
                    const next = new Set(prev);
                    next.delete('base');
                    return next;
                });
            }
        };

        setConfirmDialog({
            open: true,
            title: 'Regenerate original sample',
            message: `This will regenerate the original sample from ${selectedLabel} and may affect all emotion variations. Continue?`,
            actions: [
                {
                    label: 'Regenerate',
                    onClick: regenerateBase,
                    variant: 'primary'
                }
            ]
        });
    };

    const handleDeleteEmotionImage = (emotion: Emotion) => {
        if (!selectedOutfitId) {
            stage().showPriorityMessage('Select an outfit before deleting emotion images.');
            return;
        }

        if (!selectedOutfit?.emotionPack?.[emotion]) {
            stage().showPriorityMessage(`No ${emotion} image to delete.`);
            return;
        }

        setConfirmDialog({
            open: true,
            title: `Delete ${emotion} Image`,
            message: `This will remove the ${emotion} image for ${selectedOutfit?.name || 'the selected outfit'}. Continue?`,
            actions: [
                {
                    label: 'Delete Image',
                    onClick: () => {
                        setConfirmDialog((prev) => ({ ...prev, open: false }));
                        const nextOutfits = editedOutfits.map((outfit) => (
                            outfit.id === selectedOutfitId
                                ? {
                                    ...outfit,
                                    prompts: { ...(outfit.prompts || {}) },
                                    emotionPack: {
                                        ...(outfit.emotionPack || {}),
                                        [emotion]: '',
                                    },
                                }
                                : outfit
                        ));

                        setEditedOutfits(nextOutfits);
                        actor.outfits = nextOutfits.map((outfit) => ({
                            ...outfit,
                            prompts: { ...(outfit.prompts || {}) },
                            emotionPack: { ...(outfit.emotionPack || {}) },
                        }));
                        stage().saveGame();
                        forceUpdate({});
                    },
                    variant: 'primary',
                },
            ],
        });
    };

    // Get all emotions for the grid
    const allEmotions = Object.values(Emotion);
    const missingEmotionCount = allEmotions.filter((emotion) => !selectedOutfit?.emotionPack?.[emotion]).length;

    const cycleDialogEmotion = (direction: -1 | 1) => {
        const target = imageDialog.target;
        if (!target || target === 'base' || allEmotions.length < 2) {
            return;
        }

        const currentIndex = allEmotions.indexOf(target);
        if (currentIndex < 0) {
            return;
        }

        const nextIndex = (currentIndex + direction + allEmotions.length) % allEmotions.length;
        const nextEmotion = allEmotions[nextIndex];
        setImageDialog({ open: true, target: nextEmotion });
        setEmotionPromptDraft(getEmotionPrompt(nextEmotion));
        setIsImageDropActive(false);
    };

    const handleFillMissingEmotionImages = async () => {
        if (!selectedOutfit || !selectedOutfitId) {
            stage().showPriorityMessage('Select an outfit before filling missing emotion images.');
            return;
        }

        if (isFillingMissingEmotions) {
            return;
        }

        const missingEmotions = allEmotions.filter((emotion) => !selectedOutfit.emotionPack?.[emotion]);
        if (missingEmotions.length === 0) {
            stage().showPriorityMessage(`All emotion images already exist for ${selectedOutfit.name}.`);
            return;
        }

        setIsFillingMissingEmotions(true);
        let generatedCount = 0;
        let failedCount = 0;

        try {
            for (const emotion of missingEmotions) {
                setRegeneratingImages((prev) => new Set(prev).add(emotion));

                try {
                    const existingPrompt = selectedOutfit.prompts?.[emotion] || '';
                    if (!existingPrompt.trim()) {
                        const generatedPrompt = await generateOutfitEmotionPrompt(actor, emotion, stage(), selectedOutfitId);
                        if (!generatedPrompt) {
                            throw new Error(`Missing prompt for ${emotion}`);
                        }
                    }

                    await generateEmotionImage(actor, emotion, stage(), true, selectedOutfitId);
                    generatedCount += 1;
                    syncEditedOutfitsFromActor();
                    forceUpdate({});
                } catch (error) {
                    failedCount += 1;
                    console.error(`Failed to fill ${emotion} emotion image:`, error);
                } finally {
                    setRegeneratingImages((prev) => {
                        const next = new Set(prev);
                        next.delete(emotion);
                        return next;
                    });
                }
            }
        } finally {
            setIsFillingMissingEmotions(false);
        }

        if (generatedCount > 0 && failedCount === 0) {
            stage().showPriorityMessage(`Generated ${generatedCount} missing emotion image${generatedCount === 1 ? '' : 's'} for ${selectedOutfit.name}.`);
        } else if (generatedCount > 0 && failedCount > 0) {
            stage().showPriorityMessage(`Generated ${generatedCount} emotion image${generatedCount === 1 ? '' : 's'}; ${failedCount} failed. Check console for details.`);
        } else {
            stage().showPriorityMessage('Failed to generate missing emotion images. Check console for details.');
        }
    };

    const currentImageUrl = imageDialog.target ? getSelectedOutfitImageUrl(imageDialog.target as Emotion | 'base') : '';
    const isCurrentImageRegenerating = imageDialog.target ? regeneratingImages.has(imageDialog.target) : false;
    const imageTargetLabel = imageDialog.target || '';
    const imageTargetOutfitName = selectedOutfit?.name || 'Outfit';
    const isDialogEmotionTarget = !!imageDialog.target && imageDialog.target !== 'base';
    const dialogEmotionIndex = isDialogEmotionTarget ? allEmotions.indexOf(imageDialog.target as Emotion) : -1;
    const baseRegenOutfitOptions = editedOutfits.filter((outfit) => !!outfit.emotionPack?.base);
    const baseRegenOptions: Array<{ value: BaseRegenSource; label: string }> = [
        { value: 'description' as BaseRegenSource, label: 'Description Only' },
        ...baseRegenOutfitOptions.map((outfit) => ({
            value: `outfit:${outfit.id}` as BaseRegenSource,
            label: `Outfit: ${outfit.name}`,
        })),
    ];

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
                            boxSizing: 'border-box',
                            minHeight: 0,
                            overflow: 'auto',
                            position: 'relative',
                            padding: '20px',
                            paddingBottom: '28px',
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
                                Actor Details: {editedActor.name}
                            </Title>
                        </div>

                        {/* Form Content */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                            
                            {/* Basic Info Section */}
                            <section>
                                <h2 style={{ 
                                    color: 'var(--agenda-highlight)', 
                                    fontSize: '18px', 
                                    fontWeight: 'bold',
                                    marginBottom: '15px',
                                    borderBottom: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                                    paddingBottom: '5px'
                                }}>
                                    Basic Information
                                </h2>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    {/* Name */}
                                    <div>
                                        <label 
                                            style={{
                                                display: 'block',
                                                color: 'var(--agenda-highlight)',
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                                marginBottom: '8px',
                                            }}
                                        >
                                            Name
                                        </label>
                                        <TextInput
                                            fullWidth
                                            value={editedActor.name}
                                            onChange={(e) => handleInputChange('name', e.target.value)}
                                            placeholder="Character name"
                                        />
                                    </div>

                                    <div>
                                        <label
                                            style={{
                                                display: 'block',
                                                color: 'var(--agenda-highlight)',
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                                marginBottom: '8px',
                                            }}
                                        >
                                            Category
                                        </label>
                                        <TextInput
                                            fullWidth
                                            value={editedActor.category}
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
                                        <label 
                                            style={{
                                                display: 'block',
                                                color: 'var(--agenda-highlight)',
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                                marginBottom: '8px',
                                            }}
                                        >
                                            Physical Description
                                        </label>
                                        <TextArea
                                            value={editedActor.description}
                                            onChange={(e) => handleInputChange('description', e.target.value)}
                                            placeholder="Core physical appearance, separate from clothing or outfit details"
                                            style={{
                                                width: '100%',
                                                minHeight: '100px',
                                                borderRadius: '5px',
                                                resize: 'vertical',
                                            }}
                                        />
                                    </div>

                                    {/* Profile/Personality */}
                                    <div>
                                        <label 
                                            style={{
                                                display: 'block',
                                                color: 'var(--agenda-highlight)',
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                                marginBottom: '8px',
                                            }}
                                        >
                                            Personality Profile{isProfileBackedByLore ? ' (From Lorebook)' : ''}
                                        </label>
                                        <TextArea
                                            value={isProfileBackedByLore ? editedActor.lore : editedActor.profile}
                                            onChange={(e) => handleInputChange(isProfileBackedByLore ? 'lore' : 'profile', e.target.value)}
                                            placeholder="Key personality traits and behaviors"
                                            style={{
                                                width: '100%',
                                                minHeight: '100px',
                                                borderRadius: '5px',
                                                resize: 'vertical',
                                            }}
                                        />
                                    </div>

                                    {actorStats.length > 0 && (
                                        <div style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '12px',
                                            backgroundColor: 'color-mix(in srgb, var(--agenda-surface-base) 55%, transparent)',
                                            border: '1px solid color-mix(in srgb, var(--agenda-highlight) 20%, transparent)',
                                            borderRadius: '8px',
                                            padding: '12px',
                                        }}>
                                            <label
                                                style={{
                                                    display: 'block',
                                                    color: 'var(--agenda-highlight)',
                                                    fontSize: '14px',
                                                    fontWeight: 'bold',
                                                    marginBottom: '2px',
                                                }}
                                            >
                                                Actor Stats
                                            </label>

                                            {actorStats.map((stat) => {
                                                const value = Number(editedStatMap[stat.name]);
                                                const displayValue = Number.isFinite(value)
                                                    ? value
                                                    : clampActorStatValue(Number(stat.default) || 0, stat);
                                                const statRange = resolveActorStatRange(stat);
                                                const letterGradeOptions = buildLetterGradeOptions(stat);
                                                const nearestGrade = letterGradeOptions.reduce((closest, option) => {
                                                    const optionDelta = Math.abs(option.value - displayValue);
                                                    const closestDelta = Math.abs(closest.value - displayValue);
                                                    return optionDelta < closestDelta ? option : closest;
                                                }, letterGradeOptions[0]);

                                                return (
                                                    <div
                                                        key={stat.name}
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
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline', height: '40px' }}>
                                                            <div style={{ color: 'var(--agenda-text-primary)', fontSize: '14px', fontWeight: 600 }}>
                                                                {stat.name}
                                                            </div>

                                                            {stat.displayType === 'stars' && (
                                                                <ActorStatStars
                                                                    stat={stat}
                                                                    value={displayValue}
                                                                    updateScore={(nextValue) => handleActorStatValueChange(stat, nextValue)}
                                                                />
                                                            )}

                                                            {stat.displayType === 'letter grade' && (
                                                                <div>
                                                                    <select
                                                                        value={nearestGrade.label}
                                                                        onChange={(e) => {
                                                                            const selectedOption = letterGradeOptions.find((option) => option.label === e.target.value);
                                                                            if (!selectedOption) {
                                                                                return;
                                                                            }
                                                                            handleActorStatValueChange(stat, selectedOption.value);
                                                                        }}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '10px',
                                                                            fontSize: '14px',
                                                                            backgroundColor: 'var(--agenda-glass-bright)',
                                                                            border: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                                                                            borderRadius: '5px',
                                                                            color: 'var(--agenda-text-primary)',
                                                                            fontFamily: 'inherit',
                                                                            cursor: 'pointer',
                                                                        }}
                                                                    >
                                                                        {letterGradeOptions.map((option) => (
                                                                            <option key={`${stat.name}-grade-${option.label}`} value={option.label}>
                                                                                {option.label}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            )}

                                                            {stat.displayType === 'percentage' || (stat.displayType === 'number' && statRange.hasRange) && (
                                                                <input
                                                                    type="range"
                                                                    min={statRange.min}
                                                                    max={statRange.max}
                                                                    step={statRange.step}
                                                                    value={Math.min(statRange.max, Math.max(statRange.min, displayValue))}
                                                                    onChange={(e) => handleActorStatValueChange(stat, Number(e.target.value))}
                                                                    style={{ width: '100%' }}
                                                                />
                                                            )}
                                                        </div>

                                                        {!!stat.description?.trim() && (
                                                            <div style={{ color: 'color-mix(in srgb, var(--agenda-text-primary) 75%, transparent)', fontSize: '12px' }}>
                                                                {stat.description}
                                                            </div>
                                                        )}

                                                        
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Theme & Voice Section */}
                            <section>
                                <h2 style={{ 
                                    color: 'var(--agenda-highlight)', 
                                    fontSize: '18px', 
                                    fontWeight: 'bold',
                                    marginBottom: '15px',
                                    borderBottom: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                                    paddingBottom: '5px'
                                }}>
                                    Theme & Voice
                                </h2>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    {/* Voice ID */}
                                    <div>
                                        <label 
                                            style={{
                                                display: 'block',
                                                color: 'var(--agenda-highlight)',
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                                marginBottom: '8px',
                                            }}
                                        >
                                            Voice ID
                                        </label>
                                        <select
                                            value={editedActor.voiceId}
                                            onChange={(e) => handleInputChange('voiceId', e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '12px',
                                                fontSize: '14px',
                                                backgroundColor: 'var(--agenda-glass-bright)',
                                                border: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                                                borderRadius: '5px',
                                                color: 'var(--agenda-text-primary)',
                                                fontFamily: 'inherit',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {Object.entries(VOICE_MAP).map(([id, description]) => (
                                                <option key={id} value={id}>
                                                    {description}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Theme Color */}
                                    <div>
                                        <label 
                                            style={{
                                                display: 'block',
                                                color: 'var(--agenda-highlight)',
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                                marginBottom: '8px',
                                            }}
                                        >
                                            Theme Color
                                        </label>
                                        <ColorPickerInput
                                            value={editedActor.themeColor}
                                            onChange={(value) => handleInputChange('themeColor', value)}
                                            placeholder="#RRGGBB"
                                            popoverTitle="Choose theme color"
                                            swatches={actorThemeColorSwatches}
                                            inputStyle={{ flex: 1 }}
                                        />
                                    </div>

                                    {/* Font Family */}
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label 
                                            style={{
                                                display: 'block',
                                                color: 'var(--agenda-highlight)',
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                                marginBottom: '8px',
                                            }}
                                        >
                                            Font Family
                                        </label>
                                        <TextInput
                                            fullWidth
                                            value={editedActor.themeFontFamily}
                                            onChange={(e) => handleInputChange('themeFontFamily', e.target.value)}
                                            placeholder="Font stack (e.g., Arial, sans-serif)"
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* Outfit Section */}
                            <section>
                                <h2 style={{
                                    color: 'var(--agenda-highlight)',
                                    fontSize: '18px',
                                    fontWeight: 'bold',
                                    marginBottom: '15px',
                                    borderBottom: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                                    paddingBottom: '5px'
                                }}>
                                    Outfit
                                </h2>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: '15px' }}>
                                        <div>
                                            <label
                                                style={{
                                                    display: 'block',
                                                    color: 'var(--agenda-highlight)',
                                                    fontSize: '14px',
                                                    fontWeight: 'bold',
                                                    marginBottom: '8px',
                                                }}
                                            >
                                                Selected Outfit
                                            </label>
                                            <select
                                                value={selectedOutfit?.id || ''}
                                                onChange={(e) => handleSelectOutfit(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '12px',
                                                    fontSize: '14px',
                                                    backgroundColor: 'var(--agenda-glass-bright)',
                                                    border: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                                                    borderRadius: '5px',
                                                    color: 'var(--agenda-text-primary)',
                                                    fontFamily: 'inherit',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                {editedOutfits.map((outfit) => (
                                                    <option key={outfit.id} value={outfit.id}>
                                                        {outfit.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label
                                                style={{
                                                    display: 'block',
                                                    color: 'var(--agenda-highlight)',
                                                    fontSize: '14px',
                                                    fontWeight: 'bold',
                                                    marginBottom: '8px',
                                                }}
                                            >
                                                Outfit Name
                                            </label>
                                            <TextInput
                                                fullWidth
                                                value={selectedOutfit?.name || ''}
                                                onChange={(e) => handleOutfitChange('name', e.target.value)}
                                                placeholder="Outfit name"
                                            />
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <Button onClick={handleCreateOutfit}>
                                            New Outfit
                                        </Button>
                                        <Button
                                            onClick={handleDeleteOutfit}
                                            variant="secondary"
                                            disabled={editedOutfits.length <= 1 || selectedOutfit?.id === actor.outfitId}
                                        >
                                            Delete Outfit
                                        </Button>
                                    </div>

                                    <div>
                                        <label
                                            style={{
                                                display: 'block',
                                                color: 'var(--agenda-highlight)',
                                                fontSize: '14px',
                                                fontWeight: 'bold',
                                                marginBottom: '8px',
                                            }}
                                        >
                                            Outfit Description
                                        </label>
                                        <TextArea
                                            value={selectedOutfit?.description || ''}
                                            onChange={(e) => handleOutfitChange('description', e.target.value)}
                                            placeholder="Physical appearance, attire, and distinguishing features for this outfit"
                                            style={{
                                                width: '100%',
                                                minHeight: '100px',
                                                padding: '12px',
                                                fontSize: '14px',
                                                backgroundColor: 'var(--agenda-glass-bright)',
                                                border: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                                                borderRadius: '5px',
                                                color: 'var(--agenda-text-primary)',
                                                fontFamily: 'inherit',
                                                resize: 'vertical',
                                            }}
                                        />
                                    </div>

                                    {stage().getSave().betaMode && (
                                        <div>
                                            <label
                                                style={{
                                                    display: 'block',
                                                    color: 'var(--agenda-highlight)',
                                                    fontSize: '14px',
                                                    fontWeight: 'bold',
                                                    marginBottom: '8px',
                                                }}
                                            >
                                                Outfit Object (for testing and export)
                                            </label>
                                            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                                <Button onClick={handleGenerateOutfitsExport} variant="secondary">
                                                    Generate Object
                                                </Button>
                                            </div>
                                            <TextArea
                                                value={outfitsObjectExport}
                                                readOnly
                                                placeholder="Generate object output to export this actor's outfits"
                                                style={{
                                                    width: '100%',
                                                    minHeight: '160px',
                                                    padding: '12px',
                                                    fontSize: '13px',
                                                    backgroundColor: 'var(--agenda-glass-bright)',
                                                    border: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                                                    borderRadius: '5px',
                                                    color: 'var(--agenda-text-primary)',
                                                    fontFamily: 'monospace',
                                                    resize: 'vertical',
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Emotion Images Section */}
                            <section>
                                <h2 style={{ 
                                    color: 'var(--agenda-highlight)', 
                                    fontSize: '18px', 
                                    fontWeight: 'bold',
                                    marginBottom: '15px',
                                    borderBottom: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                                    paddingBottom: '5px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <ImageIcon />
                                    Emotion Images ({selectedOutfit?.name || 'Outfit'})
                                </h2>

                                <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
                                    <Button
                                        onClick={handleFillMissingEmotionImages}
                                        disabled={!selectedOutfit || isFillingMissingEmotions || missingEmotionCount === 0}
                                    >
                                        {isFillingMissingEmotions
                                            ? 'Filling Missing Emotions...'
                                            : `Fill Missing Emotions (${missingEmotionCount})`}
                                    </Button>
                                </div>
                                
                                <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
                                    gap: '15px' 
                                }}>
                                    {/* original sample */}
                                    <motion.div
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => handleOpenImageDialog('base')}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '8px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: '120px',
                                                height: '120px',
                                                backgroundColor: getSelectedOutfitImageUrl('base') ? 'transparent' : 'var(--agenda-glass-bright)',
                                                border: `2px solid ${getSelectedOutfitImageUrl('base') ? 'color-mix(in srgb, var(--agenda-accent-primary) 56%, transparent)' : 'color-mix(in srgb, var(--agenda-highlight) 20%, transparent)'}`,
                                                borderRadius: '8px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                overflow: 'hidden',
                                                position: 'relative',
                                            }}
                                        >
                                            {getSelectedOutfitImageUrl('base') && (
                                                <img
                                                    src={getSelectedOutfitImageUrl('base')}
                                                    alt={`${selectedOutfit?.name || 'Outfit'} base`}
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        objectFit: 'cover',
                                                        objectPosition: 'center top',
                                                        display: 'block',
                                                    }}
                                                />
                                            )}
                                            {!getSelectedOutfitImageUrl('base') && (
                                                <div style={{
                                                    color: 'color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                                                    fontSize: '12px',
                                                    textAlign: 'center',
                                                    padding: '10px'
                                                }}>
                                                    Not Generated
                                                </div>
                                            )}
                                            {regeneratingImages.has('base') && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0,
                                                    right: 0,
                                                    bottom: 0,
                                                    backgroundColor: 'color-mix(in srgb, var(--agenda-surface-base) 72%, #000)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: 'var(--agenda-highlight)',
                                                    fontSize: '12px',
                                                }}>
                                                    Generating...
                                                </div>
                                            )}
                                        </div>
                                        <Chip style={{
                                            fontSize: '11px',
                                            textTransform: 'capitalize',
                                            backgroundColor: 'color-mix(in srgb, var(--agenda-accent-primary) 24%, transparent)',
                                        }}>
                                            Base
                                        </Chip>
                                    </motion.div>

                                    {/* Emotion Images */}
                                    {allEmotions.map(emotion => {
                                        const imageUrl = getSelectedOutfitImageUrl(emotion);
                                        const hasImage = !!imageUrl;
                                        const isRegenerating = regeneratingImages.has(emotion);
                                        
                                        return (
                                            <motion.div
                                                key={emotion}
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => handleOpenImageDialog(emotion)}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: '120px',
                                                        height: '120px',
                                                        backgroundColor: hasImage ? 'transparent' : 'var(--agenda-glass-bright)',
                                                        border: `2px solid ${hasImage ? 'color-mix(in srgb, var(--agenda-highlight) 50%, transparent)' : 'color-mix(in srgb, var(--agenda-highlight) 20%, transparent)'}`,
                                                        borderRadius: '8px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        overflow: 'hidden',
                                                        position: 'relative',
                                                    }}
                                                >
                                                    {hasImage && (
                                                        <img
                                                            src={imageUrl}
                                                            alt={`${selectedOutfit?.name || 'Outfit'} ${emotion}`}
                                                            style={{
                                                                width: '100%',
                                                                height: '100%',
                                                                objectFit: 'cover',
                                                                objectPosition: 'center top',
                                                                display: 'block',
                                                            }}
                                                        />
                                                    )}
                                                    {!hasImage && (
                                                        <div style={{
                                                            color: 'color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                                                            fontSize: '12px',
                                                            textAlign: 'center',
                                                            padding: '10px'
                                                        }}>
                                                            Not Generated
                                                        </div>
                                                    )}
                                                    {isRegenerating && (
                                                        <div style={{
                                                            position: 'absolute',
                                                            top: 0,
                                                            left: 0,
                                                            right: 0,
                                                            bottom: 0,
                                                            backgroundColor: 'color-mix(in srgb, var(--agenda-surface-base) 72%, #000)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            color: 'var(--agenda-highlight)',
                                                            fontSize: '12px',
                                                        }}>
                                                            Generating...
                                                        </div>
                                                    )}
                                                </div>
                                                <Chip style={{
                                                    fontSize: '11px',
                                                    textTransform: 'capitalize',
                                                    backgroundColor: hasImage ? 'color-mix(in srgb, var(--agenda-highlight) 20%, transparent)' : 'var(--agenda-glass-bright)',
                                                }}>
                                                    {emotion}
                                                </Chip>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </section>

                            {/* Read-only Info Section */}
                            <section>
                                <h2 style={{ 
                                    color: 'var(--agenda-highlight)', 
                                    fontSize: '18px', 
                                    fontWeight: 'bold',
                                    marginBottom: '15px',
                                    borderBottom: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                                    paddingBottom: '5px'
                                }}>
                                    Additional Information
                                </h2>
                                
                                <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                                    gap: '15px',
                                    backgroundColor: 'color-mix(in srgb, var(--agenda-surface-base) 60%, transparent)',
                                    padding: '15px',
                                    borderRadius: '5px',
                                    border: '1px solid color-mix(in srgb, var(--agenda-highlight) 20%, transparent)',
                                }}>
                                    <div>
                                        <div style={{ color: 'color-mix(in srgb, var(--agenda-highlight) 70%, transparent)', fontSize: '12px', marginBottom: '4px' }}>
                                            Actor ID
                                        </div>
                                        <div style={{ color: 'var(--agenda-text-primary)', fontSize: '14px', fontFamily: 'monospace' }}>
                                            {actor.id}
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <Button
                                    onClick={() => {
                                        setConfirmDialog({
                                            open: true,
                                            title: `Delete Actor: ${editedActor.name || actor.name}`,
                                            message: 'This will mark this actor as inactive (soft delete), hide it from management lists, and delete its linked lorebook entry. Existing references remain intact in past content. Continue?',
                                            actions: [
                                                {
                                                    label: 'Delete Actor',
                                                    onClick: () => {
                                                        setConfirmDialog((prev) => ({ ...prev, open: false }));
                                                        handleDeactivateActor();
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
                                        if (isGeneratingActorDetails) {
                                            return;
                                        }

                                        setConfirmDialog({
                                            open: true,
                                            title: 'Generate Actor Details',
                                            message: 'Warning: this will replace existing details for this actor.',
                                            actions: [
                                                {
                                                    label: isGeneratingActorDetails ? 'Generating...' : 'Generate',
                                                    onClick: async () => {
                                                        setConfirmDialog((prev) => ({ ...prev, open: false }));
                                                        await handleGenerateActorDetails();
                                                    },
                                                    variant: 'primary',
                                                },
                                            ],
                                        });
                                    }}
                                    disabled={isGeneratingActorDetails}
                                >
                                    {isGeneratingActorDetails ? 'Generating...' : 'Generate'}
                                </Button>
                            </div>
                        </div>
                    </GlassPanel>
                </div>
            </motion.div>

            {/* Confirmation Dialog */}
            <Dialog
                open={imageDialog.open}
                onClose={handleCloseImageDialog}
                slotProps={{
                    paper: {
                        style: {
                            backgroundColor: 'color-mix(in srgb, var(--agenda-surface-raised) 94%, var(--agenda-surface-base))',
                            backdropFilter: 'blur(10px)',
                            border: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                            borderRadius: '8px',
                            color: 'var(--agenda-text-primary)',
                            minWidth: '700px',
                            maxWidth: '900px',
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
                    textTransform: 'capitalize',
                }}>
                    Manage {imageTargetLabel} Image - {imageTargetOutfitName}
                </DialogTitle>
                <DialogContent style={{ paddingTop: '20px' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '20px',
                        alignItems: 'stretch'
                    }}>
                        <div style={{ display: 'flex' }}>
                            <input
                                ref={imageUploadInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    const target = imageDialog.target;
                                    const file = e.target.files?.[0];
                                    if (!target || !file) return;
                                    handleImageFile(file, target);
                                }}
                            />
                            <div
                                onClick={() => imageUploadInputRef.current?.click()}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setIsImageDropActive(true);
                                }}
                                onDragEnter={(e) => {
                                    e.preventDefault();
                                    setIsImageDropActive(true);
                                }}
                                onDragLeave={(e) => {
                                    e.preventDefault();
                                    setIsImageDropActive(false);
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setIsImageDropActive(false);
                                    const target = imageDialog.target;
                                    const file = e.dataTransfer.files?.[0];
                                    if (!target || !file) return;
                                    handleImageFile(file, target);
                                }}
                                style={{
                                    width: '100%',
                                    minHeight: '360px',
                                    height: '100%',
                                    backgroundColor: currentImageUrl ? 'transparent' : 'var(--agenda-glass-bright)',
                                    border: `2px dashed ${isImageDropActive ? 'color-mix(in srgb, var(--agenda-highlight) 80%, transparent)' : 'color-mix(in srgb, var(--agenda-highlight) 35%, transparent)'}`,
                                    borderRadius: '8px',
                                    backgroundImage: currentImageUrl ? `url(${currentImageUrl})` : 'none',
                                    backgroundSize: 'contain',
                                    backgroundPosition: 'center',
                                    backgroundRepeat: 'no-repeat',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    overflow: 'hidden',
                                }}
                            >
                                {isDialogEmotionTarget && allEmotions.length > 1 && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                cycleDialogEmotion(-1);
                                            }}
                                            style={{
                                                position: 'absolute',
                                                left: '10px',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                width: '38px',
                                                height: '38px',
                                                borderRadius: '999px',
                                                border: '1px solid color-mix(in srgb, var(--agenda-highlight) 45%, transparent)',
                                                backgroundColor: 'color-mix(in srgb, var(--agenda-surface-base) 78%, #000)',
                                                color: 'var(--agenda-highlight)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                zIndex: 3,
                                            }}
                                            aria-label="Previous emotion image"
                                        >
                                            <ArrowBackIosNew style={{ fontSize: '16px' }} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                cycleDialogEmotion(1);
                                            }}
                                            style={{
                                                position: 'absolute',
                                                right: '10px',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                width: '38px',
                                                height: '38px',
                                                borderRadius: '999px',
                                                border: '1px solid color-mix(in srgb, var(--agenda-highlight) 45%, transparent)',
                                                backgroundColor: 'color-mix(in srgb, var(--agenda-surface-base) 78%, #000)',
                                                color: 'var(--agenda-highlight)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                zIndex: 3,
                                            }}
                                            aria-label="Next emotion image"
                                        >
                                            <ArrowForwardIos style={{ fontSize: '16px' }} />
                                        </button>
                                    </>
                                )}

                                {isDialogEmotionTarget && dialogEmotionIndex >= 0 && (
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '10px',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        padding: '4px 10px',
                                        borderRadius: '999px',
                                        border: '1px solid color-mix(in srgb, var(--agenda-highlight) 35%, transparent)',
                                        backgroundColor: 'color-mix(in srgb, var(--agenda-surface-base) 78%, #000)',
                                        color: 'var(--agenda-highlight)',
                                        fontSize: '12px',
                                        letterSpacing: '0.4px',
                                        zIndex: 3,
                                    }}>
                                        {dialogEmotionIndex + 1} / {allEmotions.length}
                                    </div>
                                )}

                                {!currentImageUrl && (
                                    <div style={{
                                        color: 'color-mix(in srgb, var(--agenda-highlight) 50%, transparent)',
                                        fontSize: '14px',
                                        textAlign: 'center',
                                        padding: '16px',
                                        lineHeight: 1.5,
                                    }}>
                                        Click to upload image
                                        <br />
                                        or drag and drop here
                                    </div>
                                )}

                                {isImageDropActive && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        backgroundColor: 'color-mix(in srgb, var(--agenda-highlight) 20%, transparent)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--agenda-highlight)',
                                        fontSize: '16px',
                                        fontWeight: 'bold',
                                    }}>
                                        Drop to Replace
                                    </div>
                                )}

                                {isUploadingImage && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        backgroundColor: 'color-mix(in srgb, var(--agenda-surface-base) 72%, #000)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--agenda-highlight)',
                                        fontSize: '14px',
                                        fontWeight: 'bold',
                                    }}>
                                        Uploading...
                                    </div>
                                )}

                                {isCurrentImageRegenerating && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        backgroundColor: 'color-mix(in srgb, var(--agenda-surface-base) 72%, #000)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--agenda-highlight)',
                                        fontSize: '14px',
                                        fontWeight: 'bold',
                                    }}>
                                        Generating...
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '360px' }}>
                            <div style={{
                                color: 'var(--agenda-text-primary)',
                                fontSize: '14px',
                                lineHeight: 1.6,
                            }}>
                                Click the image area to select a file, or drag and drop an image to replace the current {String(imageTargetLabel).toLowerCase()} image for {imageTargetOutfitName}.
                            </div>
                            {imageDialog.target === 'base' && (
                                <div>
                                    <label
                                        style={{
                                            display: 'block',
                                            color: 'var(--agenda-highlight)',
                                            fontSize: '13px',
                                            fontWeight: 'bold',
                                            marginBottom: '8px',
                                        }}
                                    >
                                        Regenerate Source
                                    </label>
                                    <select
                                        value={baseRegenSource}
                                        onChange={(e) => setBaseRegenSource(e.target.value as BaseRegenSource)}
                                        style={{
                                            width: '100%',
                                            boxSizing: 'border-box',
                                            padding: '12px',
                                            fontSize: '14px',
                                            backgroundColor: 'var(--agenda-glass-bright)',
                                            border: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                                            borderRadius: '5px',
                                            color: 'var(--agenda-text-primary)',
                                            fontFamily: 'inherit',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {baseRegenOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {imageDialog.target && imageDialog.target !== 'base' && (
                                <div>
                                    <label
                                        style={{
                                            display: 'block',
                                            color: 'var(--agenda-highlight)',
                                            fontSize: '13px',
                                            fontWeight: 'bold',
                                            marginBottom: '8px',
                                        }}
                                    >
                                        Emotion Prompt
                                    </label>
                                    <TextArea
                                        value={emotionPromptDraft}
                                        onChange={(e) => handleEmotionPromptDraftChange(e.target.value)}
                                        placeholder="Describe the character's expression, gesture, or pose for this emotion; leave blank to have a prompt generated for you."
                                        style={{
                                            width: '100%',
                                            boxSizing: 'border-box',
                                            minHeight: '120px',
                                            padding: '12px',
                                            fontSize: '13px',
                                            backgroundColor: 'var(--agenda-glass-bright)',
                                            border: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                                            borderRadius: '5px',
                                            color: 'var(--agenda-text-primary)',
                                            fontFamily: 'inherit',
                                            resize: 'vertical',
                                            lineHeight: 1.5,
                                        }}
                                    />
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', alignSelf: 'flex-start' }}>
                                <Button
                                    onClick={async () => {
                                        const target = imageDialog.target;
                                        if (!target) return;
                                        if (target === 'base') {
                                            handleRegenerateBase(baseRegenSource);
                                        } else {
                                            handleRegenerateEmotion(target, emotionPromptDraft);
                                        }
                                    }}
                                    disabled={!imageDialog.target || isCurrentImageRegenerating}
                                >
                                    {isCurrentImageRegenerating ? 'Generating...' : 'Regenerate Image'}
                                </Button>
                                {imageDialog.target && imageDialog.target !== 'base' && (
                                    <Button
                                        onClick={() => handleDeleteEmotionImage(imageDialog.target as Emotion)}
                                        disabled={!currentImageUrl || isCurrentImageRegenerating || isUploadingImage}
                                        variant="secondary"
                                    >
                                        Delete Image
                                    </Button>
                                )}
                            </div>
                            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
                                <Button onClick={handleCloseImageDialog} variant="secondary">
                                    Close
                                </Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={confirmDialog.open}
                onClose={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
                slotProps={{
                    paper: {
                        style: {
                            backgroundColor: 'color-mix(in srgb, var(--agenda-surface-raised) 94%, var(--agenda-surface-base))',
                            backdropFilter: 'blur(10px)',
                            border: '2px solid color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
                            borderRadius: '8px',
                            color: 'var(--agenda-text-primary)',
                            minWidth: '400px',
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
                        onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
                        variant="secondary"
                    >
                        Cancel
                    </Button>
                    {confirmDialog.actions ? (
                        confirmDialog.actions.map((action, index) => (
                            <Button
                                key={index}
                                onClick={action.onClick}
                                variant={action.variant || 'primary'}
                            >
                                {action.label}
                            </Button>
                        ))
                    ) : (
                        <Button
                            onClick={confirmDialog.onConfirm}
                            variant="primary"
                        >
                            Regenerate
                        </Button>
                    )}
                </DialogActions>
            </Dialog>
        </AnimatePresence>
    );
};
