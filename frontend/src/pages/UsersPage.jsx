import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, API } from "@/App";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Users, UserCheck, UserX, RefreshCw, Download, Circle, Plus, Trash2, Key, Edit3, Hash
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const ALL_DEPARTMENTS = [
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

export default function UsersPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [employeeCodes, setEmployeeCodes] = useState([]);
  const [newCode, setNewCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Edit user modal state
  const [editModal, setEditModal] = useState({ open: false, user: null });
  const [editData, setEditData] = useState({ departments: [], role: "staff", name: "", salesperson_id: "" });
  
  // Password reset modal state
  const [passwordModal, setPasswordModal] = useState({ open: false, user: null });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  
  // PIN management modal state
  const [pinModal, setPinModal] = useState({ open: false, user: null });
  const [newPin, setNewPin] = useState("");
  const [settingPin, setSettingPin] = useState(false);
  
  // Salespeople list for linking
  const [salespeople, setSalespeople] = useState([]);

  const fetchUsers = async (showToast = false) => {
    if (showToast) setRefreshing(true);
    try {
      const [usersRes, codesRes, salespeopleRes] = await Promise.all([
        axios.get(`${API}/admin/users`),
        axios.get(`${API}/admin/employee-codes`),
        axios.get(`${API}/salespeople?active_only=true`).catch(() => ({ data: [] }))
      ]);
      setUsers(usersRes.data);
      setEmployeeCodes(codesRes.data);
      setSalespeople(salespeopleRes.data || []);
      if (showToast) toast.success("Refreshed!");
    } catch (error) {
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCreateCode = async (e) => {
    e.preventDefault();
    if (!newCode.trim()) return;
    
    try {
      await axios.post(`${API}/admin/employee-codes`, { code: newCode.trim() });
      toast.success(`Employee code "${newCode.toUpperCase()}" created!`);
      setNewCode("");
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create code");
    }
  };

  const handleDeleteCode = async (codeId, codeValue) => {
    try {
      await axios.delete(`${API}/admin/employee-codes/${codeId}`);
      toast.success(`Code "${codeValue}" deleted`);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete code");
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    try {
      await axios.delete(`${API}/admin/users/${userId}`);
      toast.success(`User "${userName}" deleted`);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete user");
    }
  };

  // Open edit modal for a user
  const openEditModal = (userToEdit) => {
    setEditData({
      departments: userToEdit.departments || [userToEdit.department],
      role: userToEdit.role || "staff",
      name: userToEdit.name || "",
      salesperson_id: userToEdit.salesperson_id || ""
    });
    setEditModal({ open: true, user: userToEdit });
  };

  // Handle department checkbox change
  const handleDeptChange = (dept, checked) => {
    if (checked) {
      if (editData.departments.length < 4) {
        setEditData(prev => ({ ...prev, departments: [...prev.departments, dept] }));
      } else {
        toast.error(t('users.maxDepartments', 'Maximum 4 departments allowed'));
      }
    } else {
      if (editData.departments.length > 1) {
        setEditData(prev => ({ ...prev, departments: prev.departments.filter(d => d !== dept) }));
      } else {
        toast.error(t('users.minDepartment', 'At least one department required'));
      }
    }
  };

  // Move department up (make it primary)
  const moveDeptUp = (index) => {
    if (index === 0) return;
    const newDepts = [...editData.departments];
    [newDepts[index - 1], newDepts[index]] = [newDepts[index], newDepts[index - 1]];
    setEditData(prev => ({ ...prev, departments: newDepts }));
  };

  // Save user changes
  const handleSaveUser = async () => {
    try {
      await axios.put(`${API}/admin/users/${editModal.user.id}`, {
        departments: editData.departments,
        role: editData.role,
        name: editData.name,
        salesperson_id: editData.salesperson_id || null
      });
      toast.success(`User "${editData.name}" updated`);
      setEditModal({ open: false, user: null });
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update user");
    }
  };

  // Open password reset modal
  const openPasswordModal = (userToReset) => {
    setNewPassword("");
    setConfirmPassword("");
    setPasswordModal({ open: true, user: userToReset });
  };

  // Handle password reset
  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error("Please fill in both password fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    
    setResettingPassword(true);
    try {
      await axios.post(`${API}/admin/users/${passwordModal.user.id}/reset-password`, {
        new_password: newPassword
      });
      toast.success(`Password reset for "${passwordModal.user.name}"`);
      setPasswordModal({ open: false, user: null });
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to reset password");
    } finally {
      setResettingPassword(false);
    }
  };

  // Open PIN management modal
  const openPinModal = (userToEdit) => {
    setNewPin(userToEdit.login_pin || "");
    setPinModal({ open: true, user: userToEdit });
  };

  // Handle PIN set/update
  const handleSetPin = async () => {
    if (newPin && (newPin.length !== 4 || !/^\d{4}$/.test(newPin))) {
      toast.error("PIN must be exactly 4 digits");
      return;
    }
    
    setSettingPin(true);
    try {
      await axios.post(`${API}/admin/users/${pinModal.user.id}/set-pin`, {
        pin: newPin || null
      });
      toast.success(newPin ? `PIN set for "${pinModal.user.name}"` : `PIN removed for "${pinModal.user.name}"`);
      setPinModal({ open: false, user: null });
      setNewPin("");
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to set PIN");
    } finally {
      setSettingPin(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // Refresh every 30 seconds to update online status
    const interval = setInterval(() => fetchUsers(false), 30000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = users.filter(u => u.is_online).length;
  const offlineCount = users.filter(u => !u.is_online).length;

  const exportUsersPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("CORLEONE FORGED", 105, 20, { align: "center" });
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text("User Report", 105, 30, { align: "center" });
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 38, { align: "center" });
    doc.text(`Total Users: ${users.length} | Online: ${onlineCount}`, 105, 44, { align: "center" });
    
    const tableData = users.map(u => [
      u.name,
      u.email,
      u.department === "admin" ? "Admin" : u.department,
      u.role,
      u.is_online ? "Online" : "Offline",
      u.last_active ? new Date(u.last_active).toLocaleString() : "Never"
    ]);
    
    autoTable(doc, {
      startY: 52,
      head: [["Name", "Email", "Department", "Role", "Status", "Last Active"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
    });
    
    doc.save(`corleone-forged-users-${new Date().toISOString().split("T")[0]}.pdf`);
    toast.success("PDF exported!");
  };

  const getDepartmentLabel = (dept) => {
    const labels = {
      "admin": "Admin",
      "received": "Sales",
      "design": "Design",
      "program": "Program",
      "machine_waiting": "Machine Waiting",
      "machine": "Machine",
      "finishing": "Finishing",
      "powder_coat": "Powder Coat",
      "assemble": "Assemble",
      "showroom": "Showroom",
      "shipped": "Shipped"
    };
    return labels[dept] || dept;
  };

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-red-500 font-oswald uppercase">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="app-header sticky top-0 z-50 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md">
        <div className="max-w-[1920px] mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="text-zinc-400 hover:text-white mr-2"
                data-testid="back-btn"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <img 
                src="https://customer-assets.emergentagent.com/job_31a0c595-a4df-4df8-a9b1-3cd3b62875e2/artifacts/mjago68w_logo_cf_red-removebg-preview%20%281%29.png" 
                alt="Corleone Forged" 
                className="h-8 w-auto cursor-pointer"
                onClick={() => navigate("/")}
                data-testid="logo-home"
              />
              <h1 
                className="font-oswald text-xl md:text-2xl uppercase tracking-widest text-white cursor-pointer"
                onClick={() => navigate("/")}
              >
                User Management
              </h1>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportUsersPDF}
                className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white font-oswald uppercase tracking-wider text-xs"
                data-testid="export-users-pdf-btn"
              >
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchUsers(true)}
                disabled={refreshing}
                className="text-zinc-400 hover:text-white"
                data-testid="refresh-users-btn"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto p-4 md:p-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="bg-zinc-900/50 border-zinc-800 stats-card">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1">Total Users</p>
              <p className="font-oswald text-3xl text-white" data-testid="total-users">{users.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800 stats-card">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1">Online Now</p>
              <p className="font-oswald text-3xl text-green-500" data-testid="online-users">{onlineCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800 stats-card">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1">Offline</p>
              <p className="font-oswald text-3xl text-zinc-500" data-testid="offline-users">{offlineCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800 stats-card">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1">Admins</p>
              <p className="font-oswald text-3xl text-red-500" data-testid="admin-users">{users.filter(u => u.role === "admin").length}</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800 stats-card">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1">Available Codes</p>
              <p className="font-oswald text-3xl text-amber-500" data-testid="available-codes">{employeeCodes.filter(c => !c.used).length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Employee Codes Management */}
        <Card className="bg-zinc-900/50 border-zinc-800 mb-6">
          <CardHeader className="border-b border-zinc-800 p-4">
            <div className="flex items-center justify-between">
              <CardTitle className="font-oswald uppercase tracking-widest text-sm text-amber-500">
                <Key className="w-4 h-4 inline mr-2" />
                Employee Codes
              </CardTitle>
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500">
                {employeeCodes.filter(c => !c.used).length} Available / {employeeCodes.filter(c => c.used).length} Used
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {/* Add New Code Form */}
            <form onSubmit={handleCreateCode} className="flex gap-2 mb-4">
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="Enter new employee code (e.g., EMP001)"
                className="bg-zinc-950 border-zinc-700 font-mono uppercase flex-1"
                data-testid="new-code-input"
              />
              <Button
                type="submit"
                disabled={!newCode.trim()}
                className="bg-amber-500 hover:bg-amber-400 text-black font-oswald uppercase tracking-wider"
                data-testid="create-code-btn"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Code
              </Button>
            </form>

            {/* Codes List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {employeeCodes.length === 0 ? (
                <p className="text-zinc-500 font-mono text-sm col-span-full text-center py-4">
                  No employee codes created yet. Create one above to allow staff registration.
                </p>
              ) : (
                employeeCodes.map((code) => (
                  <div
                    key={code.id}
                    className={`p-3 rounded border ${code.used ? "bg-zinc-800/30 border-zinc-700" : "bg-amber-500/10 border-amber-500/30"}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-mono text-lg font-bold ${code.used ? "text-zinc-500 line-through" : "text-amber-500"}`}>
                        {code.code}
                      </span>
                      {!code.used && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCode(code.id, code.code)}
                          className="h-6 w-6 p-0 text-zinc-500 hover:text-red-500"
                          data-testid={`delete-code-${code.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {code.used ? (
                        <>
                          <p className="font-mono text-[10px] text-zinc-500">
                            Used by: <span className="text-green-400">{code.used_by_name}</span>
                          </p>
                          <p className="font-mono text-[10px] text-zinc-600">
                            {new Date(code.used_at).toLocaleString()}
                          </p>
                        </>
                      ) : (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500 text-[9px]">
                          Available
                        </Badge>
                      )}
                      <p className="font-mono text-[9px] text-zinc-600">
                        Created by {code.created_by}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="border-b border-zinc-800 p-4">
            <CardTitle className="font-oswald uppercase tracking-widest text-sm text-zinc-300">
              <Users className="w-4 h-4 inline mr-2" />
              All Users
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-red-500 font-oswald uppercase tracking-widest animate-pulse">
                  Loading...
                </div>
              </div>
            ) : users.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-zinc-600 font-mono text-sm">No users found</p>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-400px)] min-h-[400px]">
                <Table className="data-table">
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="font-oswald text-zinc-500">Status</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Name</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Email</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Department</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Role</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Last Active</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Created</TableHead>
                      <TableHead className="font-oswald text-zinc-500">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow
                        key={u.id}
                        className="border-zinc-800 hover:bg-zinc-800/50"
                        data-testid={`user-row-${u.id}`}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Circle 
                              className={`w-3 h-3 ${u.is_online ? "fill-green-500 text-green-500" : "fill-zinc-600 text-zinc-600"}`}
                            />
                            <span className={`font-mono text-[10px] ${u.is_online ? "text-green-500" : "text-zinc-500"}`}>
                              {u.is_online ? "Online" : "Offline"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-white text-sm">
                          {u.name}
                        </TableCell>
                        <TableCell className="font-mono text-zinc-400 text-xs">
                          {u.email}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(u.departments || [u.department]).map((dept, idx) => (
                              <Badge 
                                key={dept} 
                                className={`badge-industrial bg-transparent ${idx === 0 ? "text-cyan-500 border-cyan-500" : "text-zinc-400 border-zinc-600"}`}
                              >
                                {getDepartmentLabel(dept)}{idx === 0 && " ★"}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`badge-industrial bg-transparent ${
                            u.role === "admin" ? "text-red-500 border-red-500" : 
                            u.role === "admin_restricted" ? "text-amber-500 border-amber-500" : 
                            "text-zinc-400 border-zinc-600"
                          }`}>
                            {u.role === "admin" ? "ADMIN" : u.role === "admin_restricted" ? "ADMIN 1" : "STAFF"}
                          </Badge>
                          {u.salesperson_id && (
                            <Badge className="ml-1 badge-industrial bg-transparent text-green-500 border-green-500">
                              💰 SALES
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-zinc-500 text-xs">
                          {u.last_active ? new Date(u.last_active).toLocaleString() : "Never"}
                        </TableCell>
                        <TableCell className="font-mono text-zinc-500 text-xs">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {/* Edit button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-zinc-500 hover:text-amber-500 hover:bg-amber-500/10"
                              onClick={() => openEditModal(u)}
                              data-testid={`edit-user-${u.id}`}
                            >
                              <Edit3 className="w-4 h-4" />
                            </Button>
                            {/* Password Reset Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-zinc-500 hover:text-blue-500 hover:bg-blue-500/10"
                              onClick={() => openPasswordModal(u)}
                              data-testid={`reset-password-${u.id}`}
                              title="Reset Password"
                            >
                              <Key className="w-4 h-4" />
                            </Button>
                            {/* PIN Management Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-7 w-7 p-0 ${u.login_pin ? 'text-green-500' : 'text-zinc-500'} hover:text-amber-500 hover:bg-amber-500/10`}
                              onClick={() => openPinModal(u)}
                              data-testid={`set-pin-${u.id}`}
                              title={u.login_pin ? `PIN: ${u.login_pin}` : "Set PIN"}
                            >
                              <Hash className="w-4 h-4" />
                            </Button>
                            {/* Don't allow deleting yourself or other admins if you're the only admin */}
                            {u.id !== user?.id && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-zinc-500 hover:text-red-500 hover:bg-red-500/10"
                                    data-testid={`delete-user-${u.id}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="font-oswald uppercase tracking-widest text-white">
                                      Delete User?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription className="font-mono text-zinc-400">
                                      Are you sure you want to delete <span className="text-red-500 font-bold">{u.name}</span>?
                                      This action cannot be undone. The user will no longer be able to access the system.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700 font-mono">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteUser(u.id, u.name)}
                                    className="bg-red-500 hover:bg-red-600 text-white font-oswald uppercase tracking-wider"
                                  >
                                    Delete User
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Edit User Modal */}
      <Dialog open={editModal.open} onOpenChange={(open) => setEditModal({ open, user: open ? editModal.user : null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald uppercase tracking-widest text-white flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-amber-500" />
              Edit User
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label className="font-mono text-xs text-zinc-400">Name</Label>
              <Input
                value={editData.name}
                onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
                className="bg-zinc-800 border-zinc-700 text-white font-mono"
                data-testid="edit-user-name"
              />
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label className="font-mono text-xs text-zinc-400">Role</Label>
              <Select
                value={editData.role}
                onValueChange={(value) => setEditData(prev => ({ ...prev, role: value }))}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white font-mono" data-testid="edit-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="staff" className="font-mono">Staff</SelectItem>
                  <SelectItem value="admin" className="font-mono">Admin (Full)</SelectItem>
                  <SelectItem value="admin_restricted" className="font-mono">Admin 1 (Restricted)</SelectItem>
                </SelectContent>
              </Select>
              <p className="font-mono text-[10px] text-zinc-500 mt-1">
                Admin 1 cannot view/manage users or create PINs
              </p>
            </div>

            {/* Departments */}
            <div className="space-y-3">
              <Label className="font-mono text-xs text-zinc-400">
                Departments (max 3, first one is primary)
              </Label>
              
              {/* Selected departments - draggable order */}
              {editData.departments.length > 0 && (
                <div className="space-y-2 mb-3">
                  <p className="font-mono text-[10px] text-zinc-500">Current departments (click ↑ to make primary):</p>
                  {editData.departments.map((dept, idx) => (
                    <div key={dept} className="flex items-center gap-2 p-2 bg-zinc-800/50 rounded border border-zinc-700">
                      <Badge className={`${idx === 0 ? "bg-amber-500/20 text-amber-400 border-amber-500" : "bg-zinc-700/50 text-zinc-400 border-zinc-600"}`}>
                        {idx === 0 ? "PRIMARY" : `#${idx + 1}`}
                      </Badge>
                      <span className="font-mono text-sm text-white flex-1">
                        {ALL_DEPARTMENTS.find(d => d.value === dept)?.label || dept}
                      </span>
                      {idx > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-zinc-400 hover:text-amber-500"
                          onClick={() => moveDeptUp(idx)}
                        >
                          ↑
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {/* Available departments checkboxes */}
              <div className="grid grid-cols-2 gap-2 p-3 bg-zinc-800/30 rounded border border-zinc-700">
                {ALL_DEPARTMENTS.map((dept) => (
                  <div key={dept.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`dept-${dept.value}`}
                      checked={editData.departments.includes(dept.value)}
                      onCheckedChange={(checked) => handleDeptChange(dept.value, checked)}
                      className="border-zinc-600 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                      data-testid={`edit-dept-${dept.value}`}
                    />
                    <label
                      htmlFor={`dept-${dept.value}`}
                      className="font-mono text-xs text-zinc-300 cursor-pointer"
                    >
                      {dept.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Link to Salesperson for Commission */}
            {salespeople.length > 0 && (
              <div className="space-y-2">
                <Label className="text-zinc-400 font-mono text-xs uppercase">
                  Link to Salesperson (Commission)
                </Label>
                <Select
                  value={editData.salesperson_id || "none"}
                  onValueChange={(value) => setEditData(prev => ({ ...prev, salesperson_id: value === "none" ? "" : value }))}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 font-mono">
                    <SelectValue placeholder="Select salesperson..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="none" className="font-mono text-zinc-500">Not a salesperson</SelectItem>
                    {salespeople.map((sp) => (
                      <SelectItem key={sp.id} value={sp.id} className="font-mono">
                        {sp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-zinc-500 font-mono">
                  If this user is a salesperson, link them to get auto-credited on orders they create.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
            <Button
              variant="outline"
              onClick={() => setEditModal({ open: false, user: null })}
              className="font-mono border-zinc-700 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveUser}
              className="bg-amber-500 hover:bg-amber-400 text-black font-oswald uppercase tracking-wider"
              data-testid="save-user-btn"
            >
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Reset Modal */}
      <Dialog open={passwordModal.open} onOpenChange={(open) => {
        if (!open) {
          setPasswordModal({ open: false, user: null });
          setNewPassword("");
          setConfirmPassword("");
        }
      }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald uppercase tracking-widest text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-blue-500" />
              Reset Password
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="font-mono text-sm text-blue-400">
                Resetting password for: <span className="text-white font-bold">{passwordModal.user?.name}</span>
              </p>
              <p className="font-mono text-xs text-zinc-500 mt-1">
                {passwordModal.user?.email}
              </p>
            </div>
            
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-zinc-400">
                New Password
              </Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="bg-zinc-800 border-zinc-700 font-mono"
                data-testid="new-password-input"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-zinc-400">
                Confirm Password
              </Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="bg-zinc-800 border-zinc-700 font-mono"
                data-testid="confirm-password-input"
              />
            </div>
            
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-red-500 font-mono text-xs">Passwords do not match</p>
            )}
            
            <Button
              onClick={handleResetPassword}
              disabled={resettingPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-oswald uppercase tracking-wider"
              data-testid="reset-password-submit"
            >
              {resettingPassword ? "Resetting..." : "Reset Password"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PIN Management Modal */}
      <Dialog open={pinModal.open} onOpenChange={(open) => {
        if (!open) {
          setPinModal({ open: false, user: null });
          setNewPin("");
        }
      }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-oswald uppercase tracking-widest text-white flex items-center gap-2">
              <Hash className="w-5 h-5 text-amber-500" />
              Set Login PIN
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="font-mono text-sm text-amber-400">
                Setting PIN for: <span className="text-white font-bold">{pinModal.user?.name}</span>
              </p>
              <p className="font-mono text-xs text-zinc-500 mt-1">
                Current PIN: {pinModal.user?.login_pin ? <span className="text-green-400 font-bold">{pinModal.user.login_pin}</span> : <span className="text-zinc-600">Not set</span>}
              </p>
            </div>
            
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider text-zinc-400">
                4-Digit PIN
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={newPin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setNewPin(value);
                }}
                placeholder="Enter 4-digit PIN"
                className="bg-zinc-800 border-zinc-700 font-mono text-2xl tracking-[0.5em] text-center"
                data-testid="new-pin-input"
              />
              <p className="font-mono text-xs text-zinc-500">
                Leave empty to remove PIN. User won't be able to use PIN login.
              </p>
            </div>
            
            {newPin && newPin.length !== 4 && (
              <p className="text-red-500 font-mono text-xs">PIN must be exactly 4 digits</p>
            )}
            
            <div className="flex gap-2">
              <Button
                onClick={handleSetPin}
                disabled={settingPin || (newPin && newPin.length !== 4)}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-oswald uppercase tracking-wider"
                data-testid="set-pin-submit"
              >
                {settingPin ? "Saving..." : newPin ? "Set PIN" : "Remove PIN"}
              </Button>
              {pinModal.user?.login_pin && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setNewPin("");
                    handleSetPin();
                  }}
                  disabled={settingPin}
                  className="border-red-500/50 text-red-500 hover:bg-red-500/10 font-oswald uppercase tracking-wider"
                  data-testid="remove-pin-btn"
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
