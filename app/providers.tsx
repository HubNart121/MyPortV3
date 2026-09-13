'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { useFirebaseAuth } from '@/components/AuthProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  const { user, isFirebaseActive } = useFirebaseAuth();
  return <AccountQueries key={isFirebaseActive ? user?.uid ?? 'signed-out' : 'offline'}>{children}</AccountQueries>;
}

function AccountQueries({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1 },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
