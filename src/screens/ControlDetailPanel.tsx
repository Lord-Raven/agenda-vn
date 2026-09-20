import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { Add, Delete } from '@mui/icons-material';
import { v4 as generateUuid } from 'uuid';
import { Stage } from '../Stage';
import { Control, ControlPlacement, ControlType } from '../content/Control';
import { ConditionCollection } from '../content/Condition';
import { isFunctionStatType, isNumericDisplayType, Stat, StatUpdate, StatValue } from '../content/Stat';
import { Button, GlassPanel, TextInput, Title } from '../components/UiComponents';
import { ConditionEditor, buildActorTargetOptions } from '../components/ConditionEditor';
import { SearchableOptionPicker } from '../components/SearchableOptionPicker';
import { StatValueInput } from '../components/StatValueInput';
import { resolveIcon } from '../components/StatRating';

interface ControlDetailPanelProps {
    control: Control;
    stage: () => Stage;
    onUpdate?: () => void;
    onDeactivate?: (controlId: string) => void;
}

type ControlDraft = {
    name: string;
    placement: ControlPlacement;
    type: ControlType;
    label: string;
    iconName: string;
    statId: string;
    availabilityConditions: ConditionCollection[];
    actions: StatUpdate[];
};

const createDraft = (control: Control): ControlDraft => ({
    name: control.name,
    placement: control.placement,
    type: control.type,
    label: control.label,
    iconName: control.iconName,
    statId: control.statId,
    availabilityConditions: (control.availabilityConditions || []).map((collection) => [...collection]),
    actions: (control.actions || []).map((update) => ({ ...update })),
});

const selectStyle: React.CSSProperties = {
    minHeight: 38,
    width: '100%',
    maxWidth: '100%',
    background: 'var(--agenda-surface-base)',
    color: 'var(--agenda-text-primary)',
    border: '1px solid var(--agenda-line-subtle)',
    borderRadius: 6,
    padding: '0 8px',
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

const iconButtonStyle: React.CSSProperties = {
    display: 'grid',
    placeItems: 'center',
    minWidth: 30,
    minHeight: 30,
    padding: 0,
};

export const ControlDetailPanel: FC<ControlDetailPanelProps> = ({ control, stage, onUpdate, onDeactivate }) => {
    const stageInstance = stage();
    const globalStats = useMemo(() => stageInstance.getConfiguration().globalStats || [], [stageInstance]);
    const actorStats = useMemo(() => stageInstance.getConfiguration().actorStats || [], [stageInstance]);
    const updatableGlobalStats = useMemo(() => globalStats.filter((stat) => !isFunctionStatType(stat.type)), [globalStats]);
    const updatableActorStats = useMemo(() => actorStats.filter((stat) => !isFunctionStatType(stat.type) && !stat.perActor), [actorStats]);
    const actors = useMemo(() => stageInstance.getConfiguration().actors || [], [stageInstance]);
    const items = useMemo(() => stageInstance.getConfiguration().items || [], [stageInstance]);
    const locations = useMemo(() => stageInstance.getConfiguration().locations || [], [stageInstance]);
    const actorTargetOptions = useMemo(() => buildActorTargetOptions(actors, false).filter((option) => option.key !== 'none'), [actors]);

    const [draft, setDraft] = useState<ControlDraft>(() => createDraft(control));
    const draftRef = useRef(draft);
    const autoSaveTimeoutRef = useRef<number | null>(null);
    const didMountRef = useRef(false);

    const persistDraft = (nextDraft: ControlDraft) => {
        const configuredControls = stageInstance.getConfiguration().controls || [];
        const persistedControl = new Control({
            ...control,
            name: nextDraft.name,
            placement: nextDraft.placement,
            type: nextDraft.type,
            label: nextDraft.label,
            iconName: nextDraft.iconName,
            statId: nextDraft.statId,
            availabilityConditions: nextDraft.availabilityConditions.map((collection) => [...collection]),
            actions: nextDraft.actions.map((update) => ({ ...update })),
        });
        stageInstance.updateConfiguration({
            controls: configuredControls.map((candidate) => candidate.id === control.id ? persistedControl : candidate),
        });
        onUpdate?.();
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft]);

    useEffect(() => {
        setDraft(createDraft(control));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [control]);

    useEffect(() => () => {
        if (autoSaveTimeoutRef.current) {
            persistDraft(draftRef.current);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleDeactivate = () => {
        const configuredControls = stageInstance.getConfiguration().controls || [];
        const persistedControl = new Control({ ...control, active: false });
        stageInstance.updateConfiguration({
            controls: configuredControls.map((candidate) => candidate.id === control.id ? persistedControl : candidate),
        });
        onDeactivate?.(control.id);
    };

    const statsForUpdate = (update: StatUpdate): Stat[] => update.targetType === 'player' ? updatableGlobalStats : updatableActorStats;
    const resolveUpdateStat = (update: StatUpdate): Stat | undefined => statsForUpdate(update).find((stat) => stat.id === update.statId);

    const addAction = () => {
        const newUpdate: StatUpdate = {
            id: generateUuid(),
            targetType: 'player',
            actorId: 'any',
            statId: updatableGlobalStats[0]?.id || '',
            operation: 'adjust',
            value: 0,
        };
        setDraft((current) => ({ ...current, actions: [...current.actions, newUpdate] }));
    };

    const updateAction = (updateId: string, patch: Partial<StatUpdate>) => {
        setDraft((current) => ({
            ...current,
            actions: current.actions.map((update) => update.id === updateId ? { ...update, ...patch } : update),
        }));
    };

    const removeAction = (updateId: string) => {
        setDraft((current) => ({ ...current, actions: current.actions.filter((update) => update.id !== updateId) }));
    };

    const PreviewIcon = draft.iconName.trim() ? resolveIcon(draft.iconName.trim()) : null;

    return (
        <GlassPanel variant="default" style={{ overflow: 'visible', position: 'relative', padding: '20px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
                <Title variant="glow" style={{ fontSize: '24px', margin: 0 }}>
                    Control: {draft.name || '(Unnamed Control)'}
                </Title>
                <Button variant="danger" onClick={handleDeactivate}>Deactivate</Button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', flex: 1 }}>
                <section>
                    <h2 style={sectionHeadingStyle}>Basic Information</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div>
                            <label style={labelStyle}>Name</label>
                            <TextInput
                                fullWidth
                                value={draft.name}
                                onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
                                placeholder="Internal/admin label"
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div>
                                <label style={labelStyle}>Placement</label>
                                <select
                                    style={selectStyle}
                                    value={draft.placement}
                                    onChange={(e) => setDraft((current) => ({ ...current, placement: e.target.value as ControlPlacement }))}
                                >
                                    <option value="top">Top (with date/stats)</option>
                                    <option value="bottom">Bottom (control dock)</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Type</label>
                                <select
                                    style={selectStyle}
                                    value={draft.type}
                                    onChange={(e) => setDraft((current) => ({ ...current, type: e.target.value as ControlType }))}
                                >
                                    <option value="button">Button</option>
                                    <option value="statDisplay">Stat Display</option>
                                    <option value="statEditor">Stat Editor</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </section>

                <section>
                    <h2 style={sectionHeadingStyle}>Availability</h2>
                    <ConditionEditor
                        conditionCollections={draft.availabilityConditions}
                        globalStats={globalStats}
                        actorStats={actorStats}
                        actors={actors}
                        items={items}
                        locations={locations}
                        onChange={(availabilityConditions) => setDraft((current) => ({ ...current, availabilityConditions }))}
                    />
                    {draft.availabilityConditions.length === 0 && (
                        <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>Always rendered.</span>
                    )}
                </section>

                {draft.type === 'button' ? (
                    <>
                        <section>
                            <h2 style={sectionHeadingStyle}>Button</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div>
                                    <label style={labelStyle}>Label</label>
                                    <TextInput
                                        fullWidth
                                        value={draft.label}
                                        onChange={(e) => setDraft((current) => ({ ...current, label: e.target.value }))}
                                        placeholder="Text shown on the button"
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Icon Name (optional)</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {PreviewIcon && <PreviewIcon sx={{ color: 'var(--agenda-highlight)' }} />}
                                        <TextInput
                                            fullWidth
                                            value={draft.iconName}
                                            onChange={(e) => setDraft((current) => ({ ...current, iconName: e.target.value }))}
                                            placeholder="MUI icon name, e.g. Star"
                                        />
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 style={sectionHeadingStyle}>Actions (fired on click)</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {draft.actions.map((update) => {
                                    const stat = resolveUpdateStat(update);
                                    const availableStats = statsForUpdate(update);
                                    return (
                                        <div
                                            key={update.id}
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'minmax(90px, 110px) minmax(120px, 1.2fr) minmax(120px, 1.3fr) minmax(100px, 110px) minmax(100px, 1fr) auto',
                                                gap: 8,
                                                alignItems: 'center',
                                                minWidth: 0,
                                            }}
                                        >
                                            <select
                                                style={selectStyle}
                                                value={update.targetType}
                                                onChange={(e) => {
                                                    const targetType = e.target.value as StatUpdate['targetType'];
                                                    const nextStats = targetType === 'player' ? updatableGlobalStats : updatableActorStats;
                                                    updateAction(update.id, { targetType, statId: nextStats[0]?.id || '', value: 0 });
                                                }}
                                            >
                                                <option value="player">Player</option>
                                                <option value="actor">Actor</option>
                                            </select>
                                            {update.targetType === 'actor' ? (
                                                <SearchableOptionPicker
                                                    value={update.actorId}
                                                    onChange={(nextValue) => updateAction(update.id, { actorId: (Array.isArray(nextValue) ? nextValue[0] : nextValue) || 'any' })}
                                                    options={actorTargetOptions}
                                                    defaultOptionKeys={['any']}
                                                    allowClear={false}
                                                    title="Choose actor target"
                                                    placeholder="Search actors"
                                                />
                                            ) : <div />}
                                            <select
                                                style={selectStyle}
                                                value={update.statId}
                                                onChange={(e) => updateAction(update.id, { statId: e.target.value, value: 0 })}
                                            >
                                                {availableStats.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                                            </select>
                                            {stat && isNumericDisplayType(stat.type) ? (
                                                <select
                                                    style={selectStyle}
                                                    value={update.operation}
                                                    onChange={(e) => updateAction(update.id, { operation: e.target.value as StatUpdate['operation'] })}
                                                >
                                                    <option value="adjust">Adjust by</option>
                                                    <option value="set">Set to</option>
                                                </select>
                                            ) : <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>Set to</span>}
                                            <StatValueInput
                                                stat={stat}
                                                value={update.value as StatValue}
                                                onChange={(value) => updateAction(update.id, { value })}
                                                actors={actors}
                                                items={items}
                                                locations={locations}
                                                stage={stage}
                                                allowExpression
                                            />
                                            <Button variant="danger" onClick={() => removeAction(update.id)} aria-label="Delete action" style={iconButtonStyle}>
                                                <Delete fontSize="small" />
                                            </Button>
                                        </div>
                                    );
                                })}
                                <Button variant="secondary" onClick={addAction} style={{ display: 'flex', alignItems: 'center', gap: 6, justifySelf: 'start' }}>
                                    <Add fontSize="small" /> Add Action
                                </Button>
                            </div>
                        </section>
                    </>
                ) : (
                    <section>
                        <h2 style={sectionHeadingStyle}>{draft.type === 'statEditor' ? 'Stat Editor' : 'Stat Display'}</h2>
                        <div>
                            <label style={labelStyle}>Global Stat</label>
                            <select
                                style={selectStyle}
                                value={draft.statId}
                                onChange={(e) => setDraft((current) => ({ ...current, statId: e.target.value }))}
                            >
                                <option value="">Select a stat...</option>
                                {updatableGlobalStats.map((stat) => <option key={stat.id} value={stat.id}>{stat.name}</option>)}
                            </select>
                        </div>
                    </section>
                )}
            </div>
        </GlassPanel>
    );
};
