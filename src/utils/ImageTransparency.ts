export async function hasOpaqueImageCorners(file: Blob): Promise<boolean> {
    const objectUrl = URL.createObjectURL(file);
    try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error('Failed to decode image for transparency check.'));
            image.src = objectUrl;
        });
        const { naturalWidth: width, naturalHeight: height } = image;
        if (!width || !height) {
            throw new Error('Cannot check transparency of an empty image.');
        }

        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Canvas is unavailable for the transparency check.');
        }
        const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
        corners.forEach(([x, y], index) => {
            context.drawImage(image, x, y, 1, 1, index % 2, Math.floor(index / 2), 1, 1);
        });
        const { data } = context.getImageData(0, 0, 2, 2);
        return [3, 7, 11, 15].every(index => data[index] === 255);
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}
