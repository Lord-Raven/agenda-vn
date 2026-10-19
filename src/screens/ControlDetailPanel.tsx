import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { Stage } from '../Stage';
import { ContentListDisplay, Control, ControlPlacement, ControlType, StatDisplayType } from '../content/Control';
import { ConditionCollection } from '../content/Condition';
import { isReferenceListDisplayType, StatUpdateAction, cloneStatUpdateAction } from '../content/Stat';
import { Button, ColorPickerInput, GlassPanel, TextArea, TextInput, Title } from '../components/UiComponents';
import { ConditionEditor } from '../components/ConditionEditor';
import { OutcomeEditor } from '../components/OutcomeEditor';
import { IconPicker } from '../components/StatRating';

interface ControlDetailPanelProps {
    control: Control;
    stage: () => Stage;
    onUpdate?: () => void;
    onDeactivate?: (controlId: string) => void;
}

type ControlDraft = {
    name: string;
    priority: number;
    widthWeight: number;
    placement: ControlPlacement;
    type: ControlType;
    label: string;
    iconName: string;
    description: string;
    statId: string;
    contentListDisplay: ContentListDisplay;
    displayType: StatDisplayType;
    displayColor: string;
    ratingIconName: string;
    outcomeStatTarget: Control['outcomeStatTarget'];
    availabilityConditions: ConditionCollection[];
    actions: StatUpdateAction[];
};

const createDraft = (control: Control): ControlDraft => ({
    name: control.name,
    priority: control.priority,
    widthWeight: control.widthWeight ?? 1,
    placement: control.placement,
    type: control.type,
    label: control.label,
    iconName: control.iconName,
    description: control.description,
    statId: control.statId,
    contentListDisplay: control.contentListDisplay ?? 'carousel',
    displayType: control.displayType,
    displayColor: control.displayColor,
    ratingIconName: control.ratingIconName,
    outcomeStatTarget: control.outcomeStatTarget,
    availabilityConditions: (control.availabilityConditions || []).map((collection) => [...collection]),
    actions: (control.actions || []).map(cloneStatUpdateAction),
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

export const ControlDetailPanel: FC<ControlDetailPanelProps> = ({ control, stage, onUpdate, onDeactivate }) => {
    const stageInstance = stage();
    const globalStats = useMemo(() => stageInstance.getConfiguration().globalStats || [], [stageInstance]);
    const actorStats = useMemo(() => stageInstance.getConfiguration().actorStats || [], [stageInstance]);
    const updatableGlobalStats = globalStats;
    const updatableActorStats = useMemo(() => actorStats.filter((stat) => !stat.perActor), [actorStats]);
    const updatableLocationStats = useMemo(() => stageInstance.getConfiguration().locationStats || [], [stageInstance]);
    const updatableItemStats = useMemo(() => stageInstance.getConfiguration().itemStats || [], [stageInstance]);
    const actors = useMemo(() => stageInstance.getConfiguration().actors || [], [stageInstance]);
    const items = useMemo(() => stageInstance.getConfiguration().items || [], [stageInstance]);
    const locations = useMemo(() => stageInstance.getConfiguration().locations || [], [stageInstance]);

    const [draft, setDraft] = useState<ControlDraft>(() => createDraft(control));
    const draftRef = useRef(draft);
    const autoSaveTimeoutRef = useRef<number | null>(null);
    const didMountRef = useRef(false);

    const persistDraft = (nextDraft: ControlDraft) => {
        const configuredControls = stageInstance.getConfiguration().controls || [];
        const persistedControl = new Control({
            ...control,
            name: nextDraft.name,
            priority: nextDraft.priority,
            widthWeight: nextDraft.widthWeight,
            placement: nextDraft.placement,
            type: nextDraft.type,
            label: nextDraft.label,
            iconName: nextDraft.iconName,
            description: nextDraft.description,
            statId: nextDraft.statId,
            contentListDisplay: nextDraft.contentListDisplay,
            displayType: nextDraft.displayType,
            displayColor: nextDraft.displayColor,
            ratingIconName: nextDraft.ratingIconName,
            outcomeStatTarget: nextDraft.outcomeStatTarget,
            availabilityConditions: nextDraft.availabilityConditions.map((collection) => [...collection]),
            actions: nextDraft.actions.map(cloneStatUpdateAction),
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

    const usesActorStat = draft.type === 'actorStatDisplay' || (draft.type === 'statOutcome' && draft.outcomeStatTarget === 'actor');
    const selectableStats = usesActorStat ? updatableActorStats : updatableGlobalStats;
    const selectedStat = selectableStats.find((stat) => stat.id === draft.statId);

    return (
        <GlassPanel variant="default" style={{ overflow: 'visible', position: 'relative', padding: '20px', display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
                <Title variant="glow" style={{ fontSize: '24px', margin: 0 }}>
                    Control: {draft.name || '(Unnamed Control)'}
                </Title>
                <Button variant="danger" onClick={handleDeactivate}>Deactivate</Button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
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
                        <div>
                            <label htmlFor={`control-priority-${control.id}`} style={labelStyle}>Priority</label>
                            <TextInput
                                id={`control-priority-${control.id}`}
                                fullWidth
                                type="number"
                                step="any"
                                value={draft.priority}
                                onChange={(e) => {
                                    const priority = Number(e.target.value);
                                    if (!Number.isFinite(priority)) {
                                        e.target.setCustomValidity('Enter a finite priority number.');
                                        e.target.reportValidity();
                                        return;
                                    }
                                    e.target.setCustomValidity('');
                                    setDraft((current) => ({ ...current, priority }));
                                }}
                            />
                            <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                                Lower numbers display first. Equal priorities keep configuration order.
                            </span>
                        </div>
                        {draft.type !== 'actorStatDisplay' && draft.type !== 'statOutcome' && draft.type !== 'settings' && (
                            <div>
                                <label htmlFor={`control-width-weight-${control.id}`} style={labelStyle}>Width Weight</label>
                                <TextInput
                                    id={`control-width-weight-${control.id}`}
                                    fullWidth
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={draft.widthWeight}
                                    onChange={(e) => {
                                        const widthWeight = Number(e.target.value);
                                        if (!Number.isFinite(widthWeight) || widthWeight <= 0) {
                                            e.target.setCustomValidity('Enter a finite width weight greater than zero.');
                                            e.target.reportValidity();
                                            return;
                                        }
                                        e.target.setCustomValidity('');
                                        setDraft((current) => ({ ...current, widthWeight }));
                                    }}
                                />
                                <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                                    Relative width among controls on the same row, including buttons. Default: 1.
                                    Use 2 for twice the space or 0.5 for half. Controls wrap onto new rows when needed.
                                </span>
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div>
                                <label style={labelStyle}>Placement</label>
                                <select
                                    style={selectStyle}
                                    value={draft.placement}
                                    disabled={draft.type === 'actorStatDisplay' || draft.type === 'statOutcome' || draft.type === 'settings'}
                                    onChange={(e) => setDraft((current) => ({ ...current, placement: e.target.value as ControlPlacement }))}
                                >
                                    <option value="top">Top (with date/stats)</option>
                                    <option value="bottom">Bottom (control dock)</option>
                                    {draft.type === 'actorStatDisplay' && <option value="actorCard">Actor Card</option>}
                                    {draft.type === 'statOutcome' && <option value="outcome">Outcomes</option>}
                                    {draft.type === 'settings' && <option value="settings">Settings</option>}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Type</label>
                                <select
                                    style={selectStyle}
                                    value={draft.type}
                                    disabled={draft.type === 'statOutcome'}
                                    onChange={(e) => {
                                        const type = e.target.value as ControlType;
                                        setDraft((current) => ({
                                            ...current,
                                            type,
                                            placement: type === 'statOutcome' ? 'outcome' : type === 'actorStatDisplay' ? 'actorCard' : type === 'settings' ? 'settings' : current.placement === 'actorCard' || current.placement === 'outcome' || current.placement === 'settings' ? 'bottom' : current.placement,
                                            statId: '',
                                        }));
                                    }}
                                >
                                    <option value="button">Button</option>
                                    <option value="statDisplay">Stat Display</option>
                                    <option value="statEditor">Stat Editor</option>
                                    <option value="actorStatDisplay">Actor Stat Display</option>
                                    <option value="statOutcome">Outcome</option>
                                    <option value="settings">Settings</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </section>

                {draft.type !== 'statOutcome' && draft.type !== 'settings' && (
                    <section>
                        <h2 style={sectionHeadingStyle}>Availability</h2>
                        <ConditionEditor
                            conditionCollections={draft.availabilityConditions}
                            globalStats={globalStats}
                            actorStats={actorStats}
                            locationStats={stageInstance.getConfiguration().locationStats || []}
                            itemStats={stageInstance.getConfiguration().itemStats || []}
                            actors={actors}
                            stage={stage}
                            items={items}
                            locations={locations}
                            variableContentType={usesActorStat ? 'actor' : undefined}
                            onChange={(availabilityConditions) => setDraft((current) => ({ ...current, availabilityConditions }))}
                        />
                        {draft.availabilityConditions.length === 0 && (
                            <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>Always rendered.</span>
                        )}
                        {draft.type === 'actorStatDisplay' && (
                            <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                                Rendered on actor cards. Variable actor targets refer to the actor whose card is shown.
                            </span>
                        )}
                    </section>
                )}

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
                                    <label style={labelStyle}>Label Icon (optional)</label>
                                    <IconPicker stage={stage} value={draft.iconName || undefined} allowClear onChange={(iconName) => setDraft((current) => ({ ...current, iconName: iconName || '' }))} />
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 style={sectionHeadingStyle}>Actions (fired on click)</h2>
                            <OutcomeEditor
                                actions={draft.actions}
                                onChange={actions => setDraft(current => ({ ...current, actions }))}
                                globalStats={globalStats}
                                actorStats={actorStats}
                                locationStats={updatableLocationStats}
                                itemStats={updatableItemStats}
                                actors={actors.filter(actor => actor.active !== false)}
                                items={items.filter(item => item.active !== false)}
                                locations={locations.filter(location => location.active !== false)}
                                stage={stage}
                            />
                        </section>
                    </>
                ) : (
                    <section>
                        <h2 style={sectionHeadingStyle}>{draft.type === 'statOutcome' ? 'Stat Outcome' : draft.type === 'actorStatDisplay' ? 'Actor Stat Display' : draft.type === 'statEditor' ? 'Stat Editor' : draft.type === 'settings' ? 'Settings' : 'Stat Display'}</h2>
                        {draft.type === 'statOutcome' && (
                            <div style={{ marginBottom: 15 }}>
                                <label style={labelStyle}>Stat Target</label>
                                <select style={selectStyle} value={draft.outcomeStatTarget}
                                    onChange={(e) => setDraft((current) => ({ ...current, outcomeStatTarget: e.target.value as Control['outcomeStatTarget'], statId: '' }))}>
                                    <option value="global">Global</option>
                                    <option value="actor">Actor</option>
                                </select>
                            </div>
                        )}
                        <div>
                            <label style={labelStyle}>{usesActorStat ? 'Actor Stat' : 'Global Stat'}</label>
                            <select
                                style={selectStyle}
                                value={draft.statId}
                                onChange={(e) => setDraft((current) => ({ ...current, statId: e.target.value }))}
                            >
                                <option value="">Select a stat...</option>
                                {selectableStats.map((stat) => <option key={stat.id} value={stat.id}>{stat.name}</option>)}
                            </select>
                        </div>
                        {draft.type !== 'settings' && (
                            <div style={{ marginTop: 15 }}>
                                <label style={labelStyle}>Label (optional)</label>
                                <TextInput fullWidth value={draft.label} placeholder={selectedStat?.name || 'Use stat name'}
                                    onChange={(e) => setDraft((current) => ({ ...current, label: e.target.value }))} />
                            </div>
                        )}
                        {(draft.type === 'statDisplay' || draft.type === 'statEditor' || draft.type === 'actorStatDisplay' || draft.type === 'settings') && (
                            <div style={{ marginTop: 15 }}>
                                <label style={labelStyle}>Description</label>
                                <TextArea
                                    value={draft.description}
                                    onChange={(e) => setDraft((current) => ({ ...current, description: e.target.value }))}
                                    rows={2}
                                    placeholder="Description shown with this control"
                                    style={{ width: '100%', resize: 'vertical' }}
                                />
                            </div>
                        )}
                        {draft.type !== 'settings' && (
                            <div style={{ marginTop: 15 }}>
                                <label style={labelStyle}>Label Icon (optional)</label>
                                <IconPicker stage={stage} value={draft.iconName || undefined} allowClear onChange={(iconName) => setDraft((current) => ({ ...current, iconName: iconName || '' }))} />
                            </div>
                        )}
                        {(draft.type === 'statDisplay' || draft.type === 'actorStatDisplay') && selectedStat?.type === 'number' && (
                            <div style={{ marginTop: 15 }}>
                                <label style={labelStyle}>Display</label>
                                <select style={selectStyle} value={draft.displayType}
                                    onChange={(e) => setDraft((current) => ({ ...current, displayType: e.target.value as StatDisplayType }))}>
                                    <option value="straight">Straight Number</option>
                                    <option value="percentage">Percentage</option>
                                    <option value="bar">Bar</option>
                                    <option value="rating">Rating</option>
                                    <option value="letter grade">Letter Grade</option>
                                </select>
                                {draft.displayType === 'rating' && (
                                    <div style={{ marginTop: 15 }}>
                                        <label style={labelStyle}>Rating Icon</label>
                                        <IconPicker stage={stage} value={draft.ratingIconName} onChange={(ratingIconName) => setDraft((current) => ({ ...current, ratingIconName: ratingIconName || 'star' }))} />
                                    </div>
                                )}
                            </div>
                        )}
                        {(draft.type === 'statDisplay' || draft.type === 'actorStatDisplay') && (
                            <div style={{ marginTop: 15 }}>
                                <label style={labelStyle}>Display Color</label>
                                <ColorPickerInput value={draft.displayColor} popoverTitle="Choose Display Color"
                                    onChange={(displayColor) => setDraft((current) => ({ ...current, displayColor }))} />
                            </div>
                        )}
                        {(draft.type === 'statDisplay' || draft.type === 'statEditor') && isReferenceListDisplayType(selectedStat?.type ?? 'text') && (
                            <div style={{ marginTop: 15 }}>
                                <label style={labelStyle} htmlFor={`content-list-display-${control.id}`}>Content List Display</label>
                                <select
                                    id={`content-list-display-${control.id}`}
                                    style={selectStyle}
                                    value={draft.contentListDisplay}
                                    onChange={(e) => setDraft((current) => ({ ...current, contentListDisplay: e.target.value as ContentListDisplay }))}
                                >
                                    <option value="carousel">Portrait Carousel (default)</option>
                                    <option value="abbreviated">Abbreviated</option>
                                </select>
                            </div>
                        )}
                    </section>
                )}
            </div>
        </GlassPanel>
    );
};
