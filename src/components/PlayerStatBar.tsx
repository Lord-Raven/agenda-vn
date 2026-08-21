import { FC, ReactNode, useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { Stage } from "../Stage";
import { ActorStat } from '../content/ActorStat';
import { resolveIcon } from "./ActorStatRating";
import { ActorStatValueDisplay } from "./ActorStatDisplay";

interface PlayerStatBarProps {
    stage: () => Stage;
    buttons?: ReactNode;
}

const resolveStatDefaultValue = (stat: ActorStat): number | string | boolean => {
    if (stat.type === "option") {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        if (typeof stat.default === "string" && optionNames.includes(stat.default)) {
            return stat.default;
        }
        return optionNames[0] || "";
    }

    if (stat.type === "text" || stat.type === "location") {
        return typeof stat.default === "string" ? stat.default : "";
    }

    if (stat.type === "checkbox") {
        return typeof stat.default === "boolean" ? stat.default : false;
    }

    return Number.isFinite(stat.default) ? Number(stat.default) : 0;
};

const normalizeStatValue = (value: unknown, stat: ActorStat): number | string | boolean => {
    if (stat.type === "option") {
        const optionNames = (stat.options || []).map(option => option.name).filter(Boolean);
        if (typeof value === "string" && optionNames.includes(value)) {
            return value;
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

const resolveDisplayValue = (stat: ActorStat, value: unknown, atlas?: { [key: string]: { name: string } }): string => {
    const normalized = normalizeStatValue(value, stat);
    if (stat.type === "location") {
        return atlas?.[String(normalized)]?.name || "";
    }

    if (stat.type === "option") {
        return typeof normalized === "string" ? normalized : "";
    }

    if (stat.type === "text") {
        return typeof normalized === "string" ? normalized : "";
    }

    if (stat.type === "checkbox") {
        return normalized === true ? "True" : "False";
    }

    return `${Number(normalized)}`;
};

export const PlayerStatBar: FC<PlayerStatBarProps> = ({ stage, buttons }) => {
    const stats = useMemo(() => {
        const stageInstance = stage();
        const allStats = stageInstance.getConfiguration()?.playerStats || [];
        return allStats.filter((stat) => stat?.name?.trim() && stat.exposed === true);
    }, [stage]);

    if (stats.length === 0 && !buttons) {
        return null;
    }

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
                {stats.map((stat) => {
                const statName = (stat.name || "").trim();
                if (!statName) {
                    return null;
                }

                const stageInstance = stage();
                const rawValue = stageInstance.getSave()?.playerStatValues?.[stat.id]
                    ?? stageInstance.getConfiguration()?.playerStatValues?.[stat.id]
                    ?? stat.default;
                const normalizedValue = normalizeStatValue(rawValue, stat);
                const isNumericStat = stat.type === "number";
                const StatIcon = stat.iconName ? resolveIcon(stat.iconName) : null;

                return (
                    <Box
                        key={`player-stat-bar-${statName}`}
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
                            <ActorStatValueDisplay stat={stat} value={Number(normalizedValue)} style={{ minHeight: 20 }} />
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
