import { createTheme, ThemeProvider } from "@mui/material/styles";
import { useTheme } from "./contexts/ThemeContext.jsx";

const darkTheme = createTheme({
  typography: { fontFamily: '"Manrope", sans-serif' },
  palette: {
    mode: "dark",
    primary: { main: "#4C8DFF" },
    success: { main: "#34C77B" },
    warning: { main: "#F5A623" },
    error: { main: "#E5484D" },
    background: { default: "#0B1220", paper: "#161B26" },
    text: { primary: "#E8ECF1", secondary: "#8791A3" },
  },
});

const lightTheme = createTheme({
  typography: { fontFamily: '"Manrope", sans-serif' },
  palette: {
    mode: "light",
    primary: { main: "#2E6BD6" },
    success: { main: "#1FAE66" },
    warning: { main: "#D98A0E" },
    error: { main: "#D6393E" },
    background: { default: "#F5F7FA", paper: "#FFFFFF" },
    text: { primary: "#12151C", secondary: "#5B6472" },
  },
});

export default function MuiTheme({ children }) {
  const { isDark } = useTheme();
  return <ThemeProvider theme={isDark ? darkTheme : lightTheme}>{children}</ThemeProvider>;
}
