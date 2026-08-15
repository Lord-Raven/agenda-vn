import React, { Dispatch, ReactNode, SetStateAction, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from './UiComponents';
import { Add } from '@mui/icons-material';

export interface CategorizedEntrySection<TEntry> {
    id: string;
    title: string;
    entries: TEntry[];
    subsections?: CategorizedEntrySubsection<TEntry>[];
}

export interface CategorizedEntrySubsection<TEntry> {
    id: string;
    title: string;
    entries: TEntry[];
}

const collapseStateCache = new Map<string, Record<string, boolean>>();

export const useCachedSidebarCollapseState = (
    cacheKey: string,
): [Record<string, boolean>, Dispatch<SetStateAction<Record<string, boolean>>>] => {
    const [collapseState, setCollapseState] = useState<Record<string, boolean>>(() => (
        collapseStateCache.get(cacheKey) ?? {}
    ));

    const setCachedCollapseState: Dispatch<SetStateAction<Record<string, boolean>>> = (value) => {
        setCollapseState((current) => {
            const next = typeof value === 'function' ? value(current) : value;
            collapseStateCache.set(cacheKey, next);
            return next;
        });
    };

    return [collapseState, setCachedCollapseState];
};

interface CategorizedEntrySidebarProps<TEntry> {
    sections: CategorizedEntrySection<TEntry>[];
    collapsedSections: Record<string, boolean>;
    onToggleSection: (sectionId: string) => void;
    renderEntry: (entry: TEntry, section: CategorizedEntrySection<TEntry>) => ReactNode;
    getEntryKey: (entry: TEntry) => string;
    shouldReduceMotion: boolean;
    emptyListMessage: string;
    renderSectionAction?: (section: CategorizedEntrySection<TEntry>) => void;
    sectionEmptyMessage?: string | ((section: CategorizedEntrySection<TEntry>) => string);
    shouldHideSection?: (section: CategorizedEntrySection<TEntry>) => boolean;
    defaultCollapsed?: boolean;
    collapsedSubsections?: Record<string, boolean>;
    onToggleSubsection?: (subsectionId: string) => void;
    defaultSubsectionCollapsed?: boolean;
}

export const CategorizedEntrySidebar = <TEntry,>({
    sections,
    collapsedSections,
    onToggleSection,
    renderEntry,
    getEntryKey,
    shouldReduceMotion,
    emptyListMessage,
    renderSectionAction,
    sectionEmptyMessage,
    shouldHideSection,
    defaultCollapsed = true,
    collapsedSubsections = {},
    onToggleSubsection,
    defaultSubsectionCollapsed = true,
}: CategorizedEntrySidebarProps<TEntry>) => {
    const renderEntries = (entries: TEntry[], section: CategorizedEntrySection<TEntry>) => (
        <div style={{ display: 'grid', gap: '10px' }}>
            {entries.map((entry) => (
                <React.Fragment key={getEntryKey(entry)}>
                    {renderEntry(entry, section)}
                </React.Fragment>
            ))}
        </div>
    );

    return (
        <div
            style={{
                background: 'color-mix(in srgb, var(--agenda-surface-base) 78%, transparent)',
                border: '1px solid var(--agenda-line-subtle)',
                borderRadius: '12px',
                padding: '14px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
            }}
        >
            {sections.length === 0 ? (
                <div style={{ color: 'var(--agenda-text-muted)', fontSize: '13px', padding: '8px 0' }}>
                    {emptyListMessage}
                </div>
            ) : (
                sections.map((section) => {
                    if (shouldHideSection?.(section)) {
                        return null;
                    }

                    const isCollapsed = collapsedSections[section.id] ?? defaultCollapsed;

                    return (
                        <div key={section.id}>
                            <div
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginBottom: '8px',
                                    gap: '8px',
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => onToggleSection(section.id)}
                                    aria-expanded={!isCollapsed}
                                    style={{
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        background: 'transparent',
                                        border: 'none',
                                        padding: 0,
                                        color: 'var(--agenda-text-primary)',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.08em',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid var(--agenda-line-subtle)',
                                        paddingBottom: '6px',
                                    }}
                                >
                                    <span>{section.title} ({section.entries.length})</span>
                                    <motion.span
                                        aria-hidden="true"
                                        animate={{ rotate: isCollapsed ? 0 : 90 }}
                                        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
                                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        ▸
                                    </motion.span>
                                </button>
                                {renderSectionAction && (
                                    <Button
                                        variant="secondary"
                                        onClick={() => renderSectionAction(section)}
                                        style={{
                                            padding: '4px 10px',
                                            fontSize: '12px',
                                            borderRadius: '8px',
                                            alignSelf: 'auto',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                        }}
                                    >
                                        <Add style={{ fontSize: '16px' }} /> New
                                    </Button>
                                )}
                            </div>

                            <AnimatePresence initial={false}>
                                {!isCollapsed && (
                                    <motion.div
                                        key={`${section.id}-entries`}
                                        initial={shouldReduceMotion ? false : { height: 0, opacity: 0, y: -6 }}
                                        animate={shouldReduceMotion ? { height: 'auto', opacity: 1 } : { height: 'auto', opacity: 1, y: 0 }}
                                        exit={shouldReduceMotion ? { height: 0, opacity: 0 } : { height: 0, opacity: 0, y: -6 }}
                                        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
                                        style={{ overflow: 'visible', marginBottom: '10px' }}
                                    >
                                        {section.entries.length === 0 ? (
                                            <div style={{ color: 'var(--agenda-text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                                                {typeof sectionEmptyMessage === 'function'
                                                    ? sectionEmptyMessage(section)
                                                    : sectionEmptyMessage || 'No entries.'}
                                            </div>
                                        ) : section.subsections ? (
                                            <div style={{ display: 'grid', gap: '10px' }}>
                                                {section.subsections.map((subsection) => {
                                                    const isSubsectionCollapsed = collapsedSubsections[subsection.id] ?? defaultSubsectionCollapsed;

                                                    return (
                                                        <div key={subsection.id}>
                                                            <button
                                                                type="button"
                                                                onClick={() => onToggleSubsection?.(subsection.id)}
                                                                aria-expanded={!isSubsectionCollapsed}
                                                                style={{
                                                                    width: '100%',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'space-between',
                                                                    background: 'transparent',
                                                                    border: 'none',
                                                                    borderBottom: '1px solid var(--agenda-line-subtle)',
                                                                    padding: '0 0 5px 8px',
                                                                    color: 'var(--agenda-text-secondary)',
                                                                    fontSize: '12px',
                                                                    fontWeight: 700,
                                                                    cursor: onToggleSubsection ? 'pointer' : 'default',
                                                                }}
                                                            >
                                                                <span>{subsection.title} ({subsection.entries.length})</span>
                                                                <motion.span
                                                                    aria-hidden="true"
                                                                    animate={{ rotate: isSubsectionCollapsed ? 0 : 90 }}
                                                                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
                                                                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                >
                                                                    ▸
                                                                </motion.span>
                                                            </button>
                                                            <AnimatePresence initial={false}>
                                                                {!isSubsectionCollapsed && (
                                                                    <motion.div
                                                                        key={`${subsection.id}-entries`}
                                                                        initial={shouldReduceMotion ? false : { height: 0, opacity: 0, y: -4 }}
                                                                        animate={shouldReduceMotion ? { height: 'auto', opacity: 1 } : { height: 'auto', opacity: 1, y: 0 }}
                                                                        exit={shouldReduceMotion ? { height: 0, opacity: 0 } : { height: 0, opacity: 0, y: -4 }}
                                                                        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
                                                                        style={{ overflow: 'visible', padding: '8px 0 0 8px' }}
                                                                    >
                                                                        {renderEntries(subsection.entries, section)}
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            renderEntries(section.entries, section)
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })
            )}
        </div>
    );
};