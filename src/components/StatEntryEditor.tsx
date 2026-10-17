import React, { FC } from 'react';
import { v4 as generateUuid } from 'uuid';
import { Add, KeyboardArrowUp, KeyboardArrowDown } from '@mui/icons-material';
import { Stage } from '../Stage';
import {
    Stat, StatValue, StatValueRule,
    findStatOptionByValue, getStatOptionValue, isNumericDisplayType, isOptionListStatType,
    isReferenceDisplayType, isReferenceListDisplayType, isSourcedOptionStat, normalizeReferenceListValue,
    resolveStatDefault,
} from '../content/Stat';
import { Button, TextArea, TextInput } from './UiComponents';
import { ConditionEditor } from './ConditionEditor';
import { ConditionalFlagEditor } from './ConditionalFlagEditor';
import { StatValueInput } from './StatValueInput';
import { isFunctionReference } from '../content/Function';
import { ActorLike } from './UiComponents';
import { ItemLike } from './ItemPortrait';
import { LocationLike } from './LocationPortrait';

export type StatEntryCategory = 'global' | 'actor' | 'location' | 'item';

export const resolveStatDefaultValue = (stat: Stat): StatValue => resolveStatDefault(stat);

// Shape-normalizes a stat after a type change (or on render) so fields irrelevant to the current type are
// cleared/defaulted consistently, regardless of whether the stat is a global/actor/location/item stat.
export const normalizeStatShape = (stat: Stat): Stat => {
    const normalized = normalizeStatShapeForType(stat);
    if (isFunctionReference(stat.default)) {
        normalized.default = stat.default;
    }
    return normalized.type === 'option' ? normalized : { ...normalized, optionSourceStatId: undefined };
};

const normalizeStatShapeForType = (stat: Stat): Stat => {
    if (stat.type === 'option' && isSourcedOptionStat(stat)) {
        // Options come from the source list; the stat's own options are kept in case the source is cleared.
        return {
            ...stat,
            default: typeof stat.default === 'string' ? stat.default : '',
            min: undefined,
            max: undefined,
        };
    }

    if (stat.type === 'option' || isOptionListStatType(stat.type)) {
        const options = (stat.options || [])
            .filter(option => option.name.trim())
            .map((option, optionIndex) => ({ ...option, id: getStatOptionValue(option, optionIndex) }));
        if (isOptionListStatType(stat.type)) {
            const optionIds = new Set(options.map(option => option.id));
            return {
                ...stat,
                options,
                default: Array.isArray(stat.default)
                    ? normalizeReferenceListValue(stat.default).filter(id => isFunctionReference(id) || optionIds.has(id))
                    : options.map(option => option.id),
                min: undefined,
                max: undefined,
                perActor: false,
                perActorDefaultRules: [],
            };
        }
        const defaultValue = findStatOptionByValue({ ...stat, options }, stat.default)?.value || (options[0] ? getStatOptionValue(options[0], 0) : '');
        return {
            ...stat,
            options,
            default: defaultValue,
            min: undefined,
            max: undefined,
        };
    }

    if (isReferenceListDisplayType(stat.type)) {
        return {
            ...stat,
            default: normalizeReferenceListValue(stat.default),
            options: [],
            min: undefined,
            max: undefined,
        };
    }

    if (stat.type === 'text' || isReferenceDisplayType(stat.type)) {
        return {
            ...stat,
            default: typeof stat.default === 'string' ? stat.default : '',
            options: [],
            min: undefined,
            max: undefined,
        };
    }

    if (stat.type === 'checkbox') {
        return {
            ...stat,
            default: typeof stat.default === 'boolean' ? stat.default : false,
            options: [],
            min: undefined,
            max: undefined,
        };
    }

    return {
        ...stat,
        default: Number.isFinite(stat.default) ? Number(stat.default) : 0,
        options: [],
    };
};

export const renderStatTypeOptions = () => (
    <>
        <option value="actor">Actor</option>
        <option value="actorList">Actor List</option>
        <option value="checkbox">Checkbox</option>
        <option value="item">Item</option>
        <option value="itemList">Item List</option>
        <option value="location">Location</option>
        <option value="locationList">Location List</option>
        <option value="number">Number</option>
        <option value="option">Option</option>
        <option value="optionList">Option List</option>
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
    fieldLabelStyle: React.CSSProperties;
    inlineFieldStyle: React.CSSProperties;
    inlineFieldTopStyle: React.CSSProperties;
    compactChipLabelStyle: React.CSSProperties;
}

// Single stat editor card shared by the Global/Actor/Location/Item stat sections of StatManagementPanel.
// Most fields behave identically across categories; the handful of differences (perActor,
// default-value rules, description/guidance visibility, allowed condition targets) are driven by `category`.
export const StatEntryEditor: FC<StatEntryEditorProps> = ({
    stat, index, total, typeLabel, category,
    collapsed, onToggleCollapse, onMove, onRemove, onPatch, onNameChange,
    selfStats, globalStats, actorStats, conditionActors, valueActors, items, locations, stage,
    fieldLabelStyle, inlineFieldStyle, inlineFieldTopStyle, compactChipLabelStyle,
}) => {
    const normalizedStat = normalizeStatShape(stat);
    // Raw (unfiltered) options, so blank-named rows stay visible and indices match updateOption/removeOption.
    const editableOptionEntries = stat.options || [];
    const isSourcedOption = isSourcedOptionStat(normalizedStat);
    // Global lists, plus (for entity stats) lists on the same entity, whose active options are that entity's own.
    const optionListSources = [...globalStats, ...(category === 'global' ? [] : selfStats)]
        .filter(candidate => isOptionListStatType(candidate.type) && candidate.id !== stat.id);
    const variableContentType = category === 'actor' ? 'actor' : undefined;
    const conditionStats = category === 'global' ? [...selfStats, ...actorStats] : [...selfStats, ...globalStats];

    const guidanceVisible = stat.llmSees.value === true || stat.llmSees.conditions.length > 0;

    const valueRulesConfig: ValueRulesConfig | undefined = category === 'global'
        ? {
            fieldKey: 'defaultValueRules',
            title: 'Default Value Rules',
            description: "Evaluated in order when a new game starts. The first matching rule wins and seeds this stat's starting value. The final Default Value rule is used if no earlier rule matches.",
            visible: true,
        }
        : category === 'actor'
            ? {
                fieldKey: 'perActorDefaultRules',
                title: 'Default Value Rules',
                description: "Evaluated in order for the target actor being considered (use \"Variable\" actor targets to inspect the target's own stats). The first matching rule wins. The final Default Value rule is used if no earlier rule matches. An actor's own rules (configured on its detail page) take precedence over these.",
                visible: stat.perActor === true,
            }
            : undefined;
    const defaultRuleId = valueRulesConfig ? `default:${stat.id}` : undefined;
    const configuredValueRules = valueRulesConfig?.visible ? stat[valueRulesConfig.fieldKey] || [] : [];
    const storedDefaultRule = defaultRuleId
        ? configuredValueRules.find(rule => rule.id === defaultRuleId)
        : undefined;
    const defaultRule: StatValueRule | undefined = defaultRuleId
        ? { ...storedDefaultRule, id: defaultRuleId, value: normalizedStat.default, conditions: [] }
        : undefined;
    const valueRules = defaultRule
        ? storedDefaultRule
            ? configuredValueRules.map(rule => rule.id === defaultRuleId ? defaultRule : rule)
            : [...configuredValueRules, defaultRule]
        : [];

    const patchStat = (patch: Partial<Stat>) => {
        const defaultValue = patch.default;
        if (!valueRulesConfig?.visible || defaultValue === undefined) {
            onPatch(patch);
            return;
        }
        onPatch({
            ...patch,
            [valueRulesConfig.fieldKey]: valueRules.map(rule => rule.id === defaultRuleId
                ? { ...rule, value: defaultValue }
                : rule),
        } as Partial<Stat>);
    };

    const updateOption = (optionIndex: number, patch: { name?: string; description?: string }) => {
        const currentOptions = [...(stat.options || [])];
        const currentOption = currentOptions[optionIndex] || { id: generateUuid(), name: '', description: '' };
        currentOptions[optionIndex] = { ...currentOption, id: getStatOptionValue(currentOption, optionIndex), ...patch };
        onPatch({ options: currentOptions });
    };

    const removeOption = (optionIndex: number) => {
        const options = (stat.options || []).filter((_, idx) => idx !== optionIndex);
        if (isOptionListStatType(stat.type) || isFunctionReference(stat.default)) {
            onPatch({ options });
            return;
        }
        const defaultValue = findStatOptionByValue({ ...stat, options }, stat.default)?.value || (options[0] ? getStatOptionValue(options[0], 0) : '');
        patchStat({ options, default: defaultValue });
    };

    const addOption = () => {
        const options = [...(stat.options || [])];
        const nextLabel = `Option ${options.length + 1}`;
        options.push({ id: generateUuid(), name: nextLabel, description: '' });
        if (isOptionListStatType(stat.type)) {
            if (isFunctionReference(stat.default)) {
                onPatch({ options });
                return;
            }
            const activeIds = Array.isArray(stat.default) ? normalizeReferenceListValue(stat.default) : [];
            patchStat({ options, default: [...activeIds, options[options.length - 1].id!] });
            return;
        }
        patchStat({
            options,
            default: typeof stat.default === 'string' && stat.default.trim() ? stat.default : getStatOptionValue(options[options.length - 1], options.length - 1),
        });
    };

    const addValueRule = () => {
        if (!valueRulesConfig) return;
        const rule: StatValueRule = { id: generateUuid(), value: resolveStatDefaultValue(stat), conditions: [] };
        onPatch({ [valueRulesConfig.fieldKey]: [rule, ...valueRules] } as Partial<Stat>);
    };

    const removeValueRule = (ruleId: string) => {
        if (!valueRulesConfig || ruleId === defaultRuleId) return;
        onPatch({ [valueRulesConfig.fieldKey]: valueRules.filter(rule => rule.id !== ruleId) } as Partial<Stat>);
    };

    const updateValueRule = (ruleId: string, patch: Partial<StatValueRule>) => {
        if (!valueRulesConfig) return;
        const isDefaultRule = ruleId === defaultRuleId;
        onPatch({
            ...(isDefaultRule && patch.value !== undefined ? { default: patch.value } : {}),
            [valueRulesConfig.fieldKey]: valueRules.map(rule => rule.id === ruleId ? { ...rule, ...patch } : rule),
        } as Partial<Stat>);
    };

    const moveValueRule = (ruleId: string, direction: -1 | 1) => {
        if (!valueRulesConfig) return;
        const index = valueRules.findIndex(rule => rule.id === ruleId);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= valueRules.length) return;
        const nextRules = [...valueRules];
        [nextRules[index], nextRules[nextIndex]] = [nextRules[nextIndex], nextRules[index]];
        onPatch({ [valueRulesConfig.fieldKey]: nextRules } as Partial<Stat>);
    };

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
                                onChange={(e) => patchStat(normalizeStatShape({ ...stat, type: e.target.value as Stat['type'] }))}
                            >
                                {renderStatTypeOptions()}
                            </select>
                        </div>

                        {/*Temporarily removing this feature:
                        category === 'actor' && (
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
                        )*/}

                        <ConditionalFlagEditor
                            label="Send to LLM"
                            enabledLabel="Included in LLM context"
                            disabledLabel="Omitted from LLM context"
                            flag={stat.llmSees}
                            onChange={(llmSees) => onPatch({ llmSees })}
                            globalStats={conditionStats}
                            actorStats={actorStats}
                            actors={conditionActors}
                            stage={stage}
                            items={items}
                            locations={locations}
                            variableContentType={variableContentType}
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
                                stage={stage}
                                items={items}
                                locations={locations}
                                variableContentType={variableContentType}
                                fieldLabelStyle={fieldLabelStyle}
                                inlineFieldStyle={inlineFieldStyle}
                            />
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
                        {normalizedStat.type === 'option' && (optionListSources.length > 0 || isSourcedOption) && (
                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                <label style={fieldLabelStyle}>Option Source</label>
                                <select
                                    className="input-base"
                                    value={normalizedStat.optionSourceStatId || ''}
                                    onChange={(e) => patchStat({ optionSourceStatId: e.target.value || undefined, default: '' })}
                                >
                                    <option value="">Own options</option>
                                    {optionListSources.map(source => (
                                        <option key={source.id} value={source.id}>
                                            {source.name?.trim() || 'Unnamed option list'}{category !== 'global' && !globalStats.includes(source) ? ` (same ${category})` : ' (global)'}
                                        </option>
                                    ))}
                                    {isSourcedOption && !optionListSources.some(source => source.id === normalizedStat.optionSourceStatId) && (
                                        <option value={normalizedStat.optionSourceStatId}>Missing option list</option>
                                    )}
                                </select>
                            </div>
                        )}

                        {isSourcedOption && !valueRulesConfig?.visible && (
                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                <label style={fieldLabelStyle}>Default Option</label>
                                {renderValueInput(normalizedStat.default, defaultValue => onPatch({ default: defaultValue }))}
                            </div>
                        )}

                        {((normalizedStat.type === 'option' && !isSourcedOption) || isOptionListStatType(normalizedStat.type)) && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: 10 }}>
                                {valueRulesConfig?.visible ? null : isOptionListStatType(normalizedStat.type) ? (
                                    <div style={{ ...inlineFieldTopStyle, marginBottom: 4 }}>
                                        <label style={fieldLabelStyle}>Initially Active</label>
                                        {renderValueInput(normalizedStat.default, defaultValue => onPatch({ default: defaultValue }))}
                                    </div>
                                ) : (
                                <div style={{ ...inlineFieldStyle, marginBottom: 4 }}>
                                    <label style={fieldLabelStyle}>Default Option</label>
                                    {renderValueInput(normalizedStat.default, defaultValue => onPatch({ default: defaultValue }))}
                                </div>
                                )}

                                {editableOptionEntries.map((option, optionIndex) => (
                                    <div key={option.id || `option-${optionIndex}`} style={{ border: '1px solid var(--agenda-line-subtle)', borderRadius: 8, padding: 8 }}>
                                        <div style={inlineFieldStyle}>
                                            <label style={fieldLabelStyle}>Option Name</label>
                                            <TextInput
                                                fullWidth
                                                value={option.name}
                                                onChange={(e) => updateOption(optionIndex, { name: e.target.value })}
                                                placeholder="Option name"
                                            />
                                        </div>
                                        <div style={{ ...inlineFieldTopStyle, marginBottom: 0 }}>
                                            <label style={fieldLabelStyle}>Option Description</label>
                                            <TextArea
                                                value={option.description}
                                                onChange={(e) => updateOption(optionIndex, { description: e.target.value })}
                                                rows={2}
                                                style={{ width: '100%', resize: 'vertical' }}
                                            />
                                        </div>
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

                        {normalizedStat.type === 'text' && !valueRulesConfig?.visible && (
                            <div style={{ ...inlineFieldTopStyle, marginBottom: 10 }}>
                                <label style={fieldLabelStyle}>Default Value</label>
                                {renderValueInput(normalizedStat.default, defaultValue => onPatch({ default: defaultValue }))}
                            </div>
                        )}

                        {isReferenceDisplayType(normalizedStat.type) && !valueRulesConfig?.visible && (
                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                <label style={fieldLabelStyle}>Default Reference</label>
                                {renderValueInput(normalizedStat.default, (defaultValue) => onPatch({ default: defaultValue }))}
                            </div>
                        )}

                        {isReferenceListDisplayType(normalizedStat.type) && !valueRulesConfig?.visible && (
                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                <label style={fieldLabelStyle}>Default References</label>
                                {renderValueInput(normalizedStat.default, (defaultValue) => onPatch({ default: defaultValue }))}
                            </div>
                        )}

                        {normalizedStat.type === 'checkbox' && !valueRulesConfig?.visible && (
                            <div style={{ ...inlineFieldStyle, marginBottom: 10 }}>
                                <label style={fieldLabelStyle}>Default Value</label>
                                {renderValueInput(normalizedStat.default, defaultValue => onPatch({ default: defaultValue }))}
                            </div>
                        )}

                        {isNumericDisplayType(normalizedStat.type) && (
                            <div style={{ ...inlineFieldTopStyle, marginBottom: 0 }}>
                                <label style={fieldLabelStyle}>Properties</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                                    {!valueRulesConfig?.visible && (
                                        <div>
                                            <div style={compactChipLabelStyle}>Default</div>
                                            {renderValueInput(normalizedStat.default, defaultValue => onPatch({ default: defaultValue }))}
                                        </div>
                                    )}
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

                    {valueRulesConfig && valueRulesConfig.visible && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <label style={fieldLabelStyle}>{valueRulesConfig.title}</label>
                                <Button
                                    variant="secondary"
                                    onClick={addValueRule}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                >
                                    <Add fontSize="small" /> Add rule
                                </Button>
                            </div>
                            <span style={{ color: 'var(--agenda-text-muted)', fontSize: '11px' }}>
                                {valueRulesConfig.description}
                            </span>
                            {valueRules.map((rule, ruleIndex) => (
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
                                        <span style={{ color: 'var(--agenda-text-primary)', fontSize: '12px' }}>
                                            {rule.id === defaultRuleId ? 'Default Value' : 'Value'}
                                        </span>
                                        {renderValueInput(rule.value, (value) => updateValueRule(rule.id, { value }))}
                                        <Button
                                            variant="secondary"
                                            disabled={ruleIndex === 0}
                                            onClick={() => moveValueRule(rule.id, -1)}
                                            style={{ padding: '4px 8px', minWidth: 0 }}
                                            aria-label="Move rule up"
                                        >
                                            <KeyboardArrowUp fontSize="small" />
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            disabled={ruleIndex === valueRules.length - 1}
                                            onClick={() => moveValueRule(rule.id, 1)}
                                            style={{ padding: '4px 8px', minWidth: 0 }}
                                            aria-label="Move rule down"
                                        >
                                            <KeyboardArrowDown fontSize="small" />
                                        </Button>
                                        <Button
                                            variant="danger"
                                            onClick={() => removeValueRule(rule.id)}
                                            style={{ marginLeft: 'auto' }}
                                            disabled={rule.id === defaultRuleId}
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                    {rule.id !== defaultRuleId && (
                                        <ConditionEditor
                                            conditionCollections={rule.conditions}
                                            globalStats={conditionStats}
                                            actorStats={actorStats}
                                            actors={conditionActors}
                                            stage={stage}
                                            items={items}
                                            locations={locations}
                                            variableContentType={variableContentType}
                                            onChange={(conditions) => updateValueRule(rule.id, { conditions })}
                                        />
                                    )}
                                    {rule.id !== defaultRuleId && rule.conditions.length === 0 && (
                                        <span style={{ color: 'var(--agenda-text-muted)', fontSize: '11px' }}>
                                            Always matches; place below rules that should take precedence.
                                        </span>
                                    )}
                                </div>
                            ))}
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
