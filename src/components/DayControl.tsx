import { FC } from "react";
import { Box, Typography } from "@mui/material";
import { Bed, Bedtime, EventAvailable, HourglassBottom, HourglassTop, WbSunny, WbTwilight } from "@mui/icons-material";
import { Stage } from "../Stage";
import { formatCurrentDate, formatDateLabel } from "../content/Skit";
import { CALENDAR_TIME_OF_DAY_ORDER, CalendarTimeOfDay } from "../content/CalendarEvent";
interface DayControlProps {
    stage: () => Stage;
    isVerticalLayout?: boolean;
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

export const DayControl: FC<DayControlProps> = ({ stage, isVerticalLayout = false }) => {
    const stageInstance = stage();
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
                        // Match the stat card's padding, label line, gap, and minimum value height.
                        minHeight: isVerticalLayout ? 20 : theme => `calc(14px + 0.792rem + ${theme.spacing(0.5)} + 32px)`,
                        boxSizing: isVerticalLayout ? "content-box" : "border-box",
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
                            lineHeight: usePhaseSegments ? 1.1 : isVerticalLayout ? "20px" : 1.2,
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
    );
};
