import { CSSProperties, FC } from 'react';
import { Stage } from '../Stage';
import { ContentType } from '../content/Condition';
import { contentStatReference, createListSection, ListSection, listContentKind } from '../content/Screen';
import { functionReference, functionSignature, isStatReturnType, valuePickerOptions } from '../content/Function';
import { OutcomeEditor, OutcomeEditorContext } from './OutcomeEditor';
import { PickerOption, SearchableOptionPicker } from './SearchableOptionPicker';
import { Button, TextInput } from './UiComponents';
import { HeaderVariableContext, VariableContentContext } from './VariableContentContext';

interface ListSectionsEditorProps extends Omit<OutcomeEditorContext, 'stage'> {
    sections: ListSection[];
    onChange: (sections: ListSection[]) => void;
    stage: () => Stage;
}

const CONTENT_LABELS: Record<ContentType, string> = { actor: 'Actor', item: 'Item', location: 'Location' };

const labelStyle: CSSProperties = { display: 'block', color: 'var(--agenda-highlight)', fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' };
const helpStyle: CSSProperties = { color: 'var(--agenda-text-muted)', fontSize: 12 };

// Header sources: text values (one header) or String List functions (one header per string).
export const listHeaderSourceOptions = (stage: Stage): PickerOption[] => {
    const configuration = stage.getConfiguration();
    return [
        ...(configuration.functions || []).filter(fn => fn.returnType === 'textList').map(fn => ({
            key: functionReference(fn.id), label: functionSignature(fn), category: 'String List Functions', description: fn.description,
        })),
        ...valuePickerOptions(configuration, 'text'),
    ];
};

export const listContentSourceOptions = (stage: Stage): PickerOption[] => {
    const configuration = stage.getConfiguration();
    return [...valuePickerOptions(configuration, 'actorList'), ...valuePickerOptions(configuration, 'itemList'), ...valuePickerOptions(configuration, 'locationList')];
};

// Card details for a content kind: value functions taking a parameter of that kind, and that kind's stats.
export const listDetailOptions = (stage: Stage, kind: ContentType): PickerOption[] => {
    const configuration = stage.getConfiguration();
    const stats = kind === 'actor' ? configuration.actorStats : kind === 'location' ? configuration.locationStats : configuration.itemStats;
    return [
        ...(configuration.functions || [])
            .filter(fn => isStatReturnType(fn.returnType) && (fn.parameters || []).some(parameter => parameter.type === kind))
            .map(fn => ({ key: functionReference(fn.id), label: functionSignature(fn), category: 'Functions', description: fn.description })),
        ...(stats || []).map(stat => ({ key: contentStatReference(kind, stat.id), label: stat.name, category: `${CONTENT_LABELS[kind]} Stats`, description: stat.guidance })),
    ];
};

export const ListSectionsEditor: FC<ListSectionsEditorProps> = ({ sections, onChange, stage, ...outcomeContext }) => {
    const stageInstance = stage();
    const configuration = stageInstance.getConfiguration();
    const headerOptions = listHeaderSourceOptions(stageInstance);
    const contentOptions = listContentSourceOptions(stageInstance);
    const update = (id: string, patch: Partial<ListSection>) => onChange(sections.map(section => section.id === id ? { ...section, ...patch } : section));
    const move = (index: number, offset: number) => {
        const next = [...sections];
        const [section] = next.splice(index, 1);
        next.splice(index + offset, 0, section);
        onChange(next);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            {sections.length === 0 && <span style={helpStyle}>No headers yet. Add a header to list content on this Screen.</span>}
            {sections.map((section, index) => {
                const kind = listContentKind(configuration, section.contentSource);
                return (
                    <div key={section.id} data-popup-section={section.id}
                        style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, borderRadius: 10, border: '1px solid var(--agenda-line-subtle)', background: 'var(--agenda-surface-raised)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong style={{ flex: 1, color: 'var(--agenda-text-primary)' }}>Header {index + 1}</strong>
                            <Button variant="secondary" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move header ${index + 1} up`}>↑</Button>
                            <Button variant="secondary" disabled={index === sections.length - 1} onClick={() => move(index, 1)} aria-label={`Move header ${index + 1} down`}>↓</Button>
                            <Button variant="secondary" onClick={() => onChange(sections.filter(candidate => candidate.id !== section.id))} aria-label={`Delete header ${index + 1}`}>Delete</Button>
                        </div>
                        <div>
                            <label style={labelStyle}>Header Text</label>
                            {section.headerSource ? (
                                <span style={helpStyle}>Headers come from the selected source below.</span>
                            ) : (
                                <TextInput fullWidth value={section.header} placeholder="e.g. Friends"
                                    onChange={event => update(section.id, { header: event.target.value })} />
                            )}
                        </div>
                        <div>
                            <label style={labelStyle}>Header Source (optional)</label>
                            <SearchableOptionPicker stage={stage} allowClear emptyLabel="Use header text" title="Choose header source"
                                value={section.headerSource || undefined} options={headerOptions}
                                onChange={value => update(section.id, { headerSource: typeof value === 'string' ? value : '' })} />
                            <span style={helpStyle}>A String List function creates one header per string; a text value creates a single header.</span>
                        </div>
                        <div>
                            <label style={labelStyle}>Contents</label>
                            <HeaderVariableContext.Provider value={true}>
                                <SearchableOptionPicker stage={stage} allowClear emptyLabel="None" title="Choose header contents" bindVariableParameters
                                    value={section.contentSource || undefined} options={contentOptions}
                                    onChange={value => {
                                        const contentSource = typeof value === 'string' ? value : '';
                                        const sameKind = listContentKind(configuration, contentSource) === kind;
                                        update(section.id, { contentSource, details: sameKind ? section.details : [] });
                                    }} />
                            </HeaderVariableContext.Provider>
                            <span style={helpStyle}>An Actor, Item, or Location list. Text parameters can use the header. Headers without contents are hidden.</span>
                        </div>
                        {kind ? (
                            <VariableContentContext.Provider value={kind}>
                                <HeaderVariableContext.Provider value={true}>
                                    <div>
                                        <label style={labelStyle}>Card Details</label>
                                        <SearchableOptionPicker stage={stage} multiple bindVariableParameters title="Choose card details"
                                            values={section.details} options={listDetailOptions(stageInstance, kind)}
                                            onChange={value => update(section.id, { details: Array.isArray(value) ? value : [] })} />
                                        <span style={helpStyle}>{`Shown at each card's right end: ${CONTENT_LABELS[kind]} stats, or functions taking ${kind === 'actor' ? 'an' : 'a'} ${CONTENT_LABELS[kind]} parameter (Variable is the card's ${kind}).`}</span>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Card Click Actions</label>
                                        <OutcomeEditor actions={section.actions} onChange={actions => update(section.id, { actions })} stage={stage} {...outcomeContext} />
                                        <span style={helpStyle}>{`Fired when a card is clicked; Variable refers to the clicked ${kind} and Header to its page header. Cards without actions are not clickable.`}</span>
                                    </div>
                                </HeaderVariableContext.Provider>
                            </VariableContentContext.Provider>
                        ) : (
                            <span style={helpStyle}>Choose contents to configure card details and click actions.</span>
                        )}
                    </div>
                );
            })}
            <div>
                <Button variant="secondary" onClick={() => onChange([...sections, createListSection()])}>Add Header</Button>
            </div>
        </div>
    );
};
