/**
 * Shared UI Components
 * Reusable components for the game.
 * Can use Material UI and Framer Motion, as desired.
 */

import React, { FC, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Actor } from '../content/Actor';
import { motion, AnimatePresence } from 'framer-motion';
import { HourglassTop, HourglassBottom } from '@mui/icons-material';
import { Box, lighten, Chip as MuiChip, Popover, Typography } from '@mui/material';
import { useTooltip } from './TooltipContext';

/* ===============================================
   PANEL COMPONENTS (Using MUI Paper with custom styling)
   =============================================== */

interface GlassPanelProps {
	variant?: 'default' | 'bright';
	children: ReactNode;
	className?: string;
	style?: React.CSSProperties;
}

export const GlassPanel: FC<GlassPanelProps> = ({ 
	variant = 'default', 
	children,
	style,
}) => {
	return (
		<Box 
			className={variant === 'bright' ? 'glass-panel-bright' : 'glass-panel'}
			sx={{
				padding: '24px',
				...style
			}}
		>
			{children}
		</Box>
	);
};

/* ===============================================
   BUTTON COMPONENTS (Wrapping MUI Button)
   =============================================== */

interface ButtonProps {
	variant?: 'primary' | 'secondary' | 'menu' | 'danger';
	children: ReactNode;
	disabled?: boolean;
	onClick?: () => void;
	style?: React.CSSProperties;
	className?: string;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
}

export const Button: FC<ButtonProps> = ({ 
	variant = 'primary', 
	children, 
	disabled = false,
	onClick,
	className = '',
	style,
	onMouseEnter,
	onMouseLeave,
}) => {
	const buttonClass = `btn-${variant}`;
	
	return (
		<motion.button
			className={`${buttonClass} ${className}`}
			disabled={disabled}
			onClick={onClick}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
			whileHover={!disabled ? { scale: variant === 'menu' ? 1 : 1.03 } : {}}
			whileTap={!disabled ? { scale: 0.98 } : {}}
			style={{
				height: 'fit-content',
				alignSelf: 'center',
				...style
			}}
		>
			{children}
		</motion.button>
	);
};

/* ===============================================
	PROGRESS INDICATORS
   =============================================== */

interface TurnIndicatorProps {
	currentTurn: number;
	totalTurns: number;
}

export const TurnIndicator: FC<TurnIndicatorProps> = ({ currentTurn, totalTurns }) => {
	return (
		<Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
			{Array.from({ length: totalTurns }).map((_, index) => {
				const isSpent = index < currentTurn;
				const HourglassIcon = isSpent ? HourglassTop : HourglassBottom;
				
				return (
					<motion.div
						key={index}
						initial={{ scale: 0, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={{ 
							duration: 0.3, 
							delay: index * 0.1,
							ease: "easeOut"
						}}
						whileHover={{ 
							scale: 1.2,
							transition: { duration: 0.2 }
						}}
					>
						<HourglassIcon
							sx={{
								color: isSpent ? 'var(--agenda-text-muted)' : 'var(--agenda-accent-primary)',
								filter: isSpent ? 'none' : 'drop-shadow(0 0 8px color-mix(in srgb, var(--agenda-accent-primary) 45%, transparent))',
								fontSize: '28px',
							}}
						/>
					</motion.div>
				);
			})}
		</Box>
	);
};

/* ===============================================
   TEXT COMPONENTS (Using MUI Typography)
   =============================================== */

interface TitleProps {
	variant?: 'primary' | 'glow';
	children: ReactNode;
	style?: React.CSSProperties;
	className?: string;
}

export const Title: FC<TitleProps> = ({ 
	variant = 'primary', 
	children,
	style,
	className = ''
}) => {
	const textClass = variant === 'primary' ? 'text-glow-primary' : 'text-gradient';
	
	return (
		<Typography 
			variant="h1" 
			className={`${textClass} ${className}`} 
			sx={{ 
				fontSize: { xs: '1.5rem', sm: '2rem', md: '2.5rem' },
				...style 
			}}
		>
			{children}
		</Typography>
	);
};

/* ===============================================
   NAMEPLATE COMPONENT
   =============================================== */

interface NamePlateProps {
	actor?: Actor;
	style?: React.CSSProperties;
	className?: string;
}

export const NamePlate: FC<NamePlateProps> = ({
	actor,
	style,
	className = ''
}) => {
	if (!actor) {
		return null;
	}

	const themeColor = actor.themeColor || '#8ab0cc';
	const { clearTooltip } = useTooltip();

	return (
		<Box
			component={'div'}
			className={className}
			onMouseLeave={clearTooltip}
			sx={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				position: 'relative',
				overflow: 'hidden',
				borderRadius: '10px',
				background: `linear-gradient(135deg, rgba(27, 33, 51, 0.78) 0%, rgba(34, 42, 64, 0.72) 100%), 
					radial-gradient(circle at 50% 50%, ${themeColor}15, transparent 70%)`,
				backdropFilter: 'blur(12px)',
				border: '2px solid transparent',
				backgroundImage: `
					linear-gradient(135deg, rgba(27, 33, 51, 0.78) 0%, rgba(34, 42, 64, 0.72) 100%),
					radial-gradient(circle at 50% 50%, ${themeColor}15, transparent 70%),
					linear-gradient(135deg, ${themeColor}, ${themeColor})
				`,
				backgroundOrigin: 'border-box',
				backgroundClip: 'padding-box, padding-box, border-box',
				boxShadow: `0 6px 16px rgba(0, 0, 0, 0.5), 0 0 15px ${themeColor}33`,
				color: '#ffffff',
				textShadow: `0 0 8px ${themeColor}80, 0 2px 4px rgba(0, 0, 0, 0.8)`,
				fontWeight: 700,
				fontSize: '1.2rem',
				padding: '2px 6px',
				minHeight: '30px',
				cursor: 'default',
				textDecoration: 'none',
				...style,
				'&::after': {
					content: '""',
					position: 'absolute',
					inset: 0,
					background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0) 60%)',
					opacity: 0.5,
					pointerEvents: 'none'
				}
			}}
		>
			<span
				style={{
					fontFamily: actor.themeFontFamily || 'inherit',
					position: 'relative',
					zIndex: 1,
					fontSize: 'inherit'
				}}
			>
				{actor.name}
			</span>
		</Box>
	);
};

/* ===============================================
   INPUT COMPONENTS (Using MUI TextField)
   =============================================== */

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
	fullWidth?: boolean;
	style?: React.CSSProperties;
	className?: string;
}

export const TextInput: FC<TextInputProps> = ({ 
	fullWidth = false,
	className = '',
	style,
	...props 
}) => {
	return (
		<input
			className={`input-base ${className}`}
			style={{
				width: fullWidth ? '100%' : 'auto',
				...style
			}}
			{...props}
		/>
	);
};

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
	fullWidth?: boolean;
	style?: React.CSSProperties;
	className?: string;
}

export const TextArea: FC<TextAreaProps> = ({
	fullWidth = false,
	className = '',
	style,
	...props
}) => {
	return (
		<textarea
			className={`input-base ${className}`}
			style={{
				width: fullWidth ? '100%' : 'auto',
				...style
			}}
			{...props}
		/>
	);
};

interface ColorPickerInputProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	swatches?: readonly string[];
	fallbackColor?: string;
	popoverTitle?: string;
	inputStyle?: React.CSSProperties;
	containerStyle?: React.CSSProperties;
	swatchButtonStyle?: React.CSSProperties;
}

const DEFAULT_COLOR_SWATCHES = [
	'#8ab0cc',
	'#89cd87',
	'#e3c77d',
	'#c89eb8',
	'#7ddad7',
	'#f08f6b',
	'#6f88d9',
	'#d96f91',
	'#f2f2f2',
	'#7a7b6b',
] as const;

export const normalizeHexColor = (value: string): string | null => {
	const trimmed = value.trim();
	if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
		return trimmed;
	}

	if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
		const [r, g, b] = trimmed.slice(1);
		return `#${r}${r}${g}${g}${b}${b}`;
	}

	return null;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const toHexChannel = (channel: number): string => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0');

const parseRgbaColor = (value: string): { r: number; g: number; b: number; a: number } | null => {
	const trimmed = value.trim();
	const match = trimmed.match(/^rgba?\(([^)]+)\)$/i);
	if (!match) {
		return null;
	}

	const parts = match[1].split(',').map(part => part.trim());
	if (parts.length !== 3 && parts.length !== 4) {
		return null;
	}

	const r = Number.parseFloat(parts[0]);
	const g = Number.parseFloat(parts[1]);
	const b = Number.parseFloat(parts[2]);
	const a = parts.length === 4 ? Number.parseFloat(parts[3]) : 1;

	if (![r, g, b, a].every(Number.isFinite)) {
		return null;
	}

	return {
		r: clamp(Math.round(r), 0, 255),
		g: clamp(Math.round(g), 0, 255),
		b: clamp(Math.round(b), 0, 255),
		a: clamp(a, 0, 1),
	};
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
	const normalized = normalizeHexColor(hex);
	if (!normalized) {
		return null;
	}

	const value = normalized.slice(1);
	return {
		r: Number.parseInt(value.slice(0, 2), 16),
		g: Number.parseInt(value.slice(2, 4), 16),
		b: Number.parseInt(value.slice(4, 6), 16),
	};
};

const rgbToHex = (rgb: { r: number; g: number; b: number }): string => (
	`#${toHexChannel(rgb.r)}${toHexChannel(rgb.g)}${toHexChannel(rgb.b)}`
);

const formatRgbaColor = (hex: string, alpha: number): string => {
	const rgb = hexToRgb(hex);
	if (!rgb) {
		return `color-mix(in srgb, var(--agenda-accent-primary) 100%, transparent ${Math.round((1 - clamp(alpha, 0, 1)) * 100)}%)`;
	}

	const resolvedAlpha = clamp(Number.parseFloat(alpha.toString()), 0, 1);
	const alphaText = Number.parseFloat(resolvedAlpha.toFixed(2)).toString();
	return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alphaText})`;
};

const resolveColorValueForPicker = (value: string): { hexColor: string; alpha: number } | null => {
	const normalizedHex = normalizeHexColor(value);
	if (normalizedHex) {
		return { hexColor: normalizedHex, alpha: 1 };
	}

	const rgba = parseRgbaColor(value);
	if (!rgba) {
		return null;
	}

	return {
		hexColor: rgbToHex(rgba),
		alpha: rgba.a,
	};
};

export const buildHexColorSwatches = (
	preferred: Array<string | null | undefined>,
	fallback: readonly string[] = DEFAULT_COLOR_SWATCHES,
	max = 10,
): string[] => {
	const unique = new Set<string>();
	const merged = [...preferred, ...fallback];
	const result: string[] = [];

	for (const color of merged) {
		if (!color) {
			continue;
		}

		const resolved = resolveColorValueForPicker(color);
		const normalized = resolved?.hexColor || null;
		if (!normalized) {
			continue;
		}

		const key = normalized.toLowerCase();
		if (!unique.has(key)) {
			unique.add(key);
			result.push(normalized);
		}

		if (result.length >= max) {
			break;
		}
	}

	return result;
};

export const ColorPickerInput: FC<ColorPickerInputProps> = ({
	value,
	onChange,
	placeholder = '#RRGGBB',
	swatches = DEFAULT_COLOR_SWATCHES,
	fallbackColor = '#8ab0cc',
	popoverTitle = 'Choose color',
	inputStyle,
	containerStyle,
	swatchButtonStyle,
}) => {
	const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
	const normalizedColor = resolveColorValueForPicker(value)?.hexColor || null;
	const previewColor = normalizedColor || fallbackColor;
	const isPopoverOpen = Boolean(anchorEl);
	const displaySwatches = buildHexColorSwatches([...swatches], DEFAULT_COLOR_SWATCHES, 10);

	return (
		<>
			<div style={{ display: 'flex', gap: '10px', alignItems: 'center', ...containerStyle }}>
				<TextInput
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					style={{ flex: 1, ...inputStyle }}
				/>
				<button
					type="button"
					onClick={(event) => setAnchorEl(event.currentTarget)}
					aria-label="Open color picker"
					title="Open color picker"
					style={{
						width: '50px',
						height: '38px',
						backgroundColor: previewColor,
						border: '2px solid var(--agenda-line-strong)',
						borderRadius: '5px',
						cursor: 'pointer',
						padding: 0,
						...swatchButtonStyle,
					}}
				/>
			</div>
			<Popover
				open={isPopoverOpen}
				anchorEl={anchorEl}
				onClose={() => setAnchorEl(null)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
				transformOrigin={{ vertical: 'top', horizontal: 'left' }}
				slotProps={{
					paper: {
						style: {
							marginTop: '8px',
								backgroundColor: 'var(--agenda-surface-base)',
								border: '2px solid var(--agenda-line-strong)',
							borderRadius: '8px',
								color: 'var(--agenda-text-primary)',
							minWidth: '260px',
							padding: '12px',
						},
					},
				}}
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
					<div style={{ fontSize: '12px', color: 'var(--agenda-text-muted)' }}>
						{popoverTitle}
					</div>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
							gap: '8px',
						}}
					>
						{displaySwatches.map((color) => {
							const isSelected = normalizedColor?.toLowerCase() === color.toLowerCase();
							return (
								<button
									key={color}
									type="button"
									onClick={() => onChange(color)}
									title={color}
									aria-label={`Set color ${color}`}
									style={{
										width: '100%',
										aspectRatio: '1',
										borderRadius: '6px',
										border: isSelected ? '2px solid var(--agenda-text-primary)' : '2px solid color-mix(in srgb, var(--agenda-text-primary) 28%, transparent)',
										backgroundColor: color,
										cursor: 'pointer',
										boxShadow: isSelected ? '0 0 0 1px var(--agenda-line-strong)' : 'none',
									}}
								/>
							);
						})}
					</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
						<input
							type="color"
							value={previewColor}
							onChange={(e) => onChange(e.target.value)}
							style={{
								width: '44px',
								height: '32px',
								border: 'none',
								borderRadius: '4px',
								background: 'transparent',
								cursor: 'pointer',
								padding: 0,
							}}
						/>
						<span style={{ fontSize: '12px', color: 'var(--agenda-text-muted)' }}>
							Custom color
						</span>
					</div>
				</div>
			</Popover>
		</>
	);
};

interface AlphaColorPickerInputProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	swatches?: readonly string[];
	fallbackColor?: string;
	fallbackAlpha?: number;
	popoverTitle?: string;
	inputStyle?: React.CSSProperties;
	containerStyle?: React.CSSProperties;
	swatchButtonStyle?: React.CSSProperties;
}

export const AlphaColorPickerInput: FC<AlphaColorPickerInputProps> = ({
	value,
	onChange,
	placeholder = 'rgba(R, G, B, A)',
	swatches = DEFAULT_COLOR_SWATCHES,
	fallbackColor = '#8ab0cc',
	fallbackAlpha = 0.8,
	popoverTitle = 'Choose color and alpha',
	inputStyle,
	containerStyle,
	swatchButtonStyle,
}) => {
	const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
	const parsedValue = resolveColorValueForPicker(value);
	const fallbackParsedValue = resolveColorValueForPicker(fallbackColor) || { hexColor: '#8ab0cc', alpha: clamp(fallbackAlpha, 0, 1) };
	const currentHexColor = parsedValue?.hexColor || fallbackParsedValue.hexColor;
	const currentAlpha = parsedValue?.alpha ?? fallbackParsedValue.alpha;
	const previewColor = formatRgbaColor(currentHexColor, currentAlpha);
	const displaySwatches = buildHexColorSwatches([...swatches], DEFAULT_COLOR_SWATCHES, 10);
	const isPopoverOpen = Boolean(anchorEl);

	const updateColor = (hexColor: string, alpha: number) => {
		onChange(formatRgbaColor(hexColor, alpha));
	};

	return (
		<>
			<div style={{ display: 'flex', gap: '10px', alignItems: 'center', ...containerStyle }}>
				<TextInput
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					style={{ flex: 1, ...inputStyle }}
				/>
				<button
					type="button"
					onClick={(event) => setAnchorEl(event.currentTarget)}
					aria-label="Open RGBA color picker"
					title="Open RGBA color picker"
					style={{
						width: '50px',
						height: '38px',
						backgroundColor: previewColor,
						border: '2px solid var(--agenda-line-strong)',
						borderRadius: '5px',
						cursor: 'pointer',
						padding: 0,
						...swatchButtonStyle,
					}}
				/>
			</div>
			<Popover
				open={isPopoverOpen}
				anchorEl={anchorEl}
				onClose={() => setAnchorEl(null)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
				transformOrigin={{ vertical: 'top', horizontal: 'left' }}
				slotProps={{
					paper: {
						style: {
							marginTop: '8px',
								backgroundColor: 'var(--agenda-surface-base)',
								border: '2px solid var(--agenda-line-strong)',
							borderRadius: '8px',
								color: 'var(--agenda-text-primary)',
							minWidth: '280px',
							padding: '12px',
						},
					},
				}}
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
					<div style={{ fontSize: '12px', color: 'var(--agenda-text-muted)' }}>
						{popoverTitle}
					</div>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
							gap: '8px',
						}}
					>
						{displaySwatches.map((color) => {
							const isSelected = currentHexColor.toLowerCase() === color.toLowerCase();
							return (
								<button
									key={color}
									type="button"
									onClick={() => updateColor(color, currentAlpha)}
									title={color}
									aria-label={`Set color ${color}`}
									style={{
										width: '100%',
										aspectRatio: '1',
										borderRadius: '6px',
										border: isSelected ? '2px solid var(--agenda-text-primary)' : '2px solid color-mix(in srgb, var(--agenda-text-primary) 28%, transparent)',
										backgroundColor: color,
										cursor: 'pointer',
										boxShadow: isSelected ? '0 0 0 1px var(--agenda-line-strong)' : 'none',
									}}
								/>
							);
						})}
					</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
						<input
							type="color"
							value={currentHexColor}
							onChange={(e) => updateColor(e.target.value, currentAlpha)}
							style={{
								width: '44px',
								height: '32px',
								border: 'none',
								borderRadius: '4px',
								background: 'transparent',
								cursor: 'pointer',
								padding: 0,
							}}
						/>
						<span style={{ fontSize: '12px', color: 'var(--agenda-text-muted)' }}>
							Custom color
						</span>
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
						<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--agenda-text-muted)' }}>
							<span>Alpha</span>
							<span>{Math.round(currentAlpha * 100)}%</span>
						</div>
						<input
							type="range"
							min={0}
							max={1}
							step={0.01}
							value={currentAlpha}
							onChange={(e) => updateColor(currentHexColor, Number.parseFloat(e.target.value))}
							style={{ width: '100%', accentColor: 'var(--agenda-highlight)' }}
						/>
					</div>
				</div>
			</Popover>
		</>
	);
};

/* ===============================================
   CHIP/BADGE COMPONENTS (Using MUI Chip)
   =============================================== */

interface ChipProps {
	children: ReactNode;
	style?: React.CSSProperties;
	className?: string;
}

export const Chip: FC<ChipProps> = ({ 
	children,
	style,
	className = ''
}) => {
	return (
		<MuiChip 
			label={children}
			className={className}
			sx={{ ...style }}
		/>
	);
};

/* ===============================================
   EXPANDABLE MENU ITEM
   =============================================== */

interface MenuItemProps {
	title: string;
	isExpanded: boolean;
	onToggle: () => void;
	children: ReactNode;
}

export const MenuItem: FC<MenuItemProps> = ({ 
	title, 
	isExpanded, 
	onToggle, 
	children 
}) => {
	const [isHovered, setIsHovered] = React.useState(false);
	
	return (
		<motion.div 
			layout
			style={{ margin: '10px 0' }}
			animate={{ x: isHovered ? 10 : 0 }}
			transition={{ 
				layout: { duration: 0.3, ease: 'easeInOut' },
				x: { duration: 0.2, ease: 'easeOut' }
			}}
		>
			<motion.button
				onClick={onToggle}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
				whileTap={{ scale: 0.95 }}
				className="btn-menu"
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					background: isExpanded ? 'color-mix(in srgb, var(--agenda-accent-primary) 16%, transparent)' : 'transparent',
				}}
			>
				<span>{title}</span>
				<motion.span
					animate={{ rotate: isExpanded ? 180 : 0 }}
					transition={{ duration: 0.3 }}
				>
					▼
				</motion.span>
			</motion.button>
			
			<motion.div
				layout
				initial={{ height: 0, opacity: 0 }}
				animate={{ 
					height: isExpanded ? 'auto' : 0,
					opacity: isExpanded ? 1 : 0
				}}
				transition={{ 
					height: { duration: 0.3, ease: 'easeInOut' },
					opacity: { duration: 0.2, ease: 'easeInOut' }
				}}
				style={{ 
					overflow: 'hidden',
					background: 'color-mix(in srgb, var(--agenda-surface-base) 86%, transparent)',
					border: isExpanded ? '2px solid var(--agenda-line-subtle)' : 'none',
					borderTop: 'none',
					borderRadius: '0 0 8px 8px',
				}}
			>
				<div style={{ padding: '15px' }}>
					{children}
				</div>
			</motion.div>
		</motion.div>
	);
};
/* ===============================================
   CONFIRM DIALOG COMPONENT
   =============================================== */

interface ConfirmDialogProps {
	isOpen: boolean;
	title: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	confirmVariant?: ButtonProps['variant'];
	onConfirm: () => void;
	onCancel: () => void;
}

export const ConfirmDialog: FC<ConfirmDialogProps> = ({
	isOpen,
	title,
	message,
	confirmText = 'Continue',
	cancelText = 'Cancel',
	confirmVariant = 'primary',
	onConfirm,
	onCancel,
}) => {
	if (typeof document === 'undefined') {
		return null;
	}

	return createPortal(
		<AnimatePresence>
			{isOpen && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.2 }}
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						background: 'rgba(0, 0, 0, 0.75)',
						backdropFilter: 'blur(4px)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						zIndex: 2000,
						padding: '20px',
					}}
					onClick={onCancel}
				>
					<motion.div
						initial={{ scale: 0.9, y: 20 }}
						animate={{ scale: 1, y: 0 }}
						exit={{ scale: 0.9, y: 20 }}
						transition={{ duration: 0.2, ease: 'easeOut' }}
						onClick={(e) => e.stopPropagation()}
						style={{
							background: 'linear-gradient(135deg, rgba(31, 37, 58, 0.95) 0%, rgba(24, 29, 45, 0.95) 100%)',
							border: '2px solid rgba(138, 176, 204, 0.45)',
							borderRadius: '12px',
							padding: '30px',
							maxWidth: '500px',
							width: '100%',
							boxShadow: '0 10px 40px rgba(8, 14, 28, 0.55)',
						}}
					>
						{/* Title */}
						<Typography
							variant="h5"
							className="text-gradient"
							sx={{
								fontSize: '24px',
								fontWeight: 'bold',
								marginBottom: '16px',
								textAlign: 'center',
							}}
						>
							{title}
						</Typography>

						{/* Message */}
						<Typography
							sx={{
								color: 'rgba(255, 255, 255, 0.85)',
								fontSize: '16px',
								lineHeight: 1.6,
								marginBottom: '24px',
								textAlign: 'center',
							}}
						>
							{message}
						</Typography>

						{/* Action Buttons */}
						<div
							style={{
								display: 'flex',
								gap: '12px',
								justifyContent: 'center',
							}}
						>
							<Button variant="secondary" onClick={onCancel}>
								{cancelText}
							</Button>
							<Button variant={confirmVariant} onClick={onConfirm}>
								{confirmText}
							</Button>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body,
	);
};