import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { API, useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  RefreshCw, 
  Download,
  Calendar,
  TrendingUp,
  Users,
  User,
  Award,
  Clock,
  CheckCircle,
  AlertCircle,
  Zap,
  BarChart3,
  Trophy,
  Target,
  ChevronLeft,
  ChevronRight,
  Settings,
  FileText,
  Edit2,
  Save,
  X
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Grade colors
const GRADE_COLORS = {
  A: "bg-green-500/20 text-green-400 border-green-500",
  B: "bg-blue-500/20 text-blue-400 border-blue-500",
  C: "bg-yellow-500/20 text-yellow-400 border-yellow-500",
  D: "bg-orange-500/20 text-orange-400 border-orange-500",
  F: "bg-red-500/20 text-red-400 border-red-500"
};

const GRADE_BG_COLORS = {
  A: "from-green-500/30 to-green-500/10",
  B: "from-blue-500/30 to-blue-500/10",
  C: "from-yellow-500/30 to-yellow-500/10",
  D: "from-orange-500/30 to-orange-500/10",
  F: "from-red-500/30 to-red-500/10"
};

export default function PerformancePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [performanceData, setPerformanceData] = useState(null);
  const [detailedData, setDetailedData] = useState(null);
  const [activeTab, setActiveTab] = useState("daily-reports"); // Default to daily reports tab
  const [selectedUser, setSelectedUser] = useState(null);
  
  // Daily Reports state
  const [dailyReports, setDailyReports] = useState(null);
  const [userTargets, setUserTargets] = useState([]);
  const [defaultTarget, setDefaultTarget] = useState(5);
  const [showTargetSettings, setShowTargetSettings] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [newTargetValue, setNewTargetValue] = useState(5);

  const isAdmin = user?.role === "admin";
  const isAdminRestricted = user?.role === "admin_restricted";

  useEffect(() => {
    fetchPerformance();
    if (isAdmin) {
      fetchDailyReports();
      fetchUserTargets();
    }
  }, [selectedDate]);

  const fetchPerformance = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [basicRes, detailedRes] = await Promise.all([
        axios.get(`${API}/performance/daily?date=${selectedDate}`),
        axios.get(`${API}/performance/detailed?date=${selectedDate}`)
      ]);
      setPerformanceData(basicRes.data);
      setDetailedData(detailedRes.data);
    } catch (error) {
      toast.error("Failed to load performance data");
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchDailyReports = async () => {
    try {
      const res = await axios.get(`${API}/daily-reports?date=${selectedDate}`);
      setDailyReports(res.data);
    } catch (error) {
      console.error("Failed to load daily reports:", error);
    }
  };

  const fetchUserTargets = async () => {
    try {
      const res = await axios.get(`${API}/user-targets`);
      setUserTargets(res.data.targets || []);
      setDefaultTarget(res.data.default_target || 5);
    } catch (error) {
      console.error("Failed to load user targets:", error);
    }
  };

  const saveUserTarget = async (userId, target) => {
    try {
      await axios.post(`${API}/user-targets`, { user_id: userId, daily_target: target });
      toast.success("Target saved!");
      fetchUserTargets();
      fetchDailyReports();
      setEditingTarget(null);
    } catch (error) {
      toast.error("Failed to save target");
    }
  };

  const saveDefaultTarget = async (target) => {
    try {
      await axios.put(`${API}/user-targets/default`, { default_target: target });
      toast.success("Default target saved!");
      setDefaultTarget(target);
      fetchDailyReports();
    } catch (error) {
      toast.error("Failed to save default target");
    }
  };

  const exportDailyReportPDF = () => {
    if (!dailyReports) return;

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("CORLEONE FORGED", 105, 20, { align: "center" });
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(`Daily Performance Report - ${dailyReports.date_formatted}`, 105, 30, { align: "center" });
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 38, { align: "center" });

    // Summary
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Summary", 14, 50);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Total Users: ${dailyReports.summary.total_users}`, 14, 58);
    doc.text(`Users with Activity: ${dailyReports.summary.users_with_activity}`, 14, 64);
    doc.text(`Total Orders Completed: ${dailyReports.summary.total_orders_completed}`, 14, 70);
    doc.text(`Default Daily Target: ${dailyReports.default_target} orders`, 14, 76);

    // Grade Distribution
    const gradeDistStr = Object.entries(dailyReports.summary.grade_distribution || {})
      .map(([g, c]) => `${g}: ${c}`)
      .join("  |  ");
    doc.text(`Grade Distribution: ${gradeDistStr}`, 14, 82);

    // User Reports Table
    const tableData = dailyReports.reports.map(r => [
      r.name,
      r.target,
      r.orders_completed,
      `${r.percentage}%`,
      r.grade,
      r.grade_description
    ]);

    autoTable(doc, {
      startY: 90,
      head: [["Employee", "Target", "Completed", "% of Target", "Grade", "Status"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        4: { halign: 'center', fontStyle: 'bold' }
      }
    });

    // Grade Scale Legend
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Grade Scale:", 14, finalY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    let yPos = finalY + 6;
    Object.entries(dailyReports.grade_scale || {}).forEach(([grade, desc]) => {
      doc.text(`${grade}: ${desc}`, 14, yPos);
      yPos += 5;
    });

    doc.save(`daily-report-${selectedDate}.pdf`);
    toast.success("Daily report exported!");
  };

  const changeDate = (days) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + days);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const exportPDF = () => {
    if (!performanceData) return;

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("CORLEONE FORGED", 105, 20, { align: "center" });
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(`Daily Performance Report - ${formatDate(selectedDate)}`, 105, 30, { align: "center" });
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 38, { align: "center" });

    // Summary
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Summary", 14, 50);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Total Orders Completed: ${performanceData.summary.total_orders_completed}`, 14, 58);
    doc.text(`Total Orders Received: ${performanceData.summary.total_orders_received}`, 14, 64);
    doc.text(`Overall Completion Rate: ${performanceData.summary.overall_completion_rate}%`, 14, 70);

    // Department Performance Table
    const deptTableData = performanceData.departments
      .filter(d => d.orders_completed > 0 || d.orders_received > 0)
      .map(d => [
        d.label,
        d.orders_completed,
        d.orders_received,
        `${d.completion_rate}%`,
        `${d.avg_processing_time_hours}h`,
        d.grade,
        d.score
      ]);

    autoTable(doc, {
      startY: 78,
      head: [["Department", "Completed", "Received", "Rate", "Avg Time", "Grade", "Score"]],
      body: deptTableData,
      theme: "grid",
      headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 2 },
    });

    // User Performance Table
    if (performanceData.users.length > 0) {
      const userTableData = performanceData.users.map(u => [
        u.name,
        u.orders_touched,
        u.notes_added
      ]);

      doc.addPage();
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("User Performance", 14, 20);

      autoTable(doc, {
        startY: 28,
        head: [["User", "Orders Touched", "Notes Added"]],
        body: userTableData,
        theme: "grid",
        headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 8, cellPadding: 2 },
      });
    }

    doc.save(`performance-report-${selectedDate}.pdf`);
    toast.success("Performance report exported!");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-red-500 animate-spin mx-auto mb-4" />
          <p className="text-zinc-400 font-mono">Loading performance data...</p>
        </div>
      </div>
    );
  }

  // Filter out departments with no activity
  const activeDepartments = performanceData?.departments?.filter(
    d => d.orders_completed > 0 || d.orders_received > 0
  ) || [];

  // Sort by score for leaderboard
  const sortedDepartments = [...activeDepartments].sort((a, b) => b.score - a.score);

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md">
        <div className="max-w-[1920px] mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="text-zinc-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-red-500" />
                <h1 className="font-oswald text-xl md:text-2xl uppercase tracking-widest text-white">
                  Performance
                </h1>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Date Navigation */}
              <div className="flex items-center gap-2 bg-zinc-800 rounded-lg p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => changeDate(-1)}
                  className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-2 px-2">
                  <Calendar className="w-4 h-4 text-red-500" />
                  <span className="font-mono text-sm text-white min-w-[100px] text-center">
                    {formatDate(selectedDate)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => changeDate(1)}
                  disabled={selectedDate === new Date().toISOString().split('T')[0]}
                  className="h-8 w-8 p-0 text-zinc-400 hover:text-white disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-40 bg-zinc-800 border-zinc-700 font-mono text-sm"
              />

              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchPerformance(true)}
                disabled={refreshing}
                className="text-zinc-400 hover:text-white"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>

              <Button
                onClick={exportPDF}
                className="bg-red-500 hover:bg-red-400 text-white font-oswald uppercase tracking-wider"
              >
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto p-4 md:p-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Completed</p>
                  <p className="font-oswald text-2xl text-green-500">
                    {performanceData?.summary?.total_orders_completed || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Target className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Received</p>
                  <p className="font-oswald text-2xl text-blue-500">
                    {performanceData?.summary?.total_orders_received || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Completion Rate</p>
                  <p className="font-oswald text-2xl text-purple-500">
                    {performanceData?.summary?.overall_completion_rate || 0}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <Users className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Active Users</p>
                  <p className="font-oswald text-2xl text-amber-500">
                    {performanceData?.users?.length || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Grade Scale Legend */}
        <Card className="bg-zinc-900/50 border-zinc-800 mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-center gap-4">
              <span className="font-mono text-xs text-zinc-500 uppercase">Grade Scale:</span>
              {Object.entries(performanceData?.grade_scale || {}).map(([grade, desc]) => (
                <div key={grade} className="flex items-center gap-2">
                  <Badge className={`${GRADE_COLORS[grade]} font-oswald text-lg px-3`}>
                    {grade}
                  </Badge>
                  <span className="font-mono text-xs text-zinc-400">{desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-zinc-800/50 p-1">
            {isAdmin && (
              <TabsTrigger 
                value="daily-reports"
                className="font-oswald uppercase tracking-wider data-[state=active]:bg-red-500 data-[state=active]:text-white"
                data-testid="daily-reports-tab"
              >
                <FileText className="w-4 h-4 mr-2" />
                Daily Reports
              </TabsTrigger>
            )}
            <TabsTrigger 
              value="departments"
              className="font-oswald uppercase tracking-wider data-[state=active]:bg-red-500 data-[state=active]:text-white"
            >
              <Award className="w-4 h-4 mr-2" />
              Departments
            </TabsTrigger>
            <TabsTrigger 
              value="users"
              className="font-oswald uppercase tracking-wider data-[state=active]:bg-red-500 data-[state=active]:text-white"
            >
              <Users className="w-4 h-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger 
              value="leaderboard"
              className="font-oswald uppercase tracking-wider data-[state=active]:bg-red-500 data-[state=active]:text-white"
            >
              <Trophy className="w-4 h-4 mr-2" />
              Leaderboard
            </TabsTrigger>
          </TabsList>

          {/* Daily Reports Tab - Admin Only */}
          {isAdmin && (
            <TabsContent value="daily-reports" className="space-y-4">
              {!dailyReports ? (
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardContent className="p-12 text-center">
                    <RefreshCw className="w-8 h-8 text-zinc-600 animate-spin mx-auto mb-4" />
                    <p className="text-zinc-500 font-mono">Loading daily reports...</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {/* Header with Export and Settings */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-oswald text-xl uppercase tracking-wider text-white">
                        Daily Performance Report
                      </h2>
                      <p className="text-zinc-500 font-mono text-sm">
                        {dailyReports.date_formatted}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowTargetSettings(!showTargetSettings)}
                        className="text-zinc-400 hover:text-white"
                        data-testid="target-settings-btn"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Set Targets
                      </Button>
                      <Button
                        onClick={exportDailyReportPDF}
                        className="bg-red-500 hover:bg-red-400 text-white font-oswald uppercase tracking-wider"
                        data-testid="export-daily-report-btn"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Export PDF
                      </Button>
                    </div>
                  </div>

                  {/* Target Settings Panel */}
                  {showTargetSettings && (
                    <Card className="bg-zinc-900/50 border-amber-500/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="font-oswald uppercase tracking-wider text-amber-400 text-sm flex items-center gap-2">
                          <Settings className="w-4 h-4" />
                          Daily Target Settings
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Default Target */}
                        <div className="flex items-center justify-between bg-zinc-800/50 rounded p-3">
                          <div>
                            <p className="font-mono text-sm text-white">Default Target (for all users)</p>
                            <p className="font-mono text-xs text-zinc-500">Applied when no individual target is set</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="1"
                              max="100"
                              value={defaultTarget}
                              onChange={(e) => setDefaultTarget(parseInt(e.target.value) || 5)}
                              className="w-20 bg-zinc-700 border-zinc-600 text-center"
                            />
                            <span className="text-zinc-400 font-mono text-sm">orders/day</span>
                            <Button
                              size="sm"
                              onClick={() => saveDefaultTarget(defaultTarget)}
                              className="bg-amber-500 hover:bg-amber-400 text-black"
                            >
                              <Save className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>

                        {/* Individual User Targets */}
                        <div>
                          <p className="font-mono text-xs text-zinc-500 uppercase tracking-wider mb-2">Individual User Targets</p>
                          <div className="space-y-2 max-h-[300px] overflow-auto">
                            {dailyReports.reports.map((r) => {
                              const existingTarget = userTargets.find(t => t.user_id === r.user_id);
                              const isEditing = editingTarget === r.user_id;
                              
                              return (
                                <div key={r.user_id} className="flex items-center justify-between bg-zinc-800/30 rounded p-2">
                                  <div className="flex items-center gap-3">
                                    <span className="font-mono text-sm text-white">{r.name}</span>
                                    {r.departments?.length > 0 && (
                                      <span className="font-mono text-[10px] text-zinc-500">
                                        ({r.departments.slice(0, 2).join(", ")})
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {isEditing ? (
                                      <>
                                        <Input
                                          type="number"
                                          min="1"
                                          max="100"
                                          value={newTargetValue}
                                          onChange={(e) => setNewTargetValue(parseInt(e.target.value) || 5)}
                                          className="w-16 h-7 bg-zinc-700 border-zinc-600 text-center text-sm"
                                        />
                                        <Button
                                          size="sm"
                                          className="h-7 bg-green-500 hover:bg-green-400 text-white"
                                          onClick={() => saveUserTarget(r.user_id, newTargetValue)}
                                        >
                                          <Save className="w-3 h-3" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7"
                                          onClick={() => setEditingTarget(null)}
                                        >
                                          <X className="w-3 h-3" />
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <span className={`font-mono text-sm ${existingTarget ? 'text-amber-400' : 'text-zinc-500'}`}>
                                          {existingTarget ? existingTarget.daily_target : defaultTarget} orders
                                        </span>
                                        {existingTarget && (
                                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/50 text-[10px]">
                                            Custom
                                          </Badge>
                                        )}
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 text-zinc-400 hover:text-white"
                                          onClick={() => {
                                            setEditingTarget(r.user_id);
                                            setNewTargetValue(existingTarget?.daily_target || defaultTarget);
                                          }}
                                        >
                                          <Edit2 className="w-3 h-3" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="bg-zinc-900/50 border-zinc-800">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Users className="w-5 h-5 text-blue-500" />
                          </div>
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Total Users</p>
                            <p className="font-oswald text-2xl text-blue-500">{dailyReports.summary.total_users}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-zinc-900/50 border-zinc-800">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-green-500/20 rounded-lg">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          </div>
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Active Today</p>
                            <p className="font-oswald text-2xl text-green-500">{dailyReports.summary.users_with_activity}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-zinc-900/50 border-zinc-800">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-purple-500/20 rounded-lg">
                            <Target className="w-5 h-5 text-purple-500" />
                          </div>
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Orders Done</p>
                            <p className="font-oswald text-2xl text-purple-500">{dailyReports.summary.total_orders_completed}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-zinc-900/50 border-zinc-800">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-amber-500/20 rounded-lg">
                            <Target className="w-5 h-5 text-amber-500" />
                          </div>
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Default Target</p>
                            <p className="font-oswald text-2xl text-amber-500">{dailyReports.default_target}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Grade Distribution */}
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-center justify-center gap-4">
                        <span className="font-mono text-xs text-zinc-500 uppercase">Grade Distribution:</span>
                        {Object.entries(dailyReports.summary.grade_distribution || {}).sort().map(([grade, count]) => (
                          <div key={grade} className="flex items-center gap-2">
                            <Badge className={`${GRADE_COLORS[grade]} font-oswald text-lg px-3`}>
                              {grade}
                            </Badge>
                            <span className="font-mono text-sm text-zinc-400">{count} users</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Employee Reports Table */}
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardHeader>
                      <CardTitle className="font-oswald uppercase tracking-wider text-white flex items-center gap-2">
                        <FileText className="w-5 h-5 text-red-500" />
                        Employee Daily Reports
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {/* Header */}
                        <div className="grid grid-cols-12 gap-2 p-3 bg-zinc-800/50 rounded font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                          <div className="col-span-1">#</div>
                          <div className="col-span-3">Employee</div>
                          <div className="col-span-2 text-center">Target</div>
                          <div className="col-span-2 text-center">Completed</div>
                          <div className="col-span-2 text-center">% of Target</div>
                          <div className="col-span-2 text-center">Grade</div>
                        </div>

                        {/* Rows */}
                        {dailyReports.reports.map((report, index) => (
                          <div 
                            key={report.user_id}
                            className={`grid grid-cols-12 gap-2 p-3 rounded items-center ${
                              report.grade === 'A' ? 'bg-green-500/10 border border-green-500/30' :
                              report.grade === 'B' ? 'bg-blue-500/10 border border-blue-500/30' :
                              report.grade === 'C' ? 'bg-yellow-500/10 border border-yellow-500/30' :
                              report.grade === 'D' ? 'bg-orange-500/10 border border-orange-500/30' :
                              report.orders_completed === 0 ? 'bg-zinc-800/30' :
                              'bg-red-500/10 border border-red-500/30'
                            }`}
                            data-testid={`daily-report-row-${report.user_id}`}
                          >
                            <div className="col-span-1">
                              <span className="font-mono text-sm text-zinc-500">{index + 1}</span>
                            </div>
                            <div className="col-span-3">
                              <span className="font-mono text-sm text-white font-bold">{report.name}</span>
                              {report.departments?.length > 0 && (
                                <p className="font-mono text-[10px] text-zinc-500 truncate">
                                  {report.departments.slice(0, 2).join(", ")}
                                </p>
                              )}
                            </div>
                            <div className="col-span-2 text-center">
                              <span className="font-mono text-sm text-amber-400">{report.target}</span>
                            </div>
                            <div className="col-span-2 text-center">
                              <Badge className={`${
                                report.orders_completed >= report.target ? 'bg-green-500/20 text-green-400 border-green-500' :
                                report.orders_completed > 0 ? 'bg-blue-500/20 text-blue-400 border-blue-500' :
                                'bg-zinc-700 text-zinc-500 border-zinc-600'
                              }`}>
                                {report.orders_completed}
                              </Badge>
                            </div>
                            <div className="col-span-2 text-center">
                              <span className={`font-mono text-sm ${
                                report.percentage >= 100 ? 'text-green-400' :
                                report.percentage >= 80 ? 'text-blue-400' :
                                report.percentage >= 60 ? 'text-yellow-400' :
                                report.percentage >= 40 ? 'text-orange-400' :
                                'text-red-400'
                              }`}>
                                {report.percentage}%
                              </span>
                            </div>
                            <div className="col-span-2 text-center">
                              <Badge className={`${GRADE_COLORS[report.grade]} font-oswald text-lg px-4`}>
                                {report.grade}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Grade Scale Legend */}
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-center justify-center gap-4">
                        <span className="font-mono text-xs text-zinc-500 uppercase">Grading Scale:</span>
                        {Object.entries(dailyReports.grade_scale || {}).map(([grade, desc]) => (
                          <div key={grade} className="flex items-center gap-2">
                            <Badge className={`${GRADE_COLORS[grade]} font-oswald px-2`}>
                              {grade}
                            </Badge>
                            <span className="font-mono text-xs text-zinc-400">{desc}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>
          )}

          {/* Departments Tab */}
          <TabsContent value="departments" className="space-y-4">
            {activeDepartments.length === 0 ? (
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-12 text-center">
                  <AlertCircle className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                  <p className="text-zinc-500 font-mono">No department activity for {formatDate(selectedDate)}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeDepartments.map((dept) => (
                  <Card 
                    key={dept.department} 
                    className={`bg-gradient-to-br ${GRADE_BG_COLORS[dept.grade]} border-zinc-800 hover:border-zinc-700 transition-colors`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="font-oswald uppercase tracking-wider text-white">
                          {dept.label}
                        </CardTitle>
                        <Badge className={`${GRADE_COLORS[dept.grade]} font-oswald text-2xl px-4 py-1`}>
                          {dept.grade}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Score Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-zinc-400">Score</span>
                          <span className="text-white">{dept.score}/100</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${
                              dept.grade === 'A' ? 'bg-green-500' :
                              dept.grade === 'B' ? 'bg-blue-500' :
                              dept.grade === 'C' ? 'bg-yellow-500' :
                              dept.grade === 'D' ? 'bg-orange-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${dept.score}%` }}
                          />
                        </div>
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-zinc-900/50 rounded p-2">
                          <div className="flex items-center gap-1 mb-1">
                            <CheckCircle className="w-3 h-3 text-green-500" />
                            <span className="font-mono text-[10px] text-zinc-500 uppercase">Completed</span>
                          </div>
                          <p className="font-oswald text-xl text-white">{dept.orders_completed}</p>
                        </div>
                        <div className="bg-zinc-900/50 rounded p-2">
                          <div className="flex items-center gap-1 mb-1">
                            <Target className="w-3 h-3 text-blue-500" />
                            <span className="font-mono text-[10px] text-zinc-500 uppercase">Received</span>
                          </div>
                          <p className="font-oswald text-xl text-white">{dept.orders_received}</p>
                        </div>
                        <div className="bg-zinc-900/50 rounded p-2">
                          <div className="flex items-center gap-1 mb-1">
                            <TrendingUp className="w-3 h-3 text-purple-500" />
                            <span className="font-mono text-[10px] text-zinc-500 uppercase">Rate</span>
                          </div>
                          <p className="font-oswald text-xl text-white">{dept.completion_rate}%</p>
                        </div>
                        <div className="bg-zinc-900/50 rounded p-2">
                          <div className="flex items-center gap-1 mb-1">
                            <Clock className="w-3 h-3 text-amber-500" />
                            <span className="font-mono text-[10px] text-zinc-500 uppercase">Avg Time</span>
                          </div>
                          <p className="font-oswald text-xl text-white">{dept.avg_processing_time_hours}h</p>
                        </div>
                      </div>

                      {/* Rush Orders */}
                      {(dept.rush_orders_total > 0 || dept.rush_orders_completed > 0) && (
                        <div className="flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded p-2">
                          <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-red-500" />
                            <span className="font-mono text-xs text-red-400">Rush Orders</span>
                          </div>
                          <span className="font-oswald text-red-400">
                            {dept.rush_orders_completed}/{dept.rush_orders_total}
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Users Tab - Detailed User Activity */}
          <TabsContent value="users" className="space-y-4">
            {!detailedData || detailedData?.users?.length === 0 ? (
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-12 text-center">
                  <AlertCircle className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                  <p className="text-zinc-500 font-mono">No user activity for {formatDate(selectedDate)}</p>
                </CardContent>
              </Card>
            ) : selectedUser ? (
              /* Detailed User View */
              <div className="space-y-4">
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedUser(null)}
                  className="mb-4"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to All Users
                </Button>
                
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="font-oswald uppercase tracking-wider text-white flex items-center gap-2">
                        <User className="w-5 h-5 text-red-500" />
                        {selectedUser.name}'s Activity - {detailedData.date_formatted}
                      </CardTitle>
                      <div className="flex gap-2">
                        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500 text-lg px-4">
                          {selectedUser.total_orders_moved} Moved
                        </Badge>
                        <Badge className="bg-purple-500/20 text-purple-400 border-purple-500 text-lg px-4">
                          {selectedUser.total_notes_added} Notes
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Product Type Breakdown */}
                    <div>
                      <h4 className="font-mono text-xs text-zinc-500 uppercase tracking-wider mb-3">Orders Moved by Product Type</h4>
                      <div className="grid grid-cols-4 gap-3">
                        <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-center">
                          <p className="font-oswald text-2xl text-red-400">{selectedUser.by_product_type?.rim || 0}</p>
                          <p className="font-mono text-[10px] text-zinc-500">RIMS</p>
                        </div>
                        <div className="bg-purple-500/10 border border-purple-500/30 rounded p-3 text-center">
                          <p className="font-oswald text-2xl text-purple-400">{selectedUser.by_product_type?.steering_wheel || 0}</p>
                          <p className="font-mono text-[10px] text-zinc-500">STEERING</p>
                        </div>
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3 text-center">
                          <p className="font-oswald text-2xl text-blue-400">{selectedUser.by_product_type?.caps || 0}</p>
                          <p className="font-mono text-[10px] text-zinc-500">CAPS</p>
                        </div>
                        <div className="bg-zinc-500/10 border border-zinc-500/30 rounded p-3 text-center">
                          <p className="font-oswald text-2xl text-zinc-400">{selectedUser.by_product_type?.other || 0}</p>
                          <p className="font-mono text-[10px] text-zinc-500">OTHER</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Department Breakdown */}
                    {Object.keys(selectedUser.by_department || {}).length > 0 && (
                      <div>
                        <h4 className="font-mono text-xs text-zinc-500 uppercase tracking-wider mb-3">Orders by Department</h4>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(selectedUser.by_department || {}).map(([dept, count]) => (
                            <Badge key={dept} className="bg-zinc-800 text-zinc-300 border-zinc-700">
                              {dept}: {count}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Orders Moved List */}
                    {selectedUser.orders_moved?.length > 0 && (
                      <div>
                        <h4 className="font-mono text-xs text-zinc-500 uppercase tracking-wider mb-3">
                          Orders Moved/Advanced ({selectedUser.orders_moved.length})
                        </h4>
                        <div className="max-h-[400px] overflow-auto space-y-2">
                          {selectedUser.orders_moved.map((order, idx) => (
                            <div key={idx} className="bg-zinc-800/50 rounded p-3 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-sm text-red-500 font-bold">#{order.order_number}</span>
                                <Badge className={`text-[10px] ${
                                  order.product_category === 'rim' ? 'bg-red-500/20 text-red-400 border-red-500/50' :
                                  order.product_category === 'steering_wheel' ? 'bg-purple-500/20 text-purple-400 border-purple-500/50' :
                                  order.product_category === 'caps' ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' :
                                  'bg-zinc-500/20 text-zinc-400 border-zinc-500/50'
                                }`}>
                                  {order.product_type}
                                </Badge>
                                <span className="text-zinc-400 font-mono text-xs">{order.customer_name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50 text-xs">
                                  {order.department} {order.moved_to && `→ ${order.moved_to}`}
                                </Badge>
                                <span className="font-mono text-[10px] text-zinc-500">
                                  {new Date(order.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Notes Added List */}
                    {selectedUser.orders_touched?.length > 0 && (
                      <div>
                        <h4 className="font-mono text-xs text-zinc-500 uppercase tracking-wider mb-3">
                          Notes Added ({selectedUser.orders_touched.length})
                        </h4>
                        <div className="max-h-[300px] overflow-auto space-y-2">
                          {selectedUser.orders_touched.map((order, idx) => (
                            <div key={idx} className="bg-zinc-800/50 rounded p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <span className="font-mono text-sm text-red-500 font-bold">#{order.order_number}</span>
                                  <span className="text-zinc-400 font-mono text-xs">{order.customer_name}</span>
                                </div>
                                <span className="font-mono text-[10px] text-zinc-500">
                                  {new Date(order.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                              <p className="font-mono text-xs text-zinc-300 bg-zinc-900/50 p-2 rounded">
                                "{order.note_preview}..."
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              /* All Users Overview */
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader>
                  <CardTitle className="font-oswald uppercase tracking-wider text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-red-500" />
                    Who Is Working - {detailedData.date_formatted}
                  </CardTitle>
                  <p className="text-zinc-500 font-mono text-sm">
                    {detailedData.summary?.total_users_active || 0} active users • 
                    {detailedData.summary?.total_orders_moved || 0} orders moved • 
                    {detailedData.summary?.total_notes_added || 0} notes added
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-2 p-3 bg-zinc-800/50 rounded font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                      <div className="col-span-1">#</div>
                      <div className="col-span-3">User</div>
                      <div className="col-span-2 text-center">Orders Moved</div>
                      <div className="col-span-2 text-center">Notes Added</div>
                      <div className="col-span-2 text-center">Product Types</div>
                      <div className="col-span-2 text-center">Action</div>
                    </div>

                    {/* Rows */}
                    {detailedData?.users?.map((u, index) => (
                      <div 
                        key={u.user_id} 
                        className={`grid grid-cols-12 gap-2 p-3 rounded items-center cursor-pointer hover:bg-zinc-800/50 transition-colors ${
                          index === 0 && u.total_orders_moved > 0 ? 'bg-amber-500/10 border border-amber-500/30' :
                          index === 1 && u.total_orders_moved > 0 ? 'bg-zinc-500/10 border border-zinc-500/30' :
                          index === 2 && u.total_orders_moved > 0 ? 'bg-orange-500/10 border border-orange-500/30' :
                          'bg-zinc-800/30'
                        }`}
                        onClick={() => setSelectedUser(u)}
                      >
                        <div className="col-span-1">
                          {index < 3 && u.total_orders_moved > 0 ? (
                            <span className={`font-oswald text-lg ${
                              index === 0 ? 'text-amber-400' :
                              index === 1 ? 'text-zinc-400' : 'text-orange-400'
                            }`}>
                              {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                            </span>
                          ) : (
                            <span className="font-mono text-sm text-zinc-500">{index + 1}</span>
                          )}
                        </div>
                        <div className="col-span-3">
                          <span className="font-mono text-sm text-white font-bold">{u.name}</span>
                          {u.departments?.length > 0 && (
                            <p className="font-mono text-[10px] text-zinc-500 truncate">
                              {u.departments.slice(0, 2).join(", ")}{u.departments.length > 2 ? "..." : ""}
                            </p>
                          )}
                        </div>
                        <div className="col-span-2 text-center">
                          <Badge className={`${u.total_orders_moved > 0 ? 'bg-blue-500/20 text-blue-400 border-blue-500' : 'bg-zinc-700 text-zinc-500 border-zinc-600'}`}>
                            {u.total_orders_moved}
                          </Badge>
                        </div>
                        <div className="col-span-2 text-center">
                          <Badge className={`${u.total_notes_added > 0 ? 'bg-purple-500/20 text-purple-400 border-purple-500' : 'bg-zinc-700 text-zinc-500 border-zinc-600'}`}>
                            {u.total_notes_added}
                          </Badge>
                        </div>
                        <div className="col-span-2 text-center">
                          <div className="flex justify-center gap-1">
                            {u.by_product_type?.rim > 0 && (
                              <span className="text-red-400 font-mono text-[10px]" title="Rims">R:{u.by_product_type.rim}</span>
                            )}
                            {u.by_product_type?.steering_wheel > 0 && (
                              <span className="text-purple-400 font-mono text-[10px]" title="Steering Wheels">S:{u.by_product_type.steering_wheel}</span>
                            )}
                            {u.by_product_type?.caps > 0 && (
                              <span className="text-blue-400 font-mono text-[10px]" title="Caps">C:{u.by_product_type.caps}</span>
                            )}
                          </div>
                        </div>
                        <div className="col-span-2 text-center">
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="text-xs h-7"
                            onClick={(e) => { e.stopPropagation(); setSelectedUser(u); }}
                          >
                            View Details
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Leaderboard Tab */}
          <TabsContent value="leaderboard" className="space-y-4">
            {sortedDepartments.length === 0 ? (
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-12 text-center">
                  <AlertCircle className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                  <p className="text-zinc-500 font-mono">No activity for {formatDate(selectedDate)}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Top 3 Podium */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {/* 2nd Place */}
                  <div className="flex flex-col items-center pt-8">
                    {sortedDepartments[1] && (
                      <Card className="w-full bg-gradient-to-b from-zinc-400/20 to-zinc-400/5 border-zinc-500">
                        <CardContent className="p-4 text-center">
                          <span className="text-4xl">🥈</span>
                          <p className="font-oswald text-lg text-white mt-2">{sortedDepartments[1].label}</p>
                          <Badge className={`${GRADE_COLORS[sortedDepartments[1].grade]} mt-2 text-xl px-4`}>
                            {sortedDepartments[1].grade}
                          </Badge>
                          <p className="font-mono text-sm text-zinc-400 mt-2">{sortedDepartments[1].score} pts</p>
                          <p className="font-mono text-xs text-zinc-500">{sortedDepartments[1].orders_completed} completed</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* 1st Place */}
                  <div className="flex flex-col items-center">
                    {sortedDepartments[0] && (
                      <Card className="w-full bg-gradient-to-b from-amber-500/30 to-amber-500/5 border-amber-500">
                        <CardContent className="p-6 text-center">
                          <Trophy className="w-12 h-12 text-amber-400 mx-auto" />
                          <span className="text-5xl">🥇</span>
                          <p className="font-oswald text-xl text-white mt-2">{sortedDepartments[0].label}</p>
                          <Badge className={`${GRADE_COLORS[sortedDepartments[0].grade]} mt-2 text-2xl px-6`}>
                            {sortedDepartments[0].grade}
                          </Badge>
                          <p className="font-mono text-lg text-amber-400 mt-2">{sortedDepartments[0].score} pts</p>
                          <p className="font-mono text-sm text-zinc-400">{sortedDepartments[0].orders_completed} completed</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* 3rd Place */}
                  <div className="flex flex-col items-center pt-12">
                    {sortedDepartments[2] && (
                      <Card className="w-full bg-gradient-to-b from-orange-500/20 to-orange-500/5 border-orange-500/50">
                        <CardContent className="p-4 text-center">
                          <span className="text-3xl">🥉</span>
                          <p className="font-oswald text-lg text-white mt-2">{sortedDepartments[2].label}</p>
                          <Badge className={`${GRADE_COLORS[sortedDepartments[2].grade]} mt-2 text-lg px-3`}>
                            {sortedDepartments[2].grade}
                          </Badge>
                          <p className="font-mono text-sm text-zinc-400 mt-2">{sortedDepartments[2].score} pts</p>
                          <p className="font-mono text-xs text-zinc-500">{sortedDepartments[2].orders_completed} completed</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>

                {/* Rest of Rankings */}
                {sortedDepartments.length > 3 && (
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardHeader>
                      <CardTitle className="font-oswald uppercase tracking-wider text-zinc-400 text-sm">
                        Other Departments
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {sortedDepartments.slice(3).map((dept, index) => (
                          <div 
                            key={dept.department}
                            className="flex items-center justify-between p-3 bg-zinc-800/50 rounded"
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-zinc-500 w-6">#{index + 4}</span>
                              <span className="font-oswald text-white">{dept.label}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-sm text-zinc-400">{dept.orders_completed} completed</span>
                              <Badge className={`${GRADE_COLORS[dept.grade]}`}>
                                {dept.grade}
                              </Badge>
                              <span className="font-mono text-sm text-zinc-500 w-16 text-right">{dept.score} pts</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
