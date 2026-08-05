import React, { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface CategorizedEntrySection<TEntry> {
    id: string;
    title: string;
    entries: TEntry[];
}

interface CategorizedEntrySidebarProps<TEntry> {
    sections: CategorizedEntrySection<TEntry>[];
    collapsedSections: Record<string, boolean>;
    onToggleSection: (sectionId: string) => void;
    renderEntry: (entry: TEntry, section: CategorizedEntrySection<TEntry>) => ReactNode;
    getEntryKey: (entry: TEntry) => string;
    shouldReduceMotion: boolean;
    emptyListMessage: string;
    renderSectionAction?: (section: CategorizedEntrySection<TEntry>) => ReactNode;
    sectionEmptyMessage?: string | ((section: CategorizedEntrySection<TEntry>) => string);
    shouldHideSection?: (section: CategorizedEntrySection<TEntry>) => boolean;
    defaultCollapsed?: boolean;
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
    defaultCollapsed = false,
}: CategorizedEntrySidebarProps<TEntry>) => {
    return (
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
            {sections.length === 0 ? (
                <div style={{ color: 'rgba(224, 240, 255, 0.6)', fontSize: '13px', padding: '8px 0' }}>
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
                                        color: 'rgba(224, 240, 255, 0.9)',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.08em',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid rgba(0, 255, 136, 0.25)',
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
                                {renderSectionAction?.(section)}
                            </div>

                            <AnimatePresence initial={false}>
                                {!isCollapsed && (
                                    <motion.div
                                        key={`${section.id}-entries`}
                                        initial={shouldReduceMotion ? false : { height: 0, opacity: 0, y: -6 }}
                                        animate={shouldReduceMotion ? { height: 'auto', opacity: 1 } : { height: 'auto', opacity: 1, y: 0 }}
                                        exit={shouldReduceMotion ? { height: 0, opacity: 0 } : { height: 0, opacity: 0, y: -6 }}
                                        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
                                        style={{ overflow: 'hidden', marginBottom: '10px' }}
                                    >
                                        {section.entries.length === 0 ? (
                                            <div style={{ color: 'rgba(224, 240, 255, 0.6)', fontSize: '13px', fontStyle: 'italic' }}>
                                                {typeof sectionEmptyMessage === 'function'
                                                    ? sectionEmptyMessage(section)
                                                    : sectionEmptyMessage || 'No entries.'}
                                            </div>
                                        ) : (
                                            <div style={{ display: 'grid', gap: '10px' }}>
                                                {section.entries.map((entry) => (
                                                    <React.Fragment key={getEntryKey(entry)}>
                                                        {renderEntry(entry, section)}
                                                    </React.Fragment>
                                                ))}
                                            </div>
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