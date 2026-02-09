import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, API } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Bot, 
  Send, 
  FileCode, 
  FolderOpen, 
  RotateCcw, 
  Plug, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Save,
  AlertTriangle,
  Check,
  X,
  Home,
  Loader2,
  Terminal,
  Code2,
  Settings,
  History,
  MessageSquareX,
  FileEdit,
  GitCommit,
  CheckCircle2,
  Sparkles,
  Paperclip,
  Image,
  FileText
} from "lucide-react";

const ADMIN_EMAIL = "digitalebookdepot@gmail.com";

// Helper component to render chat messages with code blocks hidden
const ChatMessage = ({ msg, onApplyAllEdits }) => {
  const [showCode, setShowCode] = useState(false);
  
  // Parse message content to separate text from code blocks
  const parseContent = (content) => {
    if (!content) return { summary: '', codeBlocks: [], hasCode: false };
    
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks = content.match(codeBlockRegex) || [];
    const summary = content.replace(codeBlockRegex, '').trim();
    
    // Also detect inline code patterns that look like file changes
    const hasFilePatterns = /\.(jsx?|tsx?|py|css|json|html):/i.test(content) || 
                           /^(import|export|const|function|def |class )/m.test(content);
    
    return {
      summary: summary || (codeBlocks.length > 0 ? '(Code changes provided - see details below)' : content),
      codeBlocks,
      hasCode: codeBlocks.length > 0 || hasFilePatterns
    };
  };
  
  // Extract change summary from AI response
  const extractChangeSummary = (content, fileEdits) => {
    const changes = [];
    
    // Add file edits as changes
    if (fileEdits && fileEdits.length > 0) {
      fileEdits.forEach(edit => {
        const fileName = edit.file_path.split('/').pop();
        changes.push({
          file: fileName,
          action: edit.description || 'Modified',
          type: 'edit'
        });
      });
    }
    
    // Try to extract action items from the text
    const actionPatterns = [
      /(?:fixed|added|updated|modified|created|removed|changed)\s+([^.!?\n]+)/gi,
      /✓\s*([^.\n]+)/g,
      /•\s*([^.\n]+)/g
    ];
    
    actionPatterns.forEach(pattern => {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length < 100) {
          changes.push({
            file: '-',
            action: match[1].trim(),
            type: 'action'
          });
        }
      }
    });
    
    return changes.slice(0, 10); // Limit to 10 items
  };
  
  const { summary, codeBlocks, hasCode } = parseContent(msg.content);
  const changes = msg.role === 'assistant' ? extractChangeSummary(msg.content, msg.fileEdits) : [];
  const hasChanges = changes.length > 0 || (msg.fileEdits && msg.fileEdits.length > 0);
  
  return (
    <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[90%] rounded-lg ${
        msg.role === "user" 
          ? "bg-red-500/20 text-red-100 p-3" 
          : msg.role === "error"
          ? "bg-red-900/30 text-red-300 border border-red-800 p-3"
          : "bg-zinc-800/80 text-zinc-200 p-4"
      }`}>
        {/* Header with timestamp */}
        <div className="flex items-center gap-2 mb-2">
          {msg.role === "assistant" && <Sparkles className="w-4 h-4 text-emerald-400" />}
          <span className="text-xs text-zinc-500">
            {new Date(msg.timestamp).toLocaleTimeString()}
          </span>
          {msg.role === "assistant" && hasChanges && (
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500 text-[10px] ml-auto">
              {msg.fileEdits?.length || changes.length} changes
            </Badge>
          )}
        </div>
        
        {/* Summary text (no code) */}
        <div className="text-sm leading-relaxed mb-3">
          {summary.split('\n').map((line, i) => (
            <p key={i} className={line.trim() ? 'mb-1' : 'mb-2'}>{line}</p>
          ))}
        </div>
        
        {/* Changes Summary Table */}
        {msg.role === "assistant" && hasChanges && (
          <div className="bg-zinc-900/80 rounded-lg border border-zinc-700 overflow-hidden mb-3">
            <div className="bg-zinc-800 px-3 py-2 border-b border-zinc-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileEdit className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Changes Summary</span>
              </div>
            </div>
            <div className="divide-y divide-zinc-800">
              {msg.fileEdits && msg.fileEdits.map((edit, idx) => (
                <div key={idx} className="px-3 py-2 flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span className="text-xs text-zinc-300 flex-1">{edit.file_path.split('/').pop()}</span>
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500 text-[9px]">
                    {edit.description || 'Modified'}
                  </Badge>
                </div>
              ))}
              {changes.filter(c => c.type === 'action').slice(0, 5).map((change, idx) => (
                <div key={`action-${idx}`} className="px-3 py-2 flex items-center gap-3">
                  <Check className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                  <span className="text-xs text-zinc-400">{change.action}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Commit Button for file edits - only show for valid edits with content */}
        {msg.fileEdits && msg.fileEdits.length > 0 && (() => {
          const validEdits = msg.fileEdits.filter(e => e.content !== null && e.content !== undefined);
          const failedEdits = msg.fileEdits.filter(e => e.content === null || e.content === undefined);
          
          if (validEdits.length === 0 && failedEdits.length > 0) {
            // All edits failed - show error message
            return (
              <div className="w-full bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-sm">
                <div className="flex items-center gap-2 text-red-400">
                  <span className="font-semibold">⚠ Edit Failed</span>
                </div>
                <p className="text-red-300 mt-1 text-xs">
                  {failedEdits[0]?.error || "The search text was not found in the file. The AI may have generated incorrect code."}
                </p>
              </div>
            );
          }
          
          if (validEdits.length > 0) {
            return (
              <Button
                size="sm"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                onClick={() => onApplyAllEdits(validEdits)}
                data-testid="commit-changes-btn"
              >
                <GitCommit className="w-4 h-4 mr-2" />
                Commit {validEdits.length} Change{validEdits.length > 1 ? 's' : ''}
              </Button>
            );
          }
          
          return null;
        })()}
        
        {/* View Code Toggle */}
        {hasCode && codeBlocks.length > 0 && (
          <div className="mt-3 pt-3 border-t border-zinc-700">
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-500 hover:text-zinc-300 text-xs h-7 px-2"
              onClick={() => setShowCode(!showCode)}
            >
              <Code2 className="w-3 h-3 mr-1" />
              {showCode ? 'Hide Code' : `View Code (${codeBlocks.length} block${codeBlocks.length > 1 ? 's' : ''})`}
              {showCode ? <ChevronDown className="w-3 h-3 ml-1" /> : <ChevronRight className="w-3 h-3 ml-1" />}
            </Button>
            
            {showCode && (
              <div className="mt-2 space-y-2">
                {codeBlocks.map((block, idx) => (
                  <pre key={idx} className="bg-zinc-950 rounded p-3 text-xs overflow-x-auto border border-zinc-800">
                    <code className="text-zinc-300">{block.replace(/```\w*\n?/g, '').replace(/```$/g, '')}</code>
                  </pre>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default function AdminControlPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  // Access control state
  const [hasAccess, setHasAccess] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(true);
  const [sessionId, setSessionId] = useState(() => `session-${Date.now()}`);
  const chatEndRef = useRef(null);
  
  // Attachment state for chat
  const [chatAttachments, setChatAttachments] = useState([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const attachmentInputRef = useRef(null);
  
  // File browser state
  const [currentPath, setCurrentPath] = useState("/app/frontend/src");
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const [expandedFolders, setExpandedFolders] = useState(new Set(["/app/frontend/src"]));
  const [fileLoading, setFileLoading] = useState(false);
  
  // Rollback state
  const [rollbackHistory, setRollbackHistory] = useState([]);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  
  // Integrations state
  const [integrations, setIntegrations] = useState([]);
  const [showAddIntegration, setShowAddIntegration] = useState(false);
  const [newIntegration, setNewIntegration] = useState({ name: "", url: "", api_key: "", description: "" });
  const [showApiKey, setShowApiKey] = useState({});
  
  // Pending file edits from AI
  const [pendingEdits, setPendingEdits] = useState([]);
  
  // Clear chat confirmation dialog
  const [clearChatDialogOpen, setClearChatDialogOpen] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  
  // Preview URL
  const previewUrl = process.env.REACT_APP_BACKEND_URL?.replace('/api', '') || window.location.origin;
  const iframeRef = useRef(null);

  // Check access on mount
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const res = await axios.get(`${API}/admin-control/verify`);
        setHasAccess(res.data.has_access);
        if (!res.data.has_access) {
          toast.error("Access denied to Admin Control Center");
          navigate("/");
        }
      } catch (error) {
        toast.error("Failed to verify access");
        navigate("/");
      } finally {
        setAccessChecked(true);
      }
    };
    
    if (user) {
      checkAccess();
    } else {
      navigate("/login");
    }
  }, [user, navigate]);

  // Load initial data
  useEffect(() => {
    if (hasAccess) {
      loadFiles(currentPath);
      loadRollbackHistory();
      loadIntegrations();
      loadChatHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess]);

  // Load chat history from database
  const loadChatHistory = async () => {
    setChatHistoryLoading(true);
    try {
      const res = await axios.get(`${API}/admin-control/messages?limit=50`);
      if (res.data.messages && res.data.messages.length > 0) {
        // Convert DB messages to chat format
        const loadedMessages = res.data.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          fileEdits: msg.file_edits || []
        }));
        setChatMessages(loadedMessages);
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
      // Don't show error toast - just start fresh
    } finally {
      setChatHistoryLoading(false);
    }
  };

  // Save a message to the database
  const saveChatMessage = async (role, content, fileEdits = []) => {
    try {
      await axios.post(`${API}/admin-control/messages/save`, {
        role,
        content,
        file_edits: fileEdits
      });
    } catch (error) {
      console.error("Failed to save chat message:", error);
    }
  };

  // Clear all chat messages (with confirmation)
  const clearChatHistory = async () => {
    setClearingChat(true);
    try {
      await axios.delete(`${API}/admin-control/messages`);
      setChatMessages([]);
      setPendingEdits([]);
      toast.success("Chat history cleared");
      setClearChatDialogOpen(false);
    } catch (error) {
      toast.error("Failed to clear chat history");
    } finally {
      setClearingChat(false);
    }
  };

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // File operations
  const loadFiles = async (path) => {
    setFileLoading(true);
    try {
      const res = await axios.get(`${API}/admin-control/files?path=${encodeURIComponent(path)}`);
      setFiles(res.data.files);
      setCurrentPath(path);
    } catch (error) {
      toast.error("Failed to load files");
    } finally {
      setFileLoading(false);
    }
  };

  const openFile = async (filePath) => {
    setFileLoading(true);
    try {
      const res = await axios.post(`${API}/admin-control/read-file`, { file_path: filePath });
      setSelectedFile(filePath);
      setFileContent(res.data.content);
    } catch (error) {
      toast.error("Failed to read file");
    } finally {
      setFileLoading(false);
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    
    setFileLoading(true);
    try {
      await axios.post(`${API}/admin-control/write-file`, {
        file_path: selectedFile,
        content: fileContent,
        commit_message: `Manual edit: ${selectedFile.split('/').pop()}`
      });
      toast.success("File saved successfully");
      loadRollbackHistory();
      refreshPreview();
    } catch (error) {
      toast.error("Failed to save file");
    } finally {
      setFileLoading(false);
    }
  };

  const toggleFolder = async (path) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
      await loadFiles(path);
    }
    setExpandedFolders(newExpanded);
  };

  // Rollback operations
  const loadRollbackHistory = async () => {
    try {
      const res = await axios.get(`${API}/admin-control/rollback-history`);
      setRollbackHistory(res.data.edits);
    } catch (error) {
      console.error("Failed to load rollback history:", error);
    }
  };

  const performRollback = async (editId) => {
    setRollbackLoading(true);
    try {
      await axios.post(`${API}/admin-control/rollback/${editId}`);
      toast.success("Rollback successful");
      loadRollbackHistory();
      refreshPreview();
      // Reload current file if it was affected
      if (selectedFile) {
        openFile(selectedFile);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Rollback failed");
    } finally {
      setRollbackLoading(false);
    }
  };

  // Integration operations
  const loadIntegrations = async () => {
    try {
      const res = await axios.get(`${API}/admin-control/integrations`);
      setIntegrations(res.data.integrations);
    } catch (error) {
      console.error("Failed to load integrations:", error);
    }
  };

  const addIntegration = async () => {
    if (!newIntegration.name || !newIntegration.url || !newIntegration.api_key) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    try {
      await axios.post(`${API}/admin-control/integrations`, newIntegration);
      toast.success("Integration added");
      setShowAddIntegration(false);
      setNewIntegration({ name: "", url: "", api_key: "", description: "" });
      loadIntegrations();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to add integration");
    }
  };

  const deleteIntegration = async (id) => {
    try {
      await axios.delete(`${API}/admin-control/integrations/${id}`);
      toast.success("Integration deleted");
      loadIntegrations();
    } catch (error) {
      toast.error("Failed to delete integration");
    }
  };

  // Attachment handling for chat
  const handleAttachmentSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    setUploadingAttachment(true);
    
    for (const file of files) {
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`File ${file.name} is too large (max 10MB)`);
        continue;
      }
      
      // Check file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/csv', 'application/json'];
      const isAllowed = allowedTypes.includes(file.type) || file.name.endsWith('.txt') || file.name.endsWith('.csv') || file.name.endsWith('.json');
      
      if (!isAllowed) {
        toast.error(`File type not supported: ${file.name}`);
        continue;
      }
      
      try {
        const formData = new FormData();
        formData.append('file', file);
        
        const res = await axios.post(`${API}/admin-control/upload-attachment`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        setChatAttachments(prev => [...prev, {
          name: file.name,
          url: res.data.url,
          type: file.type,
          size: file.size
        }]);
        
        toast.success(`Attached: ${file.name}`);
      } catch (error) {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    
    setUploadingAttachment(false);
    // Reset input so the same file can be selected again
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = '';
    }
  };
  
  const removeAttachment = (index) => {
    setChatAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Chat operations
  const sendMessage = async () => {
    if ((!chatInput.trim() && chatAttachments.length === 0) || chatLoading) return;
    
    const userMessage = chatInput.trim();
    const attachments = [...chatAttachments];
    setChatInput("");
    setChatAttachments([]);
    
    // Build message content with attachments
    let messageContent = userMessage;
    if (attachments.length > 0) {
      const attachmentInfo = attachments.map(a => `[Attachment: ${a.name}]`).join(' ');
      messageContent = userMessage ? `${userMessage}\n\n${attachmentInfo}` : attachmentInfo;
    }
    
    // Add user message to UI with attachments
    const userMsgData = { 
      role: "user", 
      content: messageContent, 
      timestamp: new Date(),
      attachments: attachments
    };
    setChatMessages(prev => [...prev, userMsgData]);
    
    // Save user message to database
    saveChatMessage("user", messageContent, [], attachments);
    
    setChatLoading(true);
    
    try {
      const res = await axios.post(`${API}/admin-control/chat`, {
        message: userMessage,
        session_id: sessionId,
        attachments: attachments.map(a => ({ name: a.name, url: a.url, type: a.type }))
      });
      
      const aiResponse = res.data.response;
      const fileEdits = res.data.file_edits || [];
      
      // Add AI response to UI
      const aiMsgData = { 
        role: "assistant", 
        content: aiResponse, 
        timestamp: new Date(),
        fileEdits: fileEdits
      };
      setChatMessages(prev => [...prev, aiMsgData]);
      
      // Save AI response to database
      saveChatMessage("assistant", aiResponse, fileEdits);
      
      // If there are file edits, add them to pending
      if (fileEdits.length > 0) {
        // Filter out failed edits and show errors
        const validEdits = fileEdits.filter(edit => edit.content !== null);
        const failedEdits = fileEdits.filter(edit => edit.content === null);
        
        if (failedEdits.length > 0) {
          failedEdits.forEach(edit => {
            toast.error(`Edit failed for ${edit.file_path.split('/').pop()}: ${edit.error}`);
          });
        }
        
        if (validEdits.length > 0) {
          setPendingEdits(validEdits);
          toast.success(`${validEdits.length} change${validEdits.length > 1 ? 's' : ''} ready to commit`);
        }
      }
      
    } catch (error) {
      const errorMsg = error.response?.data?.detail || "Failed to get AI response";
      toast.error(errorMsg);
      
      // Add error to UI
      const errorMsgData = { 
        role: "error", 
        content: errorMsg, 
        timestamp: new Date() 
      };
      setChatMessages(prev => [...prev, errorMsgData]);
      
      // Save error to database (so user sees it on reload)
      saveChatMessage("error", errorMsg, []);
    } finally {
      setChatLoading(false);
    }
  };

  const applyPendingEdit = async (edit) => {
    try {
      console.log("Applying edit:", edit);
      const response = await axios.post(`${API}/admin-control/write-file`, {
        file_path: edit.file_path,
        content: edit.content,
        commit_message: `AI Edit: ${edit.file_path.split('/').pop()}`
      });
      console.log("Write response:", response.data);
      toast.success(`Applied changes to ${edit.file_path.split('/').pop()}`);
      setPendingEdits(prev => prev.filter(e => e.file_path !== edit.file_path));
      loadRollbackHistory();
      refreshPreview();
    } catch (error) {
      console.error("Apply edit error:", error.response?.data || error.message);
      const errorDetail = error.response?.data?.detail || error.message || 'Unknown error';
      const errorMsg = typeof errorDetail === 'object' ? JSON.stringify(errorDetail) : String(errorDetail);
      toast.error(`Failed to apply edit: ${errorMsg}`);
    }
  };

  const discardPendingEdit = (edit) => {
    setPendingEdits(prev => prev.filter(e => e.file_path !== edit.file_path));
  };

  // Apply all file edits at once (from Commit button)
  const applyAllEdits = async (edits) => {
    let successCount = 0;
    let failCount = 0;
    let lastError = "";
    
    for (const edit of edits) {
      try {
        console.log("Applying edit:", edit.file_path, "Content type:", typeof edit.content, "Content length:", edit.content?.length);
        
        // Validate edit has content
        if (!edit.content || typeof edit.content !== 'string') {
          throw new Error(`Invalid edit content: ${typeof edit.content}`);
        }
        
        await axios.post(`${API}/admin-control/write-file`, {
          file_path: edit.file_path,
          content: edit.content,
          commit_message: `AI Edit: ${edit.file_path.split('/').pop()}`
        });
        successCount++;
      } catch (error) {
        failCount++;
        const errorDetail = error.response?.data?.detail || error.message || 'Unknown error';
        lastError = typeof errorDetail === 'object' ? JSON.stringify(errorDetail) : String(errorDetail);
        console.error(`Failed to apply edit to ${edit.file_path}:`, error.response?.data || error.message);
      }
    }
    
    if (successCount > 0) {
      toast.success(`✓ Committed ${successCount} change${successCount > 1 ? 's' : ''} successfully`);
      loadRollbackHistory();
      refreshPreview();
    }
    if (failCount > 0) {
      toast.error(`Failed to apply ${failCount} change${failCount > 1 ? 's' : ''}: ${lastError}`);
    }
    
    // Clear pending edits that match
    setPendingEdits(prev => prev.filter(e => !edits.find(edit => edit.file_path === e.file_path)));
  };

  // Preview operations
  const refreshPreview = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  }, []);

  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Render file tree item
  const renderFileItem = (file, depth = 0) => {
    const isExpanded = expandedFolders.has(file.path);
    const isSelected = selectedFile === file.path;
    
    return (
      <div key={file.path}>
        <div
          className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-zinc-800/50 rounded transition-colors ${
            isSelected ? "bg-red-500/20 text-red-400" : "text-zinc-300"
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => file.is_directory ? toggleFolder(file.path) : openFile(file.path)}
        >
          {file.is_directory ? (
            <>
              {isExpanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
              <FolderOpen className="w-4 h-4 text-yellow-500" />
            </>
          ) : (
            <>
              <span className="w-4" />
              <FileCode className="w-4 h-4 text-blue-400" />
            </>
          )}
          <span className="text-sm truncate">{file.name}</span>
        </div>
        {file.is_directory && isExpanded && files.filter(f => f.path.startsWith(file.path + "/")).map(child => 
          renderFileItem(child, depth + 1)
        )}
      </div>
    );
  };

  if (!accessChecked) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-red-500 mx-auto mb-4" />
          <p className="text-zinc-400 font-mono text-sm">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="h-14 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="text-zinc-400 hover:text-white"
            data-testid="back-to-dashboard-btn"
          >
            <Home className="w-4 h-4 mr-2" />
            Dashboard
          </Button>
          <div className="h-6 w-px bg-zinc-700" />
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-red-500" />
            <h1 className="font-oswald uppercase tracking-wider text-lg">Admin Control Center</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-red-500/50 text-red-400">
            <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse" />
            {user?.email}
          </Badge>
        </div>
      </header>

      {/* Main Content - Split Screen */}
      <div className="flex h-[calc(100vh-56px)]">
        {/* Left Side - AI Chat & Tools */}
        <div className="w-1/2 border-r border-zinc-800 flex flex-col">
          <Tabs defaultValue="chat" className="flex-1 flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b border-zinc-800 bg-zinc-950 p-0 h-auto">
              <TabsTrigger 
                value="chat" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-red-500 data-[state=active]:bg-transparent px-4 py-3"
                data-testid="chat-tab"
              >
                <Bot className="w-4 h-4 mr-2" />
                AI Chat
              </TabsTrigger>
              <TabsTrigger 
                value="files" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-red-500 data-[state=active]:bg-transparent px-4 py-3"
                data-testid="files-tab"
              >
                <Code2 className="w-4 h-4 mr-2" />
                Files
              </TabsTrigger>
              <TabsTrigger 
                value="rollback" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-red-500 data-[state=active]:bg-transparent px-4 py-3"
                data-testid="rollback-tab"
              >
                <History className="w-4 h-4 mr-2" />
                Rollback
              </TabsTrigger>
              <TabsTrigger 
                value="integrations" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-red-500 data-[state=active]:bg-transparent px-4 py-3"
                data-testid="integrations-tab"
              >
                <Plug className="w-4 h-4 mr-2" />
                Integrations
              </TabsTrigger>
            </TabsList>

            {/* Chat Tab */}
            <TabsContent value="chat" className="flex-1 flex flex-col m-0 p-0">
              {/* Chat Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {chatHistoryLoading && (
                    <div className="text-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-red-500 mx-auto mb-4" />
                      <p className="text-sm text-zinc-500">Loading chat history...</p>
                    </div>
                  )}
                  {!chatHistoryLoading && chatMessages.length === 0 && (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                        <Sparkles className="w-8 h-8 text-emerald-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">AI Assistant Ready</h3>
                      <p className="text-sm text-zinc-500 max-w-md mx-auto mb-6">
                        Describe what you want to change in plain English. I&apos;ll show you a summary of changes before applying them.
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
                        <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 text-xs">
                          &quot;Fix the search bar&quot;
                        </Badge>
                        <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 text-xs">
                          &quot;Add a status column&quot;
                        </Badge>
                        <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 text-xs">
                          &quot;Change the header color&quot;
                        </Badge>
                      </div>
                    </div>
                  )}
                  
                  {chatMessages.map((msg, idx) => (
                    <ChatMessage 
                      key={idx} 
                      msg={msg} 
                      onApplyAllEdits={applyAllEdits}
                    />
                  ))}
                  
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-zinc-800/80 rounded-lg p-3">
                        <Loader2 className="w-5 h-5 animate-spin text-red-400" />
                      </div>
                    </div>
                  )}
                  
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>

              {/* Pending Edits Banner - Clean Dashboard Style */}
              {pendingEdits.length > 0 && (
                <div className="border-t border-emerald-500/30 bg-emerald-500/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileEdit className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-semibold text-emerald-400">Ready to Commit</span>
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500 text-[10px]">
                        {pendingEdits.length} file{pendingEdits.length > 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm"
                        variant="ghost"
                        className="h-7 px-3 text-zinc-400 hover:text-white text-xs"
                        onClick={() => setPendingEdits([])}
                      >
                        Discard All
                      </Button>
                      <Button 
                        size="sm"
                        className="h-7 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                        onClick={() => applyAllEdits(pendingEdits)}
                        data-testid="commit-all-btn"
                      >
                        <GitCommit className="w-3 h-3 mr-1" />
                        Commit All
                      </Button>
                    </div>
                  </div>
                  <div className="bg-zinc-900/80 rounded-lg border border-zinc-800 divide-y divide-zinc-800">
                    {pendingEdits.map((edit, idx) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <FileCode className="w-4 h-4 text-blue-400 flex-shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs text-zinc-300 truncate">{edit.file_path.split('/').pop()}</span>
                            {edit.edit_type === 'search_replace' && (
                              <span className="text-[10px] text-emerald-500">Search & Replace</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-6 w-6 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20"
                            onClick={() => applyPendingEdit(edit)}
                            data-testid={`apply-edit-${idx}`}
                            title="Commit this file"
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-6 w-6 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-500/20"
                            onClick={() => discardPendingEdit(edit)}
                            data-testid={`discard-edit-${idx}`}
                            title="Discard this change"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat Input */}
              <div className="border-t border-zinc-800 p-4">
                {/* Attachment Preview */}
                {chatAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {chatAttachments.map((attachment, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-1.5 text-sm">
                        {attachment.type?.startsWith('image/') ? (
                          <Image className="w-4 h-4 text-blue-400" />
                        ) : (
                          <FileText className="w-4 h-4 text-green-400" />
                        )}
                        <span className="text-zinc-300 max-w-[150px] truncate">{attachment.name}</span>
                        <button
                          onClick={() => removeAttachment(idx)}
                          className="text-zinc-500 hover:text-red-400 ml-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex gap-2">
                  {/* Hidden file input */}
                  <input
                    type="file"
                    ref={attachmentInputRef}
                    onChange={handleAttachmentSelect}
                    className="hidden"
                    multiple
                    accept="image/*,.pdf,.txt,.csv,.json"
                    data-testid="attachment-input"
                  />
                  
                  {/* Attachment button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => attachmentInputRef.current?.click()}
                    disabled={chatLoading || uploadingAttachment}
                    className="border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 self-end h-10"
                    title="Attach file (images, PDFs, text files)"
                    data-testid="attach-file-btn"
                  >
                    {uploadingAttachment ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Paperclip className="w-4 h-4" />
                    )}
                  </Button>
                  
                  <Textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe what you want to change..."
                    className="flex-1 bg-zinc-900 border-zinc-700 focus:border-red-500 min-h-[60px] max-h-[120px] resize-none"
                    disabled={chatLoading}
                    data-testid="chat-input"
                  />
                  <div className="flex flex-col gap-1 self-end">
                    <Button 
                      onClick={sendMessage} 
                      disabled={chatLoading || (!chatInput.trim() && chatAttachments.length === 0)}
                      className="bg-red-500 hover:bg-red-600"
                      data-testid="send-message-btn"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                    {chatMessages.length > 0 && (
                      <Dialog open={clearChatDialogOpen} onOpenChange={setClearChatDialogOpen}>
                        <DialogTrigger asChild>
                          <Button 
                            variant="ghost"
                            size="sm"
                            className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 h-7 px-2"
                            data-testid="clear-chat-btn"
                            title="Clear chat history"
                          >
                            <MessageSquareX className="w-3.5 h-3.5" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-zinc-900 border-zinc-800">
                          <DialogHeader>
                            <DialogTitle className="text-red-400">Clear Chat History?</DialogTitle>
                            <DialogDescription className="text-zinc-400">
                              This will permanently delete all {chatMessages.length} messages from your conversation history. This action cannot be undone.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter className="gap-2 sm:gap-0">
                            <Button 
                              variant="outline" 
                              onClick={() => setClearChatDialogOpen(false)}
                              className="border-zinc-700"
                            >
                              Cancel
                            </Button>
                            <Button 
                              variant="destructive"
                              onClick={clearChatHistory}
                              disabled={clearingChat}
                              className="bg-red-600 hover:bg-red-700"
                              data-testid="confirm-clear-chat-btn"
                            >
                              {clearingChat ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              ) : (
                                <Trash2 className="w-4 h-4 mr-2" />
                              )}
                              Delete All Messages
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Files Tab */}
            <TabsContent value="files" className="flex-1 flex m-0 p-0">
              {/* File Tree */}
              <div className="w-64 border-r border-zinc-800 overflow-auto">
                <div className="p-2 border-b border-zinc-800 bg-zinc-900/50">
                  <p className="text-xs text-zinc-500 font-mono">/app/frontend/src</p>
                </div>
                <div className="p-2">
                  {files.filter(f => !f.path.includes('/', f.path.lastIndexOf('/') + 1) || f.path.split('/').length <= currentPath.split('/').length + 1).map(file => (
                    <div
                      key={file.path}
                      className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-zinc-800/50 rounded transition-colors ${
                        selectedFile === file.path ? "bg-red-500/20 text-red-400" : "text-zinc-300"
                      }`}
                      onClick={() => file.is_directory ? loadFiles(file.path) : openFile(file.path)}
                    >
                      {file.is_directory ? (
                        <FolderOpen className="w-4 h-4 text-yellow-500" />
                      ) : (
                        <FileCode className="w-4 h-4 text-blue-400" />
                      )}
                      <span className="text-sm truncate">{file.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* File Editor */}
              <div className="flex-1 flex flex-col">
                {selectedFile ? (
                  <>
                    <div className="flex items-center justify-between p-2 border-b border-zinc-800 bg-zinc-900/50">
                      <span className="text-sm text-zinc-400 font-mono truncate">{selectedFile}</span>
                      <Button 
                        size="sm" 
                        onClick={saveFile}
                        disabled={fileLoading}
                        className="bg-green-600 hover:bg-green-700"
                        data-testid="save-file-btn"
                      >
                        <Save className="w-4 h-4 mr-1" />
                        Save
                      </Button>
                    </div>
                    <Textarea
                      value={fileContent}
                      onChange={(e) => setFileContent(e.target.value)}
                      className="flex-1 bg-zinc-950 border-0 font-mono text-sm resize-none rounded-none focus:ring-0"
                      style={{ minHeight: "100%" }}
                      data-testid="file-editor"
                    />
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-zinc-600">
                    <div className="text-center">
                      <FileCode className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Select a file to edit</p>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Rollback Tab */}
            <TabsContent value="rollback" className="flex-1 m-0 p-0">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium flex items-center gap-2">
                    <RotateCcw className="w-5 h-5 text-red-400" />
                    Safety Reset - Last 10 Changes
                  </h3>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={loadRollbackHistory}
                    className="border-zinc-700"
                    data-testid="refresh-history-btn"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                
                <ScrollArea className="h-[calc(100vh-240px)]">
                  {rollbackHistory.length === 0 ? (
                    <div className="text-center py-12 text-zinc-600">
                      <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No edit history yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {rollbackHistory.map((edit) => (
                        <Card key={edit.id} className="bg-zinc-900/50 border-zinc-800">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-mono text-zinc-300 truncate">{edit.file_path}</p>
                                <p className="text-xs text-zinc-500 mt-1">{edit.commit_message}</p>
                                <p className="text-xs text-zinc-600 mt-1">
                                  {new Date(edit.timestamp).toLocaleString()}
                                </p>
                              </div>
                              {edit.type !== "rollback" && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => performRollback(edit.id)}
                                  disabled={rollbackLoading}
                                  className="shrink-0"
                                  data-testid={`rollback-btn-${edit.id}`}
                                >
                                  <RotateCcw className="w-4 h-4 mr-1" />
                                  Undo
                                </Button>
                              )}
                              {edit.type === "rollback" && (
                                <Badge variant="outline" className="border-yellow-500/50 text-yellow-400">
                                  Rollback
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </TabsContent>

            {/* Integrations Tab */}
            <TabsContent value="integrations" className="flex-1 m-0 p-0">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium flex items-center gap-2">
                    <Plug className="w-5 h-5 text-red-400" />
                    API Integrations
                  </h3>
                  <Dialog open={showAddIntegration} onOpenChange={setShowAddIntegration}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-red-500 hover:bg-red-600" data-testid="add-integration-btn">
                        <Plus className="w-4 h-4 mr-1" />
                        Add Integration
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-zinc-900 border-zinc-800">
                      <DialogHeader>
                        <DialogTitle>Add New Integration</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label>Name *</Label>
                          <Input
                            value={newIntegration.name}
                            onChange={(e) => setNewIntegration({...newIntegration, name: e.target.value})}
                            placeholder="e.g., Stripe, Twilio"
                            className="bg-zinc-800 border-zinc-700 mt-1"
                            data-testid="integration-name-input"
                          />
                        </div>
                        <div>
                          <Label>API URL *</Label>
                          <Input
                            value={newIntegration.url}
                            onChange={(e) => setNewIntegration({...newIntegration, url: e.target.value})}
                            placeholder="https://api.example.com"
                            className="bg-zinc-800 border-zinc-700 mt-1"
                            data-testid="integration-url-input"
                          />
                        </div>
                        <div>
                          <Label>API Key *</Label>
                          <Input
                            type="password"
                            value={newIntegration.api_key}
                            onChange={(e) => setNewIntegration({...newIntegration, api_key: e.target.value})}
                            placeholder="sk_live_..."
                            className="bg-zinc-800 border-zinc-700 mt-1"
                            data-testid="integration-key-input"
                          />
                        </div>
                        <div>
                          <Label>Description</Label>
                          <Textarea
                            value={newIntegration.description}
                            onChange={(e) => setNewIntegration({...newIntegration, description: e.target.value})}
                            placeholder="What is this integration used for?"
                            className="bg-zinc-800 border-zinc-700 mt-1"
                            data-testid="integration-description-input"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddIntegration(false)}>Cancel</Button>
                        <Button onClick={addIntegration} className="bg-red-500 hover:bg-red-600" data-testid="save-integration-btn">
                          Save Integration
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>

                <ScrollArea className="h-[calc(100vh-240px)]">
                  {integrations.length === 0 ? (
                    <div className="text-center py-12 text-zinc-600">
                      <Plug className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No integrations configured</p>
                      <p className="text-sm mt-2">Add Stripe, Twilio, or vendor APIs</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {integrations.map((integration) => (
                        <Card key={integration.id} className="bg-zinc-900/50 border-zinc-800">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-zinc-200">{integration.name}</span>
                                  <Badge variant="outline" className="text-xs">{integration.url}</Badge>
                                </div>
                                {integration.description && (
                                  <p className="text-xs text-zinc-500 mt-1">{integration.description}</p>
                                )}
                                <div className="flex items-center gap-2 mt-2">
                                  <span className="text-xs text-zinc-400 font-mono">
                                    {showApiKey[integration.id] ? integration.api_key : integration.api_key_masked}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    onClick={() => setShowApiKey({...showApiKey, [integration.id]: !showApiKey[integration.id]})}
                                  >
                                    {showApiKey[integration.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                  </Button>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
                                onClick={() => deleteIntegration(integration.id)}
                                data-testid={`delete-integration-${integration.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Side - Live Preview */}
        <div className="w-1/2 flex flex-col bg-zinc-950">
          <div className="h-12 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900/50">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm text-zinc-400">Live Preview</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={previewUrl}
                readOnly
                className="w-64 h-8 text-xs bg-zinc-800 border-zinc-700"
              />
              <Button 
                size="sm" 
                variant="outline" 
                onClick={refreshPreview}
                className="border-zinc-700 h-8"
                data-testid="refresh-preview-btn"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 bg-white">
            <iframe
              ref={iframeRef}
              src={previewUrl}
              className="w-full h-full border-0"
              title="Live Preview"
              data-testid="preview-iframe"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
