import React, { FC, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Person } from '@mui/icons-material';
import { Stage } from '../Stage';
import { Actor, getEmotionImage } from '../content/Actor';
import { Button } from './UiComponents';
import { ActorDetailPanel } from './ActorDetailPanel';
import { CategorizedEntrySection, CategorizedEntrySidebar } from './CategorizedEntrySidebar';

interface ActorManagementPanelProps {
    stage: () => Stage;
}

export const ActorManagementPanel: FC<ActorManagementPanelProps> = ({ stage }) => {
    const UNCATEGORIZED_LABEL = 'Uncategorized';
    const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
    const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
    const shouldReduceMotion = useReducedMotion();

    const shellStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 360px) 1fr',
        gap: '20px',
        flex: 1,
        minHeight: 0,
    };

    const detailPaneStyle: React.CSSProperties = {
        background: 'color-mix(in srgb, var(--agenda-surface-base) 78%, transparent)',
        border: '1px solid var(--agenda-line-subtle)',
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
    };

    const sortByName = <T extends { name?: string }>(a: T, b: T) =>
        (a.name ?? '').trim().localeCompare((b.name ?? '').trim(), undefined, { sensitivity: 'base' });

    const actors = useMemo(() => {
        const save = stage().getSave();
        return Object.values(save.actors || {})
            .filter((actor) => actor.id !== save.playerId)
            .filter((actor) => actor.active !== false)
            .sort(sortByName);
    }, [stage]);

    const actorsByCategory = useMemo<CategorizedEntrySection<Actor>[]>(() => {
        const categoryMap: Record<string, Actor[]> = {};
        for (const actor of actors) {
            const normalizedCategory = (actor.category || '').trim();
            const category = normalizedCategory || UNCATEGORIZED_LABEL;
            if (!categoryMap[category]) {
                categoryMap[category] = [];
            }
            categoryMap[category].push(actor);
        }

        if (!categoryMap[UNCATEGORIZED_LABEL]) {
            categoryMap[UNCATEGORIZED_LABEL] = [];
        }

        return Object.entries(categoryMap)
            .map(([title, entries]) => ({
                id: title,
                title,
                entries: entries.sort(sortByName),
            }))
            .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
            }, [actors, UNCATEGORIZED_LABEL]);

    const selectedActor = useMemo(() => {
        if (!selectedActorId) {
            return null;
        }
        return actors.find((actor) => actor.id === selectedActorId) || null;
    }, [actors, selectedActorId]);

    const handleCreateActor = (category: string) => {
        const save = stage().getSave();
        const baseName = 'New Actor';
        const usedNames = new Set(Object.values(save.actors || {}).map((actor) => actor.name?.trim().toLowerCase()));

        let candidateName = baseName;
        let counter = 1;
        while (usedNames.has(candidateName.toLowerCase())) {
            candidateName = `New Actor ${counter}`;
            counter += 1;
        }

        const actor = new Actor({
            active: true,
            name: candidateName,
            description: '',
            profile: '',
            category: category === UNCATEGORIZED_LABEL ? '' : category,
            outfitId: '',
            outfits: [],
            themeColor: '',
            themeFontFamily: '',
            voiceId: '',
            statMap: {},
        });

        save.actors[actor.id] = actor;
        stage().saveGame();
        setSelectedActorId(actor.id);
    };

    const renderActorButton = (actor: Actor) => {
        const isSelected = actor.id === selectedActorId;
        const avatarUrl = getEmotionImage(actor, 'neutral') || getEmotionImage(actor, 'base');
        return (
            <motion.button
                whileHover={{ scale: 1.01 }}
                type="button"
                onClick={() => setSelectedActorId(actor.id)}
                style={{
                    width: '100%',
                    textAlign: 'left',
                    background: isSelected
                        ? 'color-mix(in srgb, var(--agenda-highlight) 20%, transparent)'
                        : 'color-mix(in srgb, var(--agenda-surface-base) 76%, transparent)',
                    border: `1px solid ${isSelected ? 'var(--agenda-line-strong)' : 'var(--agenda-line-subtle)'}`,
                    borderRadius: '8px',
                    padding: '10px',
                    color: 'var(--agenda-text-primary)',
                    cursor: 'pointer',
                    display: 'grid',
                    gridTemplateColumns: '52px 1fr',
                    gap: '10px',
                    alignItems: 'center',
                }}
            >
                <div
                    style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '50%',
                        backgroundColor: 'color-mix(in srgb, var(--agenda-surface-base) 86%, transparent)',
                        border: `2px solid ${actor.themeColor || 'var(--agenda-line-strong)'}`,
                        backgroundImage: avatarUrl ? `url(${avatarUrl})` : 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: 'top center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {!avatarUrl && <Person style={{ fontSize: '24px', color: 'var(--agenda-accent-primary)' }} />}
                </div>
                <div>
                    <div style={{ color: actor.themeColor || 'var(--agenda-highlight)', fontSize: '15px', fontWeight: 700 }}>
                        {actor.name || '(Unnamed Actor)'}
                    </div>
                </div>
            </motion.button>
        );
    };

    return (
        <div style={shellStyle}>
            <CategorizedEntrySidebar
                sections={actorsByCategory}
                collapsedSections={collapsedCategories}
                onToggleSection={(sectionId) => {
                    setCollapsedCategories((current) => ({
                        ...current,
                        [sectionId]: !(current[sectionId] ?? false),
                    }));
                }}
                renderEntry={(actor) => renderActorButton(actor)}
                getEntryKey={(actor) => actor.id}
                shouldReduceMotion={Boolean(shouldReduceMotion)}
                emptyListMessage="No actors found in the current save."
                sectionEmptyMessage="No actors."
                renderSectionAction={(section) => {
                    handleCreateActor(section.title);
                }}
            />

            <div style={detailPaneStyle}>
                {!selectedActor ? (
                    <div
                        style={{
                            color: 'var(--agenda-text-muted)',
                            fontSize: '15px',
                            textAlign: 'center',
                            padding: '30px',
                        }}
                    >
                        Select an actor to view and edit details.
                    </div>
                ) : (
                    <ActorDetailPanel
                        key={selectedActor.id}
                        actor={selectedActor}
                        stage={stage}
                        onDeactivate={(actorId) => {
                            if (selectedActorId === actorId) {
                                setSelectedActorId(null);
                            }
                        }}
                    />
                )}
            </div>
        </div>
    );
};
