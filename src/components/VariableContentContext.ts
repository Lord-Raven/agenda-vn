import { createContext } from 'react';
import type { ContentType } from '../content/Condition';

export const VariableContentContext = createContext<ContentType | undefined>(undefined);

// True where the evaluation context binds the header variable (list pop-up headers), so text inputs offer it.
export const HeaderVariableContext = createContext<boolean>(false);
