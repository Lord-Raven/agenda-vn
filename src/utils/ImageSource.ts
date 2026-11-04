export async function getImageGenerationSource(imageUrl: string): Promise<string> {
    if (!imageUrl.startsWith('/assets/')) {
        return imageUrl;
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error(`Failed to load image: ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
            } else {
                reject(new Error('Failed to read image data.'));
            }
        };
        reader.onerror = () => reject(reader.error || new Error('Failed to read image data.'));
        reader.onabort = () => reject(new Error('Image loading was aborted.'));
        reader.readAsDataURL(blob);
    });
}
