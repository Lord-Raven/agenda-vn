import { FC, useEffect, useMemo, useState } from "react";
import type { CalendarEvent, CalendarEventRecurrence, CalendarTimeOfDay } from "../content/CalendarEvent";
import { Stage } from "../Stage";
import { ScreenType } from "./BaseScreen";
import { Box, Typography } from "@mui/material";
import {
    ArrowBackRounded,
    ArrowForwardRounded,
    Bed,
    Bedtime,
    EventAvailable,
    MenuRounded,
    Settings,
    TodayRounded,
    WbSunny,
    WbTwilight,
} from "@mui/icons-material";
import { AnimatePresence, motion } from "framer-motion";
import { Button, GlassPanel } from "./UiComponents";
import { useTooltip } from "./TooltipContext";
import { ContentManagementScreen } from "./ContentManagementScreen";
import { Actor, getEmotionImage } from "../content/Actor";

interface CalendarScreenProps {
    stage: () => Stage;
    setScreenType: (type: ScreenType) => void;
    isVerticalLayout: boolean;
}

const DEFAULT_BACKGROUND_IMAGE_URL = 'https://avatars.charhub.io/avatars/uploads/images/gallery/file/5c990a43-3e56-455f-ba19-ba487eec4972/1a9f6a36-676f-4dc1-85ae-29bf7a97e538.png';
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CALENDAR_ROW_COUNT = 6;
const MAX_EVENT_LINES_PER_DAY = 3;
const TIME_OF_DAY_ORDER: CalendarTimeOfDay[] = ["morning", "afternoon", "evening", "night"];

const parseDateKey = (dateText: string) => new Date(`${dateText}T00:00:00Z`);

const formatDateKey = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number) => new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + days,
));

const startOfMonth = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const addMonths = (date: Date, months: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

const isSameDate = (left: Date, right: Date) => formatDateKey(left) === formatDateKey(right);

const formatDate = (dateText: string) => {
    const parsedDate = parseDateKey(dateText);
    if (Number.isNaN(parsedDate.getTime())) {
        return dateText;
    }

    return parsedDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
    });
};

const formatMonthLabel = (date: Date) => date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
});

const formatOrdinal = (value: number) => {
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 13) {
        return `${value}th`;
    }
    const mod10 = value % 10;
    if (mod10 === 1) {
        return `${value}st`;
    }
    if (mod10 === 2) {
        return `${value}nd`;
    }
    if (mod10 === 3) {
        return `${value}rd`;
    }
    return `${value}th`;
};

const formatCurrentDateLabel = (date: Date) => {
    const dayOfMonth = date.getUTCDate();
    const year = date.getUTCFullYear();
    const monthString = date.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
    return `${monthString} ${formatOrdinal(dayOfMonth)}, ${year}`;
};

const getTimeOfDayIcon = (timeOfDay: CalendarTimeOfDay) => {
    if (timeOfDay === "morning") {
        return WbTwilight;
    }
    if (timeOfDay === "afternoon") {
        return WbSunny;
    }
    if (timeOfDay === "evening") {
        return Bedtime;
    }
    return Bed;
};

const formatRecurrenceSummary = (recurrence?: CalendarEventRecurrence | null) => {
    if (!recurrence) {
        return "";
    }

    const interval = Math.max(1, Number(recurrence.interval) || 1);
    const unit = recurrence.frequency === "daily"
        ? (interval === 1 ? "day" : "days")
        : recurrence.frequency === "weekly"
            ? (interval === 1 ? "week" : "weeks")
            : (interval === 1 ? "month" : "months");
    return `Repeats every ${interval} ${unit} until ${formatDate(recurrence.untilDate)}`;
};

const formatTimeOfDay = (timeOfDay: CalendarTimeOfDay) => `${timeOfDay[0].toUpperCase()}${timeOfDay.slice(1)}`;

const getDurationSlots = (event: CalendarEvent) => {
    const unique = Array.from(new Set((event.duration || []).filter((slot): slot is CalendarTimeOfDay => TIME_OF_DAY_ORDER.includes(slot as CalendarTimeOfDay))));
    return unique.sort((left, right) => TIME_OF_DAY_ORDER.indexOf(left) - TIME_OF_DAY_ORDER.indexOf(right));
};

const getEventStartSlotIndex = (event: CalendarEvent) => {
    const first = getDurationSlots(event)[0] || 'morning';
    return TIME_OF_DAY_ORDER.indexOf(first);
};

const getEventEndSlotIndex = (event: CalendarEvent) => {
    const slots = getDurationSlots(event);
    const last = slots[slots.length - 1] || 'evening';
    return TIME_OF_DAY_ORDER.indexOf(last);
};

const compareEventSchedule = (left: CalendarEvent, right: CalendarEvent) => {
    const dateCompare = `${left.date || ""}`.localeCompare(`${right.date || ""}`);
    if (dateCompare !== 0) {
        return dateCompare;
    }

    const timeCompare = getEventStartSlotIndex(left) - getEventStartSlotIndex(right);
    if (timeCompare !== 0) {
        return timeCompare;
    }

    return `${left.id || ""}`.localeCompare(`${right.id || ""}`);
};

const isPastDate = (targetDate: string, currentDate: string) => targetDate < currentDate;

const isPastSlot = (targetDate: string, currentDate: string, currentSlotIndex: number, slotIndex: number) => {
    if (targetDate < currentDate) {
        return true;
    }
    if (targetDate > currentDate) {
        return false;
    }
    return slotIndex < currentSlotIndex;
};

const isPastEvent = (event: CalendarEvent, currentDate: string, currentSlotIndex: number) => {
    if (isPastDate(event.date, currentDate)) {
        return true;
    }
    if (event.date > currentDate) {
        return false;
    }
    return getEventEndSlotIndex(event) < currentSlotIndex;
};

const doesEventOccupySlot = (event: CalendarEvent, slotIndex: number) => {
    const start = getEventStartSlotIndex(event);
    const end = getEventEndSlotIndex(event);
    return slotIndex >= start && slotIndex <= end;
};

const formatDurationSummary = (event: CalendarEvent) => {
    const slots = getDurationSlots(event);
    if (slots.length === 0) {
        return "All Day";
    }
    if (slots.length === 1) {
        return formatTimeOfDay(slots[0]);
    }
    return `${formatTimeOfDay(slots[0])} - ${formatTimeOfDay(slots[slots.length - 1])}`;
};

const buildMonthGrid = (monthDate: Date) => {
    const monthStart = startOfMonth(monthDate);
    const leadingDays = monthStart.getUTCDay();
    const firstGridDay = addDays(monthStart, -leadingDays);

    return Array.from({ length: CALENDAR_ROW_COUNT * 7 }, (_, index) => addDays(firstGridDay, index));
};

const groupEventsByDate = (events: CalendarEvent[]) => events.reduce((grouped, event) => {
    const bucket = grouped.get(event.date) || [];
    bucket.push(event);
    bucket.sort((left, right) => getEventStartSlotIndex(left) - getEventStartSlotIndex(right));
    grouped.set(event.date, bucket);
    return grouped;
}, new Map<string, CalendarEvent[]>());

export const CalendarScreen: FC<CalendarScreenProps> = ({ stage, setScreenType }) => {
    const { setTooltip, clearTooltip } = useTooltip();
    const [showContentManagement, setShowContentManagement] = useState(false);

    const stageInstance = stage();
    const configuredBackgroundImageUrl = (stageInstance.getConfiguration().backgroundImageUrl || '').trim() || DEFAULT_BACKGROUND_IMAGE_URL;
    const save = stageInstance.getSave();
    const currentDateKey = save.currentDate || formatDateKey(new Date());
    const currentDate = parseDateKey(currentDateKey);
    const currentTimeOfDay = save.currentTimeOfDay || 'morning';
    const currentSlotIndex = Math.max(TIME_OF_DAY_ORDER.indexOf(currentTimeOfDay), 0);

    const allEvents = useMemo(
        () => [...(save.upcomingEvents || [])].sort((left, right) => compareEventSchedule(left, right)),
        [save.upcomingEvents, save.currentDate, save.currentTimeOfDay, stageInstance],
    );
    const upcomingEvents = useMemo(() => [...stageInstance.getUpcomingEvents()], [save.upcomingEvents, save.currentDate, save.currentTimeOfDay, stageInstance]);
    // In this screen, "today" is anchored to the next event date to match narrative progression.
    const todayDateKey = upcomingEvents[0]?.date || currentDateKey;
    const todayDate = parseDateKey(todayDateKey);

    const [viewMonth, setViewMonth] = useState(() => startOfMonth(todayDate));
    const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [activeDateKey, setActiveDateKey] = useState<string | null>(null);
    const isViewingCurrentMonth = viewMonth.getUTCMonth() === todayDate.getUTCMonth() && viewMonth.getUTCFullYear() === todayDate.getUTCFullYear();
    const CurrentTimeIcon = getTimeOfDayIcon(currentTimeOfDay);

    const eventsByDate = useMemo(() => groupEventsByDate(allEvents), [allEvents]);
    const monthGrid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
    const currentWeekRowIndex = useMemo(() => {
        const index = monthGrid.findIndex((gridDate) => isSameDate(gridDate, currentDate));
        return index >= 0 ? Math.floor(index / 7) : -1;
    }, [monthGrid, currentDateKey]);
    const currentWeekdayColumnIndex = currentDate.getUTCDay() + 1;
    const calendarGridTemplateColumns = useMemo(
        () => WEEKDAY_LABELS
            .map((_, dayIndex) => (dayIndex === currentWeekdayColumnIndex ? "1.21fr" : "0.97fr"))
            .join(" "),
        [currentWeekdayColumnIndex],
    );
    const calendarGridTemplateRows = useMemo(
        () => Array.from({ length: CALENDAR_ROW_COUNT }, (_, rowIndex) => {
            if (currentWeekRowIndex < 0) {
                return "1fr";
            }

            return rowIndex === currentWeekRowIndex ? "1.35fr" : "0.93fr";
        }).join(" "),
        [currentWeekRowIndex],
    );

    useEffect(() => {
        stageInstance.loadCalendarScreen();
    }, [stageInstance]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                setScreenType(ScreenType.MENU);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [setScreenType]);

    const jumpToCurrentMonth = () => {
        setViewMonth(startOfMonth(todayDate));
    };

    const changeMonth = (offset: number) => {
        const nextMonth = addMonths(viewMonth, offset);
        setViewMonth(nextMonth);
    };

    const openEvent = (eventId: string) => {
        const opened = stageInstance.startCalendarEventSkit(eventId);
        if (opened) {
            setSelectedDateKey(null);
            setSelectedEventId(null);
            setScreenType(ScreenType.SKIT);
        }
    };

    const openDateDetails = (dateKey: string) => {
        setSelectedDateKey(dateKey);
        setSelectedEventId(null);
    };

    return (
        <>
            <Box
                sx={{
                    width: "100vw",
                    minHeight: "100vh",
                    height: "100dvh",
                    boxSizing: "border-box",
                    padding: { xs: "12px", md: "18px" },
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.5,
                    overflow: "hidden",
                    backgroundImage: `linear-gradient(130deg, var(--agenda-calendar-overlay-start) 0%, var(--agenda-calendar-overlay-mid) 48%, var(--agenda-calendar-overlay-end) 100%), url(${configuredBackgroundImageUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                }}
            >
                <GlassPanel variant="bright" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                            <Typography
                                sx={{
                                    color: isViewingCurrentMonth ? "var(--agenda-primary)" : "var(--agenda-inactive)",
                                    fontFamily: "var(--agenda-font-flavor)",
                                    fontWeight: 700,
                                    fontSize: { xs: "2rem", md: "3rem" },
                                    letterSpacing: "0.04em",
                                    lineHeight: 1,
                                    textShadow: isViewingCurrentMonth ? "0 3px 14px rgba(0, 0, 0, 0.24)" : "none",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 1,
                                }}
                            >
                                {isViewingCurrentMonth ? formatCurrentDateLabel(todayDate) : `(${formatMonthLabel(viewMonth)})`}
                                {isViewingCurrentMonth && <CurrentTimeIcon sx={{ fontSize: { xs: "1.4rem", md: "2rem" }, opacity: 0.9 }} />}
                            </Typography>

                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, opacity: 0.82, flexWrap: "wrap", justifyContent: "flex-end" }}>

                                <Button
                                    variant="secondary"
                                    onClick={() => changeMonth(-1)}
                                    onMouseEnter={() => setTooltip("Previous month", ArrowBackRounded)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <ArrowBackRounded fontSize="small" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={jumpToCurrentMonth}
                                    onMouseEnter={() => setTooltip("Jump to current month", TodayRounded)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <TodayRounded fontSize="small" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => changeMonth(1)}
                                    onMouseEnter={() => setTooltip("Next month", ArrowForwardRounded)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <ArrowForwardRounded fontSize="small" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => setShowContentManagement(true)}
                                    onMouseEnter={() => setTooltip("Manage configuration, actors, locations, and more", Settings)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <Settings fontSize="small" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => setScreenType(ScreenType.MENU)}
                                    onMouseEnter={() => setTooltip("Main menu", MenuRounded)}
                                    onMouseLeave={clearTooltip}
                                    style={{ padding: "8px 10px" }}
                                >
                                    <MenuRounded fontSize="small" />
                                </Button>
                            </Box>
                        </Box>

                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: calendarGridTemplateColumns,
                                gap: 0,
                                width: "100%",
                                minWidth: 0,
                                boxSizing: "border-box",
                                justifyItems: "stretch",
                                border: "1px solid var(--agenda-calendar-card-border)",
                                borderBottom: 0,
                                borderRadius: "12px 12px 0 0",
                                overflow: "hidden",
                            }}
                        >
                            {WEEKDAY_LABELS.map((label) => (
                                <Typography
                                    key={label}
                                    sx={{
                                        minWidth: 0,
                                        boxSizing: "border-box",
                                        color: "var(--agenda-inactive)",
                                        letterSpacing: "0.12em",
                                        textTransform: "uppercase",
                                        fontSize: "0.68rem",
                                        textAlign: "center",
                                        py: 0.85,
                                        borderRight: "1px solid var(--agenda-calendar-card-border)",
                                        background: "linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.015))",
                                        "&:last-of-type": {
                                            borderRight: 0,
                                        },
                                    }}
                                >
                                    {label}
                                </Typography>
                            ))}
                        </Box>

                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: calendarGridTemplateColumns,
                                gridTemplateRows: calendarGridTemplateRows,
                                gap: 0,
                                width: "100%",
                                minWidth: 0,
                                boxSizing: "border-box",
                                flex: 1,
                                minHeight: 0,
                                border: "1px solid var(--agenda-calendar-card-border)",
                                borderTop: 0,
                                borderRadius: "0 0 12px 12px",
                                overflow: "visible",
                                isolation: "isolate",
                                background: "var(--agenda-calendar-card-bg)",
                            }}
                        >
                            {monthGrid.map((cellDate) => {
                                const dateKey = formatDateKey(cellDate);
                                const isCurrentMonth = cellDate.getUTCMonth() === viewMonth.getUTCMonth();
                                const isToday = isSameDate(cellDate, todayDate);
                                const cellEvents = eventsByDate.get(dateKey) || [];
                                const hasEvents = cellEvents.length > 0;
                                const isActiveDate = hasEvents && activeDateKey === dateKey;

                                return (
                                    <motion.div
                                        key={dateKey}
                                        onHoverStart={hasEvents ? () => setActiveDateKey(dateKey) : undefined}
                                        onFocusCapture={hasEvents ? () => setActiveDateKey(dateKey) : undefined}
                                        onClick={hasEvents ? () => openDateDetails(dateKey) : undefined}
                                        whileHover={hasEvents ? { scale: 1.05 } : undefined}
                                        whileTap={hasEvents ? { scale: 0.995 } : undefined}
                                        style={{
                                            appearance: "none",
                                            border: 0,
                                            padding: 0,
                                            background: "transparent",
                                            textAlign: "left",
                                            width: "100%",
                                            height: "100%",
                                            minWidth: 0,
                                            zIndex: isActiveDate ? 4 : 1,
                                            position: "relative",
                                            transformOrigin: "center",
                                            cursor: hasEvents ? "pointer" : "default",
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                height: "100%",
                                                minHeight: 0,
                                                minWidth: 0,
                                                boxSizing: "border-box",
                                                borderRight: "1px solid var(--agenda-calendar-card-border)",
                                                borderBottom: "1px solid var(--agenda-calendar-card-border)",
                                                borderRadius: 0,
                                                borderTop: 0,
                                                borderLeft: 0,
                                                background: isCurrentMonth
                                                    ? "linear-gradient(178deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.005))"
                                                    : "rgba(0, 0, 0, 0.2)",
                                                opacity: isCurrentMonth ? 1 : 0.5,
                                                boxShadow: isToday
                                                    ? "inset 0 0 0 2px rgba(137, 205, 135, 0.42)"
                                                    : "none",
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 0.5,
                                                padding: "10px",
                                                overflow: "hidden",
                                                position: "relative",
                                                zIndex: 0,
                                                "&::before": hasEvents
                                                    ? {
                                                        content: '""',
                                                        position: "absolute",
                                                        inset: isActiveDate ? "-1px" : "0px",
                                                        background: isCurrentMonth
                                                            ? "linear-gradient(178deg, rgba(46, 53, 77, 0.98), rgba(28, 34, 52, 0.96))"
                                                            : "rgba(18, 24, 38, 0.96)",
                                                        border: "1px solid var(--agenda-calendar-card-border)",
                                                        opacity: isActiveDate ? 1 : 0,
                                                        transition: "opacity 180ms ease",
                                                        pointerEvents: "none",
                                                        zIndex: 0,
                                                    }
                                                    : undefined,
                                            }}
                                        >
                                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1 }}>
                                                <Typography
                                                    sx={{
                                                        position: "relative",
                                                        zIndex: 1,
                                                        color: isToday ? "var(--agenda-active)" : "var(--agenda-primary)",
                                                        fontWeight: 700,
                                                        fontSize: { xs: "0.82rem", md: "0.92rem" },
                                                    }}
                                                >
                                                    {cellDate.getUTCDate()}
                                                </Typography>
                                                {isToday && (
                                                    <Typography sx={{ position: "relative", zIndex: 1, color: "var(--agenda-active)", fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                                                        Today
                                                    </Typography>
                                                )}
                                            </Box>

                                            <Box sx={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 0.5, overflow: "hidden" }}>
                                                {cellEvents.slice(0, MAX_EVENT_LINES_PER_DAY).map((eventItem) => {
                                                    const participants = (eventItem.actorIds || eventItem.participantActorIds || [])
                                                        .map((actorId) => save.actors[actorId])
                                                        .filter(Boolean) as Actor[];
                                                    const leadActor = participants[0];
                                                    const eventPast = isPastEvent(eventItem, currentDateKey, currentSlotIndex);

                                                    return (
                                                        <Box
                                                            key={eventItem.id}
                                                            style={{
                                                                padding: 0,
                                                                width: "100%",
                                                                opacity: eventPast ? 0.45 : 1,
                                                            }}
                                                        >
                                                            <Box
                                                                sx={{
                                                                    position: "relative",
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    backgroundColor: `${leadActor?.themeColor || "#8ab0cc"}22`,
                                                                    border: `1px solid ${leadActor?.themeColor || "rgba(138, 176, 204, 0.48)"}`,
                                                                    borderRadius: "7px",
                                                                    padding: "4px 8px",
                                                                    minHeight: "30px",
                                                                    overflow: "hidden",
                                                                }}
                                                            >
                                                                <Box
                                                                    sx={{
                                                                        position: "absolute",
                                                                        right: 6,
                                                                        top: "50%",
                                                                        transform: "translateY(-50%)",
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        pointerEvents: "none",
                                                                        zIndex: 1,
                                                                    }}
                                                                >
                                                                    {participants.slice(0, 4).map((actor, index) => (
                                                                        <Box
                                                                            key={`${eventItem.id}-${actor.id}`}
                                                                            sx={{
                                                                                width: 20,
                                                                                height: 20,
                                                                                marginLeft: index === 0 ? 0 : -0.9,
                                                                                borderRadius: "50%",
                                                                                border: "1px solid rgba(237, 242, 242, 0.44)",
                                                                                backgroundImage: `url(${getEmotionImage(actor, "neutral", stageInstance, actor.outfitId) || getEmotionImage(actor, "base", stageInstance, actor.outfitId)})`,
                                                                                backgroundSize: "cover",
                                                                                backgroundPosition: "top center",
                                                                                backgroundColor: "rgba(12, 18, 28, 0.88)",
                                                                                boxShadow: "0 1px 4px rgba(0, 0, 0, 0.35)",
                                                                            }}
                                                                        />
                                                                    ))}
                                                                </Box>

                                                                <Typography
                                                                    sx={{
                                                                        position: "relative",
                                                                        zIndex: 2,
                                                                        color: "rgba(240, 246, 246, 0.98)",
                                                                        fontSize: "0.72rem",
                                                                        fontWeight: 700,
                                                                        letterSpacing: "0.01em",
                                                                        whiteSpace: "nowrap",
                                                                        overflow: "hidden",
                                                                        textOverflow: "ellipsis",
                                                                        paddingRight: "48px",
                                                                        width: "100%",
                                                                        fontFamily: leadActor?.themeFontFamily || "inherit",
                                                                        textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)",
                                                                        WebkitTextStroke: `0.6px ${leadActor?.themeColor || "rgba(12, 18, 28, 0.95)"}`,
                                                                    }}
                                                                >
                                                                    {eventItem.recurrence ? "↻ " : ""}{eventItem.name} · {formatDurationSummary(eventItem)}
                                                                </Typography>
                                                            </Box>
                                                        </Box>
                                                    );
                                                })}
                                            </Box>
                                        </Box>
                                    </motion.div>
                                );
                            })}
                        </Box>
                    </GlassPanel>
            </Box>

            <AnimatePresence>
                {selectedDateKey && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => {
                            setSelectedDateKey(null);
                            setSelectedEventId(null);
                        }}
                        style={{
                            position: "fixed",
                            inset: 0,
                            background: "linear-gradient(180deg, var(--agenda-calendar-overlay-start), var(--agenda-calendar-overlay-end))",
                            backdropFilter: "blur(5px)",
                            zIndex: 1200,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "16px",
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 18, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 12, scale: 0.97 }}
                            transition={{ duration: 0.24, ease: "easeOut" }}
                            onClick={(event) => event.stopPropagation()}
                            style={{ width: "min(1100px, 94vw)" }}
                        >
                            <GlassPanel variant="bright" style={{ display: "flex", flexDirection: "column", gap: 1, height: "50vh", maxHeight: "88vh", minHeight: 0 }}>
                                {(() => {
                                    const dateEvents = eventsByDate.get(selectedDateKey) || [];
                                    const orderedDateEvents = [...dateEvents].sort((left, right) => compareEventSchedule(left, right));
                                    const selectedEvent = dateEvents.find((eventItem) => eventItem.id === selectedEventId) || null;
                                    const selectedEventPast = selectedEvent ? isPastEvent(selectedEvent, currentDateKey, currentSlotIndex) : true;

                                    return (
                                        <>
                                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
                                    <Box>
                                        <Typography sx={{ color: "var(--agenda-primary)", fontWeight: 700, fontSize: { xs: "1rem", md: "1.2rem" } }}>
                                            Events on {formatDate(selectedDateKey)}
                                        </Typography>
                                        <Typography sx={{ color: "var(--agenda-inactive)", fontSize: "0.88rem" }}>
                                            Select an event, then confirm to begin.
                                        </Typography>
                                    </Box>
                                    <Typography sx={{ color: "var(--agenda-active)", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: "0.72rem" }}>
                                        Current Time: {formatTimeOfDay(currentTimeOfDay)}
                                    </Typography>
                                </Box>

                                <Box
                                    sx={{
                                        display: "flex",
                                        flexDirection: "column",
                                        flex: 1,
                                        border: "1px solid var(--agenda-calendar-card-border)",
                                        borderRadius: "12px",
                                        background: "linear-gradient(180deg, var(--agenda-calendar-card-bg), var(--agenda-glass))",
                                        padding: "12px",
                                        minHeight: 0,
                                        overflowY: "auto",
                                    }}
                                >
                                    <Box
                                        sx={{
                                            display: "grid",
                                            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                                            gap: 1,
                                            mb: 1.2,
                                        }}
                                    >
                                        {TIME_OF_DAY_ORDER.map((slot, slotIndex) => {
                                            const slotIsPast = isPastSlot(selectedDateKey, currentDateKey, currentSlotIndex, slotIndex);

                                            return (
                                                <Box
                                                    key={slot}
                                                    sx={{
                                                        minWidth: 0,
                                                        borderLeft: slotIndex === 0 ? "none" : "1px solid var(--agenda-calendar-card-border)",
                                                        pl: slotIndex === 0 ? 0 : 1,
                                                        opacity: slotIsPast ? 0.45 : 1,
                                                    }}
                                                >
                                                    <Typography sx={{ color: "var(--agenda-primary)", fontWeight: 700, fontSize: "0.78rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                                                        {formatTimeOfDay(slot)}
                                                    </Typography>
                                                </Box>
                                            );
                                        })}
                                    </Box>

                                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minHeight: 0 }}>
                                        {orderedDateEvents.length === 0 && (
                                            <Typography sx={{ color: "var(--agenda-inactive)", fontSize: "0.8rem", fontStyle: "italic", opacity: 0.7 }}>
                                                No events
                                            </Typography>
                                        )}

                                        {orderedDateEvents.map((eventItem) => {
                                            const participants = (eventItem.actorIds || eventItem.participantActorIds || [])
                                                .map((actorId) => save.actors[actorId])
                                                .filter(Boolean) as Actor[];
                                            const leadActor = participants[0];
                                            const eventIsPast = isPastEvent(eventItem, currentDateKey, currentSlotIndex);
                                            const selected = selectedEventId === eventItem.id;
                                            const startSlotIndex = Math.max(getEventStartSlotIndex(eventItem), 0);
                                            const endSlotIndex = Math.max(getEventEndSlotIndex(eventItem), startSlotIndex);

                                            return (
                                                <Box
                                                    key={eventItem.id}
                                                    sx={{
                                                        position: "relative",
                                                        display: "grid",
                                                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                                                        columnGap: 1,
                                                        alignItems: "stretch",
                                                        '&::before': {
                                                            content: '""',
                                                            position: "absolute",
                                                            inset: 0,
                                                            borderRadius: "10px",
                                                            background: "linear-gradient(90deg, var(--agenda-bg-soft) 0%, var(--agenda-bg-soft) 25%, var(--agenda-calendar-card-bg) 25%, var(--agenda-calendar-card-bg) 50%, var(--agenda-bg-soft) 50%, var(--agenda-bg-soft) 75%, var(--agenda-calendar-card-bg) 75%, var(--agenda-calendar-card-bg) 100%)",
                                                            opacity: 0.18,
                                                            pointerEvents: "none",
                                                        },
                                                    }}
                                                >
                                                    <motion.button
                                                        type="button"
                                                        onClick={() => setSelectedEventId(eventItem.id)}
                                                        whileHover={{ scale: 1.01 }}
                                                        whileTap={{ scale: 0.995 }}
                                                        style={{
                                                            appearance: "none",
                                                            border: selected
                                                                ? `2px solid ${leadActor?.themeColor || "var(--agenda-active)"}`
                                                                : `1px solid ${leadActor?.themeColor || "var(--agenda-calendar-card-border)"}`,
                                                            borderRadius: "9px",
                                                            padding: "10px",
                                                            background: "linear-gradient(145deg, var(--agenda-bg-soft), var(--agenda-bg-deep))",
                                                            textAlign: "left",
                                                            width: "100%",
                                                            cursor: "pointer",
                                                            opacity: eventIsPast ? 0.4 : 1,
                                                            gridColumn: `${startSlotIndex + 1} / ${endSlotIndex + 2}`,
                                                            position: "relative",
                                                            zIndex: 1,
                                                            minWidth: 0,
                                                        }}
                                                    >
                                                        <Typography sx={{ color: "var(--agenda-primary)", fontSize: "0.8rem", fontWeight: 700, lineHeight: 1.3 }}>
                                                            {eventItem.recurrence ? "↻ " : ""}{eventItem.name}
                                                        </Typography>
                                                        <Typography sx={{ color: "var(--agenda-inactive)", fontSize: "0.72rem", mt: 0.4 }}>
                                                            {formatDurationSummary(eventItem)} · {save.atlas[eventItem.locationId]?.name || "Unknown Location"}
                                                        </Typography>
                                                        {eventItem.recurrence && (
                                                            <Typography sx={{ color: "var(--agenda-inactive)", fontSize: "0.67rem", mt: 0.3, opacity: 0.86 }}>
                                                                {formatRecurrenceSummary(eventItem.recurrence)}
                                                            </Typography>
                                                        )}
                                                    </motion.button>
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                </Box>

                                <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap" }}>
                                    <Button
                                        variant="primary"
                                        onClick={() => selectedEventId && openEvent(selectedEventId)}
                                        onMouseEnter={() => selectedEvent ? setTooltip(`Open event: ${selectedEvent.name}`, EventAvailable) : undefined}
                                        onMouseLeave={clearTooltip}
                                        disabled={!selectedEvent || selectedEventPast}
                                        style={{ padding: "10px 14px", opacity: !selectedEvent || selectedEventPast ? 0.5 : 1 }}
                                    >
                                        Confirm
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        onClick={() => {
                                            setSelectedDateKey(null);
                                            setSelectedEventId(null);
                                        }}
                                        style={{ padding: "10px 14px" }}
                                    >
                                        Back
                                    </Button>
                                </Box>
                                        </>
                                    );
                                })()}
                            </GlassPanel>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {showContentManagement && (
                <ContentManagementScreen
                    stage={stage}
                    onClose={() => setShowContentManagement(false)}
                />
            )}
        </>
    );
};
