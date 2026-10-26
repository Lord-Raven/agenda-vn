import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { hasOpaqueImageCorners } from '../src/utils/ImageTransparency';

function mockImageCorners(alphas: number[], decodeError = false, canvasAvailable = true) {
    const drawImage = mock.fn();
    const revoke = mock.method(URL, 'revokeObjectURL');
    const create = mock.method(URL, 'createObjectURL', () => 'blob:uploaded-image');
    const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: class {
        naturalWidth = 31;
        naturalHeight = 47;
        onload?: () => void;
        onerror?: () => void;
        set src(_value: string) {
            queueMicrotask(() => decodeError ? this.onerror?.() : this.onload?.());
        }
    } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
        createElement: () => ({
            getContext: () => canvasAvailable ? {
                drawImage,
                getImageData: () => ({
                    data: Uint8ClampedArray.from(alphas.flatMap(alpha => [0, 0, 0, alpha])),
                }),
            } : null,
        }),
    } });
    return {
        drawImage, revoke,
        restore: () => {
            if (originalImage) Object.defineProperty(globalThis, 'Image', originalImage);
            else Reflect.deleteProperty(globalThis, 'Image');
            if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
            else Reflect.deleteProperty(globalThis, 'document');
            create.mock.restore();
            revoke.mock.restore();
        },
    };
}

test('checks the exact four source corners and releases the local image URL', async () => {
    const browser = mockImageCorners([255, 255, 255, 255]);
    try {
        assert.equal(await hasOpaqueImageCorners(new Blob()), true);
        assert.deepEqual(browser.drawImage.mock.calls.map(call => call.arguments.slice(1)), [
            [0, 0, 1, 1, 0, 0, 1, 1],
            [30, 0, 1, 1, 1, 0, 1, 1],
            [0, 46, 1, 1, 0, 1, 1, 1],
            [30, 46, 1, 1, 1, 1, 1, 1],
        ]);
        assert.deepEqual(browser.revoke.mock.calls[0].arguments, ['blob:uploaded-image']);
    } finally {
        browser.restore();
    }
});

for (const alpha of [0, 1, 254]) {
    for (let corner = 0; corner < 4; corner++) {
        test(`does not flag an image with alpha ${alpha} at corner ${corner}`, async () => {
            const alphas = [255, 255, 255, 255];
            alphas[corner] = alpha;
            const browser = mockImageCorners(alphas);
            try {
                assert.equal(await hasOpaqueImageCorners(new Blob()), false);
            } finally {
                browser.restore();
            }
        });
    }
}

for (const decodeError of [false, true]) {
    test(`reports ${decodeError ? 'decode' : 'canvas'} failures and releases the image URL`, async () => {
        const browser = mockImageCorners([], decodeError, false);
        try {
            await assert.rejects(hasOpaqueImageCorners(new Blob()), /decode|Canvas/);
            assert.equal(browser.revoke.mock.callCount(), 1);
        } finally {
            browser.restore();
        }
    });
}
