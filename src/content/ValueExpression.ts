export const isNumericValueExpression = (value: unknown): value is string =>
    typeof value === 'string' && /[()+*/%]|\{\{|^\s*=|\d\s*[+-]|^\s*[+-]\s+\d|\d*d\d+/i.test(value);

export type ValueExpressionSources = {
    call: (name: string, args?: (number | string)[]) => number;
    get: (name: string) => number;
};

// Parse only arithmetic, dice, and explicit value lookups; never execute input as JavaScript.
export const evaluateValueExpression = (source: string, sources: ValueExpressionSources, options: { syntaxOnly?: boolean } = {}): number => {
    const expression = source.trim().replace(/^=/, '');
    let position = 0;
    let depth = 0;
    const fail = (message: string): never => {
        throw new Error(`Invalid value formula at ${position + 1}: ${message}`);
    };
    const consume = (token: string): boolean => {
        while (/\s/.test(expression[position] || '') && position < expression.length) position++;
        if (!expression.startsWith(token, position)) return false;
        position += token.length;
        return true;
    };
    const finite = (value: number): number => {
        if (!options.syntaxOnly && !Number.isFinite(value)) fail('result must be a finite number');
        return value;
    };
    const quotedName = (): string => {
        consume('');
        const quote = expression[position];
        if (quote !== '"' && quote !== "'") return fail('expected a quoted name');
        position++;
        let name = '';
        while (position < expression.length && expression[position] !== quote) {
            if (expression[position] === '\\') {
                position++;
                if (position === expression.length) return fail('unterminated name');
            }
            name += expression[position++];
        }
        if (!consume(quote)) return fail('unterminated name');
        return name;
    };
    const primary = (): number => {
        if (++depth > 100) return fail('expression is too deeply nested');
        try {
            if (consume('+')) return primary();
            if (consume('-')) return -primary();
            if (consume('(')) {
                const value = sum();
                if (!consume(')')) return fail('expected ")"');
                return value;
            }
            if (consume('{{')) {
                const end = expression.indexOf('}}', position);
                if (end < 0) return fail('expected "}}"');
                const name = expression.slice(position, end).trim();
                position = end + 2;
                return finite(sources.call(name));
            }
            consume('');
            const rest = expression.slice(position);
            const dice = /^(\d*)d(\d+)\b/i.exec(rest);
            if (dice) {
                position += dice[0].length;
                const count = Number(dice[1] || 1);
                const sides = Number(dice[2]);
                if (count < 1 || count > 100 || sides < 1 || sides > 10000) return fail('dice exceed supported limits');
                if (options.syntaxOnly) return 0;
                let result = 0;
                for (let roll = 0; roll < count; roll++) result += Math.floor(Math.random() * sides) + 1;
                return result;
            }
            const numeric = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(rest);
            if (numeric) {
                position += numeric[0].length;
                return finite(Number(numeric[0]));
            }
            const name = /^[a-z_][a-z0-9_ ]*/i.exec(rest)?.[0].trim();
            if (!name) return fail('expected a number or function call');
            position += name.length;
            if (!consume('(')) return fail('expected a function call');
            // One positional argument: a quoted string literal or a nested numeric expression.
            const argumentValue = (): number | string => {
                consume('');
                const char = expression[position];
                return char === '"' || char === "'" ? quotedName() : sum();
            };
            let result: number;
            if (name === 'get' || name === 'call') {
                const argument = quotedName();
                const args: (number | string)[] = [];
                while (consume(',')) args.push(argumentValue());
                if (name === 'get' && args.length > 0) return fail('get takes a single stat name');
                if (!consume(')')) return fail('expected ")"');
                result = name === 'get' ? sources.get(argument) : sources.call(argument, args);
            } else {
                const args: (number | string)[] = [];
                if (!consume(')')) {
                    do {
                        args.push(argumentValue());
                    } while (consume(','));
                    if (!consume(')')) return fail('expected ")" or ","');
                }
                result = sources.call(name, args);
            }
            return finite(result);
        } finally {
            depth--;
        }
    };
    const product = (): number => {
        let result = primary();
        while (true) {
            if (consume('*')) result = finite(result * primary());
            else if (consume('/')) result = finite(result / primary());
            else if (consume('%')) result = finite(result % primary());
            else return result;
        }
    };
    const sum = (): number => {
        let result = product();
        while (true) {
            if (consume('+')) result = finite(result + product());
            else if (consume('-')) result = finite(result - product());
            else return result;
        }
    };
    const result = sum();
    consume('');
    if (position !== expression.length) return fail('unexpected input');
    return finite(result);
};

export const validateValueExpression = (source: string): void => {
    evaluateValueExpression(source, { call: () => 0, get: () => 0 }, { syntaxOnly: true });
};
