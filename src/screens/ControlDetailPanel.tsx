import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { Stage } from '../Stage';
import { BarOrientation, ContentListDisplay, Control, controlReference, ControlType, isBarContentControl, isPopupTitleControl, isContentDisplayType, StatDisplayType } from '../content/Control';
import { ConditionCollection, ContentType } from '../content/Condition';
import { isReferenceListDisplayType, isReferenceStatType, resolveReferenceKind, resolveStatOptionPool, sharesOptionPool, StatUpdateAction, cloneStatUpdateAction, ReferenceKind } from '../content/Stat';
import { parseContentStatReference, SCREEN_TYPE_LABELS } from '../content/Screen';
import { functionReference, functionReferenceId, functionSignature, globalStatReference, globalStatReferenceId, isFunctionReference, isGlobalStatReference } from '../content/Function';
import { Button, ColorPickerInput, GlassPanel, HelpTip, ReferenceMultiSelect, TextArea, TextInput, Title } from '../components/UiComponents';
import { ConditionEditor } from '../components/ConditionEditor';
import { OutcomeEditor } from '../components/OutcomeEditor';
import { IconPicker } from '../components/StatRating';
import { SearchableOptionPicker } from '../components/SearchableOptionPicker';
import { cardControlOptions, contentDetailSourceOptions, listDetailOptions } from '../components/ListSectionsEditor';
import { HeaderVariableContext, MarkerTextVariableContext, VariableContentContext } from '../components/VariableContentContext';

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
    type: ControlType;
    barOrientation: BarOrientation;
    barControls: string[];
    barContent: Control['barContent'];
    label: string;
    iconName: string;
    description: string;
    subLabel: string;
    cardDetails: string[];
    useNamePlate: boolean;
    showPortrait: boolean;
    portraitScale: number;
    showSourceLink: boolean;
    visibilityConditions: ConditionCollection[];
    statId: string;
    contentType: ContentType | undefined;
    displaySource: string;
    onDragFunction: string;
    onDropFunction: string;
    dropValidationFunction: string;
    pickerSource?: string[];
    screenId: string;
    titleBarControls: string[];
    contentListDisplay: ContentListDisplay;
    displayType: StatDisplayType;
    displayColor: string;
    ratingIconName: string;
    outcomeStatTarget: Control['outcomeStatTarget'];
    availabilityConditions: ConditionCollection[];
    actions: StatUpdateAction[];
    markerInputType: 'actor' | 'item' | 'location' | 'screen' | 'string';
    cardControlId: string;
    contentList: { kind: ReferenceKind | 'mixed'; values: string[] };
};

const createDraft = (control: Control): ControlDraft => ({
    name: control.name,
    priority: control.priority,
    widthWeight: control.widthWeight ?? 1,
    type: control.type,
    barOrientation: control.barOrientation,
    barControls: [...control.barControls],
    barContent: control.barContent ? { ...control.barContent } : undefined,
    label: control.label,
    iconName: control.iconName,
    description: control.description,
    subLabel: control.subLabel,
    cardDetails: [...control.cardDetails],
    useNamePlate: control.useNamePlate,
    showPortrait: control.showPortrait,
    portraitScale: control.portraitScale,
    showSourceLink: control.showSourceLink,
    visibilityConditions: control.visibilityConditions.map(collection => collection.map(condition => ({ ...condition }))),
    statId: control.statId,
    contentType: control.contentType,
    displaySource: control.displaySource,
    onDragFunction: control.onDragFunction,
    onDropFunction: control.onDropFunction,
    dropValidationFunction: control.dropValidationFunction,
    pickerSource: control.pickerSource ? [...control.pickerSource] : undefined,
    screenId: control.screenId,
    titleBarControls: [...control.titleBarControls],
    contentListDisplay: control.contentListDisplay ?? 'carousel',
    displayType: control.displayType,
    displayColor: control.displayColor,
    ratingIconName: control.ratingIconName,
    outcomeStatTarget: control.outcomeStatTarget,
    availabilityConditions: (control.availabilityConditions || []).map((collection) => [...collection]),
    actions: (control.actions || []).map(cloneStatUpdateAction),
    markerInputType: control.markerInputType,
    cardControlId: control.cardControlId,
    contentList: { kind: control.contentList?.kind === 'string' ? 'mixed' : (control.contentList?.kind || 'mixed') as ReferenceKind | 'mixed', values: [...(control.contentList?.values || [])] },
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
    const barControlOptions = useMemo(() => (stageInstance.getConfiguration().controls || [])
        .filter(candidate => candidate.active !== false && isBarContentControl(candidate))
        .map(candidate => ({
            key: controlReference(candidate.id),
            label: candidate.name || '(Unnamed Control)',
            category: candidate.type === 'button' ? 'Buttons' : candidate.type === 'statDisplay' ? 'Stat Displays'
                : candidate.type === 'time' ? 'Time Controls' : candidate.type === 'dragDropDisplay' ? 'Drag and Drops' : 'Stat Editors',
            description: candidate.description,
        })), [stageInstance]);
    const titleBarControlOptions = barControlOptions.filter(option =>
        (stageInstance.getConfiguration().controls || []).some(candidate => controlReference(candidate.id) === option.key && isPopupTitleControl(candidate)));

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
            type: nextDraft.type,
            barOrientation: nextDraft.barOrientation,
            barControls: [...nextDraft.barControls],
            barContent: nextDraft.barContent,
            label: nextDraft.label,
            iconName: nextDraft.iconName,
            description: nextDraft.description,
            subLabel: nextDraft.subLabel,
            cardDetails: [...nextDraft.cardDetails],
            useNamePlate: nextDraft.useNamePlate,
            showPortrait: nextDraft.showPortrait,
            portraitScale: nextDraft.portraitScale,
            showSourceLink: nextDraft.showSourceLink,
            visibilityConditions: nextDraft.visibilityConditions,
            statId: nextDraft.statId,
            contentType: nextDraft.contentType,
            displaySource: nextDraft.displaySource,
            onDragFunction: nextDraft.onDragFunction,
            onDropFunction: nextDraft.onDropFunction,
            dropValidationFunction: nextDraft.dropValidationFunction,
            pickerSource: nextDraft.pickerSource ? [...nextDraft.pickerSource] : undefined,
            screenId: nextDraft.screenId,
            titleBarControls: [...nextDraft.titleBarControls],
            contentListDisplay: nextDraft.contentListDisplay,
            displayType: nextDraft.displayType,
            displayColor: nextDraft.displayColor,
            ratingIconName: nextDraft.ratingIconName,
            outcomeStatTarget: nextDraft.outcomeStatTarget,
            availabilityConditions: nextDraft.availabilityConditions.map((collection) => [...collection]),
            actions: nextDraft.actions.map(cloneStatUpdateAction),
            markerInputType: nextDraft.markerInputType,
            cardControlId: nextDraft.cardControlId,
            contentList: nextDraft.contentList,
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
    const isDragDrop = draft.type === 'dragDropDisplay';
    const isContentBoundDisplay = draft.type === 'statDisplay' && draft.contentType !== undefined;
    const isCard = draft.type === 'card';
    const isMarker = draft.type === 'marker';
    const conditionProps = {
        globalStats, actorStats, locationStats: updatableLocationStats, itemStats: updatableItemStats,
        actors: actors.filter(actor => actor.active !== false),
        items: items.filter(item => item.active !== false),
        locations: locations.filter(location => location.active !== false),
        stage, variableContentType: isCard || isContentBoundDisplay || isDragDrop ? draft.contentType : isMarker && (draft.markerInputType === 'actor' || draft.markerInputType === 'item' || draft.markerInputType === 'location') ? draft.markerInputType : usesActorStat ? 'actor' as const : undefined,
    };
    const contentTypeStats = draft.contentType === 'actor' ? actorStats : draft.contentType === 'location' ? updatableLocationStats : draft.contentType === 'item' ? updatableItemStats : globalStats;
    // The content source's value type, for gating the numeric display settings.
    const displayStatReference = parseContentStatReference(draft.displaySource);
    const displaySourceType = displayStatReference
        ? contentTypeStats.find((stat) => stat.id === displayStatReference.statId)?.type
        : isGlobalStatReference(draft.displaySource)
            ? globalStats.find(stat => stat.id === globalStatReferenceId(draft.displaySource))?.type
        : isFunctionReference(draft.displaySource)
            ? (stageInstance.getConfiguration().functions || []).find((fn) => fn.id === functionReferenceId(draft.displaySource))?.returnType
            : undefined;
    const displaySourceOptions = (draft.contentType ? contentDetailSourceOptions(stageInstance, draft.contentType) : [
        ...(stageInstance.getConfiguration().functions || []).map(fn => ({ key: functionReference(fn.id), label: functionSignature(fn), category: 'Functions', description: fn.description })),
        ...globalStats.map(stat => ({ key: globalStatReference(stat.id), label: stat.name, category: 'Global Stats', description: stat.guidance })),
    ]).filter(option => {
        if (!isDragDrop) return true;
        const reference = parseContentStatReference(option.key);
        const type = reference ? contentTypeStats.find(stat => stat.id === reference.statId)?.type
            : isGlobalStatReference(option.key) ? globalStats.find(stat => stat.id === globalStatReferenceId(option.key))?.type
            : stageInstance.getConfiguration().functions.find(fn => fn.id === functionReferenceId(option.key))?.returnType;
        return isContentDisplayType(type);
    });
    const draggedKinds = displaySourceType === 'contentList' ? ['actor', 'item', 'location']
        : isContentDisplayType(displaySourceType) ? [resolveReferenceKind(displaySourceType)] : [];
    const dragDropFunctionOptions = (stageInstance.getConfiguration().functions || [])
        .filter(fn => {
            const parameters = fn.parameters || [];
            if (draft.contentType && parameters[0]?.type !== draft.contentType) return false;
            const movedParameters = draft.contentType ? parameters.slice(1) : parameters;
            if (draft.contentType && displaySourceType !== 'contentList') return draggedKinds.length === 1 && movedParameters[0]?.type === draggedKinds[0];
            return draggedKinds.length > 0 && draggedKinds.every(kind => movedParameters.some(parameter => parameter.type === kind));
        })
        .map(fn => ({ key: functionReference(fn.id), label: functionSignature(fn), category: 'Functions', description: fn.description }));

    return (
        <GlassPanel variant="default" style={{ overflow: 'visible', position: 'relative', padding: '20px', display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
                <Title variant="glow" style={{ fontSize: '24px', margin: 0 }}>
                    Control: {draft.name || '(Unnamed Control)'}
                </Title>
                <Button variant="danger" onClick={handleDelete}>Delete</Button>
            </div>

            <VariableContentContext.Provider value={conditionProps.variableContentType}>
            <HeaderVariableContext.Provider value={isCard || isContentBoundDisplay || (isDragDrop && !!draft.contentType)}>
            <MarkerTextVariableContext.Provider value={isMarker && (draft.markerInputType === 'string' || draft.markerInputType === 'screen')}>
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
                        {(draft.type === 'button' || draft.type === 'statDisplay' || draft.type === 'statEditor') && (
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
                                            statId: '',
                                            displaySource: '',
                                            pickerSource: undefined,
                                            contentType: type === 'statDisplay' || type === 'dragDropDisplay' ? undefined : current.contentType || 'actor',
                                        }));
                                    }}
                                >
                                    <option value="button">Button</option>
                                    <option value="statDisplay">Stat Display</option>
                                    <option value="statEditor">Stat Editor</option>
                                    <option value="card">Card</option>
                                    <option value="dragDropDisplay">Drag and Drop Display</option>
                                    <option value="statOutcome">Outcome</option>
                                    <option value="settings">Settings</option>
                                    <option value="popup">Pop-up</option>
                                    <option value="marker">Marker</option>
                                    <option value="bar">Bar</option>
                                    <option value="time">Time Control</option>
                                </select>
                            </div>
                        </div>
                        {draft.type === 'statDisplay' && (
                            <div>
                                <div style={fieldHeadingStyle}>
                                    <label>Content Type (optional)</label>
                                    <HelpTip title="Display content type">
                                        Leave unset to display a global stat. Select a content type to attach this display to matching Cards or Bars with that content context.
                                    </HelpTip>
                                </div>
                                <select
                                    style={selectStyle}
                                    value={draft.contentType || ''}
                                    onChange={(e) => setDraft(current => ({ ...current, contentType: e.target.value ? e.target.value as ContentType : undefined, displaySource: '' }))}
                                >
                                    <option value="">Global</option>
                                    <option value="actor">Actor</option>
                                    <option value="item">Item</option>
                                    <option value="location">Location</option>
                                </select>
                            </div>
                        )}
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
                                {(isContentBoundDisplay || (isDragDrop && draft.contentType)) && ' Evaluated per entry. Variable targets refer to the entry this display is attached to.'}
                                {isMarker && ' Variable refers to the content passed to this marker.'}
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

                {isMarker && (
                    <section>
                        <h2 style={sectionHeadingStyle}>Marker</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                            <div>
                                <div style={fieldHeadingStyle}>
                                    <label>Input Type</label>
                                    <HelpTip title="Marker input">
                                        Each marker instance on a Map Screen picks its own actor, item, location, or screen, or enters its own text.
                                        Location availability does not hide or disable the marker; use the Marker Control's availability conditions instead.
                                        Variable offers it in compatible condition, action, and function parameter inputs.
                                        Screen inputs supply the selected screen ID as text.
                                    </HelpTip>
                                </div>
                                <select
                                    style={selectStyle}
                                    value={draft.markerInputType}
                                    onChange={(event) => setDraft(current => ({
                                        ...current,
                                        markerInputType: event.target.value as typeof current.markerInputType,
                                        cardControlId: event.target.value === current.markerInputType ? current.cardControlId : '',
                                    }))}
                                >
                                    <option value="actor">Actor</option>
                                    <option value="item">Item</option>
                                    <option value="location">Location</option>
                                    <option value="screen">Screen</option>
                                    <option value="string">String</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle} htmlFor={`marker-card-${control.id}`}>Hover Card Control</label>
                                <select
                                    id={`marker-card-${control.id}`}
                                    style={selectStyle}
                                    value={draft.cardControlId}
                                    disabled={draft.markerInputType === 'screen' || draft.markerInputType === 'string'}
                                    onChange={(event) => setDraft(current => ({ ...current, cardControlId: event.target.value }))}
                                >
                                    <option value="">None</option>
                                    {(draft.markerInputType === 'actor' || draft.markerInputType === 'item' || draft.markerInputType === 'location')
                                        && cardControlOptions(stageInstance, draft.markerInputType).map(option => (
                                            <option key={option.key} value={option.key}>{option.label}</option>
                                        ))}
                                </select>
                                <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                                    Cards require an Actor, Item, or Location input and receive the marker instance's value. Their availability follows the marker, not the card or content availability rules.
                                </span>
                            </div>
                            <div>
                                <div style={fieldHeadingStyle}>
                                    <label>Content below marker</label>
                                    <HelpTip title="Content below marker">
                                        A mixed list of Actors, Items, and Locations, independent of the marker input type.
                                    </HelpTip>
                                </div>
                                <ReferenceMultiSelect
                                    values={draft.contentList.values}
                                    onChange={(values) => setDraft(current => ({ ...current, contentList: { kind: 'mixed', values } }))}
                                    actors={actors.filter(actor => actor.active !== false)}
                                    items={items.filter(item => item.active !== false)}
                                    locations={locations.filter(location => location.active !== false)}
                                    stage={stage}
                                />
                            </div>
                        </div>
                    </section>
                )}

                {draft.type === 'bar' ? (
                    <section>
                        <h2 style={sectionHeadingStyle}>Bar</h2>
                        <label htmlFor={`bar-orientation-${control.id}`} style={labelStyle}>Orientation</label>
                        <select id={`bar-orientation-${control.id}`} style={selectStyle} value={draft.barOrientation}
                            onChange={event => setDraft(current => ({ ...current, barOrientation: event.target.value as BarOrientation }))}>
                            <option value="top">Top</option>
                            <option value="bottom">Bottom</option>
                        </select>
                        <div style={{ marginTop: 15 }}>
                            <label htmlFor={`bar-content-kind-${control.id}`} style={labelStyle}>Content context (optional)</label>
                            <select id={`bar-content-kind-${control.id}`} style={selectStyle} value={draft.barContent?.kind || ''}
                                onChange={event => {
                                    const kind = event.target.value as ContentType | '';
                                    setDraft(current => ({ ...current, barContent: kind ? { kind, id: '' } : undefined }));
                                }}>
                                <option value="">None</option>
                                <option value="actor">Actor</option>
                                <option value="item">Item</option>
                                <option value="location">Location</option>
                            </select>
                            {draft.barContent && <SearchableOptionPicker stage={stage} allowClear title="Choose bar content"
                                value={draft.barContent.id || undefined}
                                options={(draft.barContent.kind === 'actor' ? actors : draft.barContent.kind === 'item' ? items : locations)
                                    .filter(entity => entity.active !== false)
                                    .map(entity => ({ key: entity.id, label: entity.name }))}
                                onChange={value => setDraft(current => ({
                                    ...current,
                                    barContent: current.barContent ? { ...current.barContent, id: typeof value === 'string' ? value : '' } : undefined,
                                }))} />}
                        </div>
                        <div style={{ marginTop: 15 }}>
                            <label style={labelStyle}>Controls</label>
                            <SearchableOptionPicker stage={stage} multiple title="Choose bar controls"
                                values={draft.barControls} options={barControlOptions}
                                onChange={value => setDraft(current => ({ ...current, barControls: Array.isArray(value) ? value : [] }))} />
                            <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                                Controls appear in selection order when available. Content-bound displays require a matching content context; global controls do not. The bar's own availability also applies.
                            </span>
                        </div>
                    </section>
                ) : draft.type === 'time' ? (
                    <section>
                        <h2 style={sectionHeadingStyle}>Time Control</h2>
                        <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                            Displays the current day or date and time or phase according to the game settings.
                        </span>
                    </section>
                ) : draft.type === 'popup' ? (
                    <section>
                        <h2 style={sectionHeadingStyle}>Pop-up</h2>
                        <div style={fieldHeadingStyle}>
                            <label htmlFor={`control-screen-${control.id}`}>Screen</label>
                            <HelpTip title="Pop-up Screen">
                                Appears over the map, calendar, or skit while its availability conditions pass.
                                Bars remain visible and usable.
                                Pop-ups animate in and out; switching pop-ups fades only their contents.
                                Only one pop-up is shown: lower priority numbers win, with configuration order breaking ties.
                                It cannot be dismissed directly; use title bar, marker, or card click actions to change the availability conditions.
                                {' The selected Screen ignores its normal availability rules, but marker controls retain theirs. Define reusable Map, List, and Grid content in Screens.'}
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
                                <option key={screen.id} value={screen.id}>{screen.name || 'Unnamed Screen'} ({SCREEN_TYPE_LABELS[screen.type]})</option>
                            ))}
                        </select>
                        <div style={{ marginTop: 15 }}>
                            <div style={fieldHeadingStyle}>
                                <label>Title Bar Controls</label>
                                <HelpTip title="Pop-up title bar controls">
                                    Buttons, Stat Displays, and Stat Editors shown beside the title, in selection order.
                                    Each control's availability conditions apply.
                                    Use a button whose actions break this pop-up's availability conditions as a close button.
                                </HelpTip>
                            </div>
                            <SearchableOptionPicker stage={stage} multiple title="Choose title bar controls"
                                values={draft.titleBarControls} options={titleBarControlOptions}
                                onChange={value => setDraft(current => ({ ...current, titleBarControls: Array.isArray(value) ? value : [] }))} />
                        </div>
                    </section>
                ) : draft.type === 'button' || isCard || isMarker ? (
                    <>
                        <section>
                            <h2 style={sectionHeadingStyle}>{isCard ? 'Card Appearance' : isMarker ? 'Marker Appearance' : 'Button'}</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div>
                                    <div style={fieldHeadingStyle}>
                                        <label>{isCard ? 'Label' : 'Label (optional)'}</label>
                                        <HelpTip title="Control label">
                                            {isCard ? '' : 'Leave empty with a Label Icon for an icon-only button; without an icon, the control name is shown instead. '}{labelHelpText}
                                        </HelpTip>
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
                                            {' With Use NamePlate enabled, the label and sub-label appear inside the NamePlate and support {{icon:star}} macros. The primary label keeps the content\'s theme color and font; an empty label uses its display name or name.'}
                                            {' Use {{content:id}}, {{content:name}}, {{content:description}}, {{content:header}}, and for Actors {{content:role}}, {{content:age}}, {{content:meta}}, {{content:summary}} or {{char:Stat Name}}.'}
                                            {' Use {{content:Stat Name}} for Card content stats and {{content:Enabled ? content:Label : "fallback"}} for conditional text. Conditions use truthiness (false, zero, and empty text are false).'}
                                            {' Function macros accept content values as arguments, e.g. {{Some Function(content:id)}} or {{Some Function(content:Stat Name)}}.'}
                                            {' Function arguments can bind "variable:actor", "variable:item", "variable:location", or "variable:header". Cards are horizontal in Lists and vertical in Grids and hovers.'}
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
                                        {draft.showPortrait && draft.contentType !== 'location' && (
                                            <div>
                                                <label htmlFor={`control-portrait-scale-${control.id}`} style={labelStyle}>Portrait size: {draft.portraitScale}%</label>
                                                <input id={`control-portrait-scale-${control.id}`} type="range" min={50} max={100} step={1}
                                                    value={draft.portraitScale} style={{ width: '100%' }}
                                                    onChange={event => setDraft(current => ({ ...current, portraitScale: Number(event.target.value) }))} />
                                                <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                                                    Percentage of the card's inner width in Grids and hovers, or inner height in Lists. Portraits keep their proportions. Location backgrounds always fill the card.
                                                </span>
                                            </div>
                                        )}
                                        <div>
                                            <label style={labelStyle}>Stat Displays and Drag and Drops</label>
                                            <SearchableOptionPicker stage={stage} multiple title="Choose card controls"
                                                values={draft.cardDetails} options={listDetailOptions(stageInstance, draft.contentType || 'actor')}
                                                onChange={value => setDraft(current => ({ ...current, cardDetails: Array.isArray(value) ? value : [] }))} />
                                            <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>Stat Displays and Drag and Drops of the same content type, or global Drag and Drops, in selection order.</span>
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
                ) : isContentBoundDisplay || isDragDrop ? (
                    <section>
                        <h2 style={sectionHeadingStyle}>{isDragDrop ? 'Drag and Drop Display' : 'Stat Display'}</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {isDragDrop ? <div>
                                <div style={fieldHeadingStyle}>
                                    <label>Content Type</label>
                                    <HelpTip title="Display content type">
                                        Global displays use global sources and can be attached to any Card or Bar. Other displays use the matching content as their context.
                                    </HelpTip>
                                </div>
                                <select
                                    style={selectStyle}
                                    value={draft.contentType || ''}
                                    onChange={(e) => setDraft((current) => ({ ...current, contentType: e.target.value ? e.target.value as ContentType : undefined, displaySource: '', onDragFunction: '', onDropFunction: '', dropValidationFunction: '' }))}
                                >
                                    <option value="">Global</option>
                                    <option value="actor">Actor</option>
                                    <option value="item">Item</option>
                                    <option value="location">Location</option>
                                </select>
                            </div> : null}
                            <div>
                                <div style={fieldHeadingStyle}>
                                    <label>Value Source</label>
                                    <HelpTip title="Display value source">
                                        {isDragDrop ? 'An Actor, Item, Location, or content list stat or function. ' : 'A stat of the chosen content type, or any function. '}
                                        {draft.contentType ? 'Matching Variable parameters can bind to the entry this display is attached to. ' : ''}
                                        Functions returning Void or String List cannot be displayed.
                                    </HelpTip>
                                </div>
                                <VariableContentContext.Provider value={draft.contentType}>
                                    <HeaderVariableContext.Provider value={!!draft.contentType}>
                                        <SearchableOptionPicker stage={stage} allowClear emptyLabel="None" title="Choose display source" bindVariableParameters
                                            value={draft.displaySource || undefined} options={displaySourceOptions}
                                            onChange={(value) => setDraft((current) => ({ ...current, displaySource: typeof value === 'string' ? value : '', ...(isDragDrop ? { onDragFunction: '', onDropFunction: '', dropValidationFunction: '' } : {}) }))} />
                                    </HeaderVariableContext.Provider>
                                </VariableContentContext.Provider>
                            </div>
                            {isDragDrop && <>
                                <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                                    Both callbacks run on drop, not at drag start. On Drop runs first, even if the incoming content is already displayed.
                                    On Drag runs when content is dropped outside its source display. Dropping back into the same display or canceling does nothing.
                                    {draft.contentType ? 'The first parameter receives the owning content; the second receives the moved content. ' : 'The first parameter matching the moved content type receives its ID. '}
                                    Other arguments keep their configured values. Mixed content lists require a separate moved-content parameter for each content type after the owner.
                                    Without On Drag, content cannot be dragged. Without On Drop, this display does not receive drops.
                                </span>
                                {(['onDragFunction', 'onDropFunction'] as const).map(behavior => <div key={behavior}>
                                    <label style={labelStyle}>{behavior === 'onDragFunction' ? 'On Drag' : 'On Drop'}</label>
                                    <SearchableOptionPicker stage={stage} allowClear emptyLabel="None"
                                        title={behavior === 'onDragFunction' ? 'Choose On Drag function' : 'Choose On Drop function'}
                                        value={draft[behavior] || undefined} options={dragDropFunctionOptions}
                                        onChange={value => setDraft(current => ({ ...current, [behavior]: typeof value === 'string' ? value : '' }))} />
                                </div>)}
                                <div>
                                    <label style={labelStyle}>Drop Validation (optional)</label>
                                    <SearchableOptionPicker stage={stage} allowClear emptyLabel="Accept compatible content"
                                        title="Choose drop validation function" disabled={!draft.onDropFunction}
                                        value={draft.dropValidationFunction || undefined}
                                        options={dragDropFunctionOptions.filter(option => stageInstance.getConfiguration().functions
                                            .find(fn => fn.id === functionReferenceId(option.key))?.returnType === 'boolean')}
                                        onChange={value => setDraft(current => ({ ...current, dropValidationFunction: typeof value === 'string' ? value : '' }))} />
                                    <span style={{ color: 'var(--agenda-text-muted)', fontSize: 12 }}>
                                        Evaluated read-only with the dragged content when dragging starts. Valid receivers are highlighted.
                                        Checked again on drop; false skips On Drop but still runs the source's On Drag.
                                        Without a validator, compatible content is accepted.
                                    </span>
                                </div>
                            </>}
                            <div>
                                <div style={fieldHeadingStyle}>
                                    <label>Label (optional)</label>
                                    <HelpTip title="Display label">
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
                                    placeholder="Description shown with this display"
                                    style={{ width: '100%', resize: 'vertical' }}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Label Icon (optional)</label>
                                <IconPicker stage={stage} value={draft.iconName || undefined} allowClear onChange={(iconName) => setDraft((current) => ({ ...current, iconName: iconName || '' }))} />
                            </div>
                            {displaySourceType === 'number' && (
                                <div>
                                    <div style={fieldHeadingStyle}>
                                        <label>Display</label>
                                        <HelpTip title="Number display">
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
                                                sourceStatFilter={candidate => sharesOptionPool(selectedStat, candidate, { sourceStats: globalStats })}
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
            </MarkerTextVariableContext.Provider>
            </HeaderVariableContext.Provider>
            </VariableContentContext.Provider>
        </GlassPanel>
    );
};
