import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { PreferencesProvider } from '@/state/Preferences';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <PreferencesProvider>
        <Shell />
      </PreferencesProvider>
    </ThemeProvider>
  );
}

/**
 * Sin pantalla de login: el tablero es lo primero y lo único que se ve.
 * El acceso se protege del lado del servidor, no con una puerta en la app.
 */
function Shell() {
  const theme = useTheme();
  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
          // En iOS y Android el cambio de pantalla es un fundido, no el deslizamiento
          // lateral por defecto. En web el Stack no anima: ahí la entrada la da
          // `FadeIn` dentro de cada marco.
          animation: 'fade',
        }}
      />
    </>
  );
}
