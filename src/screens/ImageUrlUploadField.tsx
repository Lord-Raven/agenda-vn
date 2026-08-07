import { FC, ReactNode, useRef } from 'react';
import { TextInput } from './UiComponents';

type ImageUrlUploadFieldProps = {
    imageUrl: string;
    onImageUrlChange: (value: string) => void;
    onUploadFile: (file: File) => Promise<void>;
    isUploading?: boolean;
    disabled?: boolean;
    inputLabel?: string;
    inputPlaceholder?: string;
    previewWidth?: string | number;
    previewHeight?: string | number;
    previewBorder?: string;
    previewBorderRadius?: string | number;
    previewBackgroundColor?: string;
    previewBackgroundPosition?: string;
    previewPlaceholder?: ReactNode;
    previewUploadHint?: ReactNode;
    accept?: string;
    onInvalidFile?: () => void;
};

export const ImageUrlUploadField: FC<ImageUrlUploadFieldProps> = ({
    imageUrl,
    onImageUrlChange,
    onUploadFile,
    isUploading = false,
    disabled = false,
    inputLabel = 'Image URL',
    inputPlaceholder = 'https://... or leave empty',
    previewWidth = '160px',
    previewHeight = '120px',
    previewBorder = '2px solid var(--agenda-line-strong)',
    previewBorderRadius = '8px',
    previewBackgroundColor = 'color-mix(in srgb, var(--agenda-surface-base) 82%, transparent)',
    previewBackgroundPosition = '50% 50%',
    previewPlaceholder,
    previewUploadHint,
    accept = 'image/*',
    onInvalidFile,
}) => {
    const uploadInputRef = useRef<HTMLInputElement>(null);

    const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }

        if (!file.type.startsWith('image/')) {
            onInvalidFile?.();
            if (uploadInputRef.current) {
                uploadInputRef.current.value = '';
            }
            return;
        }

        try {
            await onUploadFile(file);
        } finally {
            if (uploadInputRef.current) {
                uploadInputRef.current.value = '';
            }
        }
    };

    return (
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div
                role="button"
                tabIndex={disabled || isUploading ? -1 : 0}
                aria-label={isUploading ? 'Uploading image' : 'Upload image'}
                onClick={() => {
                    if (!disabled && !isUploading) {
                        uploadInputRef.current?.click();
                    }
                }}
                onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !disabled && !isUploading) {
                        e.preventDefault();
                        uploadInputRef.current?.click();
                    }
                }}
                style={{
                    position: 'relative',
                    width: previewWidth,
                    height: previewHeight,
                    borderRadius: previewBorderRadius,
                    border: previewBorder,
                    backgroundColor: previewBackgroundColor,
                    backgroundImage: imageUrl ? `url(${imageUrl})` : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: previewBackgroundPosition,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    overflow: 'hidden',
                    cursor: disabled || isUploading ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.7 : 1,
                }}
            >
                {!imageUrl && previewPlaceholder}
                {previewUploadHint && (
                    <div
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            bottom: 0,
                            padding: '6px 8px',
                            fontSize: '12px',
                            color: 'var(--agenda-text-primary)',
                            background: 'linear-gradient(180deg, transparent, color-mix(in srgb, var(--agenda-surface-base) 82%, black 18%))',
                            textAlign: 'center',
                        }}
                    >
                        {previewUploadHint}
                    </div>
                )}
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '220px' }}>
                <div>
                    <label style={{ display: 'block', color: 'var(--agenda-text-muted)', marginBottom: 6 }}>{inputLabel}</label>
                    <TextInput
                        fullWidth
                        value={imageUrl}
                        onChange={(e) => onImageUrlChange(e.target.value)}
                        placeholder={inputPlaceholder}
                        disabled={disabled}
                    />
                </div>
                <input
                    ref={uploadInputRef}
                    type="file"
                    accept={accept}
                    style={{ display: 'none' }}
                    onChange={handleImageFileChange}
                />
            </div>
        </div>
    );
};

export default ImageUrlUploadField;