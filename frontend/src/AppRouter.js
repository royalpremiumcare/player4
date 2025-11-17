import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import LandingPage from "./components/LandingPage";
import LoginPage from "./components/LoginPage";
import RegisterPage from "./components/RegisterPage";
import ForgotPasswordPage from "./components/ForgotPasswordPage";
import ResetPasswordPage from "./components/ResetPasswordPage";
import SetupPassword from "./components/SetupPassword";
import PublicBookingPage from "./components/PublicBookingPage";
import SuperAdmin from "./components/SuperAdmin";
import App from "./App";

const AppRouter = () => {
  const { isAuthenticated, userRole } = useAuth();
  const location = useLocation();

  // Eğer kullanıcı authenticated ise ve login/register sayfalarındaysa ana sayfaya yönlendir
  const shouldRedirectToHome = isAuthenticated && 
    (location.pathname === '/login' || 
     location.pathname === '/register' || 
     location.pathname === '/forgot-password' || 
     location.pathname === '/reset-password');
  
  // Superadmin kontrolü
  const isSuperAdmin = userRole === 'superadmin';

  return (
    <Routes>
      {/* Root Route - Authenticated ise App, değilse Landing */}
      <Route 
        path="/" 
        element={isAuthenticated ? <App /> : <LandingPage />} 
      />
      {/* Dashboard Route - Same as root for authenticated users */}
      <Route 
        path="/dashboard" 
        element={isAuthenticated ? <Navigate to="/" replace /> : <Navigate to="/login" replace />} 
      />
      <Route 
        path="/login" 
        element={shouldRedirectToHome ? <Navigate to="/" replace /> : <LoginPage />} 
      />
      <Route 
        path="/register" 
        element={shouldRedirectToHome ? <Navigate to="/" replace /> : <RegisterPage />} 
      />
      <Route 
        path="/forgot-password" 
        element={shouldRedirectToHome ? <Navigate to="/" replace /> : <ForgotPasswordPage />} 
      />
      <Route 
        path="/reset-password" 
        element={shouldRedirectToHome ? <Navigate to="/" replace /> : <ResetPasswordPage />} 
      />
      <Route 
        path="/setup-password" 
        element={<SetupPassword />} 
      />
      
      {/* Subscribe Route - PayTR redirect için */}
      <Route 
        path="/subscribe" 
        element={isAuthenticated ? <App /> : <Navigate to="/login" replace />} 
      />
      
      {/* Super Admin Route - Sadece superadmin rolü erişebilir */}
      <Route 
        path="/superadmin" 
        element={
          isAuthenticated && isSuperAdmin ? (
            <SuperAdmin />
          ) : isAuthenticated ? (
            <Navigate to="/" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        } 
      />
      
      {/* Public Booking - Catch dynamic business slugs (domain.com/isletmeadi) */}
      {/* This must be last to avoid catching login/register/dashboard/superadmin/subscribe */}
      <Route path="/:slug" element={<PublicBookingPage />} />
    </Routes>
  );
};

export default AppRouter;
