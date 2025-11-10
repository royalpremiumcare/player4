import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import LandingPage from "./components/LandingPage";
import LoginPage from "./components/LoginPage";
import RegisterPage from "./components/RegisterPage";
import PublicBookingPage from "./components/PublicBookingPage";
import App from "./App";

const AppRouter = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" /> : <LoginPage />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/dashboard" /> : <RegisterPage />} />
      
      {/* Protected Routes */}
      <Route 
        path="/dashboard" 
        element={isAuthenticated ? <App /> : <Navigate to="/login" />} 
      />
      
      {/* Public Booking - Catch dynamic business slugs (domain.com/isletmeadi) */}
      {/* This must be last to avoid catching login/register/dashboard */}
      <Route path="/:slug" element={<PublicBookingPage />} />
    </Routes>
  );
};

export default AppRouter;
