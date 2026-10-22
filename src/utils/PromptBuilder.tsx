// typescript
export type PromptBlock = {
  title: string;
  content?: string;
  children?: PromptBlock[];
};

export type PromptStructure = {
  rootTag: string;
  blocks: PromptBlock[];
};

export type FormatOptions = {
  pretty?: boolean; // when true, adds newlines and indentation
  indent?: string;  // indent string for pretty mode
};

/**
 * PromptBuilder builds an agnostic structure of prompt blocks and formats it.
 * Supports nested blocks via:
 *   buildPrompt('Root')
 *     .addBlock('Parent', parent => parent
 *       .addBlock('Child1', 'content1')
 *       .addBlock('Child2', 'content2')
 *     )
 *     .format();
 */
export class PromptBuilder {
  private rootTag: string;
  private blocks: PromptBlock[] = [];

  constructor(rootTag = 'Task') {
    this.rootTag = this.sanitizeTag(rootTag) || 'Task';
  }

  // addBlock accepts:
  // - title, content string/object/array
  // - title, func returning string/object
  // - title, func(builder) { builder.addBlock(...) }  // nested children
  addBlock(
      title: string,
      content?: string | object | Array<any> | (() => string) | ((b: PromptBuilder) => any)
  ): this {
    const t = this.sanitizeTag(title) || 'Block';

    // handle function specially: may be a zero-arg string-returning function
    // or a builder callback that mutates the provided nested builder.
    if (typeof content === 'function') {
      const nested = new PromptBuilder(''); // temporary builder to collect children
      let res: any;
      try {
        // try calling with nested builder first
        res = (content as (b: PromptBuilder) => any)(nested);
      } catch {
        // if that fails, try calling without args (legacy)
        try {
          res = (content as () => any)();
        } catch {
          res = undefined;
        }
      }

      if (res === undefined) {
        // user likely used the nested builder to add children
        const children = nested.build().blocks;
        this.blocks.push({ title: t, children });
        return this;
      }

      // if function returned a PromptBuilder
      if (res instanceof PromptBuilder) {
        this.blocks.push({ title: t, children: res.build().blocks });
        return this;
      }

      // if function returned an object/array/string/etc -> stringify as content
      const c = this.stringifyContent(res);
      this.blocks.push({ title: t, content: c });
      return this;
    }

    // non-function content: convert to string (objects -> JSON)
    if (content === undefined || content === null) {
      this.blocks.push({ title: t });
      return this;
    }

    // skip adding block if content is empty string after stringification
    const c = this.stringifyContent(content).trim();
    if (c) {
      this.blocks.push({ title: t, content: c });
    }
    return this;
  }

  removeBlock(indexOrTitle: number | string): this {
    if (typeof indexOrTitle === 'number') {
      if (indexOrTitle >= 0 && indexOrTitle < this.blocks.length) {
        this.blocks.splice(indexOrTitle, 1);
      }
    } else {
      const sanitized = this.sanitizeTag(indexOrTitle);
      this.blocks = this.blocks.filter(b => b.title !== sanitized);
    }
    return this;
  }

  setRootTag(tag: string): this {
    this.rootTag = this.sanitizeTag(tag) || this.rootTag;
    return this;
  }

  clear(): this {
    this.blocks = [];
    return this;
  }

  build(): PromptStructure {
    return {
      rootTag: this.rootTag,
      blocks: this.blocks.slice(),
    };
  }

  format(opts: FormatOptions = { pretty: true, indent: '  ' }): string {
    const { pretty = true, indent = '  ' } = opts;
    const nl = pretty ? '\n' : '';
    return `<${this.rootTag}>${nl}${this.formatBlocksAtLevel(1, pretty, indent)}</${this.rootTag}>`;
  }

  formatBlocks(opts: FormatOptions = { pretty: true, indent: '  ' }): string {
    const { pretty = true, indent = '  ' } = opts;
    const formatted = this.formatBlocksAtLevel(0, pretty, indent);
    return pretty && formatted.endsWith('\n') ? formatted.slice(0, -1) : formatted;
  }

  private formatBlocksAtLevel(level: number, pretty: boolean, indent: string): string {
    return this.blocks.map(block => this.formatBlock(block, level, pretty, indent)).join('');
  }

  private formatBlock(block: PromptBlock, level: number, pretty: boolean, indent: string): string {
    const nl = pretty ? '\n' : '';
    const pad = pretty ? indent.repeat(level) : '';
    const contentIndent = pretty ? indent.repeat(level + 1) : '';
    let formatted = `${pad}<${block.title}>${nl}`;

    if (block.content !== undefined) {
      const content = pretty ? this.indentContent(block.content, contentIndent) : block.content;
      formatted += `${contentIndent}${content}${nl}`;
    }

    if (block.children?.length) {
      formatted += block.children.map(child => this.formatBlock(child, level + 1, pretty, indent)).join('');
    }

    return `${formatted}${pad}</${block.title}>${nl}`;
  }

  // helper: returns sanitized tag (letters/diacritics, numbers, underscore, dash allowed)
  private sanitizeTag(tag: string): string {
    return String(tag).trim().replace(/[^\p{L}\p{N}_\-]/gu, '') || '';
  }

  // helper: stringify content into a stable string
  private stringifyContent(content: any): string {
    if (typeof content === 'string') return content;
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }

  // helper: indent multiline content for pretty printing
  private indentContent(content: string, indent: string): string {
    if (!content) return '';
    return content
        .split('\n')
        .map((line, idx) => (idx === 0 ? line : indent + line))
        .join('\n');
  }
}

// convenience factory function matching requested usage: buildPrompt().addBlock(...)
export function buildPrompt(rootTag?: string): PromptBuilder {
  return new PromptBuilder(rootTag);
}

export default PromptBuilder;