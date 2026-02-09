import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth, API } from "@/App";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, UserPlus, KeyRound, ChevronRight, Mail, User, Lock, Shield, Briefcase } from "lucide-react";
import LanguageSelector from "@/components/LanguageSelector";
import axios from "axios";
import { toast } from "sonner";

const DEPARTMENTS = [
  { value: "admin", label: "Admin (All Departments)" },
  { value: "received", label: "Sales" },
  { value: "design", label: "Design" },
  { value: "program", label: "Program" },
  { value: "machine_waiting", label: "Machine Waiting" },
  { value: "machine", label: "Machine" },
  { value: "finishing", label: "Finishing" },
  { value: "powder_coat", label: "Powder Coat" },
  { value: "assemble", label: "Assemble" },
  { value: "showroom", label: "Showroom" },
  { value: "shipped", label: "Shipped" },
];

export default function LoginPage() {
  const { user, login, pinLogin } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  const [loginForm, setLoginForm] = useState({ email: "", username: "", password: "" });
  const [quickPinForm, setQuickPinForm] = useState({ pin: "" });
  const [loginMethod, setLoginMethod] = useState("email");
  const [registerForm, setRegisterForm] = useState({
    email: "",
    username: "",
    password: "",
    name: "",
    departments: [],
    admin_pin: "",
    employee_code: "",
  });
  const [registerMethod, setRegisterMethod] = useState("email");

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleQuickPinLogin = async (e) => {
    e.preventDefault();
    if (!quickPinForm.pin) {
      toast.error("Please enter your PIN");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/pin-login`, { pin: quickPinForm.pin });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      toast.success(`Welcome back, ${res.data.user.name}!`);
      window.location.href = "/";
    } catch (error) {
      toast.error(error.response?.data?.detail || "Invalid PIN");
      setQuickPinForm({ pin: "" });
    } finally {
      setLoading(false);
    }
  };

  const toggleDepartment = (dept) => {
    const current = registerForm.departments;
    if (current.includes(dept)) {
      setRegisterForm({ ...registerForm, departments: current.filter(d => d !== dept) });
    } else if (current.length < 4) {
      setRegisterForm({ ...registerForm, departments: [...current, dept] });
    } else {
      toast.error(t('users.maxDepartments', 'Maximum 4 departments allowed'));
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const loginData = loginMethod === "email" 
        ? { email: loginForm.email, password: loginForm.password }
        : { username: loginForm.username, password: loginForm.password };
      
      const res = await axios.post(`${API}/auth/login`, loginData);
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      toast.success(`Welcome back, ${res.data.user.name}!`);
      window.location.href = "/";
    } catch (error) {
      toast.error(error.response?.data?.detail || "Login failed");
    }
    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (registerForm.departments.length === 0) {
      toast.error("Please select at least one department");
      return;
    }
    if (registerMethod === "email" && !registerForm.email) {
      toast.error("Email is required");
      return;
    }
    if (registerMethod === "username" && !registerForm.username) {
      toast.error("Username is required");
      return;
    }
    const isAdmin = registerForm.departments.includes("admin");
    if (isAdmin && !registerForm.admin_pin) {
      toast.error("Admin PIN is required");
      return;
    }
    if (!isAdmin && !registerForm.employee_code) {
      toast.error("Employee Code is required");
      return;
    }
    setLoading(true);
    try {
      const role = isAdmin ? "admin" : "staff";
      const registerData = {
        ...registerForm,
        role,
        email: registerMethod === "email" ? registerForm.email : null,
        username: registerMethod === "username" ? registerForm.username : null,
      };
      await axios.post(`${API}/auth/register`, registerData);
      toast.success("Account created! Please log in.");
      if (registerMethod === "email") {
        setLoginForm({ ...loginForm, email: registerForm.email, password: "" });
        setLoginMethod("email");
      } else {
        setLoginForm({ ...loginForm, username: registerForm.username, password: "" });
        setLoginMethod("username");
      }
      setRegisterForm({ email: "", username: "", password: "", name: "", departments: [], admin_pin: "", employee_code: "" });
      setActiveTab("login");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Registration failed");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0">
        {/* Diagonal stripes */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 20px,
            #dc2626 20px,
            #dc2626 22px
          )`
        }} />
        {/* Radial gradient */}
        <div className="absolute inset-0 bg-gradient-radial from-red-950/20 via-transparent to-transparent" />
        {/* Bottom glow */}
        <div className="absolute bottom-0 left-0 right-0 h-[500px] bg-gradient-to-t from-red-950/30 via-red-950/10 to-transparent" />
      </div>

      {/* Language Selector */}
      <div className="absolute top-6 right-6 z-50">
        <LanguageSelector />
      </div>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-12">
        
        {/* Logo Section */}
        <div className="text-center mb-10 animate-fadeIn">
          <div className="relative inline-block">
            {/* Glow effect behind logo */}
            <div className="absolute inset-0 blur-3xl bg-red-500/30 scale-150" />
            <img 
              src="https://customer-assets.emergentagent.com/job_31a0c595-a4df-4df8-a9b1-3cd3b62875e2/artifacts/mjago68w_logo_cf_red-removebg-preview%20%281%29.png" 
              alt="Corleone Forged" 
              className="relative h-28 w-auto drop-shadow-2xl"
            />
          </div>
          <h1 className="font-oswald text-5xl md:text-6xl uppercase tracking-[0.2em] text-white mt-6 font-bold">
            Corleone <span className="text-red-500">Forged</span>
          </h1>
          <div className="flex items-center justify-center gap-3 mt-3">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-red-500" />
            <p className="text-white font-mono text-xs tracking-[0.3em] uppercase font-bold">
              Order Management System
            </p>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-red-500" />
          </div>
        </div>

        {/* Login Card */}
        <div className="w-full max-w-md">
          <div className="relative">
            {/* Card glow */}
            <div className="absolute -inset-1 bg-red-500/20 rounded-2xl blur-xl" />
            
            {/* Card */}
            <div className="relative bg-zinc-950/90 backdrop-blur-xl border border-zinc-800/80 rounded-2xl overflow-hidden">
              {/* Top accent line */}
              <div className="h-1 bg-red-500" />
              
              {/* Tab Navigation */}
              <div className="flex border-b border-zinc-800/80">
                <button
                  onClick={() => setActiveTab("login")}
                  className={`flex-1 py-4 px-4 font-oswald uppercase tracking-wider text-sm flex items-center justify-center gap-2 transition-all duration-300 ${
                    activeTab === "login" 
                      ? "bg-red-500/10 text-red-500 border-b-2 border-red-500" 
                      : "text-white font-bold hover:text-zinc-300 hover:bg-zinc-900/50"
                  }`}
                  data-testid="login-tab"
                >
                  <LogIn className="w-4 h-4" />
                  {t('auth.login')}
                </button>
                <button
                  onClick={() => setActiveTab("pin")}
                  className={`flex-1 py-4 px-4 font-oswald uppercase tracking-wider text-sm flex items-center justify-center gap-2 transition-all duration-300 ${
                    activeTab === "pin" 
                      ? "bg-amber-500/10 text-amber-500 border-b-2 border-amber-500" 
                      : "text-yellow-400 font-bold hover:text-yellow-300 hover:bg-zinc-900/50"
                  }`}
                  data-testid="pin-tab"
                >
                  <KeyRound className="w-4 h-4" />
                  Quick PIN
                </button>
                <button
                  onClick={() => setActiveTab("register")}
                  className={`flex-1 py-4 px-4 font-oswald uppercase tracking-wider text-sm flex items-center justify-center gap-2 transition-all duration-300 ${
                    activeTab === "register" 
                      ? "bg-red-500/10 text-red-500 border-b-2 border-red-500" 
                      : "text-white font-bold hover:text-zinc-300 hover:bg-zinc-900/50"
                  }`}
                  data-testid="register-tab"
                >
                  <UserPlus className="w-4 h-4" />
                  {t('auth.register')}
                </button>
              </div>

              {/* Form Content */}
              <div className="p-8">
                {/* Login Form */}
                {activeTab === "login" && (
                  <form onSubmit={handleLogin} className="space-y-5">
                    {/* Method Toggle */}
                    <div className="flex gap-2 p-1 bg-zinc-900/50 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setLoginMethod("email")}
                        className={`flex-1 py-2 rounded-md font-mono text-xs uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 ${
                          loginMethod === "email" 
                            ? "bg-red-500 text-white shadow-lg shadow-red-500/25" 
                            : "text-white font-bold hover:text-white"
                        }`}
                      >
                        <Mail className="w-3.5 h-3.5" />
                        Email
                      </button>
                      <button
                        type="button"
                        onClick={() => setLoginMethod("username")}
                        className={`flex-1 py-2 rounded-md font-mono text-xs uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 ${
                          loginMethod === "username" 
                            ? "bg-red-500 text-white shadow-lg shadow-red-500/25" 
                            : "text-white font-bold hover:text-white"
                        }`}
                      >
                        <User className="w-3.5 h-3.5" />
                        Username
                      </button>
                    </div>

                    <div className="space-y-2">
                      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white font-bold flex items-center gap-2">
                        {loginMethod === "email" ? <Mail className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        {loginMethod === "email" ? t('auth.email') : t('auth.username')}
                      </Label>
                      {loginMethod === "email" ? (
                        <Input
                          type="email"
                          value={loginForm.email}
                          onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                          className="bg-zinc-900/50 border-zinc-800 focus:border-red-500 focus:ring-red-500/20 font-mono h-12 text-white placeholder:text-zinc-600"
                          placeholder="user@example.com"
                          required
                          data-testid="login-email-input"
                        />
                      ) : (
                        <Input
                          type="text"
                          value={loginForm.username}
                          onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                          className="bg-zinc-900/50 border-zinc-800 focus:border-red-500 focus:ring-red-500/20 font-mono h-12 text-white placeholder:text-zinc-600"
                          placeholder="your_username"
                          required
                          data-testid="login-username-input"
                        />
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white font-bold flex items-center gap-2">
                        <Lock className="w-3 h-3" />
                        {t('auth.password')}
                      </Label>
                      <Input
                        type="password"
                        value={loginForm.password}
                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                        className="bg-zinc-900/50 border-zinc-800 focus:border-red-500 focus:ring-red-500/20 font-mono h-12 text-white placeholder:text-zinc-600"
                        placeholder="••••••••"
                        required
                        data-testid="login-password-input"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-red-500 hover:bg-red-400 text-white font-oswald uppercase tracking-[0.2em] font-bold h-14 text-lg shadow-xl shadow-red-500/25 transition-all duration-300 hover:shadow-red-500/40 hover:scale-[1.02] group"
                      data-testid="login-submit-btn"
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Accessing...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          {t('auth.accessSystem')}
                          <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </span>
                      )}
                    </Button>
                  </form>
                )}

                {/* Quick PIN Form */}
                {activeTab === "pin" && (
                  <form onSubmit={handleQuickPinLogin} className="space-y-6">
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 mb-4">
                        <KeyRound className="w-8 h-8 text-amber-500" />
                      </div>
                      <p className="text-zinc-300 font-mono text-sm mb-2">
                        Enter your secure PIN
                      </p>
                      <p className="text-zinc-600 font-mono text-[10px]">
                        Fast access for registered users
                      </p>
                    </div>

                    <div className="space-y-3">
                      <Input
                        type="password"
                        maxLength={4}
                        value={quickPinForm.pin}
                        onChange={(e) => setQuickPinForm({ pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                        className="bg-zinc-900/50 border-amber-800/50 focus:border-amber-500 focus:ring-amber-500/20 font-mono text-5xl text-center tracking-[0.5em] h-20 text-amber-500 placeholder:text-zinc-700"
                        placeholder="• • • •"
                        required
                        autoFocus
                        data-testid="quick-pin-input"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={loading || quickPinForm.pin.length === 0}
                      className="w-full bg-amber-500 hover:bg-amber-400 text-black font-oswald uppercase tracking-[0.2em] font-bold h-14 text-lg shadow-xl shadow-amber-500/25 transition-all duration-300 hover:shadow-amber-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="quick-pin-submit-btn"
                    >
                      {loading ? "Verifying..." : "Unlock"}
                    </Button>

                    <p className="text-zinc-600 font-mono text-[10px] text-center leading-relaxed">
                      Don't have a PIN? Login with email/password first,<br />
                      then set your unique PIN in settings.
                    </p>
                  </form>
                )}

                {/* Register Form */}
                {activeTab === "register" && (
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                        <User className="w-3 h-3" />
                        Full Name
                      </Label>
                      <Input
                        type="text"
                        value={registerForm.name}
                        onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                        className="bg-zinc-900/50 border-zinc-800 focus:border-red-500 focus:ring-red-500/20 font-mono h-11 text-white placeholder:text-zinc-600"
                        placeholder="John Doe"
                        required
                        data-testid="register-name-input"
                      />
                    </div>

                    {/* Method Toggle */}
                    <div className="flex gap-2 p-1 bg-zinc-900/50 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setRegisterMethod("email")}
                        className={`flex-1 py-2 rounded-md font-mono text-xs uppercase tracking-wider transition-all duration-200 ${
                          registerMethod === "email" 
                            ? "bg-red-500 text-white" 
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        Use Email
                      </button>
                      <button
                        type="button"
                        onClick={() => setRegisterMethod("username")}
                        className={`flex-1 py-2 rounded-md font-mono text-xs uppercase tracking-wider transition-all duration-200 ${
                          registerMethod === "username" 
                            ? "bg-red-500 text-white" 
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        Use Username
                      </button>
                    </div>

                    <div className="space-y-2">
                      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                        {registerMethod === "email" ? "Email" : "Username"}
                      </Label>
                      {registerMethod === "email" ? (
                        <Input
                          type="email"
                          value={registerForm.email}
                          onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                          className="bg-zinc-900/50 border-zinc-800 focus:border-red-500 focus:ring-red-500/20 font-mono h-11 text-white placeholder:text-zinc-600"
                          placeholder="user@example.com"
                          required
                          data-testid="register-email-input"
                        />
                      ) : (
                        <Input
                          type="text"
                          value={registerForm.username}
                          onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                          className="bg-zinc-900/50 border-zinc-800 focus:border-red-500 focus:ring-red-500/20 font-mono h-11 text-white placeholder:text-zinc-600"
                          placeholder="your_username"
                          required
                          data-testid="register-username-input"
                        />
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                        <Lock className="w-3 h-3" />
                        Password
                      </Label>
                      <Input
                        type="password"
                        value={registerForm.password}
                        onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                        className="bg-zinc-900/50 border-zinc-800 focus:border-red-500 focus:ring-red-500/20 font-mono h-11 text-white placeholder:text-zinc-600"
                        placeholder="••••••••"
                        required
                        data-testid="register-password-input"
                      />
                    </div>

                    {/* Department Selection */}
                    <div className="space-y-2">
                      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                        <Briefcase className="w-3 h-3" />
                        Departments (Select up to 4)
                      </Label>
                      <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                        {DEPARTMENTS.map((dept) => (
                          <button
                            key={dept.value}
                            type="button"
                            onClick={() => toggleDepartment(dept.value)}
                            className={`p-2 rounded text-left font-mono text-[11px] transition-all duration-200 ${
                              registerForm.departments.includes(dept.value)
                                ? "bg-red-500 text-white shadow-lg shadow-red-500/25"
                                : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                            }`}
                          >
                            {dept.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-zinc-600 font-mono">
                        Selected: {registerForm.departments.length}/4
                        {registerForm.departments.length > 0 && (
                          <span className="text-red-500 ml-2">
                            ({registerForm.departments.map(d => DEPARTMENTS.find(x => x.value === d)?.label).join(", ")})
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Admin PIN */}
                    {registerForm.departments.includes("admin") && (
                      <div className="space-y-2 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                        <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-red-500 flex items-center gap-2">
                          <Shield className="w-3 h-3" />
                          Admin PIN *
                        </Label>
                        <Input
                          type="password"
                          value={registerForm.admin_pin}
                          onChange={(e) => setRegisterForm({ ...registerForm, admin_pin: e.target.value })}
                          className="bg-zinc-900/50 border-red-500/50 focus:border-red-500 focus:ring-red-500/20 font-mono h-11 text-white placeholder:text-zinc-600"
                          placeholder="Enter admin PIN"
                          required
                          data-testid="register-admin-pin-input"
                        />
                        <p className="text-[10px] text-zinc-600 font-mono">Contact administrator for PIN</p>
                      </div>
                    )}

                    {/* Employee Code */}
                    {registerForm.departments.length > 0 && !registerForm.departments.includes("admin") && (
                      <div className="space-y-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                        <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-400 flex items-center gap-2">
                          <Briefcase className="w-3 h-3" />
                          Employee Code *
                        </Label>
                        <Input
                          type="text"
                          value={registerForm.employee_code}
                          onChange={(e) => setRegisterForm({ ...registerForm, employee_code: e.target.value.toUpperCase() })}
                          className="bg-zinc-900/50 border-amber-800/50 focus:border-amber-500 focus:ring-amber-500/20 font-mono uppercase h-11 text-white placeholder:text-zinc-600"
                          placeholder="Enter your employee code"
                          required
                          data-testid="register-employee-code-input"
                        />
                        <p className="text-[10px] text-zinc-600 font-mono">Get your code from administrator</p>
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={loading || registerForm.departments.length === 0}
                      className="w-full bg-red-500 hover:bg-red-400 text-white font-oswald uppercase tracking-[0.2em] font-bold h-12 shadow-xl shadow-red-500/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="register-submit-btn"
                    >
                      {loading ? "Creating Account..." : "Create Account"}
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-white font-mono text-[10px] tracking-wider font-bold">
            © {new Date().getFullYear()} Corleone Industries LLC • All Rights Reserved
          </p>
          <p className="text-zinc-400 font-mono text-[9px] tracking-wider mt-1">
            Proprietary Software • Owned & Licensed by Corleone Industries LLC
          </p>
        </div>
      </div>
    </div>
  );
}
