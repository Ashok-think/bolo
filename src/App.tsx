import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useBusiness } from '@/hooks/useBusiness';
import { AuthScreen } from '@/screens/AuthScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { AppShell } from '@/components/AppShell';
import { PublicInvoicePage } from '@/screens/PublicInvoicePage';
import { ToastProvider } from '@/components/ui/Toast';
import { SkeletonLoader } from '@/components/ui/SkeletonLoader';

function PublicInvoiceRoute() {
  const { token } = useParams<{ token: string }>();
  if (!token) return null;
  return <PublicInvoicePage token={token} />;
}

function MainApp() {
  const { user, loading: authLoading } = useAuth();
  const { business, loading: businessLoading, refresh } = useBusiness(user?.id);

  if (authLoading || (user && businessLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <SkeletonLoader className="w-full max-w-sm h-80 rounded-card" />
      </div>
    );
  }

  if (!user) {
    return (
      <ToastProvider>
        <AuthScreen />
      </ToastProvider>
    );
  }

  if (!business) {
    return (
      <ToastProvider>
        <OnboardingScreen onDone={refresh} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <AppShell business={business} />
    </ToastProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/i/:token" element={<PublicInvoiceRoute />} />
        <Route path="/*" element={<MainApp />} />
      </Routes>
    </BrowserRouter>
  );
}
