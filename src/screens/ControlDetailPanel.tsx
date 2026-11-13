import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { Stage } from '../Stage';
import { ContentListDisplay, Control, ControlPlacement, ControlType, StatDisplayType } from '../content/Control';
import { ConditionCollection, ContentType } from '../content/Condition';
import { isReferenceListDisplayType, isReferenceStatType, resolveReferenceKind, resolveStatOptionPool, StatUpdateAction, cloneStatUpdateAction } from '../content/Stat';
import { parseContentStatReference } from '../content/Screen';
import { functionReferenceId, isFunctionReference } from '../content/Function';
import { Button, ColorPickerInput, GlassPanel, HelpTip, ReferenceMultiSelect, TextArea, TextInput, Title } from '../components/UiComponents';
import { ConditionEditor } from '../components/ConditionEditor';
import { OutcomeEditor } from '../components/OutcomeEditor';
import { IconPicker } from '../components/StatRating';
import { SearchableOptionPicker } from '../components/SearchableOptionPicker';
import { contentDetailSourceOptions, listDetailOptions } from '../components/ListSectionsEditor';
import { HeaderVariableContext, VariableContentContext } from '../components/VariableContentContext';

interface ControlDetailPanelProps {
    control: Control;
    stage: () => Stage;
    onUpdate?: () => void;
    onDelete?: (controlId: string) => void;
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
    subLabel: string;
    cardDetails: string[];
    useNamePlate: boolean;
    showPortrait: boolean;
    showSourceLink: boolean;
    visibilityConditions: ConditionCollection[];
    statId: string;
    contentType: ContentType;
    badgeSource: string;
    pickerSource?: string[];
    screenId: string;
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
    subLabel: control.subLabel,
    cardDetails: [...control.cardDetails],
    useNamePlate: control.useNamePlate,
    showPortrait: control.showPortrait,
    showSourceLink: control.showSourceLink,
    visibilityConditions: control.visibilityConditions.map(collection => collection.map(condition => ({ ...condition }))),
    statId: control.statId,
    contentType: control.contentType,
    badgeSource: control.badgeSource,
    pickerSource: control.pickerSource ? [...control.pickerSource] : undefined,
    screenId: control.screenId,
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

const fieldHeadingStyle: React.CSSProperties = {
    ...labelStyle,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
};

const labelHelpText = 'Use {{Function Name}} or {{Greeting("Alex", 2, true)}} anywhere in the label. Arguments follow parameter order; omitted arguments use defaults. Evaluated read-only. Use {{Enabled ? Label : "fallback"}} for conditional text; false, zero, and empty text are false.';

const sectionHeadingStyle: React.CSSProperties = {
    color: 'var(--agenda-highlight)',
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '15px',
    borderBottom: '2px solid var(--agenda-line-strong)',
    paddingBottom: '5px',
};

export const ControlDetailPanel: FC<ControlDetailPanelProps> = ({ control, stage, onUpdate, onDelete }) => {
    const stageInstance = stage();
    const globalStats = useMemo(() => stageInstance.getConfiguration().globalStats || [], [stageInstance]);
    const actorStats = useMemo(() => stageInstance.getConfiguration().actorStats || [], [stageInstance]);
    const updatableGlobalStats = globalStats;
    const updatableActorStats = actorStats;
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
            subLabel: nextDraft.subLabel,
            cardDetails: [...nextDraft.cardDetails],
            useNamePlate: nextDraft.useNamePlate,
            showPortrait: nextDraft.showPortrait,
            showSourceLink: nextDraft.showSourceLink,
            visibilityConditions: nextDraft.visibilityConditions,
            statId: nextDraft.statId,
            contentType: nextDraft.contentType,
            badgeSource: nextDraft.badgeSource,
            pickerSource: nextDraft.pickerSource ? [...nextDraft.pickerSource] : undefined,
            screenId: nextDraft.screenId,
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

    const handleDelete = () => {
        const configuredControls = stageInstance.getConfiguration().controls || [];
        stageInstance.updateConfiguration({
            controls: configuredControls.filter((candidate) => candidate.id !== control.id),
        });
        onDelete?.(control.id);
    };

    const usesActorStat = draft.type === 'statOutcome' && draft.outcomeStatTarget === 'actor';
    const selectableStats = usesActorStat ? updatableActorStats : updatableGlobalStats;
    const selectedStat = selectableStats.find((stat) => stat.id === draft.statId);
    const supportsDisplaySettings = draft.type === 'statDisplay' || draft.type === 'statOutcome';
    const isStatBadge = draft.type === 'statBadge';
    const isCard = draft.type === 'card';
    const conditionProps = {
        globalStats, actorStats, locationStats: updatableLocationStats, itemStats: updatableItemStats,
        actors: actors.filter(actor => actor.active !== false),
        items: items.filter(item => item.active !== false),
        locations: locations.filter(location => location.active !== false),
        stage, variableContentType: isCard || isStatBadge ? draft.contentType : usesActorStat ? 'actor' as const : undefined,
    };
    const contentTypeStats = draft.contentType === 'actor' ? actorStats : draft.contentType === 'location' ? updatableLocationStats : updatableItemStats;
    // The badge source's value type, for gating the numeric display settings.
    const badgeStatReference = parseContentStatReference(draft.badgeSource);
    const badgeSourceType = badgeStatReference
        ? contentTypeStats.find((stat) => stat.id === badgeStatReference.statId)?.type
        : isFunctionReference(draft.badgeSource)
            ? (stageInstance.getConfiguration().functions || []).find((fn) => fn.id === functionReferenceId(draft.badgeSource))?.returnType
            : undefined;

    return (
        <GlassPanel variant="default" style={{ overflow: 'visible', position: 'relative', padding: '20px', display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
                <Title variant="glow" style={{ fontSize: '24px', margin: 0 }}>
                    Control: {draft.name || '(Unnamed Control)'}
                </Title>
                <Button variant="danger" onClick={handleDelete}>Delete</Button>
            </div>

            <VariableContentContext.Provider value={conditionProps.variableContentType}>
            <HeaderVariableContext.Provider value={isCard || isStatBadge}>
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
                            <div style={fieldHeadingStyle}>
                                <label htmlFor={`control-priority-${control.id}`}>Priority</label>
                                <HelpTip title="Control priority">
                                    Lower numbers display first. Equal priorities keep configuration order.
                                </HelpTip>
                            </div>
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
                        </div>
                        {!isCard && draft.type !== 'statOutcome' && draft.type !== 'settings' && draft.type !== 'popup' && !isStatBadge && (
                            <div>
                                <div style={fieldHeadingStyle}>
                                    <label htmlFor={`control-width-weight-${control.id}`}>Width Weight</label>
                                    <HelpTip title="Width weight">
                                        Relative width among controls on the same row, including buttons. Default: 1.
                                        Use 2 for twice the space or 0.5 for half. Controls wrap onto new rows when needed.
                                    </HelpTip>
                                </div>
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
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div>
                                <label style={labelStyle}>Placement</label>
                                <select
                                    style={selectStyle}
                                    value={draft.placement}
                                    disabled={isCard || draft.type === 'statOutcome' || draft.type === 'settings' || draft.type === 'popup' || isStatBadge}
                                    onChange={(e) => setDraft((current) => ({ ...current, placement: e.target.value as ControlPlacement }))}
                                >
                                    <option value="top">Top (with date/stats)</option>
                                    <option value="bottom">Bottom (control dock)</option>
                                    {draft.type === 'statOutcome' && <option value="outcome">Outcomes</option>}
                                    {draft.type === 'settings' && <option value="settings">Settings</option>}
                                    {draft.type === 'popup' && <option value="popup">Pop-up</option>}
                                    {(isStatBadge || isCard) && <option value="standalone">Standalone</option>}
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
                                            placement: type === 'popup' ? 'popup' : type === 'statOutcome' ? 'outcome' : type === 'settings' ? 'settings' : type === 'statBadge' || type === 'card' ? 'standalone' : current.placement === 'outcome' || current.placement === 'settings' || current.placement === 'popup' || current.placement === 'standalone' ? 'bottom' : current.placement,
                                            statId: '',
                                            badgeSource: '',
                                            pickerSource: undefined,
                                        }));
                                    }}
                                >
                                    <option value="button">Button</option>
                                    <option value="statDisplay">Stat Display</option>
                                    <option value="statEditor">Stat Editor</option>
                                    <option value="card">Card</option>
                                    <option value="statBadge">Stat Badge</option>
                                    <option value="statOutcome">Outcome</option>
                                    <option value="settings">Settings</option>
                                    <option value="popup">Pop-up</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </section>

                {isCard && (
                    <section>
                        <h2 style={sectionHeadingStyle}>Card Content</h2>
                        <label style={labelStyle}>Content Type</label>
                        <select style={selectStyle} value={draft.contentType}
                            onChange={event => setDraft(current => ({ ...current, contentType: event.target.value as ContentType, cardDetails: [] }))}>
                            <option value="actor">Actor</option>
                            <option value="item">Item</option>
                            <option value="location">Location</option>
                        </select>
                        <h2 style={{ ...sectionHeadingStyle, marginTop: 20 }}>Visibility</h2>
                        <ConditionEditor {...conditionProps} allowSkitState conditionCollections={draft.visibilityConditions}
                            onChange={visibilityConditions => setDraft(current => ({ ...current, visibilityConditions }))} />
                        <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                            Hidden unless these conditions and the content's visibility rules pass. Variable is the card's content; Header is the List page header (empty for hovers).
                        </span>
                    </section>
                )}

                {draft.type !== 'statOutcome' && draft.type !== 'settings' && (
                    <section>
                        <div style={{ ...sectionHeadingStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <h2 style={{ fontSize: 'inherit', margin: 0 }}>Availability</h2>
                            <HelpTip title="Control availability">
                                {isCard ? 'Visible cards are disabled unless these conditions and the content availability rules pass.' : 'Leave conditions empty to always render this control.'}
                                {isStatBadge && ' Evaluated per entry. Variable targets refer to the entry this badge is attached to.'}
                            </HelpTip>
                        </div>
                        <ConditionEditor
                            {...conditionProps}
                            conditionCollections={draft.availabilityConditions}
                            allowSkitState
                            onChange={(availabilityConditions) => setDraft((current) => ({ ...current, availabilityConditions }))}
                        />
                        {draft.availabilityConditions.length === 0 && (
                            <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>{isCard ? 'No additional availability restriction.' : 'Always rendered.'}</span>
                        )}
                    </section>
                )}

                {draft.type === 'popup' ? (
                    <section>
                        <h2 style={sectionHeadingStyle}>Pop-up</h2>
                        <div style={fieldHeadingStyle}>
                            <label htmlFor={`control-screen-${control.id}`}>Screen</label>
                            <HelpTip title="Pop-up Screen">
                                Appears over the map, calendar, or skit while its availability conditions pass.
                                The top and bottom status bars remain visible and usable.
                                Pop-ups animate in and out; switching pop-ups fades only their contents.
                                Only one pop-up is shown: lower priority numbers win, with configuration order breaking ties.
                                It cannot be dismissed; use map button or card click actions to change the visibility conditions.
                                {' The selected Screen ignores its normal availability rules, but map links and buttons retain theirs. Define reusable Map and List content in Screens.'}
                            </HelpTip>
                        </div>
                        <select
                            id={`control-screen-${control.id}`}
                            style={selectStyle}
                            value={draft.screenId}
                            onChange={(e) => setDraft((current) => ({ ...current, screenId: e.target.value }))}
                        >
                            <option value="">Select a Screen...</option>
                            {draft.screenId && !(stageInstance.getConfiguration().screens || []).some(screen => screen.id === draft.screenId && screen.active !== false) && (
                                <option value={draft.screenId}>Missing or inactive Screen ({draft.screenId})</option>
                            )}
                            {(stageInstance.getConfiguration().screens || []).filter(screen => screen.active !== false).map(screen => (
                                <option key={screen.id} value={screen.id}>{screen.name || 'Unnamed Screen'} ({screen.type === 'list' ? 'List' : 'Map'})</option>
                            ))}
                        </select>
                    </section>
                ) : draft.type === 'button' || isCard ? (
                    <>
                        <section>
                            <h2 style={sectionHeadingStyle}>{isCard ? 'Card Appearance' : 'Button'}</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div>
                                    <div style={fieldHeadingStyle}>
                                        <label>Label</label>
                                        <HelpTip title="Control label">{labelHelpText}</HelpTip>
                                    </div>
                                    <TextInput
                                        fullWidth
                                        value={draft.label}
                                        onChange={(e) => setDraft((current) => ({ ...current, label: e.target.value }))}
                                        placeholder={isCard ? '{{content:name}}' : 'Text shown on the button'}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Label Icon (optional)</label>
                                    <IconPicker stage={stage} value={draft.iconName || undefined} allowClear onChange={(iconName) => setDraft((current) => ({ ...current, iconName: iconName || '' }))} />
                                </div>
                                {isCard && (
                                    <>
                                        <div>
                                            <label style={labelStyle}>Sub-label</label>
                                            <TextInput fullWidth value={draft.subLabel}
                                                onChange={event => setDraft(current => ({ ...current, subLabel: event.target.value }))} />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Description</label>
                                            <TextArea rows={3} value={draft.description} style={{ width: '100%' }}
                                                onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} />
                                        </div>
                                        <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                                            Labels, sub-labels, descriptions, and badge text support Stat/Function macros.
                                            {' Use {{content:name}}, {{content:description}}, {{content:header}}, and for Actors {{content:role}}, {{content:age}}, {{content:meta}}, {{content:summary}} or {{char:Stat Name}}.'}
                                            {' Use {{content:Stat Name}} for Card content stats and {{content:Enabled ? content:Label : "fallback"}} for conditional text. Conditions use truthiness (false, zero, and empty text are false).'}
                                            {' Function arguments can bind "variable:actor", "variable:item", "variable:location", or "variable:header". Cards are horizontal in Lists and vertical in hovers.'}
                                        </span>
                                        {([
                                            ['useNamePlate', 'Use NamePlate for label'],
                                            ['showPortrait', 'Show portrait / Location background'],
                                            ['showSourceLink', 'Show Actor source link'],
                                        ] as const).map(([field, label]) => (
                                            <label key={field} style={labelStyle}>
                                                <input type="checkbox" checked={draft[field]}
                                                    onChange={event => setDraft(current => ({ ...current, [field]: event.target.checked }))} /> {label}
                                            </label>
                                        ))}
                                        <div>
                                            <label style={labelStyle}>Standalone Controls</label>
                                            <SearchableOptionPicker stage={stage} multiple title="Choose card controls"
                                                values={draft.cardDetails} options={listDetailOptions(stageInstance, draft.contentType)}
                                                onChange={value => setDraft(current => ({ ...current, cardDetails: Array.isArray(value) ? value : [] }))} />
                                            <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>Standalone Stat Badges of the same content type, in selection order.</span>
                                        </div>
                                    </>
                                )}
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
                ) : isStatBadge ? (
                    <section>
                        <h2 style={sectionHeadingStyle}>Stat Badge</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div>
                                <div style={fieldHeadingStyle}>
                                    <label>Content Type</label>
                                    <HelpTip title="Badge content type">
                                        This badge can be attached to Card Controls of this content type.
                                    </HelpTip>
                                </div>
                                <select
                                    style={selectStyle}
                                    value={draft.contentType}
                                    onChange={(e) => setDraft((current) => ({ ...current, contentType: e.target.value as ContentType, badgeSource: '' }))}
                                >
                                    <option value="actor">Actor</option>
                                    <option value="item">Item</option>
                                    <option value="location">Location</option>
                                </select>
                            </div>
                            <div>
                                <div style={fieldHeadingStyle}>
                                    <label>Value Source</label>
                                    <HelpTip title="Badge value source">
                                        A stat of the chosen content type, or a function whose Variable parameter binds to the entry this badge is attached to.
                                    </HelpTip>
                                </div>
                                <VariableContentContext.Provider value={draft.contentType}>
                                    <HeaderVariableContext.Provider value={true}>
                                        <SearchableOptionPicker stage={stage} allowClear emptyLabel="None" title="Choose badge source" bindVariableParameters
                                            value={draft.badgeSource || undefined} options={contentDetailSourceOptions(stageInstance, draft.contentType)}
                                            onChange={(value) => setDraft((current) => ({ ...current, badgeSource: typeof value === 'string' ? value : '' }))} />
                                    </HeaderVariableContext.Provider>
                                </VariableContentContext.Provider>
                            </div>
                            <div>
                                <div style={fieldHeadingStyle}>
                                    <label>Label (optional)</label>
                                    <HelpTip title="Badge label">
                                        Leave empty to show no label. {labelHelpText}
                                    </HelpTip>
                                </div>
                                <TextInput fullWidth value={draft.label} placeholder="No label"
                                    onChange={(e) => setDraft((current) => ({ ...current, label: e.target.value }))} />
                            </div>
                            <div>
                                <label style={labelStyle}>Description</label>
                                <TextArea
                                    value={draft.description}
                                    onChange={(e) => setDraft((current) => ({ ...current, description: e.target.value }))}
                                    rows={2}
                                    placeholder="Tooltip shown with this badge"
                                    style={{ width: '100%', resize: 'vertical' }}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Label Icon (optional)</label>
                                <IconPicker stage={stage} value={draft.iconName || undefined} allowClear onChange={(iconName) => setDraft((current) => ({ ...current, iconName: iconName || '' }))} />
                            </div>
                            {badgeSourceType === 'number' && (
                                <div>
                                    <div style={fieldHeadingStyle}>
                                        <label>Display</label>
                                        <HelpTip title="Badge display">
                                            Function sources use a 0–100 range for Percentage, Bar, and Letter Grade displays, and 5 pips for Rating.
                                        </HelpTip>
                                    </div>
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
                            <div>
                                <label style={labelStyle}>Display Color</label>
                                <ColorPickerInput value={draft.displayColor} popoverTitle="Choose Display Color"
                                    onChange={(displayColor) => setDraft((current) => ({ ...current, displayColor }))} />
                            </div>
                        </div>
                    </section>
                ) : (
                    <section>
                        <h2 style={sectionHeadingStyle}>{draft.type === 'statOutcome' ? 'Stat Outcome' : draft.type === 'statEditor' ? 'Stat Editor' : draft.type === 'settings' ? 'Settings' : 'Stat Display'}</h2>
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
                                onChange={(e) => setDraft((current) => ({ ...current, statId: e.target.value, pickerSource: undefined }))}
                            >
                                <option value="">Select a stat...</option>
                                {selectableStats.map((stat) => <option key={stat.id} value={stat.id}>{stat.name}</option>)}
                            </select>
                        </div>
                        {draft.type === 'statEditor' && selectedStat && (isReferenceStatType(selectedStat.type) || selectedStat.type === 'option' || selectedStat.type === 'optionList') && (
                            <div style={{ marginTop: 15 }}>
                                <div style={fieldHeadingStyle}>
                                    <label>
                                        <input id={`control-picker-source-${control.id}`} type="checkbox" checked={draft.pickerSource !== undefined}
                                            onChange={(e) => setDraft(current => ({ ...current, pickerSource: e.target.checked ? [] : undefined }))} />
                                        {' '}Limit picker options
                                    </label>
                                    <HelpTip title="Limit picker options">
                                        Choose individual options or global stats and functions. Their current values determine the available choices in-game. Existing selections remain until removed.
                                    </HelpTip>
                                </div>
                                {draft.pickerSource !== undefined && (
                                    <>
                                        {isReferenceStatType(selectedStat.type) ? (
                                            <ReferenceMultiSelect kind={resolveReferenceKind(selectedStat.type)}
                                                values={draft.pickerSource} onChange={pickerSource => setDraft(current => ({ ...current, pickerSource }))}
                                                actors={actors} items={items} locations={locations} stage={stage} />
                                        ) : (
                                            <SearchableOptionPicker multiple values={draft.pickerSource}
                                                onChange={value => setDraft(current => ({ ...current, pickerSource: Array.isArray(value) ? value : [] }))}
                                                options={resolveStatOptionPool(selectedStat, { sourceStats: globalStats }).map(option => ({ key: option.id!, label: option.name, description: option.description }))}
                                                functionType="option" stage={stage} title="Choose source options" />
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                        {draft.type !== 'settings' && (
                            <div style={{ marginTop: 15 }}>
                                <div style={fieldHeadingStyle}>
                                    <label>Label (optional)</label>
                                    <HelpTip title="Control label">
                                        {selectedStat?.type === 'icon' ? 'Leave empty to show no label. ' : ''}{labelHelpText}
                                    </HelpTip>
                                </div>
                                <TextInput fullWidth value={draft.label} placeholder={selectedStat?.type === 'icon' ? 'No label' : (selectedStat?.name || 'Use stat name')}
                                    onChange={(e) => setDraft((current) => ({ ...current, label: e.target.value }))} />
                            </div>
                        )}
                        {(draft.type === 'statDisplay' || draft.type === 'statEditor' || draft.type === 'settings') && (
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
                        {supportsDisplaySettings && selectedStat?.type === 'number' && (
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
                        {supportsDisplaySettings && (
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
            </HeaderVariableContext.Provider>
            </VariableContentContext.Provider>
        </GlassPanel>
    );
};
