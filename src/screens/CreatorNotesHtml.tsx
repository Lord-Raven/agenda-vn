import React, { FC, useMemo } from 'react';
import { Stage } from '../Stage';
import { Actor, getEmotionImage } from '../content/Actor';
import { Location, getLocationImageUrl } from '../content/Location';

export interface CreatorNotesHtmlProps {
    stage: Stage;
    title: string;
    artStyle?: string;
    backgroundImageUrl?: string;
    titleImageUrl?: string;
    activeActors: Actor[];
    activeLocations: Location[];
}

const defaultBackgroundImageUrl = 'https://avatars.charhub.io/avatars/uploads/images/gallery/file/5c990a43-3e56-455f-ba19-ba487eec4972/1a9f6a36-676f-4dc1-85ae-29bf7a97e538.png';

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
    title,
    artStyle,
    backgroundImageUrl,
    titleImageUrl,
    activeActors,
    activeLocations,
}: CreatorNotesHtmlProps): string => {
    const titleText = (title || 'Untitled Game').trim() || 'Untitled Game';
    const gameDescription = artStyle?.trim() || 'A story-driven visual novel where lives, choices, and memory reshape the world.';

    const castItems = activeActors
        .filter(actor => actor?.name && actor !== stage?.getPlayerActor())
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .slice(0, 100)
        .map((actor) => {
            const actorName = escapeHtml(actor.displayName || actor.name || 'Unnamed Character');
            const actorBackground = escapeHtml((actor.background || actor.description || 'No background provided.').replace(/\s+/g, ' ').trim());
            const portraitUrl = getEmotionImage(actor, 'neutral', stage, actor.outfitId) || getEmotionImage(actor, 'base', stage, actor.outfitId) || ' ';
            return `<div class="cast-item" tabindex="0"><img src="${escapeHtml(portraitUrl)}" alt="${actorName}" class="cast-portrait" /><span class="cast-name">${actorName}</span><div class="cast-tooltip">${actorBackground}</div></div>`;
        })
        .join('');

    const locationCount = Math.min(activeLocations.length, 18);
    const firstLocationImages = activeLocations
        .map((location) => getLocationImageUrl(location, stage))
        .filter(Boolean)
        .slice(0, Math.floor(locationCount / 3));
    const secondLocationImages = activeLocations
        .map((location) => getLocationImageUrl(location, stage))
        .filter(Boolean)
        .slice(Math.floor(locationCount / 3), Math.floor((locationCount / 3) * 2));
    const thirdLocationImages = activeLocations
        .map((location) => getLocationImageUrl(location, stage))
        .filter(Boolean)
        .slice(Math.floor((locationCount / 3) * 2), locationCount);
    const resolvedLocationImages = (images: string[], fallbackIndex: number) => {
        const base = images.length > 0 ? images : [backgroundImageUrl || titleImageUrl || defaultBackgroundImageUrl];
        return Array.from({ length: 3 }, (_, index) => base[(index + fallbackIndex) % base.length] || base[0]).filter(Boolean);
    };
    const slideshowMarkup = (imageSet: string[], animationKey: string) => {
        const images = resolvedLocationImages(imageSet, animationKey.length);
        const slides = images
            .map((imageUrl, index) => `<img src="${escapeHtml(imageUrl)}" alt="" class="slideshow-slide" style="animation-delay:${index * 5}s;" />`)
            .join('');
        return `<div class="panel-img-col"><div class="photo-cycler photo-cycler-${animationKey}">${slides}</div></div>`;
    };

    const locationSlideshowA = slideshowMarkup(firstLocationImages, 'a');
    const locationSlideshowB = slideshowMarkup(secondLocationImages, 'b');
    const locationSlideshowC = slideshowMarkup(thirdLocationImages, 'c');

    const uiSettings = stage.getUiSettings();
    const creatorNotesStyle = `.creator-notes{--mem-bg-deep:${uiSettings.surfaceBaseColor};--mem-bg-mid:${uiSettings.surfaceBaseColor};--mem-bg-soft:${uiSettings.surfaceElevatedColor};--mem-fog:${uiSettings.textPrimaryColor};--mem-mist:${uiSettings.textMutedColor};--mem-verdant:${uiSettings.highlightColor};--mem-border:${uiSettings.lineSubtleColor};--mem-border-strong:${uiSettings.lineStrongColor};--mem-shadow:0 14px 34px rgba(2,8,18,0.48);--mem-glow:0 0 20px ${uiSettings.accentColor};--mem-font-flavor:${uiSettings.displayFontFamily};--mem-font-ui:${uiSettings.interfaceFontFamily};margin:16px auto;max-width:100%;color:var(--mem-fog);font-family:var(--mem-font-ui);line-height:1.55}.creator-notes .panel{position:relative;display:flex;flex-direction:row;align-items:stretch;border:1px solid var(--mem-border);border-radius:14px;margin:20px 0;overflow:visible;background:linear-gradient(160deg, ${uiSettings.panelSurfaceColor} 0%, ${uiSettings.surfaceBaseColor} 100%), radial-gradient(circle at 8% 14%, ${uiSettings.accentColor}33, transparent 60%);box-shadow:var(--mem-shadow), inset 0 1px 0 rgba(255,255,255,0.05);backdrop-filter:blur(12px)}.creator-notes .panel:hover{border-color:${uiSettings.lineStrongColor};box-shadow:var(--mem-shadow), var(--mem-glow), inset 0 1px 0 rgba(255,255,255,0.07)}.creator-notes .panel-content{flex:1 1 auto;padding:16px 22px}.creator-notes .panel-img-col{position:relative;flex:0 0 24%;min-width:130px;background:linear-gradient(180deg, ${uiSettings.surfaceBaseColor}80, ${uiSettings.surfaceBaseColor}26);overflow:hidden}.creator-notes .photo-cycler{position:absolute;inset:0;width:100%;height:100%}.creator-notes .slideshow-slide{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 15%;opacity:0;animation:creator-notes-fade 15s ease-in-out infinite}.creator-notes .panel-img-col .slideshow-slide:nth-child(1){opacity:1}.creator-notes .panel-img-col .slideshow-slide:nth-child(2),.creator-notes .panel-img-col .slideshow-slide:nth-child(3){opacity:0}.creator-notes .cast-tooltip{position:absolute;left:50%;bottom:calc(100% + 8px);transform:translate(-50%, 0);width:min(220px,80vw);padding:10px 12px;line-height:1.4;background:${uiSettings.surfaceBaseColor};border:1px solid ${uiSettings.lineSubtleColor};border-radius:10px;box-shadow:0 14px 30px rgba(2,8,18,0.6);font-size:0.76rem;color:${uiSettings.textPrimaryColor};opacity:0;pointer-events:none;transition:opacity 120ms ease, transform 120ms ease;z-index:20;overflow:visible}.creator-notes .cast-item{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;text-decoration:none;text-align:center;padding:6px 4px;border-radius:10px;color:${uiSettings.textMutedColor};background:linear-gradient(180deg, ${uiSettings.highlightColor}12, ${uiSettings.accentColor}10);transition:transform 120ms ease, box-shadow 120ms ease, background-color 120ms ease;overflow:visible;z-index:1}.creator-notes .cast-item:hover{transform:translateY(-1px);box-shadow:0 0 0 1px ${uiSettings.highlightColor}4d, 0 4px 12px rgba(2,8,18,0.38);background:linear-gradient(180deg, ${uiSettings.highlightColor}1a, ${uiSettings.accentColor}15)}.creator-notes .cast-item:hover .cast-tooltip,.creator-notes .cast-item:focus .cast-tooltip,.creator-notes .cast-item:focus-within .cast-tooltip{opacity:1;transform:translate(-50%, -2px)}.creator-notes .cast-portrait{width:128px;height:128px;border-radius:999px;object-fit:cover;object-position:50% 16%;margin-bottom:4px;border:1px solid ${uiSettings.textPrimaryColor}59;box-shadow:0 2px 8px rgba(2,8,18,0.45)}.creator-notes .cast-name{display:block;font-size:1rem;line-height:1.12;font-weight:600;color:${uiSettings.textPrimaryColor};max-width:100%;overflow-wrap:anywhere}.creator-notes .panel h2{margin:0 0 10px;font-size:1.4em;font-family:var(--mem-font-flavor);letter-spacing:0.06em;text-transform:uppercase;color:${uiSettings.textPrimaryColor};text-shadow:0 0 18px ${uiSettings.accentColor}55, 0 4px 10px rgba(3,7,15,0.66)}.creator-notes .panel p{margin:0.4em 0;color:${uiSettings.textMutedColor}}.creator-notes .panel b{color:${uiSettings.textPrimaryColor}}.creator-notes .panel i{color:${uiSettings.textMutedColor}}.creator-notes .cast-intro{margin-top:0;font-size:0.82rem;opacity:0.9}.creator-notes .cast-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(128px,1fr));gap:4px;margin-top:4px}@keyframes creator-notes-fade{0%,100%{opacity:0;transform:scale(1.02)}8%,42%{opacity:1}55%,88%{opacity:0}}@media (max-width:700px){.creator-notes .panel{flex-direction:column}.creator-notes .panel-img-col{min-height:140px;flex:0 0 140px}.creator-notes .panel-content{padding:14px 16px}.creator-notes .cast-grid{grid-template-columns:repeat(auto-fill, minmax(78px,1fr));gap:6px}.creator-notes .cast-portrait{width:128px;height:128px}}`;

    return `<div class="creator-notes">
  <section class="panel">
    ${locationSlideshowA}
    <div class="panel-content">
      <h2>${escapeHtml(titleText)}</h2>
      <p>${escapeHtml(gameDescription)}</p>
    </div>
  </section>
  <section class="panel">
    <div class="panel-content">
      <h2>The cast</h2>
      <div class="cast-grid">${castItems || '<div class="cast-intro">No active actors are configured for this game yet.</div>'}</div>
    </div>
    ${locationSlideshowB}
  </section>
  <section class="panel">
    ${locationSlideshowC}
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
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
};
