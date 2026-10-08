import React, { FC, useEffect, useMemo, useRef } from 'react';
import { Stage } from '../Stage';
import { Actor, getEmotionImage } from '../content/Actor';
import { Location, getLocationImageUrl } from '../content/Location';
import { buildGoogleFontImportRules } from '@lord-raven/novel-visualizer';

export interface CreatorNotesHtmlProps {
    stage: Stage;
    creatorNotes?: string;
    backgroundImageUrl?: string;
    titleImageUrl?: string;
    activeActors: Actor[];
    activeLocations: Location[];
    castActorIds?: string[];
    slideshowLocationIds?: string[];
}

const escapeHtml = (value: string) => {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

export const buildCreatorNotesHtml = ({
    stage,
    creatorNotes,
    backgroundImageUrl,
    titleImageUrl,
    activeActors,
    activeLocations,
    castActorIds,
    slideshowLocationIds,
}: CreatorNotesHtmlProps): string => {
    const gameDescription = creatorNotes?.trim() || 'A story-driven visual novel where lives, choices, and memory reshape the world.';

    const castActors = castActorIds && castActorIds.length > 0
        ? activeActors.filter(actor => castActorIds.includes(actor.id))
        : activeActors;

    const visibleCastActors = castActors
        .filter(actor => actor?.name && actor !== stage?.getPlayerActor())
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .slice(0, 100);
    const castSizeForScaling = Math.min(30, Math.max(1, visibleCastActors.length));
    const castPortraitSize = Math.round(256 - (castSizeForScaling - 1) * 128 / 29);
    const castItems = visibleCastActors
        .map((actor, index) => {
            const actorName = escapeHtml(actor.displayName || actor.name || 'Unnamed Character');
            const actorSummary = escapeHtml((actor.summary || 'No summary provided.').replace(/\s+/g, ' ').trim());
            const portraitUrl = getEmotionImage(actor, 'neutral', stage, actor.outfitId) || getEmotionImage(actor, 'base', stage, actor.outfitId) || ' ';
            return `<div class="cast-item" tabindex="0" data-cast-item style="anchor-name: --cast-${index}; --cast-anchor: --cast-${index};"><img src="${escapeHtml(portraitUrl)}" alt="${actorName}" class="cast-portrait" /><span class="cast-name">${actorName}</span><div class="cast-tooltip">${actorSummary}</div></div>`;
        })
        .join('');

    const slideshowLocations = slideshowLocationIds && slideshowLocationIds.length > 0
        ? activeLocations.filter(location => slideshowLocationIds.includes(location.id))
        : activeLocations;
    const locationCount = Math.min(slideshowLocations.length, 12);
    const firstLocationImages = slideshowLocations
        .map((location) => getLocationImageUrl(location, stage))
        .filter(Boolean)
        .slice(0, Math.floor(locationCount / 2));
    const secondLocationImages = slideshowLocations
        .map((location) => getLocationImageUrl(location, stage))
        .filter(Boolean)
        .slice(Math.floor(locationCount / 2), Math.floor((locationCount / 2) * 2));
    const resolvedLocationImages = (images: string[], fallbackIndex: number) => {
        const base = images.length > 0 ? images : [backgroundImageUrl || titleImageUrl].filter(Boolean);
        return Array.from({ length: 3 }, (_, index) => base[(index + fallbackIndex) % base.length] || base[0]).filter(Boolean);
    };
    const slideIntervalSeconds = 5;
    const slideshowPhaseOffsetSeconds = slideIntervalSeconds / 2;

    const slideshowMarkup = (imageSet: string[], animationKey: string, phaseOffsetSeconds: number) => {
        const images = resolvedLocationImages(imageSet, animationKey.length);
        const slides = images
            .map((imageUrl, index) => `<img src="${escapeHtml(imageUrl || '')}" alt="" class="slideshow-slide" style="animation-delay:${index * slideIntervalSeconds + phaseOffsetSeconds}s;" />`)
            .join('');
        return `<div class="panel-img-col"><div class="photo-cycler photo-cycler-${animationKey}">${slides}</div></div>`;
    };

    const locationSlideshowA = slideshowMarkup(firstLocationImages, 'a', 0);
    const locationSlideshowB = slideshowMarkup(secondLocationImages, 'b', slideshowPhaseOffsetSeconds);

    const uiSettings = stage.getUiSettings();
    const googleFontImports = buildGoogleFontImportRules([
        uiSettings.primaryFontFamily,
        uiSettings.flavorFontFamily,
    ]);
    const creatorNotesStyle = `
        ${googleFontImports}
        h3.ant-typography{ font-family: ${uiSettings.flavorFontFamily} !important; }
        .creator-notes {
            --mem-bg-deep: ${uiSettings.surfaceBaseColor};
            --mem-bg-mid: ${uiSettings.surfaceBaseColor};
            --mem-bg-soft: ${uiSettings.surfaceElevatedColor};
            --mem-fog: ${uiSettings.textPrimaryColor};
            --mem-mist: ${uiSettings.textMutedColor};
            --mem-verdant: ${uiSettings.highlightColor};
            --mem-border: ${uiSettings.lineColor};
            --mem-shadow: 0 14px 34px rgba(2, 8, 18, 0.48);
            --mem-glow: 0 0 20px ${uiSettings.accentColor};
            --mem-font-flavor: ${uiSettings.flavorFontFamily};
            --mem-font-ui: ${uiSettings.primaryFontFamily};
            margin: 16px auto;
            max-width: 100%;
            color: var(--mem-fog);
            font-family: var(--mem-font-ui);
            line-height: 1.55;
        }
        .creator-notes .panel {
            position: relative;
            display: flex;
            flex-direction: row;
            align-items: stretch;
            border: 1px solid var(--mem-border);
            border-radius: 14px;
            margin: 20px 0;
            overflow: visible;
            background: linear-gradient(160deg, ${uiSettings.panelSurfaceColor} 0%, ${uiSettings.surfaceBaseColor} 100%), radial-gradient(circle at 8% 14%, ${uiSettings.accentColor}33, transparent 60%);
            box-shadow: var(--mem-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(12px);
        }
        .creator-notes .panel.panel-with-slideshow { overflow: hidden; }
        /* A backdrop filter would make the panel the fixed tooltip's containing block. */
        .creator-notes .panel.panel-cast { backdrop-filter: none; z-index: 2; }
        .creator-notes .panel:hover {
            border-color: ${uiSettings.lineColor};
            box-shadow: var(--mem-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.07);
        }
        .creator-notes .panel-content { flex: 1 1 auto; min-width: 0; padding: 16px 22px; }
        .creator-notes .panel-img-col {
            position: relative;
            flex: 0 0 24%;
            min-width: 130px;
            background: linear-gradient(180deg, ${uiSettings.surfaceBaseColor}80, ${uiSettings.surfaceBaseColor}26);
            overflow: hidden;
        }
        .creator-notes .photo-cycler { position: absolute; inset: 0; width: 100%; height: 100%; }
        .creator-notes .slideshow-slide {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: 50% 15%;
            opacity: 0;
            animation: creator-notes-fade 15s ease-in-out infinite;
        }
        .creator-notes .panel-img-col .slideshow-slide:nth-child(1) { opacity: 1; }
        .creator-notes .panel-img-col .slideshow-slide:nth-child(2),
        .creator-notes .panel-img-col .slideshow-slide:nth-child(3) { opacity: 0; }
        .creator-notes .cast-tooltip {
            position: absolute;
            left: calc(50% + var(--cast-tooltip-shift, 0px));
            bottom: calc(100% - var(--cast-tooltip-shift-y, 0px));
            transform: translateX(-50%);
            width: max-content;
            max-width: min(360px, var(--cast-tooltip-width, calc(100vw - 24px)));
            max-height: var(--cast-tooltip-height, calc(100dvh - 24px));
            box-sizing: border-box;
            padding: 10px 12px;
            line-height: 1.4;
            background: ${uiSettings.surfaceBaseColor};
            border: 1px solid ${uiSettings.lineColor};
            border-radius: 10px;
            box-shadow: 0 14px 30px rgba(2, 8, 18, 0.6);
            font-size: 0.76rem;
            color: ${uiSettings.textPrimaryColor};
            text-align: left;
            white-space: normal;
            overflow-wrap: anywhere;
            opacity: 0;
            pointer-events: none;
            transition: opacity 120ms ease;
            z-index: 20;
            overflow: auto;
        }
        .creator-notes .cast-item {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            text-decoration: none;
            text-align: center;
            padding: 6px 4px;
            border-radius: 10px;
            color: ${uiSettings.textMutedColor};
            background: linear-gradient(180deg, ${uiSettings.highlightColor}12, ${uiSettings.accentColor}10);
            transition: transform 120ms ease, box-shadow 120ms ease, background-color 120ms ease;
            overflow: visible;
            z-index: 1;
        }
        .creator-notes .cast-item:hover {
            z-index: 3;
            box-shadow: 0 0 0 1px ${uiSettings.highlightColor}4d, 0 4px 12px rgba(2, 8, 18, 0.38);
            background: linear-gradient(180deg, ${uiSettings.highlightColor}1a, ${uiSettings.accentColor}15);
        }
        .creator-notes .cast-item:hover .cast-tooltip,
        .creator-notes .cast-item:focus .cast-tooltip,
        .creator-notes .cast-item:focus-within .cast-tooltip { opacity: 1; pointer-events: auto; }
        .creator-notes .cast-item:focus-within { z-index: 3; }
        @supports (position-area: top) and (anchor-scope: all) {
            .creator-notes .cast-grid { anchor-scope: all; }
            .creator-notes .cast-tooltip {
                position: fixed;
                position-anchor: var(--cast-anchor);
                inset: auto;
                position-area: top;
                margin: 0 12px;
                transform: none;
                max-width: min(360px, calc(100vw - 24px));
                /* Percentages use the available space in each candidate position. */
                max-height: min(320px, calc(100% - 24px));
                position-try-order: most-height;
                position-try-fallbacks: --cast-top-right, --cast-top-left, bottom, --cast-bottom-right, --cast-bottom-left;
            }
        }
        @position-try --cast-top-right { position-area: top span-right; justify-self: start; }
        @position-try --cast-top-left { position-area: top span-left; justify-self: end; }
        @position-try --cast-bottom-right { position-area: bottom span-right; justify-self: start; }
        @position-try --cast-bottom-left { position-area: bottom span-left; justify-self: end; }
        .creator-notes .cast-portrait {
            width: min(var(--cast-portrait-size), calc(100% - 2px));
            height: auto;
            aspect-ratio: 1;
            border-radius: 999px;
            object-fit: cover;
            object-position: 50% 16%;
            margin-bottom: 4px;
            border: 1px solid ${uiSettings.textPrimaryColor}59;
            box-shadow: 0 2px 8px rgba(2, 8, 18, 0.45);
        }
        .creator-notes .cast-name { display: block; font-size: 1rem; line-height: 1.12; font-weight: 700; color: ${uiSettings.textPrimaryColor}; max-width: 100%; overflow-wrap: anywhere; }
        .creator-notes .panel h2 { margin: 0 0 10px; font-size: 1.4em; font-family: var(--mem-font-flavor); letter-spacing: 0.06em; text-transform: uppercase; color: ${uiSettings.textPrimaryColor}; text-shadow: 0 0 18px ${uiSettings.accentColor}55, 0 4px 10px rgba(3, 7, 15, 0.66); }
        .creator-notes .panel p { margin: 0.4em 0; color: ${uiSettings.textMutedColor}; }
        .creator-notes .panel b { color: ${uiSettings.textPrimaryColor}; }
        .creator-notes .panel i { color: ${uiSettings.textMutedColor}; }
        .creator-notes .cast-intro { margin-top: 0; font-size: 0.82rem; opacity: 0.9; }
        .creator-notes .cast-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, calc(var(--cast-portrait-size) + 10px)), 1fr)); gap: 4px; margin-top: 4px; }
        @keyframes creator-notes-fade { 0%, 100% { opacity: 0; transform: scale(1.02); } 8%, 42% { opacity: 1; } 55%, 88% { opacity: 0; } }
        @media (max-width: 700px) {
            .creator-notes .panel { flex-direction: column; }
            .creator-notes .panel-img-col { min-height: 140px; flex: 0 0 140px; }
            .creator-notes .panel-content { padding: 14px 16px; }
            .creator-notes .cast-grid { gap: 6px; }
        }
    `.replace(/\s+/g, ' ').trim();

        return `<div class="creator-notes">
    <section class="panel panel-with-slideshow">
    ${locationSlideshowA}
    <div class="panel-content">
      <p>${gameDescription}</p>
    </div>
  </section>
    <section class="panel panel-cast">
    <div class="panel-content">
      <h2>The cast</h2>
      <div class="cast-grid" style="--cast-portrait-size: ${castPortraitSize}px;">${castItems || '<div class="cast-intro">No active actors are configured for this game yet.</div>'}</div>
    </div>
  </section>
  <section class="panel panel-with-slideshow">
    ${locationSlideshowB}
    <div class="panel-content">
      <h2>Stage Details</h2>
      <p>This bot leverages a visual novel stage framework called Agenda VN.</p>
      <p>Story beats are shaped by the current lorebook, active locations, and evolving actor states. The world updates as each skit advances and the cast reacts to new developments.</p>
    </div>
  </section>
</div>
<style>${creatorNotesStyle}</style>`;

};

export const CreatorNotesHtml: FC<CreatorNotesHtmlProps> = (props) => {
    const html = useMemo(() => buildCreatorNotesHtml(props), [props]);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const notesContainer = containerRef.current;
        if (!notesContainer || (CSS.supports('position-area', 'top') && CSS.supports('anchor-scope', 'all'))) {
            return;
        }

        const syncActorTooltipOffsets = () => {
            const viewport = window.visualViewport;
            const viewportWidth = viewport?.width || window.innerWidth;
            const viewportHeight = viewport?.height || window.innerHeight;
            const viewportLeft = (viewport?.offsetLeft || 0) + 12;
            const viewportTop = (viewport?.offsetTop || 0) + 12;
            const items = notesContainer.querySelectorAll('[data-cast-item]');

            items.forEach((item) => {
                const tooltip = item.querySelector<HTMLElement>('.cast-tooltip');
                if (!tooltip) {
                    return;
                }

                tooltip.style.setProperty('--cast-tooltip-width', `${Math.max(0, viewportWidth - 24)}px`);
                tooltip.style.setProperty('--cast-tooltip-height', `${Math.max(0, viewportHeight - 24)}px`);
                tooltip.style.setProperty('--cast-tooltip-shift', '0px');
                tooltip.style.setProperty('--cast-tooltip-shift-y', '0px');

                const tooltipRect = tooltip.getBoundingClientRect();
                const minShift = viewportLeft - tooltipRect.left;
                const maxShift = viewportLeft + viewportWidth - 24 - tooltipRect.right;
                const clampShift = Math.max(minShift, Math.min(maxShift, 0));
                tooltip.style.setProperty('--cast-tooltip-shift', `${clampShift}px`);
                const itemRect = item.getBoundingClientRect();
                const belowShift = itemRect.bottom - tooltipRect.top;
                const preferredShiftY = tooltipRect.top < viewportTop ? belowShift : 0;
                const minShiftY = viewportTop - tooltipRect.top;
                const maxShiftY = viewportTop + viewportHeight - 24 - tooltipRect.bottom;
                tooltip.style.setProperty('--cast-tooltip-shift-y', `${Math.max(minShiftY, Math.min(maxShiftY, preferredShiftY))}px`);
            });
        };

        syncActorTooltipOffsets();
        window.addEventListener('resize', syncActorTooltipOffsets);
        window.addEventListener('scroll', syncActorTooltipOffsets, true);
        notesContainer.addEventListener('pointerover', syncActorTooltipOffsets);
        notesContainer.addEventListener('focusin', syncActorTooltipOffsets);
        window.visualViewport?.addEventListener('resize', syncActorTooltipOffsets);
        window.visualViewport?.addEventListener('scroll', syncActorTooltipOffsets);

        return () => {
            window.removeEventListener('resize', syncActorTooltipOffsets);
            window.removeEventListener('scroll', syncActorTooltipOffsets, true);
            notesContainer.removeEventListener('pointerover', syncActorTooltipOffsets);
            notesContainer.removeEventListener('focusin', syncActorTooltipOffsets);
            window.visualViewport?.removeEventListener('resize', syncActorTooltipOffsets);
            window.visualViewport?.removeEventListener('scroll', syncActorTooltipOffsets);
        };
    }, [html]);

    return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: html }} />;
};
