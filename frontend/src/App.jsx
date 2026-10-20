import React, { useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import FloatingExtensionButton from './components/FloatingExtensionButton';
import PairingModal from './components/PairingModal';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import SecurityOnboardingPage from './pages/SecurityOnboardingPage';
import VaultPage from './pages/VaultPage';
import SecurityActivityPage from './pages/SecurityActivityPage';
import SecuritySettingsPage from './pages/SecuritySettingsPage';
import VerifyBridgePage from './pages/VerifyBridgePage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090d16] text-slate-400 text-xs">
        <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!user.securitySetupCompleted && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}

export default function App() {
  const { user } = useAuth();
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false);
  const location = useLocation();

  // Hide chrome elements on /verify bridge page
  const isVerifyBridge = location.pathname === '/verify';

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100">
      {!isVerifyBridge && user && (
        <Navbar onOpenExtensionModal={() => setIsExtensionModalOpen(true)} />
      )}

      <main className="flex-1">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <SecurityOnboardingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <VaultPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/activity"
            element={
              <ProtectedRoute>
                <SecurityActivityPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SecuritySettingsPage onOpenExtensionModal={() => setIsExtensionModalOpen(true)} />
              </ProtectedRoute>
            }
          />
          <Route path="/verify" element={<VerifyBridgePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {!isVerifyBridge && user && (
        <FloatingExtensionButton onClick={() => setIsExtensionModalOpen(true)} />
      )}

      <PairingModal
        isOpen={isExtensionModalOpen}
        onClose={() => setIsExtensionModalOpen(false)}
      />
    </div>
  );
}
