import { createContext } from 'react';
import type { ContentType } from '../content/Condition';

export const VariableContentContext = createContext<ContentType | undefined>(undefined);
