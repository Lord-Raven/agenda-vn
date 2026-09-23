import React, { FC } from 'react';
import { v4 as generateUuid } from 'uuid';
import { Add, KeyboardArrowUp, KeyboardArrowDown } from '@mui/icons-material';
import { Stage } from '../Stage';
import {
    Stat, StatDisplayType, StatValue, StatValueRule,
    findStatOptionByValue, getStatOptionValue, isFunctionStatType, isNumericDisplayType,
    isReferenceDisplayType, isReferenceListDisplayType, normalizeReferenceListValue,
} from '../content/Stat';
import { Button, ColorPickerInput, TextArea, TextInput } from './UiComponents';
import { IconPicker } from './StatRating';
import { ConditionEditor } from './ConditionEditor';
import { ConditionalFlagEditor } from './ConditionalFlagEditor';
import { StatFunctionEditor } from './StatFunctionEditor';
import { StatValueInput } from './StatValueInput';
import { ActorLike } from './UiComponents';
import { ItemLike } from './ItemPortrait';
import { LocationLike } from './LocationPortrait';

export type StatEntryCategory = 'global' | 'actor' | 'location' | 'item';

export const resolveStatDefaultValue = (stat: Stat): StatValue => {
    if (stat.type === 'option') {
        const defaultOption = findStatOptionByValue(stat, stat.default);
        return defaultOption?.value || (stat.options?.[0] ? getStatOptionValue(stat.options[0], 0) : '');
    }

    if (isReferenceListDisplayType(stat.type)) {
        return normalizeReferenceListValue(stat.default);
    }

    if (stat.type === 'text' || isReferenceDisplayType(stat.type)) {
        return typeof stat.default === 'string' ? stat.default : '';
    }

    if (stat.type === 'checkbox') {
        return typeof stat.default === 'boolean' ? stat.default : false;
    }

    return Number.isFinite(stat.default) ? Number(stat.default) : 0;
};

// Shape-normalizes a stat after a type change (or on render) so fields irrelevant to the current type are
// cleared/defaulted consistently, regardless of whether the stat is a global/actor/location/item stat.
export const normalizeStatShape = (stat: Stat): Stat => {
    if (isFunctionStatType(stat.type)) {
        return {
            ...stat,
            default: '',
            options: [],
            min: undefined,
            max: undefined,
            displayType: undefined,
            perActor: false,
            perActorDefaultRules: [],
            defaultValueRules: [],
            script: stat.script || '',
            // A function stat has no value of its own, so it can't be exposed in UI or sent to/maintained by the LLM.
            exposed: { value: false, conditions: [] },
            llmSees: { value: false, conditions: [] },
            llmMaintained: { value: false, conditions: [] },
        };
    }

    if (stat.type === 'option') {
        const options = (stat.options || [])
            .filter(option => option.name.trim())
            .map((option, optionIndex) => ({ ...option, id: getStatOptionValue(option, optionIndex) }));
        const defaultValue = findStatOptionByValue({ ...stat, options }, stat.default)?.value || (options[0] ? getStatOptionValue(options[0], 0) : '');
        return {
            ...stat,
            options,
            default: defaultValue,
            min: undefined,
            max: undefined,
            displayType: undefined,
            iconName: stat.iconName || 'star',
        };
    }

    if (isReferenceListDisplayType(stat.type)) {
        return {
            ...stat,
            default: normalizeReferenceListValue(stat.default),
            options: [],
            min: undefined,
            max: undefined,
            displayType: undefined,
            iconName: stat.iconName || 'star',
        };
    }

    if (stat.type === 'text' || isReferenceDisplayType(stat.type)) {
        return {
            ...stat,
            default: typeof stat.default === 'string' ? stat.default : '',
            options: [],
            min: undefined,
            max: undefined,
            displayType: undefined,
            iconName: stat.iconName || 'star',
        };
    }

    if (stat.type === 'checkbox') {
        return {
            ...stat,
            default: typeof stat.default === 'boolean' ? stat.default : false,
            options: [],
            min: undefined,
            max: undefined,
            displayType: undefined,
            iconName: stat.iconName || 'star',
        };
    }

    return {
        ...stat,
        default: Number.isFinite(stat.default) ? Number(stat.default) : 0,
        options: [],
        displayType: stat.type === 'number' ? (stat.displayType || 'straight') : undefined,
        iconName: stat.iconName || 'star',
    };
};

export const canBeVisibleInUi = (stat: Stat): boolean => stat.exposed.value === true || stat.exposed.conditions.length > 0;

export const renderStatTypeOptions = () => (
    <>
        <option value="actor">Actor</option>
        <option value="actorList">Actor List</option>
        <option value="checkbox">Checkbox</option>
        <option value="function">Function</option>
        <option value="item">Item</option>
        <option value="itemList">Item List</option>
        <option value="location">Location</option>
        <option value="locationList">Location List</option>
        <option value="number">Number</option>
        <option value="option">Option</option>
        <option value="text">Text</option>
    </>
);

interface ValueRulesConfig {
    fieldKey: 'defaultValueRules' | 'perActorDefaultRules';
    title: string;
    description: string;
    visible: boolean;
}

interface StatEntryEditorProps {
    stat: Stat;
    index: number;
    total: number;
    typeLabel: string;
    category: StatEntryCategory;
    collapsed: boolean;
    onToggleCollapse: () => void;
    onMove: (direction: -1 | 1) => void;
    onRemove: () => void;
    onPatch: (patch: Partial<Stat>) => void;
    onNameChange?: (name: string) => void;
    selfStats: Stat[];
    globalStats: Stat[];
    actorStats: Stat[];
    conditionActors: ActorLike[];
    valueActors: ActorLike[];
    items: ItemLike[];
    locations: LocationLike[];
    stage: () => Stage;
    scriptLabel?: string;
    scriptDescription?: string;
    fieldLabelStyle: React.CSSProperties;
    inlineFieldStyle: React.CSSProperties;
    inlineFieldTopStyle: React.CSSProperties;
    compactChipLabelStyle: React.CSSProperties;
}

// Single stat editor card shared by the Global/Actor/Location/Item stat sections of StatManagementPanel.
// Most fields behave identically across categories; the handful of differences (setByPlayer, perActor,
// default-value rules, description/guidance visibility, allowed condition targets) are driven by `category`.
export const StatEntryEditor: FC<StatEntryEditorProps> = ({
    stat, index, total, typeLabel, category,
    collapsed, onToggleCollapse, onMove, onRemove, onPatch, onNameChange,
    selfStats, globalStats, actorStats, conditionActors, valueActors, items, locations, stage,
    scriptLabel, scriptDescription,
    fieldLabelStyle, inlineFieldStyle, inlineFieldTopStyle, compactChipLabelStyle,
}) => {
    const normalizedStat = normalizeStatShape(stat);
    const optionEntries = normalizedStat.options || [];
    const allowVariableActorTarget = category === 'actor';
    const isFunctionType = normalizedStat.type === 'function';
    const conditionStats = category === 'global' ? [...selfStats, ...actorStats] : [...selfStats, ...globalStats];

    const descriptionVisible = category === 'global'
        ? (stat.exposed.value === true || stat.setByPlayer === true)
        : stat.exposed.value === true;

    const guidanceVisible = category === 'actor'
        ? (stat.llmSees.value === true || stat.llmSees.conditions.length > 0)
        : true;

    const valueRulesConfig: ValueRulesConfig | undefined = category === 'global'
        ? {
            fieldKey: 'defaultValueRules',
            title: 'Default Value Rules',
            description: "Evaluated in order when a new game starts. The first matching rule wins and seeds this stat's starting value; falls back to the Default above if none match.",
            visible: normalizedStat.type !== 'function',
        }
        : category === 'actor'
            ? {
                fieldKey: 'perActorDefaultRules',
                title: 'Default Value Rules',
                description: "Evaluated in order for the target actor being considered (use \"Variable\" actor targets to inspect the target's own stats). The first matching rule wins; falls back to Default above if none match. An actor's own rules (configured on its detail page) take precedence over these.",
                visible: stat.perActor === true,
            }
            : undefined;

    const updateOption = (optionIndex: number, patch: { name?: string; description?: string }) => {
        const currentOptions = [...(stat.options || [])];
        const currentOption = currentOptions[optionIndex] || { id: generateUuid(), name: '', description: '' };
        currentOptions[optionIndex] = { ...currentOption, id: getStatOptionValue(currentOption, optionIndex), ...patch };
        onPatch({ options: currentOptions });
    };

    const removeOption = (optionIndex: number) => {
        const options = (stat.options || []).filter((_, idx) => idx !== optionIndex);
        const defaultValue = findStatOptionByValue({ ...stat, options }, stat.default)?.value || (options[0] ? getStatOptionValue(options[0], 0) : '');
        onPatch({ options, default: defaultValue });
    };

    const addOption = () => {
        const options = [...(stat.options || [])];
        const nextLabel = `Option ${options.length + 1}`;
        options.push({ id: generateUuid(), name: nextLabel, description: '' });
        onPatch({
            options,
            default: typeof stat.default === 'string' && stat.default.trim() ? stat.default : getStatOptionValue(options[options.length - 1], options.length - 1),
        });
    };

    const addValueRule = () => {
        if (!valueRulesConfig) return;
        const rule: StatValueRule = { id: generateUuid(), value: resolveStatDefaultValue(stat), conditions: [] };
        onPatch({ [valueRulesConfig.fieldKey]: [...(stat[valueRulesConfig.fieldKey] || []), rule] } as Partial<Stat>);
    };

    const removeValueRule = (ruleId: string) => {
        if (!valueRulesConfig) return;
        onPatch({ [valueRulesConfig.fieldKey]: (stat[valueRulesConfig.fieldKey] || []).filter(rule => rule.id !== ruleId) } as Partial<Stat>);
    };

    const updateValueRule = (ruleId: string, patch: Partial<StatValueRule>) => {
        if (!valueRulesConfig) return;
        onPatch({
            [valueRulesConfig.fieldKey]: (stat[valueRulesConfig.fieldKey] || []).map(rule => rule.id === ruleId ? { ...rule, ...patch } : rule),
        } as Partial<Stat>);
    };

    const renderIconPicker = (value: string | undefined, onChange: (iconName: string | undefined) => void, allowClear = false) => (
        <IconPicker value={value} onChange={onChange} allowClear={allowClear} />
    );

    const renderValueInput = (value: StatValue, onChange: (value: StatValue) => void) => (
        <StatValueInput stat={stat} value={value} onChange={onChange} actors={valueActors} items={items} locations={locations} stage={stage} />
    );

    return (
        <div style={{ border: '1px solid var(--agenda-line-subtle)', borderRadius: 8, padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontWeight: 700, color: 'var(--agenda-text-primary)' }}>
                    {stat.name?.trim() || `${typeLabel} ${index + 1}`}
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <Button variant="secondary" disabled={index === 0} onClick={() => onMove(-1)} style={{ padding: '4px 8px', minWidth: 0 }}>
                        <KeyboardArrowUp fontSize="small" />
                    </Button>
                    <Button variant="secondary" disabled={index === total - 1} onClick={() => onMove(1)} style={{ padding: '4px 8px', minWidth: 0 }}>
                        <KeyboardArrowDown fontSize="small" />
                    </Button>
                    <Button variant="secondary" onClick={onToggleCollapse}>
                        {collapsed ? 'Expand' : 'Collapse'}
                    </Button>
                </div>
            </div>

            {!collapsed && (
                <>
                    <div style={{ marginTop: 10 }}>
                        <div style={inlineFieldStyle}>
                            <label style={fieldLabelStyle}>Name</label>
                            <TextInput
                                fullWidth
                                value={stat.name}
                                onChange={(e) => (onNameChange ? onNameChange(e.target.value) : onPatch({ name: e.target.value }))}
                                placeholder={category === 'global' ? 'Setting name' : 'Stat name'}
                            />
                        </div>

                        <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                            <label style={fieldLabelStyle}>Type</label>
                            <select
                                className="input-base"
                                value={normalizedStat.type}
                                onChange={(e) => onPatch(normalizeStatShape({ ...stat, type: e.target.value as Stat['type'] }))}
                            >
                                {renderStatTypeOptions()}
                            </select>
                        </div>

                        {isFunctionType && (
                            <StatFunctionEditor
                                script={normalizedStat.script || ''}
                                onScriptChange={(script) => onPatch({ script })}
                                scriptLabel={scriptLabel}
                                scriptDescription={scriptDescription}
                            />
                        )}

                        {!isFunctionType && (
                        <>
                        <ConditionalFlagEditor
                            label="Visible In UI"
                            enabledLabel="Exposed"
                            disabledLabel="Hidden"
                            flag={stat.exposed}
                            onChange={(exposed) => onPatch({ exposed })}
                            globalStats={conditionStats}
                            actorStats={actorStats}
                            actors={conditionActors}
                            items={items}
                            locations={locations}
                            allowVariableActorTarget={allowVariableActorTarget}
                            fieldLabelStyle={fieldLabelStyle}
                            inlineFieldStyle={inlineFieldStyle}
                        />

                        {category === 'global' && (
                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                <label style={fieldLabelStyle}>Editable In Settings</label>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                                    <input
                                        type="checkbox"
                                        checked={stat.setByPlayer === true}
                                        onChange={(e) => onPatch({ setByPlayer: e.target.checked })}
                                    />
                                    Set by Player
                                </label>
                            </div>
                        )}

                        {category === 'actor' && (
                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                <label style={fieldLabelStyle}>Per Actor</label>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                                    <input
                                        type="checkbox"
                                        checked={stat.perActor === true}
                                        onChange={(e) => onPatch({ perActor: e.target.checked })}
                                    />
                                    Maps other actors to distinct values
                                </label>
                            </div>
                        )}

                        <ConditionalFlagEditor
                            label="Send to LLM"
                            enabledLabel="Included in LLM context"
                            disabledLabel="Omitted from LLM context"
                            flag={stat.llmSees}
                            onChange={(llmSees) => onPatch({ llmSees })}
                            globalStats={conditionStats}
                            actorStats={actorStats}
                            actors={conditionActors}
                            items={items}
                            locations={locations}
                            allowVariableActorTarget={allowVariableActorTarget}
                            fieldLabelStyle={fieldLabelStyle}
                            inlineFieldStyle={inlineFieldStyle}
                        />

                        {(stat.llmSees.value === true || stat.llmSees.conditions.length > 0) && (
                            <ConditionalFlagEditor
                                label="Generatively Maintained"
                                enabledLabel="LLM may update this stat via outcomes"
                                disabledLabel="LLM may not update this stat"
                                flag={stat.llmMaintained}
                                onChange={(llmMaintained) => onPatch({ llmMaintained })}
                                globalStats={conditionStats}
                                actorStats={actorStats}
                                actors={conditionActors}
                                items={items}
                                locations={locations}
                                allowVariableActorTarget={allowVariableActorTarget}
                                fieldLabelStyle={fieldLabelStyle}
                                inlineFieldStyle={inlineFieldStyle}
                            />
                        )}

                        {descriptionVisible && (
                            <div style={inlineFieldTopStyle}>
                                <label style={fieldLabelStyle}>Description</label>
                                <TextArea
                                    value={stat.description}
                                    onChange={(e) => onPatch({ description: e.target.value })}
                                    rows={2}
                                    placeholder={category === 'global' ? undefined : 'Describe what this stat represents.'}
                                    style={{ width: '100%', resize: 'vertical' }}
                                />
                            </div>
                        )}

                        {guidanceVisible && (
                            <div style={inlineFieldTopStyle}>
                                <label style={fieldLabelStyle}>Guidance</label>
                                <TextArea
                                    value={stat.guidance}
                                    onChange={(e) => onPatch({ guidance: e.target.value })}
                                    rows={2}
                                    placeholder={category === 'global' ? undefined : 'Guidance for using this stat in generated narrative.'}
                                    style={{ width: '100%', resize: 'vertical' }}
                                />
                            </div>
                        )}
                        </>
                        )}

                        {normalizedStat.type === 'number' && (
                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                <label style={fieldLabelStyle}>Display</label>
                                <select
                                    className="input-base"
                                    value={normalizedStat.displayType || 'straight'}
                                    onChange={(e) => {
                                        const nextDisplayType = e.target.value as StatDisplayType;
                                        onPatch({
                                            displayType: nextDisplayType,
                                            iconName: nextDisplayType === 'rating' ? (stat.iconName || 'star') : stat.iconName,
                                        });
                                    }}
                                >
                                    <option value="straight">Straight Number</option>
                                    <option value="percentage">Percentage</option>
                                    <option value="bar">Bar</option>
                                    <option value="rating">Rating</option>
                                    <option value="letter grade">Letter Grade</option>
                                </select>
                            </div>
                        )}

                        {normalizedStat.type === 'number' && (
                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                <label style={fieldLabelStyle}>Display Color</label>
                                <ColorPickerInput
                                    value={normalizedStat.displayColor || ''}
                                    onChange={(displayColor) => onPatch({ displayColor })}
                                    popoverTitle="Choose Display Color"
                                    inputStyle={{ width: '100%' }}
                                />
                            </div>
                        )}

                        {normalizedStat.type === 'option' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: 10 }}>
                                <div style={{ ...inlineFieldStyle, marginBottom: 4 }}>
                                    <label style={fieldLabelStyle}>Default Option</label>
                                    <select
                                        className="input-base"
                                        value={typeof normalizedStat.default === 'string' ? normalizedStat.default : ''}
                                        onChange={(e) => onPatch({ default: e.target.value })}
                                    >
                                        {optionEntries.map((option, idx) => (
                                            <option key={getStatOptionValue(option, idx)} value={getStatOptionValue(option, idx)}>
                                                {option.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {optionEntries.map((option, optionIndex) => (
                                    <div key={`option-${optionIndex}`} style={{ border: '1px solid var(--agenda-line-subtle)', borderRadius: 8, padding: 8 }}>
                                        <div style={inlineFieldStyle}>
                                            <label style={fieldLabelStyle}>Option Name</label>
                                            <TextInput
                                                fullWidth
                                                value={option.name}
                                                onChange={(e) => updateOption(optionIndex, { name: e.target.value })}
                                                placeholder="Option name"
                                            />
                                        </div>
                                        {descriptionVisible && (
                                            <div style={{ ...inlineFieldTopStyle, marginBottom: 0 }}>
                                                <label style={fieldLabelStyle}>Option Description</label>
                                                <TextArea
                                                    value={option.description}
                                                    onChange={(e) => updateOption(optionIndex, { description: e.target.value })}
                                                    rows={2}
                                                    style={{ width: '100%', resize: 'vertical' }}
                                                />
                                            </div>
                                        )}
                                        <div style={{ marginTop: 8 }}>
                                            <Button variant="danger" onClick={() => removeOption(optionIndex)}>
                                                Remove Option
                                            </Button>
                                        </div>
                                    </div>
                                ))}

                                <Button variant="secondary" onClick={addOption}>
                                    Add Option
                                </Button>
                            </div>
                        )}

                        {normalizedStat.type === 'text' && (
                            <div style={{ ...inlineFieldTopStyle, marginBottom: 10 }}>
                                <label style={fieldLabelStyle}>Default Value</label>
                                <TextArea
                                    value={typeof normalizedStat.default === 'string' ? normalizedStat.default : ''}
                                    onChange={(e) => onPatch({ default: e.target.value })}
                                    rows={2}
                                    style={{ width: '100%', resize: 'vertical' }}
                                />
                            </div>
                        )}

                        {isReferenceDisplayType(normalizedStat.type) && (
                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                <label style={fieldLabelStyle}>Default Reference</label>
                                {renderValueInput(normalizedStat.default, (defaultValue) => onPatch({ default: defaultValue }))}
                            </div>
                        )}

                        {isReferenceListDisplayType(normalizedStat.type) && (
                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                <label style={fieldLabelStyle}>Default References</label>
                                {renderValueInput(normalizedStat.default, (defaultValue) => onPatch({ default: defaultValue }))}
                            </div>
                        )}

                        {normalizedStat.type === 'checkbox' && (
                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                <label style={fieldLabelStyle}>Default Value</label>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--agenda-text-primary)' }}>
                                    <input
                                        type="checkbox"
                                        checked={normalizedStat.default === true}
                                        onChange={(e) => onPatch({ default: e.target.checked })}
                                    />
                                    Checked
                                </label>
                            </div>
                        )}

                        {normalizedStat.type === 'number' && normalizedStat.displayType === 'rating' && (
                            <div style={{ ...inlineFieldTopStyle, marginBottom: 10 }}>
                                <label style={fieldLabelStyle}>Rating Icon</label>
                                {renderIconPicker(normalizedStat.iconName, (iconName) => onPatch({ iconName }))}
                            </div>
                        )}

                        {canBeVisibleInUi(stat) && (
                            <div style={{ ...inlineFieldTopStyle, marginBottom: 10 }}>
                                <label style={fieldLabelStyle}>Label Icon</label>
                                {renderIconPicker(stat.labelIconName, (iconName) => onPatch({ labelIconName: iconName || undefined }), true)}
                            </div>
                        )}

                        {isNumericDisplayType(normalizedStat.type) && (
                            <div style={{ ...inlineFieldTopStyle, marginBottom: 0 }}>
                                <label style={fieldLabelStyle}>Properties</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                                    <div>
                                        <div style={compactChipLabelStyle}>Default</div>
                                        <TextInput
                                            fullWidth
                                            type="number"
                                            value={String(Number.isFinite(normalizedStat.default) ? Number(normalizedStat.default) : 0)}
                                            onChange={(e) => onPatch({ default: Number(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div>
                                        <div style={compactChipLabelStyle}>Min</div>
                                        <TextInput
                                            fullWidth
                                            type="number"
                                            value={typeof normalizedStat.min === 'number' ? String(normalizedStat.min) : ''}
                                            onChange={(e) => onPatch({ min: e.target.value === '' ? undefined : Number(e.target.value) })}
                                        />
                                    </div>
                                    <div>
                                        <div style={compactChipLabelStyle}>Max</div>
                                        <TextInput
                                            fullWidth
                                            type="number"
                                            value={typeof normalizedStat.max === 'number' ? String(normalizedStat.max) : ''}
                                            onChange={(e) => onPatch({ max: e.target.value === '' ? undefined : Number(e.target.value) })}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {valueRulesConfig && normalizedStat.type !== 'function' && valueRulesConfig.visible && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 10 }}>
                            <label style={fieldLabelStyle}>{valueRulesConfig.title}</label>
                            <span style={{ color: 'var(--agenda-text-muted)', fontSize: '11px' }}>
                                {valueRulesConfig.description}
                            </span>
                            {(stat[valueRulesConfig.fieldKey] || []).length === 0 && (
                                <span style={{ color: 'var(--agenda-text-muted)', fontSize: '11px' }}>
                                    No rules. The Default value above is used for every {category === 'global' ? 'new game' : 'target'}.
                                </span>
                            )}
                            {(stat[valueRulesConfig.fieldKey] || []).map((rule) => (
                                <div
                                    key={rule.id}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px',
                                        padding: '8px',
                                        border: '1px solid var(--agenda-line-subtle)',
                                        borderRadius: 6,
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: 'var(--agenda-text-primary)', fontSize: '12px' }}>Value</span>
                                        {renderValueInput(rule.value, (value) => updateValueRule(rule.id, { value }))}
                                        <Button
                                            variant="danger"
                                            onClick={() => removeValueRule(rule.id)}
                                            style={{ marginLeft: 'auto' }}
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                    <ConditionEditor
                                        conditionCollections={rule.conditions}
                                        globalStats={conditionStats}
                                        actorStats={actorStats}
                                        actors={conditionActors}
                                        items={items}
                                        locations={locations}
                                        allowVariableActorTarget={allowVariableActorTarget}
                                        onChange={(conditions) => updateValueRule(rule.id, { conditions })}
                                    />
                                    {rule.conditions.length === 0 && (
                                        <span style={{ color: 'var(--agenda-text-muted)', fontSize: '11px' }}>
                                            Always matches (should typically be the last rule).
                                        </span>
                                    )}
                                </div>
                            ))}
                            <Button
                                variant="secondary"
                                onClick={addValueRule}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifySelf: 'start' }}
                            >
                                <Add fontSize="small" /> Add rule
                            </Button>
                        </div>
                    )}

                    <div style={{ marginTop: 10 }}>
                        <Button variant="danger" onClick={onRemove}>Remove {typeLabel}</Button>
                    </div>
                </>
            )}
        </div>
    );
};
