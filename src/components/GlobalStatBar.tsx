import { FC, ReactNode, useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { Bed, Bedtime, EventAvailable, WbSunny, WbTwilight } from "@mui/icons-material";
import { Stage } from "../Stage";
import { formatCurrentDate, formatDateLabel } from "../content/Skit";
import { findStatOptionByValue, getStatOptionValue, Stat, resolveStatText } from '../content/Stat';
import { resolveIcon } from "./StatRating";
import { StatValueDisplay } from "./StatDisplay";

interface GlobalStatBarProps {
    stage: () => Stage;
    buttons?: ReactNode;
}

const getDateTimeIcon = (timeOfDay?: string) => {
    if (timeOfDay === "morning") {
        return WbTwilight;
    }
    if (timeOfDay === "afternoon") {
        return WbSunny;
    }
    if (timeOfDay === "evening") {
        return Bedtime;
    }
    if (timeOfDay === "night") {
        return Bed;
    }
    return EventAvailable;
};

const resolveStatDefaultValue = (stat: Stat): number | string | boolean => {
    if (stat.type === "option") {
        const defaultOption = findStatOptionByValue(stat, stat.default);
        return defaultOption?.value || (stat.options?.[0] ? getStatOptionValue(stat.options[0], 0) : "");
    }

    if (stat.type === "text" || stat.type === "location") {
        return typeof stat.default === "string" ? stat.default : "";
    }

    if (stat.type === "checkbox") {
        return typeof stat.default === "boolean" ? stat.default : false;
    }

    return Number.isFinite(stat.default) ? Number(stat.default) : 0;
};

const normalizeStatValue = (value: unknown, stat: Stat): number | string | boolean => {
    if (stat.type === "option") {
        const selectedOption = findStatOptionByValue(stat, value);
        if (selectedOption) {
            return selectedOption.value;
        }
        return resolveStatDefaultValue(stat);
    }

    if (stat.type === "text" || stat.type === "location") {
        if (typeof value === "string") {
            return value;
        }
        return resolveStatDefaultValue(stat);
    }

    let resolved = Number.isFinite(value) ? Number(value) : Number(resolveStatDefaultValue(stat)) || 0;
    if (typeof stat.min === "number") {
        resolved = Math.max(stat.min, resolved);
    }
    if (typeof stat.max === "number") {
        resolved = Math.min(stat.max, resolved);
    }
    return resolved;
};

const resolveDisplayValue = (stat: Stat, value: unknown, atlas?: { [key: string]: { name: string } }): string => {
    const normalized = normalizeStatValue(value, stat);
    if (stat.type === "location") {
        return atlas?.[String(normalized)]?.name || "";
    }

    if (stat.type === "option") {
        return findStatOptionByValue(stat, normalized)?.option.name || "";
    }

    if (stat.type === "text") {
        return typeof normalized === "string" ? normalized : "";
    }

    if (stat.type === "checkbox") {
        return normalized === true ? "True" : "False";
    }

    return `${Number(normalized)}`;
};

export const GlobalStatBar: FC<GlobalStatBarProps> = ({ stage, buttons }) => {
    const stats = useMemo(() => {
        const stageInstance = stage();
        const allStats = stageInstance.getConfiguration()?.globalStats || [];
        return allStats.filter((stat) => stat?.name?.trim() && stat.exposed === true);
    }, [stage]);
    const stageInstance = stage();
    const save = stageInstance.getSave();
    const currentDate = save?.currentDate || stageInstance.getConfiguration()?.startingDate || new Date().toISOString().slice(0, 10);
    const currentTimeOfDay = save?.currentTimeOfDay || "morning";
    const DateTimeIcon = getDateTimeIcon(currentTimeOfDay);

    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "flex-start",
                gap: 1,
                width: "100%",
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 1,
                    flex: 1,
                    minWidth: 0,
                    alignItems: "stretch",
                }}
            >
                <Box
                    title={`Current Date: ${formatCurrentDate(currentDate, currentTimeOfDay)}`}
                    sx={{
                        flex: "0 0 auto",
                        whiteSpace: "nowrap",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 0.8,
                        padding: "8px 10px",
                        borderRadius: "12px",
                        border: "1px solid var(--agenda-panel-border)",
                        background: "color-mix(in srgb, var(--agenda-panel-surface) 88%, transparent)",
                        boxShadow: "inset 0 1px 0 color-mix(in srgb, var(--agenda-text-primary) 4%, transparent)",
                    }}
                >
                    <Typography
                        sx={{
                            color: "var(--agenda-text-primary)",
                            fontFamily: "var(--agenda-font-flavor)",
                            fontWeight: 700,
                            fontSize: { xs: '1.25rem', md: '1.8rem' },
                            whiteSpace: "nowrap",
                        }}
                    >
                        {formatDateLabel(currentDate)}
                    </Typography>
                    <DateTimeIcon sx={{ fontSize: "1.1rem", color: "var(--agenda-highlight)" }} />
                </Box>
                {stats.map((stat) => {
                const statName = (stat.name || "").trim();
                if (!statName) {
                    return null;
                }

                const stageInstance = stage();
                const rawValue = stageInstance.getSave()?.globalStatValues?.[stat.id]
                    ?? stageInstance.getConfiguration()?.globalStatValues?.[stat.id]
                    ?? stat.default;
                const normalizedValue = normalizeStatValue(rawValue, stat);
                const isNumericStat = stat.type === "number";
                const StatIcon = stat.iconName ? resolveIcon(stat.iconName) : null;
                const selectedOptionDescription = stat.type === "option"
                    ? resolveStatText(findStatOptionByValue(stat, normalizedValue)?.option.description, stageInstance).trim()
                    : "";
                const tooltipText = [resolveStatText(stat.description, stageInstance).trim(), selectedOptionDescription]
                    .filter(Boolean)
                    .join("\n\n");

                return (
                    <Box
                        key={`player-stat-bar-${statName}`}
                        title={tooltipText || undefined}
                        sx={{
                            flex: "1 1 150px",
                            minWidth: 0,
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.6,
                            padding: "8px 10px",
                            borderRadius: "12px",
                            border: "1px solid var(--agenda-panel-border)",
                            background: "color-mix(in srgb, var(--agenda-panel-surface) 88%, transparent)",
                            boxShadow: "inset 0 1px 0 color-mix(in srgb, var(--agenda-text-primary) 4%, transparent)",
                        }}
                    >
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.6,
                                color: "var(--agenda-text-muted)",
                                lineHeight: 1.2,
                            }}
                        >
                            {StatIcon && <StatIcon sx={{ fontSize: "0.8rem", color: "var(--agenda-highlight)" }} />}
                            <Typography
                                sx={{
                                    color: "var(--agenda-text-muted)",
                                    fontSize: "0.66rem",
                                    letterSpacing: "0.1em",
                                    textTransform: "uppercase",
                                    lineHeight: 1.2,
                                }}
                            >
                                {statName}
                            </Typography>
                        </Box>

                        {isNumericStat ? (
                            <StatValueDisplay stat={stat} value={Number(normalizedValue)} style={{ minHeight: 20 }} />
                        ) : (
                            <Typography
                                sx={{
                                    color: "var(--agenda-text-primary)",
                                    fontSize: "0.8rem",
                                    fontWeight: 700,
                                    lineHeight: 1.2,
                                    wordBreak: "break-word",
                                }}
                            >
                                {resolveDisplayValue(stat, normalizedValue, stageInstance.getSave()?.atlas)}
                            </Typography>
                        )}
                    </Box>
                );
            })}
            </Box>

            {buttons && (
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 0.75,
                        flexShrink: 0,
                    }}
                >
                    {buttons}
                </Box>
            )}
        </Box>
    );
};
