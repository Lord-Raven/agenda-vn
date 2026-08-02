import React, { FC, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Person } from '@mui/icons-material';
import { Stage } from '../Stage';
import { Actor, getEmotionImage } from '../content/Actor';
import { Button } from './UiComponents';
import { ActorDetailPanel } from './ActorDetailPanel';

interface ActorManagementPanelProps {
    stage: () => Stage;
}

export const ActorManagementPanel: FC<ActorManagementPanelProps> = ({ stage }) => {
    const [selectedActorId, setSelectedActorId] = useState<string | null>(null);

    const sortByName = <T extends { name?: string }>(a: T, b: T) =>
        (a.name ?? '').trim().localeCompare((b.name ?? '').trim(), undefined, { sensitivity: 'base' });

    const actors = useMemo(() => {
        const save = stage().getSave();
        return Object.values(save.actors || {})
            .filter((actor) => actor.id !== save.playerId)
            .sort(sortByName);
    }, [stage]);

    const selectedActor = useMemo(() => {
        if (!selectedActorId) {
            return null;
        }
        return actors.find((actor) => actor.id === selectedActorId) || null;
    }, [actors, selectedActorId]);

    const handleCreateActor = () => {
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
            name: candidateName,
            description: '',
            profile: '',
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

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(280px, 360px) 1fr',
                gap: '20px',
                flex: 1,
                minHeight: 0,
            }}
        >
            <div
                style={{
                    background: 'rgba(0, 20, 40, 0.45)',
                    border: '1px solid rgba(0, 255, 136, 0.25)',
                    borderRadius: '12px',
                    padding: '14px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <div style={{ color: 'rgba(0, 255, 136, 0.9)', fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        Actors ({actors.length})
                    </div>
                    <Button
                        onClick={handleCreateActor}
                        variant="secondary"
                        style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '8px' }}
                    >
                        New
                    </Button>
                </div>

                {actors.length === 0 ? (
                    <div style={{ color: 'rgba(224, 240, 255, 0.6)', fontSize: '13px', padding: '8px 0' }}>
                        No actors found in the current save.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '10px' }}>
                        {actors.map((actor) => {
                            const isSelected = actor.id === selectedActorId;
                            const avatarUrl = getEmotionImage(actor, 'neutral') || getEmotionImage(actor, 'base');
                            return (
                                <motion.button
                                    key={actor.id}
                                    whileHover={{ scale: 1.01 }}
                                    type="button"
                                    onClick={() => setSelectedActorId(actor.id)}
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        background: isSelected ? 'rgba(0, 255, 136, 0.2)' : 'rgba(0, 30, 60, 0.5)',
                                        border: `1px solid ${isSelected ? 'rgba(0, 255, 136, 0.6)' : 'rgba(0, 255, 136, 0.22)'}`,
                                        borderRadius: '8px',
                                        padding: '10px',
                                        color: '#e0f0ff',
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
                                            backgroundColor: 'rgba(0, 20, 40, 0.8)',
                                            border: `2px solid ${actor.themeColor || 'rgba(0, 255, 136, 0.45)'}`,
                                            backgroundImage: avatarUrl ? `url(${avatarUrl})` : 'none',
                                            backgroundSize: 'cover',
                                            backgroundPosition: 'top center',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        {!avatarUrl && <Person style={{ fontSize: '24px', color: 'rgba(0, 255, 136, 0.35)' }} />}
                                    </div>
                                    <div>
                                        <div style={{ color: actor.themeColor || '#00ff88', fontSize: '15px', fontWeight: 700 }}>
                                            {actor.name || '(Unnamed Actor)'}
                                        </div>
                                    </div>
                                </motion.button>
                            );
                        })}
                    </div>
                )}
            </div>

            <div
                style={{
                    background: 'rgba(0, 20, 40, 0.45)',
                    border: '1px solid rgba(0, 255, 136, 0.25)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                }}
            >
                {!selectedActor ? (
                    <div
                        style={{
                            color: 'rgba(224, 240, 255, 0.7)',
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
                        onClose={() => setSelectedActorId(null)}
                        embedded
                    />
                )}
            </div>
        </div>
    );
};
