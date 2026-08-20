import { FC, useEffect, useState } from 'react';
import { Stage } from '../Stage';

interface FontHandlerProps {
	stage: () => Stage;
}

const GOOGLE_FONT_LINK_ATTRIBUTE = 'data-agenda-google-font';
const GOOGLE_FONT_PRECONNECT_ATTRIBUTE = 'data-agenda-google-font-preconnect';
const GOOGLE_FONT_VARIANTS = ':ital,wght@0,400;0,700;1,400;1,700';
const FONT_REFRESH_INTERVAL_MS = 500;

const GENERIC_FONT_FAMILIES = new Set([
	'serif',
	'sans-serif',
	'monospace',
	'cursive',
	'fantasy',
	'system-ui',
	'ui-serif',
	'ui-sans-serif',
	'ui-monospace',
	'ui-rounded',
	'emoji',
	'math',
	'fangsong',
	'inherit',
	'initial',
	'revert',
	'revert-layer',
	'unset',
]);

const splitFontStack = (fontStack: string): string[] => {
	const families: string[] = [];
	let current = '';
	let quote: string | null = null;
	let isEscaped = false;

	for (const character of fontStack) {
		if (isEscaped) {
			current += character;
			isEscaped = false;
			continue;
		}

		if (character === '\\') {
			isEscaped = true;
			current += character;
			continue;
		}

		if (quote) {
			if (character === quote) {
				quote = null;
			}
			current += character;
			continue;
		}

		if (character === '"' || character === "'") {
			quote = character;
			current += character;
			continue;
		}

		if (character === ',') {
			families.push(current);
			current = '';
			continue;
		}

		current += character;
	}

	if (current.trim()) {
		families.push(current);
	}

	return families;
};

const normalizeFontFamily = (fontFamily: string): string => {
	const trimmed = fontFamily.trim();
	const unquoted = (
		(trimmed.startsWith('"') && trimmed.endsWith('"'))
		|| (trimmed.startsWith("'") && trimmed.endsWith("'"))
	) ? trimmed.slice(1, -1) : trimmed;

	return unquoted.replace(/\\(["'])/g, '$1').replace(/\s+/g, ' ').trim();
};

const shouldImportFontFamily = (fontFamily: string): boolean => {
	const normalized = fontFamily.toLowerCase();
	return Boolean(fontFamily)
		&& !GENERIC_FONT_FAMILIES.has(normalized)
		&& !normalized.startsWith('var(')
		&& !normalized.startsWith('local(');
};

export const extractFontFamiliesFromStack = (fontStack: string): string[] => {
	return splitFontStack(fontStack)
		.map(normalizeFontFamily)
		.filter(shouldImportFontFamily);
};

const buildGoogleFontHref = (fontFamily: string): string => {
	const encodedFamily = encodeURIComponent(fontFamily).replace(/%20/g, '+');
	return `https://fonts.googleapis.com/css2?family=${encodedFamily}${GOOGLE_FONT_VARIANTS}&display=swap`;
};

const collectStageFontFamilies = (stageInstance: Stage): string[] => {
	const uiSettings = stageInstance.getUiSettings();
	const save = stageInstance.getSave();
	const configuration = stageInstance.getConfiguration();
	const fontStacks = [
		uiSettings.interfaceFontFamily,
		uiSettings.displayFontFamily,
		configuration.uiSettings?.interfaceFontFamily,
		configuration.uiSettings?.displayFontFamily,
		...Object.values(save.actors || {}).map(actor => actor.themeFontFamily),
		...(configuration.actors || []).map(actor => actor.themeFontFamily),
	];
	const fontFamilies = new Map<string, string>();

	fontStacks.forEach((fontStack) => {
		extractFontFamiliesFromStack(fontStack || '').forEach((fontFamily) => {
			const key = fontFamily.toLowerCase();
			if (!fontFamilies.has(key)) {
				fontFamilies.set(key, fontFamily);
			}
		});
	});

	return Array.from(fontFamilies.values()).sort((left, right) => left.localeCompare(right));
};

const ensureGoogleFontPreconnects = () => {
	const existingPreconnects = document.head.querySelectorAll(`link[${GOOGLE_FONT_PRECONNECT_ATTRIBUTE}]`);
	if (existingPreconnects.length > 0) {
		return;
	}

	[
		{ href: 'https://fonts.googleapis.com' },
		{ href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
	].forEach(({ href, crossOrigin }) => {
		const link = document.createElement('link');
		link.rel = 'preconnect';
		link.href = href;
		link.setAttribute(GOOGLE_FONT_PRECONNECT_ATTRIBUTE, 'true');
		if (crossOrigin) {
			link.crossOrigin = crossOrigin;
		}
		document.head.appendChild(link);
	});
};

const syncGoogleFontLinks = (fontFamilies: string[]) => {
	ensureGoogleFontPreconnects();

	const nextFontKeys = new Set(fontFamilies.map(fontFamily => fontFamily.toLowerCase()));
	document.head.querySelectorAll<HTMLLinkElement>(`link[${GOOGLE_FONT_LINK_ATTRIBUTE}]`).forEach((link) => {
		const fontKey = link.getAttribute(GOOGLE_FONT_LINK_ATTRIBUTE) || '';
		if (!nextFontKeys.has(fontKey)) {
			link.remove();
		}
	});

	fontFamilies.forEach((fontFamily) => {
		const fontKey = fontFamily.toLowerCase();
		const existingLink = document.head.querySelector<HTMLLinkElement>(`link[${GOOGLE_FONT_LINK_ATTRIBUTE}="${CSS.escape(fontKey)}"]`);
		if (existingLink) {
			return;
		}

		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = buildGoogleFontHref(fontFamily);
		link.setAttribute(GOOGLE_FONT_LINK_ATTRIBUTE, fontKey);
		document.head.appendChild(link);
	});
};

export const FontHandler: FC<FontHandlerProps> = ({ stage }) => {
	const [fontSignature, setFontSignature] = useState('');

	useEffect(() => {
		const refreshFontSignature = () => {
			setFontSignature(collectStageFontFamilies(stage()).join('\n'));
		};

		refreshFontSignature();
		const intervalId = window.setInterval(refreshFontSignature, FONT_REFRESH_INTERVAL_MS);

		return () => window.clearInterval(intervalId);
	}, [stage]);

	useEffect(() => {
		syncGoogleFontLinks(fontSignature ? fontSignature.split('\n') : []);
	}, [fontSignature]);

	useEffect(() => {
		return () => {
			document.head.querySelectorAll(`link[${GOOGLE_FONT_LINK_ATTRIBUTE}]`).forEach(link => link.remove());
			document.head.querySelectorAll(`link[${GOOGLE_FONT_PRECONNECT_ATTRIBUTE}]`).forEach(link => link.remove());
		};
	}, []);

	return null;
};
