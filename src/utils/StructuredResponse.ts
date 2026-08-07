export type StructuredFieldDefinition = {
    key: string;
    label: string;
    tag?: string;
    description?: string;
    aliases?: string[];
    examples?: string[];
};

export type StructuredFormattingOptions = {
    includeEndTag?: boolean;
    endTag?: string;
};

const DEFAULT_END_TAG = '#END#';

function normalizeTag(rawTag: string): string {
    return rawTag
        .replace(/[<>]/g, '')
        .replace(/\*\*/g, '')
        .replace(/[^A-Za-z0-9:_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase();
}

function getFieldTag(field: StructuredFieldDefinition): string {
    const preferredTag = field.tag || field.label;
    const normalized = normalizeTag(preferredTag);
    return normalized || normalizeTag(field.key);
}

export function getStructuredFieldTags(fields: StructuredFieldDefinition[]): string[] {
    const uniqueTags = new Set<string>();
    for (const field of fields) {
        uniqueTags.add(getFieldTag(field));
    }
    return Array.from(uniqueTags);
}

function normalizeLabel(rawLabel: string): string {
    return rawLabel
        .replace(/\*\*/g, '')
        .replace(/^\s*[-*]\s*/, '')
        .replace(/^\s*\d+[.)-]?\s*/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function buildLabelKeyMap(fields: StructuredFieldDefinition[]): Map<string, string> {
    const labelKeyMap = new Map<string, string>();
    for (const field of fields) {
        labelKeyMap.set(normalizeLabel(field.label), field.key);
        for (const alias of field.aliases || []) {
            labelKeyMap.set(normalizeLabel(alias), field.key);
        }
    }
    return labelKeyMap;
}

function buildTagKeyMap(fields: StructuredFieldDefinition[]): Map<string, string> {
    const tagKeyMap = new Map<string, string>();
    for (const field of fields) {
        tagKeyMap.set(getFieldTag(field), field.key);
        for (const alias of field.aliases || []) {
            tagKeyMap.set(normalizeTag(alias), field.key);
        }
    }
    return tagKeyMap;
}

export function buildStructuredResponseFormat(
    fields: StructuredFieldDefinition[],
    options: StructuredFormattingOptions = {}
): string {
    const lines = fields.map(field =>
        field.description
            ? `<${getFieldTag(field)}>${field.description}</${getFieldTag(field)}>`
            : `<${getFieldTag(field)}></${getFieldTag(field)}>`
    );

    if (options.includeEndTag) {
        lines.push(options.endTag || DEFAULT_END_TAG);
    }

    return lines.join('\n');
}

export function buildStructuredExampleResponse(
    fields: StructuredFieldDefinition[],
    valuesByKey: { [key: string]: string },
    options: StructuredFormattingOptions = {}
): string {
    const lines = fields.map(field => {
        const exampleValue = valuesByKey[field.key] || field.examples?.[0] || '';
        return `<${getFieldTag(field)}>${exampleValue}</${getFieldTag(field)}>`;
    });

    if (options.includeEndTag) {
        lines.push(options.endTag || DEFAULT_END_TAG);
    }

    return lines.join('\n');
}

function parseXmlTagContent(content: string): any {
    const trimmedContent = (content || '').trim();
    if (!trimmedContent) {
        return '';
    }

    const tagPattern = /<([A-Za-z0-9:_-]+)\b[^>]*>/g;
    const childNodes: Array<{ tagName: string; innerContent: string }> = [];
    let match: RegExpExecArray | null;

    while ((match = tagPattern.exec(trimmedContent)) !== null) {
        const tagName = match[1];
        const openingTagLength = match[0].length;
        const closingTag = `</${tagName}>`;
        const closeIndex = trimmedContent.indexOf(closingTag, match.index + openingTagLength);

        if (closeIndex === -1) {
            break;
        }

        childNodes.push({
            tagName,
            innerContent: trimmedContent.slice(match.index + openingTagLength, closeIndex),
        });

        tagPattern.lastIndex = closeIndex + closingTag.length;
    }

    if (childNodes.length === 0) {
        return trimmedContent;
    }

    const parsedObject: Record<string, any> = {};
    for (const childNode of childNodes) {
        const childValue = parseXmlTagContent(childNode.innerContent);
        if (parsedObject[childNode.tagName] === undefined) {
            parsedObject[childNode.tagName] = childValue;
        } else if (Array.isArray(parsedObject[childNode.tagName])) {
            parsedObject[childNode.tagName].push(childValue);
        } else {
            parsedObject[childNode.tagName] = [parsedObject[childNode.tagName], childValue];
        }
    }

    return parsedObject;
}

export function parseXmlTagsToObjects(text: string): any {
    const sanitizedText = (text || '').replace(/\*\*/g, '').replace(new RegExp(DEFAULT_END_TAG, 'g'), '').trim();
    const parsedValue = parseXmlTagContent(sanitizedText);
    return parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
        ? parsedValue
        : {};
}

export function parseStructuredResponse(
    text: string,
    fields: StructuredFieldDefinition[]
): { [key: string]: string } {
    const sanitizedText = (text || '').replace(/\*\*/g, '');
    const tagKeyMap = buildTagKeyMap(fields);
    const labelKeyMap = buildLabelKeyMap(fields);
    const parsedValues: { [key: string]: string } = {};

    const tagRegex = /<\s*([^\s/>]+)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi;
    for (const match of sanitizedText.matchAll(tagRegex)) {
        const tagName = normalizeTag(match[1] || '');
        const matchedKey = tagKeyMap.get(tagName);
        if (!matchedKey) {
            continue;
        }

        const value = (match[2] || '').replace(new RegExp(DEFAULT_END_TAG, 'g'), '').trim();
        parsedValues[matchedKey] = value;
    }

    // Backward-compatible fallback for older LABEL: value responses.
    let currentKey: string | null = null;

    for (const originalLine of sanitizedText.split('\n')) {
        const line = originalLine.trim();
        if (!line || line === DEFAULT_END_TAG) {
            continue;
        }

        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const rawLabel = line.slice(0, colonIndex);
            const normalizedLabel = normalizeLabel(rawLabel);
            const matchedKey = labelKeyMap.get(normalizedLabel);

            if (matchedKey) {
                const value = line.slice(colonIndex + 1).trim();
                if (!parsedValues[matchedKey]) {
                    parsedValues[matchedKey] = value;
                }
                currentKey = matchedKey;
                continue;
            }
        }

        if (currentKey) {
            parsedValues[currentKey] = parsedValues[currentKey]
                ? `${parsedValues[currentKey]}\n${line}`
                : line;
        }
    }

    return parsedValues;
}