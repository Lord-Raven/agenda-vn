import { FC, ReactNode, useState } from "react";
import { Box, Typography } from "@mui/material";
import { Bed, Bedtime, EventAvailable, WbSunny, WbTwilight } from "@mui/icons-material";
import { Stage } from "../Stage";
import { formatCurrentDate, formatDateLabel } from "../content/Skit";
import { ControlRenderer } from "./ControlRenderer";

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

export const GlobalStatBar: FC<GlobalStatBarProps> = ({ stage, buttons }) => {
    // Bumped after a top Control fires/edits a stat, forcing this bar to re-render with the resulting state.
    const [revision, setRevision] = useState(0);
    const stageInstance = stage();
    const topControls = stageInstance.getVisibleControls('top');
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
                {topControls.map((control) => (
                    <ControlRenderer
                        key={`top-control-${control.id}`}
                        control={control}
                        stage={stage}
                        onActivate={() => setRevision((current) => current + 1)}
                    />
                ))}
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
