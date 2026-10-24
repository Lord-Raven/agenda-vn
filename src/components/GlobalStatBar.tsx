import { FC, ReactNode, useState } from "react";
import { Box, Typography } from "@mui/material";
import { Bed, Bedtime, EventAvailable, HourglassBottom, HourglassTop, WbSunny, WbTwilight } from "@mui/icons-material";
import { Stage } from "../Stage";
import { formatCurrentDate, formatDateLabel, Skit } from "../content/Skit";
import { CALENDAR_TIME_OF_DAY_ORDER, CalendarTimeOfDay } from "../content/CalendarEvent";
import { ControlRenderer } from "./ControlRenderer";

interface GlobalStatBarProps {
    stage: () => Stage;
    isVerticalLayout?: boolean;
    buttons?: ReactNode;
    onActivate?: (skit?: Skit | null) => void;
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

export const GlobalStatBar: FC<GlobalStatBarProps> = ({ stage, buttons, onActivate, isVerticalLayout = false }) => {
    // Bumped after a top Control fires/edits a stat, forcing this bar to re-render with the resulting state.
    const [revision, setRevision] = useState(0);
    const stageInstance = stage();
    const topControls = stageInstance.getVisibleControls('top');
    const save = stageInstance.getSave();
    const currentDate = save?.currentDate || stageInstance.getConfiguration(save)?.startingDate || new Date().toISOString().slice(0, 10);
    const currentTimeOfDay = save?.currentTimeOfDay || "morning";
    const DateTimeIcon = getDateTimeIcon(currentTimeOfDay);
    const isPhaseMode = stageInstance.getTimeMode() === "phase";
    const usePhaseSegments = isVerticalLayout && isPhaseMode && stageInstance.getDateMode() === "turnBased";
    const currentPhaseIndex = Math.max(CALENDAR_TIME_OF_DAY_ORDER.indexOf(currentTimeOfDay as CalendarTimeOfDay), 0);
    const dateLabel = stageInstance.getDateMode() === "turnBased"
        ? `Day ${stageInstance.getDayNumberForDate(currentDate)}`
        : formatDateLabel(currentDate);

    return (
        <Box
            sx={{
                display: "flow-root",
                width: "100%",
            }}
        >
            {buttons && (
                <Box
                    sx={{
                        float: "right",
                        display: "flex",
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                        gap: 0.75,
                        maxWidth: "100%",
                        marginBottom: isVerticalLayout ? 0.5 : 1,
                    }}
                >
                    {buttons}
                </Box>
            )}
            <Box
                sx={{
                    // Each stat must participate in the float's flow, not a separate flex column.
                    display: buttons ? "contents" : "flex",
                    flexWrap: "wrap",
                    gap: isVerticalLayout ? 0.5 : 1,
                    minWidth: 0,
                    alignItems: "stretch",
                    ...(buttons ? {
                        "& > *": {
                            float: "left",
                            maxWidth: theme => `calc(100% - ${theme.spacing(isVerticalLayout ? 0.5 : 1)})`,
                            marginRight: isVerticalLayout ? 0.5 : 1,
                            marginBottom: isVerticalLayout ? 0.5 : 1,
                        },
                    } : {}),
                }}
            >
                <Box
                    title={`Current Date: ${formatCurrentDate(currentDate, currentTimeOfDay)}`}
                    sx={{
                        flex: "0 0 auto",
                        whiteSpace: "nowrap",
                        display: "flex",
                        flexDirection: usePhaseSegments ? "column" : "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: usePhaseSegments ? "2px" : isVerticalLayout ? 0.4 : 0.8,
                        padding: isVerticalLayout ? "4px 6px" : "8px 10px",
                        ...(usePhaseSegments ? { minHeight: 30, boxSizing: "border-box" } : {}),
                        borderRadius: isVerticalLayout ? "8px" : "12px",
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
                            fontSize: usePhaseSegments ? '0.8rem' : isVerticalLayout ? '0.85rem' : { xs: '1.25rem', md: '1.8rem' },
                            ...(usePhaseSegments ? { lineHeight: 1.1 } : isVerticalLayout ? { lineHeight: "20px" } : {}),
                            whiteSpace: "nowrap",
                        }}
                    >
                        {dateLabel}
                    </Typography>
                    {usePhaseSegments ? (
                        <Box
                            role="img"
                            aria-label={`Phase ${currentPhaseIndex + 1} of ${CALENDAR_TIME_OF_DAY_ORDER.length}`}
                            sx={{ display: "flex", gap: "2px", width: "100%" }}
                        >
                            {CALENDAR_TIME_OF_DAY_ORDER.map((slot, index) => (
                                <Box
                                    key={slot}
                                    component="span"
                                    aria-hidden="true"
                                    sx={{
                                        flex: 1,
                                        height: "3px",
                                        borderRadius: "1px",
                                        backgroundColor: index <= currentPhaseIndex ? "var(--agenda-highlight)" : "var(--agenda-text-muted)",
                                        opacity: index <= currentPhaseIndex ? 1 : 0.45,
                                    }}
                                />
                            ))}
                        </Box>
                    ) : isPhaseMode ? (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.1 }}>
                            {CALENDAR_TIME_OF_DAY_ORDER.map((slot, index) => {
                                // HourglassTop reads as sand already fallen, so it marks elapsed phases.
                                const elapsed = index <= currentPhaseIndex;
                                const PhaseIcon = elapsed ? HourglassTop : HourglassBottom;
                                return (
                                    <PhaseIcon
                                        key={slot}
                                        sx={{
                                            fontSize: "1.1rem",
                                            color: elapsed ? "var(--agenda-highlight)" : "var(--agenda-text-muted)",
                                            opacity: elapsed ? 1 : 0.45,
                                        }}
                                    />
                                );
                            })}
                        </Box>
                    ) : (
                        <DateTimeIcon sx={{ fontSize: "1.1rem", color: "var(--agenda-highlight)" }} />
                    )}
                </Box>
                {topControls.map((control) => (
                    <ControlRenderer
                        key={`top-control-${control.id}`}
                        control={control}
                        stage={stage}
                        isVerticalLayout={isVerticalLayout}
                        onActivate={skit => {
                            setRevision(current => current + 1);
                            onActivate?.(skit);
                        }}
                    />
                ))}
            </Box>
        </Box>
    );
};
