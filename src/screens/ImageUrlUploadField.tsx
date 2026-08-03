import { FC, ReactNode, useRef } from 'react';
import { Image as ImageIcon } from '@mui/icons-material';
import { Button, TextInput } from './UiComponents';

type ImageUrlUploadFieldProps = {
    imageUrl: string;
    onImageUrlChange: (value: string) => void;
    onUploadFile: (file: File) => Promise<void>;
    isUploading?: boolean;
    disabled?: boolean;
    inputLabel?: string;
    inputPlaceholder?: string;
    uploadButtonLabel?: string;
    uploadingButtonLabel?: string;
    previewWidth?: string | number;
    previewHeight?: string | number;
    previewBorder?: string;
    previewBorderRadius?: string | number;
    previewBackgroundColor?: string;
    previewBackgroundPosition?: string;
    previewPlaceholder?: ReactNode;
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
    uploadButtonLabel = 'Upload Image',
    uploadingButtonLabel = 'Uploading...',
    previewWidth = '160px',
    previewHeight = '120px',
    previewBorder = '2px solid rgba(0, 255, 136, 0.3)',
    previewBorderRadius = '8px',
    previewBackgroundColor = 'rgba(0, 20, 40, 0.6)',
    previewBackgroundPosition = '50% 50%',
    previewPlaceholder,
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
                style={{
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
                }}
            >
                {!imageUrl && previewPlaceholder}
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '220px' }}>
                <div>
                    <label style={{ display: 'block', color: 'var(--agenda-inactive)', marginBottom: 6 }}>{inputLabel}</label>
                    <TextInput
                        fullWidth
                        value={imageUrl}
                        onChange={(e) => onImageUrlChange(e.target.value)}
                        placeholder={inputPlaceholder}
                        disabled={disabled}
                    />
                </div>
                <div>
                    <Button
                        onClick={() => uploadInputRef.current?.click()}
                        disabled={disabled || isUploading}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <ImageIcon style={{ fontSize: '18px' }} />
                        {isUploading ? uploadingButtonLabel : uploadButtonLabel}
                    </Button>
                    <input
                        ref={uploadInputRef}
                        type="file"
                        accept={accept}
                        style={{ display: 'none' }}
                        onChange={handleImageFileChange}
                    />
                </div>
            </div>
        </div>
    );
};

export default ImageUrlUploadField;