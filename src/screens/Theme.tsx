/**
 * Material UI Theme Configuration
 * Agenda visual language: ruin-tech, pale light, and weathered metal.
 */

import { createTheme } from '@mui/material/styles';

// Shared palette for all screen classes.
export const colors = {
  primary: {
    main: 'var(--agenda-accent-primary)',
    light: 'var(--agenda-text-muted)',
    dark: 'var(--agenda-surface-raised)',
    contrastText: 'var(--agenda-text-primary)',
  },
  secondary: {
    main: 'var(--agenda-highlight)',
    light: 'color-mix(in srgb, var(--agenda-highlight) 65%, white)',
    dark: 'color-mix(in srgb, var(--agenda-highlight) 62%, var(--agenda-surface-base))',
    contrastText: 'var(--agenda-surface-base)',
  },
  warning: {
    main: 'var(--agenda-warning)',
    light: 'color-mix(in srgb, var(--agenda-warning) 72%, var(--agenda-text-primary))',
    dark: 'color-mix(in srgb, var(--agenda-warning) 62%, var(--agenda-surface-base))',
    contrastText: 'var(--agenda-surface-base)',
  },
  danger: {
    main: 'var(--agenda-danger-text)',
    light: 'color-mix(in srgb, var(--agenda-danger-text) 80%, var(--agenda-text-primary))',
    dark: 'color-mix(in srgb, var(--agenda-danger-text) 66%, var(--agenda-surface-base))',
    contrastText: 'var(--agenda-text-primary)',
  },
  background: {
    default: 'var(--agenda-surface-base)',
    paper: 'var(--agenda-surface-raised)',
    glass: 'color-mix(in srgb, var(--agenda-accent-primary) 14%, transparent)',
    glassLight: 'color-mix(in srgb, var(--agenda-highlight) 20%, transparent)',
  },
  text: {
    primary: 'var(--agenda-text-primary)',
    secondary: 'var(--agenda-text-muted)',
    disabled: 'color-mix(in srgb, var(--agenda-text-primary) 42%, transparent)',
  },
};

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: 'dark',
    primary: colors.primary,
    secondary: colors.secondary,
    warning: colors.warning,
    error: colors.danger,
    background: {
      default: colors.background.default,
      paper: colors.background.paper,
    },
    text: colors.text,
  },
  typography: {
    fontFamily: 'var(--agenda-font-base)',
    h1: {
      fontFamily: 'var(--agenda-font-display)',
      fontSize: '2.5rem',
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      textShadow: '0 0 24px color-mix(in srgb, var(--agenda-accent-primary) 26%, transparent)',
    },
    h2: {
      fontFamily: 'var(--agenda-font-display)',
      fontSize: '2rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textShadow: '0 0 18px color-mix(in srgb, var(--agenda-highlight) 20%, transparent)',
    },
    h3: {
      fontFamily: 'var(--agenda-font-display)',
      fontSize: '1.75rem',
      fontWeight: 600,
      letterSpacing: '0.05em',
    },
    h4: {
      fontFamily: 'var(--agenda-font-display)',
      fontSize: '1.5rem',
      fontWeight: 600,
    },
    h5: {
      fontFamily: 'var(--agenda-font-display)',
      fontSize: '1.25rem',
      fontWeight: 500,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.6,
    },
    button: {
      fontFamily: 'var(--agenda-font-base)',
      textTransform: 'uppercase',
      fontWeight: 700,
      letterSpacing: '0.08em',
    },
  },
  shape: {
    borderRadius: 12,
  },
  shadows: [
    'none',
    '0 0 10px rgba(138, 176, 204, 0.22)',
    '0 0 20px rgba(138, 176, 204, 0.28)',
    '0 0 30px rgba(137, 205, 135, 0.24)',
    '0 4px 20px rgba(0, 0, 0, 0.5)',
    '0 6px 25px rgba(0, 0, 0, 0.6)',
    '0 8px 30px rgba(0, 0, 0, 0.7)',
    '0 10px 35px rgba(0, 0, 0, 0.8)',
    '0 12px 40px rgba(0, 0, 0, 0.9)',
    '0 14px 45px rgba(0, 0, 0, 0.95)',
    '0 16px 50px rgba(0, 0, 0, 1)',
    '0 18px 55px rgba(0, 0, 0, 1)',
    '0 20px 60px rgba(0, 0, 0, 1)',
    '0 22px 65px rgba(0, 0, 0, 1)',
    '0 24px 70px rgba(0, 0, 0, 1)',
    '0 26px 75px rgba(0, 0, 0, 1)',
    '0 28px 80px rgba(0, 0, 0, 1)',
    '0 30px 85px rgba(0, 0, 0, 1)',
    '0 32px 90px rgba(0, 0, 0, 1)',
    '0 34px 95px rgba(0, 0, 0, 1)',
    '0 36px 100px rgba(0, 0, 0, 1)',
    '0 38px 105px rgba(0, 0, 0, 1)',
    '0 40px 110px rgba(0, 0, 0, 1)',
    '0 42px 115px rgba(0, 0, 0, 1)',
    '0 44px 120px rgba(0, 0, 0, 1)',
  ],
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
          fontFamily: 'var(--agenda-font-base)',
          padding: '10px 24px',
          transition: 'all 0.3s ease',
          boxShadow: '0 0 14px color-mix(in srgb, var(--agenda-accent-primary) 24%, transparent)',
          '&:hover': {
            boxShadow: '0 0 24px color-mix(in srgb, var(--agenda-highlight) 30%, transparent)',
            transform: 'translateY(-2px)',
          },
        },
        contained: {
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--agenda-surface-raised) 70%, var(--agenda-accent-primary)) 0%, var(--agenda-accent-primary) 45%, var(--agenda-highlight) 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--agenda-surface-raised) 60%, var(--agenda-accent-primary)) 0%, color-mix(in srgb, var(--agenda-accent-primary) 84%, white) 45%, color-mix(in srgb, var(--agenda-highlight) 86%, white) 100%)',
          },
        },
        outlined: {
          borderColor: colors.primary.main,
          borderWidth: '2px',
          color: colors.primary.main,
          '&:hover': {
            borderWidth: '2px',
            borderColor: colors.primary.light,
            backgroundColor: 'color-mix(in srgb, var(--agenda-accent-primary) 10%, transparent)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: colors.background.paper,
          border: '2px solid',
          borderImageSlice: 1,
          borderImageSource: 'linear-gradient(135deg, var(--agenda-accent-primary), var(--agenda-highlight))',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          fontFamily: 'var(--agenda-font-base)',
          '& .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: 'color-mix(in srgb, var(--agenda-accent-primary) 40%, transparent)',
              borderWidth: '2px',
            },
            '&:hover fieldset': {
              borderColor: 'color-mix(in srgb, var(--agenda-accent-primary) 62%, transparent)',
            },
            '&.Mui-focused fieldset': {
              borderColor: colors.secondary.main,
            },
          },
          '& .MuiInputLabel-root': {
            color: colors.text.secondary,
            '&.Mui-focused': {
              color: colors.secondary.main,
            },
          },
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          height: 10,
          borderRadius: 5,
          backgroundColor: 'color-mix(in srgb, var(--agenda-surface-elevated) 70%, transparent)',
        },
        bar: {
          borderRadius: 5,
          background: 'linear-gradient(90deg, color-mix(in srgb, var(--agenda-surface-raised) 65%, var(--agenda-accent-primary)) 0%, var(--agenda-accent-primary) 45%, var(--agenda-highlight) 100%)',
          boxShadow: '0 0 10px color-mix(in srgb, var(--agenda-accent-primary) 45%, transparent)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          backgroundColor: colors.background.glass,
          border: `1px solid ${colors.primary.main}`,
          color: colors.text.primary,
          fontFamily: 'var(--agenda-font-base)',
          fontWeight: 600,
          '&:hover': {
            backgroundColor: 'color-mix(in srgb, var(--agenda-accent-primary) 16%, transparent)',
          },
        },
      },
    },
  },
});

export default theme;
