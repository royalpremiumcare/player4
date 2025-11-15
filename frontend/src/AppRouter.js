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

  // Eğer kullanıcı authenticated ise ve login/register sayfalarındaysa dashboard'a yönlendir
  const shouldRedirectToDashboard = isAuthenticated && 
    (location.pathname === '/login' || 
     location.pathname === '/register' || 
     location.pathname === '/forgot-password' || 
     location.pathname === '/reset-password');

  // Eğer kullanıcı authenticated değilse ve dashboard'da ise login'e yönlendir
  const shouldRedirectToLogin = !isAuthenticated && location.pathname === '/dashboard';
  
  // Superadmin kontrolü
  const isSuperAdmin = userRole === 'superadmin';

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route 
        path="/login" 
        element={shouldRedirectToDashboard ? <Navigate to="/dashboard" replace /> : <LoginPage />} 
      />
      <Route 
        path="/register" 
        element={shouldRedirectToDashboard ? <Navigate to="/dashboard" replace /> : <RegisterPage />} 
      />
      <Route 
        path="/forgot-password" 
        element={shouldRedirectToDashboard ? <Navigate to="/dashboard" replace /> : <ForgotPasswordPage />} 
      />
      <Route 
        path="/reset-password" 
        element={shouldRedirectToDashboard ? <Navigate to="/dashboard" replace /> : <ResetPasswordPage />} 
      />
      <Route 
        path="/setup-password" 
        element={<SetupPassword />} 
      />
      
      {/* Protected Routes */}
      <Route 
        path="/dashboard" 
        element={isAuthenticated ? <App /> : <Navigate to="/login" replace />} 
      />
      
      {/* Super Admin Route - Sadece superadmin rolü erişebilir */}
      <Route 
        path="/superadmin" 
        element={
          isAuthenticated && isSuperAdmin ? (
            <SuperAdmin />
          ) : isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        } 
      />
      
      {/* Public Booking - Catch dynamic business slugs (domain.com/isletmeadi) */}
      {/* This must be last to avoid catching login/register/dashboard/superadmin */}
      <Route path="/:slug" element={<PublicBookingPage />} />
    </Routes>
  );
};

export default AppRouter;
