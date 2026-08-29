'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { CountryProvider, useCountry } from '../lib/country';
import { WalletProvider } from '../lib/wallet';
import { ThemeProvider } from '@velar/ui';
import { ToastContainer } from './Toast';

function isAuthRoute(pathname: string | null) {
  return pathname === '/login' || pathname === '/signup' || pathname === '/ir-login';
}

/**
 * Puente entre el contexto de país de la app y el design system: `@velar/ui` no
 * conoce `lib/country`, así que el país se le pasa por prop desde acá.
 */
function ThemeWithCountry({ children }: { children: ReactNode }) {
  const { country } = useCountry();
  return <ThemeProvider country={country}>{children}</ThemeProvider>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isAuthRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <CountryProvider>
      <ThemeWithCountry>
        <WalletProvider>
          {children}
          <ToastContainer />
        </WalletProvider>
      </ThemeWithCountry>
    </CountryProvider>
  );
}
