import { useState, useEffect, createContext, useContext, useCallback, lazy, Suspense } from "react";
import "@/App.css";
import "@/i18n"; // Initialize i18n
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { NotificationProvider } from "@/contexts/NotificationContext";
import NotificationPanel from "@/components/NotificationPanel";
import LoginPage from "@/pages/LoginPage";

// Lazy load heavy pages to reduce initial bundle size and prevent timeouts
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const CompletedPage = lazy(() => import("@/pages/CompletedPage"));
const UsersPage = lazy(() => import("@/pages/UsersPage"));
const MyOrdersPage = lazy(() => import("@/pages/MyOrdersPage"));
const MachineQueuePage = lazy(() => import("@/pages/MachineQueuePage"));
const LaloQueuePage = lazy(() => import("@/pages/LaloQueuePage"));
const DataMigrationPage = lazy(() => import("@/pages/DataMigrationPage"));
const HoldQueuePage = lazy(() => import("@/pages/HoldQueuePage"));
const StockInventoryPage = lazy(() => import("@/pages/StockInventoryPage"));
const PerformancePage = lazy(() => import("@/pages/PerformancePage"));
const RefinishQueuePage = lazy(() => import("@/pages/RefinishQueuePage"));
const RushQueuePage = lazy(() => import("@/pages/RushQueuePage"));
const RedoQueuePage = lazy(() => import("@/pages/RedoQueuePage"));
const CommissionPage = lazy(() => import("@/pages/CommissionPage"));
const ActivityLogPage = lazy(() => import("@/pages/ActivityLogPage"));
const RimOverlayPage = lazy(() => import("@/pages/RimOverlayPage"));
const AdminControlPage = lazy(() => import("@/pages/AdminControlPage"));
const ManufacturingInventoryPage = lazy(() => import("@/pages/ManufacturingInventoryPage"));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
    <div className="text-center">
      <div className="inline-block w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-4"></div>
      <div className="text-red-500 font-oswald uppercase tracking-widest text-sm">Loading...</div>
    </div>
  </div>
);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Auto-logout timeout (20 minutes)
const AUTO_LOGOUT_TIME = 20 * 60 * 1000;

// Auth Context
export const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

// Axios interceptor for auth
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const errorMessage = error.response?.data?.detail || "";
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("lastActivity");
      
      // Show specific message for single device logout
      if (errorMessage.includes("another device")) {
        toast.error("You have been logged out - signed in on another device");
      }
      
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-yellow-500 font-oswald uppercase tracking-widest">Loading...</div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Admin-only route protection
const AdminProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-yellow-500 font-oswald uppercase tracking-widest">Loading...</div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  // Only allow admin users
  if (user.role !== "admin") {
    toast.error("Access denied. Admin only.");
    return <Navigate to="/" replace />;
  }
  
  return children;
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auto-logout after inactivity
  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("lastActivity");
    setUser(null);
    toast.success("Logged out");
  }, []);

  // Check and update activity
  useEffect(() => {
    if (!user) return;

    const updateActivity = () => {
      localStorage.setItem("lastActivity", Date.now().toString());
    };

    const checkInactivity = () => {
      const lastActivity = localStorage.getItem("lastActivity");
      if (lastActivity) {
        const timeSinceActivity = Date.now() - parseInt(lastActivity);
        if (timeSinceActivity > AUTO_LOGOUT_TIME) {
          toast.warning("Session expired due to inactivity");
          logout();
        }
      }
    };

    // Update activity on user interactions
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach(event => {
      window.addEventListener(event, updateActivity);
    });

    // Set initial activity
    updateActivity();

    // Check inactivity every minute
    const interval = setInterval(checkInactivity, 60000);

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, updateActivity);
      });
      clearInterval(interval);
    };
  }, [user, logout]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");
    
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      // Verify token is still valid
      axios.get(`${API}/auth/me`)
        .then(res => {
          setUser(res.data);
          localStorage.setItem("user", JSON.stringify(res.data));
          localStorage.setItem("lastActivity", Date.now().toString());
        })
        .catch(() => {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          localStorage.removeItem("lastActivity");
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    try {
      const res = await axios.post(`${API}/auth/login`, { email, password });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      localStorage.setItem("lastActivity", Date.now().toString());
      setUser(res.data.user);
      toast.success("Welcome back!");
      return true;
    } catch (error) {
      toast.error(error.response?.data?.detail || "Login failed");
      return false;
    }
  };

  const pinLogin = async (email, pin) => {
    try {
      const res = await axios.post(`${API}/auth/pin-login`, { email, pin });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      localStorage.setItem("lastActivity", Date.now().toString());
      setUser(res.data.user);
      toast.success("Welcome back!");
      return true;
    } catch (error) {
      toast.error(error.response?.data?.detail || "PIN login failed");
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, pinLogin, logout, loading }}>
      <NotificationProvider>
        <div className="App min-h-screen bg-zinc-950">
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                } />
                <Route path="/completed" element={
                  <ProtectedRoute>
                    <CompletedPage />
                  </ProtectedRoute>
                } />
                <Route path="/users" element={
                  <ProtectedRoute>
                    <UsersPage />
                  </ProtectedRoute>
                } />
                <Route path="/my-orders" element={
                  <ProtectedRoute>
                    <MyOrdersPage />
                  </ProtectedRoute>
                } />
                <Route path="/machine-queue" element={
                  <ProtectedRoute>
                    <MachineQueuePage />
                  </ProtectedRoute>
                } />
                <Route path="/lalo-queue" element={
                  <ProtectedRoute>
                    <LaloQueuePage />
                  </ProtectedRoute>
                } />
                <Route path="/data-migration" element={
                  <ProtectedRoute>
                    <DataMigrationPage />
                  </ProtectedRoute>
                } />
                <Route path="/hold-queue" element={
                  <ProtectedRoute>
                    <HoldQueuePage />
                  </ProtectedRoute>
                } />
                <Route path="/stock-inventory" element={
                  <ProtectedRoute>
                    <StockInventoryPage />
                  </ProtectedRoute>
                } />
                <Route path="/performance" element={
                  <ProtectedRoute>
                    <PerformancePage />
                  </ProtectedRoute>
                } />
                <Route path="/refinish-queue" element={
                  <ProtectedRoute>
                    <RefinishQueuePage />
                  </ProtectedRoute>
                } />
                <Route path="/rush-queue" element={
                  <ProtectedRoute>
                    <RushQueuePage />
                  </ProtectedRoute>
                } />
                <Route path="/redo-queue" element={
                  <ProtectedRoute>
                    <RedoQueuePage />
                  </ProtectedRoute>
                } />
                <Route path="/commission" element={
                  <ProtectedRoute>
                    <CommissionPage />
                  </ProtectedRoute>
                } />
                <Route path="/activity-log" element={
                  <ProtectedRoute>
                    <ActivityLogPage />
                  </ProtectedRoute>
                } />
                <Route path="/rim-overlay" element={
                  <ProtectedRoute>
                    <RimOverlayPage />
                  </ProtectedRoute>
                } />
                <Route path="/admin-control" element={
                  <ProtectedRoute>
                    <AdminControlPage />
                  </ProtectedRoute>
                } />
                <Route path="/manufacturing-inventory" element={
                  <AdminProtectedRoute>
                    <ManufacturingInventoryPage />
                  </AdminProtectedRoute>
                } />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
            <NotificationPanel />
          </BrowserRouter>
          <Toaster position="top-right" theme="dark" />
        </div>
      </NotificationProvider>
    </AuthContext.Provider>
  );
}

export default App;
