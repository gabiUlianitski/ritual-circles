import { createTheme } from "@mui/material/styles";

/** Dark theme aligned with Circle Details readability tokens. */
export const circleAdjustTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#3B82F6" },
    success: { main: "#22C55E" },
    background: {
      default: "transparent",
      paper: "#1E293B",
    },
    text: {
      primary: "#F5F7FA",
      secondary: "#A0AEC0",
    },
    divider: "rgba(255, 255, 255, 0.05)",
  },
  typography: {
    fontFamily: "inherit",
    subtitle2: {
      fontWeight: 600,
      fontSize: "0.9375rem",
      lineHeight: 1.45,
    },
    caption: {
      fontSize: "0.75rem",
      lineHeight: 1.45,
    },
    body1: {
      fontSize: "0.875rem",
      fontWeight: 500,
      lineHeight: 1.45,
    },
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid rgba(255, 255, 255, 0.05)",
          boxShadow: "none",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "#0F172A",
          "& fieldset": {
            borderColor: "rgba(255, 255, 255, 0.08)",
          },
          "&:hover fieldset": {
            borderColor: "rgba(255, 255, 255, 0.12)",
          },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          "&.Mui-checked": {
            color: "#3B82F6",
          },
          "&.Mui-checked + .MuiSwitch-track": {
            backgroundColor: "#3B82F6",
          },
        },
      },
    },
  },
});
