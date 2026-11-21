import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { AppProvider } from './context/AppContext';
import App from './App';
import './theme/theme.css';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#108D2B' },
    secondary: { main: '#F1D48F' },
    background: { default: '#F5F5F5', paper: '#FFFFFF' },
    text: { primary: '#050315', secondary: '#626174' }
  },
  typography: {
    fontFamily: 'Roboto, Inter, Manrope, system-ui, -apple-system, "Segoe UI", sans-serif',
    body1: { fontSize: '14px', lineHeight: 1.5 },
    button: { fontWeight: 700, textTransform: 'none' }
  }
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      <BrowserRouter>
        <AppProvider>
          <App />
        </AppProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
