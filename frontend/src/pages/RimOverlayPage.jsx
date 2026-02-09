import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, API } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Upload, Wand2, Download, RotateCcw, ZoomIn, ZoomOut,
  Move, Sun, Contrast, Image as ImageIcon, Trash2, Save, Loader2,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, FlipHorizontal,
  Copy, Layers, Eye, EyeOff, RefreshCw, MousePointer, Crosshair,
  Droplets, SunDim, Box, Sparkles, Target, Maximize, Settings2
} from "lucide-react";

// Custom Rim Icon
const RimIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
    <line x1="12" y1="2" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="2" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="22" y2="12" />
  </svg>
);

export default function RimOverlayPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Image states
  const [carImage, setCarImage] = useState(null);
  const [rimImage, setRimImage] = useState(null);
  const [carImageUrl, setCarImageUrl] = useState(null);
  const [rimImageUrl, setRimImageUrl] = useState(null);
  const [maskImageUrl, setMaskImageUrl] = useState(null);
  
  // Canvas refs
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  // Mode states
  const [mode, setMode] = useState('place'); // 'place', 'mask', 'adjust'
  const [clickPoints, setClickPoints] = useState([]); // Points clicked for wheel detection
  
  // Rim layers
  const [rimLayers, setRimLayers] = useState([]);
  const [activeLayerIndex, setActiveLayerIndex] = useState(0);
  
  // Loading states
  const [isDetecting, setIsDetecting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Auto-settings from AI analysis
  const [autoSettings, setAutoSettings] = useState(null);
  const [useAutoLighting, setUseAutoLighting] = useState(true);
  const [useAutoPerspective, setUseAutoPerspective] = useState(true);
  
  // Canvas dimensions
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 600 });
  
  // Mobile controls
  const [showControls, setShowControls] = useState(true);
  const [activeTab, setActiveTab] = useState('transform');
  
  // Create a new rim layer with advanced properties
  const createRimLayer = useCallback((x = 250, y = 350, isRearWheel = false) => ({
    id: Date.now() + Math.random(),
    x,
    y,
    scale: isRearWheel ? 0.42 : 0.45,
    rotation: 0,
    // Appearance
    brightness: 100,
    contrast: 100,
    opacity: 100,
    // Perspective warp
    skewX: 0,
    skewY: isRearWheel ? 8 : 5, // Rear wheel has more skew typically
    perspective: 0,
    // Shadow settings
    shadowEnabled: true,
    shadowOffsetX: 0,
    shadowOffsetY: 15,
    shadowBlur: 20,
    shadowOpacity: 35,
    shadowColor: '#000000',
    // Inner shadow for wheel well depth
    innerShadowEnabled: true,
    innerShadowSize: 15,
    innerShadowOpacity: 40,
    // Flip and visibility
    flipX: false,
    visible: true,
    isRearWheel,
    // Z-index for proper layering (rear wheel should be behind)
    zIndex: isRearWheel ? 0 : 1
  }), []);
  
  // Initialize rim layers when rim image is loaded
  useEffect(() => {
    if (rimImage && rimLayers.length === 0) {
      // Create front wheel layer
      setRimLayers([createRimLayer(canvasSize.width * 0.28, canvasSize.height * 0.62, false)]);
    }
  }, [rimImage, rimLayers.length, createRimLayer, canvasSize]);
  
  // Get active layer
  const activeLayer = rimLayers[activeLayerIndex] || null;
  
  // Update active layer
  const updateActiveLayer = useCallback((updates) => {
    setRimLayers(prev => prev.map((layer, idx) => 
      idx === activeLayerIndex ? { ...layer, ...updates } : layer
    ));
  }, [activeLayerIndex]);
  
  // Apply auto settings to all layers
  const applyAutoSettings = useCallback((settings) => {
    if (!settings) return;
    
    setRimLayers(prev => prev.map(layer => ({
      ...layer,
      brightness: useAutoLighting ? settings.brightness : layer.brightness,
      contrast: useAutoLighting ? settings.contrast : layer.contrast,
      shadowOpacity: useAutoLighting ? settings.shadow_opacity : layer.shadowOpacity,
      shadowBlur: useAutoLighting ? settings.shadow_blur : layer.shadowBlur,
      skewX: useAutoPerspective ? settings.skew_x : layer.skewX,
      skewY: useAutoPerspective ? (layer.isRearWheel ? settings.skew_y + 3 : settings.skew_y) : layer.skewY,
    })));
    
    toast.success("Auto-blend settings applied!");
  }, [useAutoLighting, useAutoPerspective]);
  
  // Handle car image upload
  const handleCarUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setCarImage(file);
      const url = URL.createObjectURL(file);
      setCarImageUrl(url);
      setMaskImageUrl(null);
      setClickPoints([]);
      toast.success("Car image uploaded - click on wheels to mask them");
      
      // Auto-analyze the image for lighting/perspective
      await analyzeCarImage(file);
    }
  };
  
  // Handle rim image upload
  const handleRimUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setRimImage(file);
      const url = URL.createObjectURL(file);
      setRimImageUrl(url);
      setRimLayers([createRimLayer(canvasSize.width * 0.28, canvasSize.height * 0.62, false)]);
      setActiveLayerIndex(0);
      toast.success("Rim render uploaded");
    }
  };
  
  // Convert file to base64
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };
  
  // Analyze car image for auto-blending
  const analyzeCarImage = async (file) => {
    setIsAnalyzing(true);
    try {
      const base64 = await fileToBase64(file);
      const response = await axios.post(`${API}/rim-overlay/analyze`, {
        image_base64: base64
      });
      
      if (response.data.success) {
        setAutoSettings(response.data.auto_settings);
        toast.success("Image analyzed - auto-blend ready!");
      }
    } catch (error) {
      console.error("Analysis error:", error);
      // Don't show error toast - analysis is optional
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  // Segment wheel using click point
  const segmentWheel = async (point) => {
    if (!carImage) return;
    
    setIsDetecting(true);
    try {
      const base64 = await fileToBase64(carImage);
      
      const response = await axios.post(`${API}/rim-overlay/segment`, {
        image_base64: base64,
        points: [point]
      });
      
      if (response.data.success && response.data.mask_url) {
        setMaskImageUrl(response.data.mask_url);
        toast.success("Wheel masked! The rim will sit behind the fender.");
      } else {
        toast.info("Click more precisely on the wheel center");
      }
    } catch (error) {
      console.error("Segmentation error:", error);
      toast.error("Masking failed - try clicking on the wheel center");
    } finally {
      setIsDetecting(false);
    }
  };
  
  // Handle canvas click for wheel masking
  const handleCanvasClick = (e) => {
    if (mode !== 'mask' || !carImageUrl) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    
    const newPoint = [x, y];
    setClickPoints(prev => [...prev, newPoint]);
    
    // Trigger segmentation with the click point
    segmentWheel(newPoint);
  };
  
  // Add rim layer for second wheel
  const addRimLayer = (isRear = true) => {
    if (!rimImage) {
      toast.error("Please upload a rim image first");
      return;
    }
    const newLayer = createRimLayer(
      isRear ? canvasSize.width * 0.72 : canvasSize.width * 0.28,
      canvasSize.height * 0.62,
      isRear
    );
    setRimLayers(prev => [...prev, newLayer].sort((a, b) => a.zIndex - b.zIndex));
    setActiveLayerIndex(rimLayers.length);
    toast.success(isRear ? "Added rear wheel" : "Added front wheel");
  };
  
  // Remove active layer
  const removeActiveLayer = () => {
    if (rimLayers.length <= 1) {
      toast.error("Cannot remove the last rim");
      return;
    }
    setRimLayers(prev => prev.filter((_, idx) => idx !== activeLayerIndex));
    setActiveLayerIndex(Math.max(0, activeLayerIndex - 1));
  };
  
  // Draw canvas with compositing
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw checkerboard background
    const tileSize = 15;
    for (let x = 0; x < canvas.width; x += tileSize) {
      for (let y = 0; y < canvas.height; y += tileSize) {
        ctx.fillStyle = ((x + y) / tileSize) % 2 === 0 ? '#141414' : '#1c1c1c';
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
    
    // Draw car image
    if (carImageUrl) {
      const carImg = new Image();
      carImg.crossOrigin = 'anonymous';
      carImg.onload = () => {
        const scale = Math.min(canvas.width / carImg.width, canvas.height / carImg.height);
        const x = (canvas.width - carImg.width * scale) / 2;
        const y = (canvas.height - carImg.height * scale) / 2;
        ctx.drawImage(carImg, x, y, carImg.width * scale, carImg.height * scale);
        
        // Draw rim layers (sorted by zIndex so rear wheel renders first)
        drawRimLayers(ctx);
        
        // Draw click points in mask mode
        if (mode === 'mask') {
          clickPoints.forEach(([px, py]) => {
            ctx.beginPath();
            ctx.arc(px, py, 8, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(34, 197, 94, 0.8)';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
          });
        }
      };
      carImg.src = carImageUrl;
    } else {
      drawRimLayers(ctx);
    }
  }, [carImageUrl, rimImageUrl, rimLayers, activeLayerIndex, mode, clickPoints]);
  
  // Draw rim layers with perspective and shadows
  const drawRimLayers = useCallback((ctx) => {
    if (!rimImageUrl) return;
    
    const rimImg = new Image();
    rimImg.crossOrigin = 'anonymous';
    rimImg.onload = () => {
      // Sort layers by zIndex for proper rendering order
      const sortedLayers = [...rimLayers].sort((a, b) => a.zIndex - b.zIndex);
      
      sortedLayers.forEach((layer, idx) => {
        if (!layer.visible) return;
        
        const actualIdx = rimLayers.findIndex(l => l.id === layer.id);
        
        ctx.save();
        
        // Move to layer position
        ctx.translate(layer.x, layer.y);
        
        // Apply rotation
        ctx.rotate((layer.rotation * Math.PI) / 180);
        
        // Apply perspective skew using transform matrix
        // This creates a 3D-like perspective effect
        const skewXRad = (layer.skewX * Math.PI) / 180;
        const skewYRad = (layer.skewY * Math.PI) / 180;
        ctx.transform(1, Math.tan(skewYRad), Math.tan(skewXRad), 1, 0, 0);
        
        // Apply flip
        if (layer.flipX) ctx.scale(-1, 1);
        
        // Apply scale
        ctx.scale(layer.scale, layer.scale);
        
        const w = rimImg.width;
        const h = rimImg.height;
        
        // Draw drop shadow (outer shadow for ground contact)
        if (layer.shadowEnabled && layer.shadowOpacity > 0) {
          ctx.shadowColor = `rgba(0, 0, 0, ${layer.shadowOpacity / 100})`;
          ctx.shadowBlur = layer.shadowBlur;
          ctx.shadowOffsetX = layer.shadowOffsetX;
          ctx.shadowOffsetY = layer.shadowOffsetY;
        }
        
        // Apply CSS-like filters
        ctx.filter = `brightness(${layer.brightness}%) contrast(${layer.contrast}%)`;
        ctx.globalAlpha = layer.opacity / 100;
        
        // Draw the rim image centered
        ctx.drawImage(rimImg, -w / 2, -h / 2, w, h);
        
        // Reset shadow for inner shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw inner shadow (wheel well depth effect)
        if (layer.innerShadowEnabled && layer.innerShadowOpacity > 0) {
          const gradient = ctx.createRadialGradient(0, -h/4, 0, 0, -h/4, w * 0.6);
          gradient.addColorStop(0, `rgba(0, 0, 0, ${layer.innerShadowOpacity / 100})`);
          gradient.addColorStop(0.3, `rgba(0, 0, 0, ${layer.innerShadowOpacity / 200})`);
          gradient.addColorStop(1, 'transparent');
          
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = gradient;
          ctx.fillRect(-w / 2, -h / 2, w, h);
          ctx.globalCompositeOperation = 'source-over';
        }
        
        // Draw selection indicator
        if (actualIdx === activeLayerIndex && mode === 'place') {
          ctx.filter = 'none';
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 4 / layer.scale;
          ctx.setLineDash([12 / layer.scale, 6 / layer.scale]);
          ctx.strokeRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16);
        }
        
        ctx.restore();
      });
    };
    rimImg.src = rimImageUrl;
  }, [rimImageUrl, rimLayers, activeLayerIndex, mode]);
  
  // Redraw on changes
  useEffect(() => {
    const timer = setTimeout(drawCanvas, 10);
    return () => clearTimeout(timer);
  }, [drawCanvas]);
  
  // Drag handling
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };
  
  const handleMouseDown = (e) => {
    if (mode === 'mask') {
      handleCanvasClick(e);
      return;
    }
    
    const coords = getCanvasCoords(e);
    
    // Check if clicking on a rim layer
    for (let i = rimLayers.length - 1; i >= 0; i--) {
      const layer = rimLayers[i];
      if (!layer.visible) continue;
      
      const dist = Math.sqrt(Math.pow(coords.x - layer.x, 2) + Math.pow(coords.y - layer.y, 2));
      if (dist < 180 * layer.scale) {
        setActiveLayerIndex(i);
        setIsDragging(true);
        setDragStart({ x: coords.x - layer.x, y: coords.y - layer.y });
        return;
      }
    }
  };
  
  const handleMouseMove = (e) => {
    if (!isDragging || !activeLayer || mode !== 'place') return;
    
    const coords = getCanvasCoords(e);
    updateActiveLayer({
      x: coords.x - dragStart.x,
      y: coords.y - dragStart.y
    });
  };
  
  const handleMouseUp = () => setIsDragging(false);
  
  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!activeLayer || mode !== 'place') return;
      
      const step = e.shiftKey ? 10 : 2;
      
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          updateActiveLayer({ x: activeLayer.x - step });
          break;
        case 'ArrowRight':
          e.preventDefault();
          updateActiveLayer({ x: activeLayer.x + step });
          break;
        case 'ArrowUp':
          e.preventDefault();
          updateActiveLayer({ y: activeLayer.y - step });
          break;
        case 'ArrowDown':
          e.preventDefault();
          updateActiveLayer({ y: activeLayer.y + step });
          break;
        case '+': case '=':
          e.preventDefault();
          updateActiveLayer({ scale: Math.min(2, activeLayer.scale + 0.02) });
          break;
        case '-': case '_':
          e.preventDefault();
          updateActiveLayer({ scale: Math.max(0.1, activeLayer.scale - 0.02) });
          break;
        case 'r': case 'R':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            updateActiveLayer({ rotation: (activeLayer.rotation + (e.shiftKey ? -5 : 5)) % 360 });
          }
          break;
        case 'f': case 'F':
          e.preventDefault();
          updateActiveLayer({ flipX: !activeLayer.flipX });
          break;
        default:
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeLayer, updateActiveLayer, mode]);
  
  // Save composite
  const saveComposite = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    setIsSaving(true);
    try {
      // Create high-res export (3x for sharp details)
      const pixelRatio = 3;
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width * pixelRatio;
      exportCanvas.height = canvas.height * pixelRatio;
      const ctx = exportCanvas.getContext('2d');
      ctx.scale(pixelRatio, pixelRatio);
      
      // White background for JPEG
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw car
      if (carImageUrl) {
        const carImg = new Image();
        carImg.crossOrigin = 'anonymous';
        await new Promise((resolve) => {
          carImg.onload = resolve;
          carImg.src = carImageUrl;
        });
        
        const scale = Math.min(canvas.width / carImg.width, canvas.height / carImg.height);
        const x = (canvas.width - carImg.width * scale) / 2;
        const y = (canvas.height - carImg.height * scale) / 2;
        ctx.drawImage(carImg, x, y, carImg.width * scale, carImg.height * scale);
      }
      
      // Draw rims
      if (rimImageUrl) {
        const rimImg = new Image();
        rimImg.crossOrigin = 'anonymous';
        await new Promise((resolve) => {
          rimImg.onload = resolve;
          rimImg.src = rimImageUrl;
        });
        
        const sortedLayers = [...rimLayers].sort((a, b) => a.zIndex - b.zIndex);
        
        for (const layer of sortedLayers) {
          if (!layer.visible) continue;
          
          ctx.save();
          ctx.translate(layer.x, layer.y);
          ctx.rotate((layer.rotation * Math.PI) / 180);
          
          const skewXRad = (layer.skewX * Math.PI) / 180;
          const skewYRad = (layer.skewY * Math.PI) / 180;
          ctx.transform(1, Math.tan(skewYRad), Math.tan(skewXRad), 1, 0, 0);
          
          if (layer.flipX) ctx.scale(-1, 1);
          ctx.scale(layer.scale, layer.scale);
          
          if (layer.shadowEnabled) {
            ctx.shadowColor = `rgba(0, 0, 0, ${layer.shadowOpacity / 100})`;
            ctx.shadowBlur = layer.shadowBlur;
            ctx.shadowOffsetX = layer.shadowOffsetX;
            ctx.shadowOffsetY = layer.shadowOffsetY;
          }
          
          ctx.filter = `brightness(${layer.brightness}%) contrast(${layer.contrast}%)`;
          ctx.globalAlpha = layer.opacity / 100;
          
          const w = rimImg.width;
          const h = rimImg.height;
          ctx.drawImage(rimImg, -w / 2, -h / 2, w, h);
          ctx.restore();
        }
      }
      
      // Export as high-quality JPEG
      const dataUrl = exportCanvas.toDataURL('image/jpeg', 0.95);
      
      // Save to backend
      const response = await axios.post(`${API}/rim-overlay/save`, {
        composite_base64: dataUrl,
        filename: `rim_composite_${Date.now()}`
      });
      
      if (response.data.success) {
        const link = document.createElement('a');
        link.download = response.data.filename;
        link.href = dataUrl;
        link.click();
        toast.success("High-quality composite saved!");
      }
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save");
    } finally {
      setIsSaving(false);
    }
  };
  
  // Reset all
  const resetAll = () => {
    setRimLayers([createRimLayer(canvasSize.width * 0.28, canvasSize.height * 0.62, false)]);
    setActiveLayerIndex(0);
    setClickPoints([]);
    setMaskImageUrl(null);
    toast.success("Reset complete");
  };
  
  // Update canvas size
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const maxWidth = Math.min(rect.width - 16, 1100);
        const maxHeight = Math.min(window.innerHeight - 180, 700);
        setCanvasSize({
          width: maxWidth,
          height: Math.min(maxWidth * 0.66, maxHeight)
        });
      }
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-zinc-900/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-[1920px] mx-auto px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="text-zinc-400 hover:text-white h-8"
              data-testid="back-btn"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
            <div className="flex items-center gap-2">
              <RimIcon className="w-5 h-5 text-cyan-500" />
              <h1 className="text-sm sm:text-base font-bold text-white">Rim Compositor</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5">
            {autoSettings && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyAutoSettings(autoSettings)}
                className="border-violet-500/50 text-violet-400 hover:bg-violet-500/10 h-8 text-xs"
                data-testid="auto-blend-btn"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1" />
                <span className="hidden sm:inline">Auto-Blend</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={saveComposite}
              disabled={isSaving || (!carImageUrl && !rimImageUrl)}
              className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 h-8 text-xs"
              data-testid="save-btn"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
              Save HD
            </Button>
          </div>
        </div>
      </header>
      
      <main className="max-w-[1920px] mx-auto p-2 sm:p-3" ref={containerRef}>
        <div className="grid lg:grid-cols-[1fr_300px] gap-3">
          {/* Main Canvas Area */}
          <div className="space-y-2">
            {/* Mode Selector + Upload */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Mode Tabs */}
              <div className="flex bg-zinc-800 rounded-lg p-0.5">
                <Button
                  variant={mode === 'place' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setMode('place')}
                  className={`h-7 px-2 text-xs ${mode === 'place' ? 'bg-cyan-600' : ''}`}
                >
                  <Move className="w-3 h-3 mr-1" />
                  Place
                </Button>
                <Button
                  variant={mode === 'mask' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setMode('mask')}
                  className={`h-7 px-2 text-xs ${mode === 'mask' ? 'bg-violet-600' : ''}`}
                >
                  <Target className="w-3 h-3 mr-1" />
                  Mask
                </Button>
              </div>
              
              {/* Uploads */}
              <label className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded cursor-pointer text-xs">
                <input type="file" accept="image/*" onChange={handleCarUpload} className="hidden" data-testid="car-upload" />
                <ImageIcon className="w-3.5 h-3.5 text-cyan-500" />
                {carImageUrl ? '✓ Car' : 'Car Photo'}
              </label>
              
              <label className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded cursor-pointer text-xs">
                <input type="file" accept="image/png,image/*" onChange={handleRimUpload} className="hidden" data-testid="rim-upload" />
                <RimIcon className="w-3.5 h-3.5 text-violet-500" />
                {rimImageUrl ? '✓ Rim' : 'Rim PNG'}
              </label>
              
              {isAnalyzing && (
                <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-400">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Analyzing...
                </Badge>
              )}
              
              {mode === 'mask' && (
                <Badge variant="outline" className="text-[10px] border-violet-500/50 text-violet-400">
                  <MousePointer className="w-3 h-3 mr-1" />
                  Click on wheel to mask
                </Badge>
              )}
            </div>
            
            {/* Canvas */}
            <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
              <CardContent className="p-0 relative">
                <canvas
                  ref={canvasRef}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  className={`w-full touch-none ${mode === 'mask' ? 'cursor-crosshair' : 'cursor-move'}`}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onTouchStart={handleMouseDown}
                  onTouchMove={handleMouseMove}
                  onTouchEnd={handleMouseUp}
                  data-testid="main-canvas"
                />
                
                {isDetecting && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-violet-400">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span>Masking wheel...</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Quick Actions */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => addRimLayer(false)}
                disabled={!rimImage}
                className="h-7 text-xs border-zinc-700"
              >
                + Front Wheel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => addRimLayer(true)}
                disabled={!rimImage}
                className="h-7 text-xs border-zinc-700"
              >
                + Rear Wheel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={resetAll}
                className="h-7 text-xs border-zinc-700"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset
              </Button>
              <div className="flex-1" />
              <span className="text-[10px] text-zinc-500 hidden sm:inline">
                Arrow keys = Move | +/- = Scale | R = Rotate | F = Flip
              </span>
            </div>
          </div>
          
          {/* Controls Panel */}
          <div className={`space-y-2 ${!showControls && 'hidden lg:block'}`}>
            {/* Layers */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="py-1.5 px-2">
                <CardTitle className="text-xs flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-violet-500" />
                  Wheels ({rimLayers.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="py-1 px-2">
                <ScrollArea className="h-20">
                  <div className="space-y-1">
                    {rimLayers.map((layer, idx) => (
                      <div
                        key={layer.id}
                        className={`flex items-center justify-between p-1.5 rounded text-xs cursor-pointer ${
                          idx === activeLayerIndex
                            ? 'bg-violet-500/20 border border-violet-500/50'
                            : 'bg-zinc-800 hover:bg-zinc-700'
                        }`}
                        onClick={() => setActiveLayerIndex(idx)}
                      >
                        <span className="font-mono">
                          {layer.isRearWheel ? 'Rear' : 'Front'} Wheel
                        </span>
                        <div className="flex gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRimLayers(prev => prev.map((l, i) => 
                                i === idx ? { ...l, visible: !l.visible } : l
                              ));
                            }}
                          >
                            {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-zinc-500" />}
                          </Button>
                          {rimLayers.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-red-400"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRimLayers(prev => prev.filter((_, i) => i !== idx));
                                if (activeLayerIndex >= idx && activeLayerIndex > 0) {
                                  setActiveLayerIndex(activeLayerIndex - 1);
                                }
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
            
            {/* Control Tabs */}
            {activeLayer && (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="w-full bg-zinc-800 h-8">
                  <TabsTrigger value="transform" className="text-xs flex-1 h-7">Transform</TabsTrigger>
                  <TabsTrigger value="lighting" className="text-xs flex-1 h-7">Lighting</TabsTrigger>
                  <TabsTrigger value="shadow" className="text-xs flex-1 h-7">Shadow</TabsTrigger>
                </TabsList>
                
                {/* Transform Tab */}
                <TabsContent value="transform" className="mt-2 space-y-2">
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="py-2 px-2 space-y-2">
                      {/* Scale */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-zinc-400">Scale</span>
                          <span className="font-mono text-cyan-400">{(activeLayer.scale * 100).toFixed(0)}%</span>
                        </div>
                        <Slider
                          value={[activeLayer.scale * 100]}
                          onValueChange={([v]) => updateActiveLayer({ scale: v / 100 })}
                          min={10} max={200} step={2}
                        />
                      </div>
                      
                      {/* Rotation */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-zinc-400">Rotation</span>
                          <span className="font-mono text-cyan-400">{activeLayer.rotation}°</span>
                        </div>
                        <Slider
                          value={[activeLayer.rotation]}
                          onValueChange={([v]) => updateActiveLayer({ rotation: v })}
                          min={-180} max={180} step={1}
                        />
                      </div>
                      
                      {/* Perspective Skew X */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-zinc-400">Skew X (Perspective)</span>
                          <span className="font-mono text-amber-400">{activeLayer.skewX}°</span>
                        </div>
                        <Slider
                          value={[activeLayer.skewX]}
                          onValueChange={([v]) => updateActiveLayer({ skewX: v })}
                          min={-30} max={30} step={1}
                        />
                      </div>
                      
                      {/* Perspective Skew Y */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-zinc-400">Skew Y (Angle)</span>
                          <span className="font-mono text-amber-400">{activeLayer.skewY}°</span>
                        </div>
                        <Slider
                          value={[activeLayer.skewY]}
                          onValueChange={([v]) => updateActiveLayer({ skewY: v })}
                          min={-30} max={30} step={1}
                        />
                      </div>
                      
                      {/* Flip */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-7 text-xs border-zinc-700"
                        onClick={() => updateActiveLayer({ flipX: !activeLayer.flipX })}
                      >
                        <FlipHorizontal className="w-3 h-3 mr-1" />
                        Flip {activeLayer.flipX && '✓'}
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                {/* Lighting Tab */}
                <TabsContent value="lighting" className="mt-2 space-y-2">
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="py-2 px-2 space-y-2">
                      {/* Brightness */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-zinc-400 flex items-center gap-1">
                            <Sun className="w-3 h-3" /> Brightness
                          </span>
                          <span className="font-mono text-amber-400">{activeLayer.brightness}%</span>
                        </div>
                        <Slider
                          value={[activeLayer.brightness]}
                          onValueChange={([v]) => updateActiveLayer({ brightness: v })}
                          min={30} max={170} step={2}
                        />
                      </div>
                      
                      {/* Contrast */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-zinc-400 flex items-center gap-1">
                            <Contrast className="w-3 h-3" /> Contrast
                          </span>
                          <span className="font-mono text-amber-400">{activeLayer.contrast}%</span>
                        </div>
                        <Slider
                          value={[activeLayer.contrast]}
                          onValueChange={([v]) => updateActiveLayer({ contrast: v })}
                          min={50} max={150} step={2}
                        />
                      </div>
                      
                      {/* Opacity */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-zinc-400">Opacity</span>
                          <span className="font-mono text-amber-400">{activeLayer.opacity}%</span>
                        </div>
                        <Slider
                          value={[activeLayer.opacity]}
                          onValueChange={([v]) => updateActiveLayer({ opacity: v })}
                          min={20} max={100} step={5}
                        />
                      </div>
                      
                      {/* Reset Lighting */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-7 text-xs border-zinc-700"
                        onClick={() => updateActiveLayer({ brightness: 100, contrast: 100, opacity: 100 })}
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Reset Lighting
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                {/* Shadow Tab */}
                <TabsContent value="shadow" className="mt-2 space-y-2">
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="py-2 px-2 space-y-2">
                      {/* Drop Shadow Toggle */}
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] text-zinc-400">Drop Shadow</Label>
                        <Switch
                          checked={activeLayer.shadowEnabled}
                          onCheckedChange={(v) => updateActiveLayer({ shadowEnabled: v })}
                        />
                      </div>
                      
                      {activeLayer.shadowEnabled && (
                        <>
                          {/* Shadow Opacity */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-zinc-400">Shadow Intensity</span>
                              <span className="font-mono text-violet-400">{activeLayer.shadowOpacity}%</span>
                            </div>
                            <Slider
                              value={[activeLayer.shadowOpacity]}
                              onValueChange={([v]) => updateActiveLayer({ shadowOpacity: v })}
                              min={0} max={80} step={5}
                            />
                          </div>
                          
                          {/* Shadow Blur */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-zinc-400">Shadow Blur</span>
                              <span className="font-mono text-violet-400">{activeLayer.shadowBlur}px</span>
                            </div>
                            <Slider
                              value={[activeLayer.shadowBlur]}
                              onValueChange={([v]) => updateActiveLayer({ shadowBlur: v })}
                              min={0} max={50} step={2}
                            />
                          </div>
                          
                          {/* Shadow Offset Y */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-zinc-400">Shadow Offset Y</span>
                              <span className="font-mono text-violet-400">{activeLayer.shadowOffsetY}px</span>
                            </div>
                            <Slider
                              value={[activeLayer.shadowOffsetY]}
                              onValueChange={([v]) => updateActiveLayer({ shadowOffsetY: v })}
                              min={-30} max={50} step={2}
                            />
                          </div>
                        </>
                      )}
                      
                      {/* Inner Shadow Toggle */}
                      <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                        <Label className="text-[10px] text-zinc-400">Wheel Well Shadow</Label>
                        <Switch
                          checked={activeLayer.innerShadowEnabled}
                          onCheckedChange={(v) => updateActiveLayer({ innerShadowEnabled: v })}
                        />
                      </div>
                      
                      {activeLayer.innerShadowEnabled && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-zinc-400">Inner Shadow</span>
                            <span className="font-mono text-violet-400">{activeLayer.innerShadowOpacity}%</span>
                          </div>
                          <Slider
                            value={[activeLayer.innerShadowOpacity]}
                            onValueChange={([v]) => updateActiveLayer({ innerShadowOpacity: v })}
                            min={0} max={70} step={5}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
            
            {/* Auto Settings */}
            {autoSettings && (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="py-1.5 px-2">
                  <CardTitle className="text-xs flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    AI Auto-Blend
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-1.5 px-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] text-zinc-400">Auto Lighting</Label>
                    <Switch checked={useAutoLighting} onCheckedChange={setUseAutoLighting} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] text-zinc-400">Auto Perspective</Label>
                    <Switch checked={useAutoPerspective} onCheckedChange={setUseAutoPerspective} />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs border-amber-500/50 text-amber-400"
                    onClick={() => applyAutoSettings(autoSettings)}
                  >
                    <Sparkles className="w-3 h-3 mr-1" />
                    Apply Auto-Blend
                  </Button>
                </CardContent>
              </Card>
            )}
            
            {/* Help */}
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="py-1.5 px-2">
                <p className="text-[9px] text-zinc-500 leading-relaxed">
                  <strong className="text-zinc-400">Mask Mode:</strong> Click on wheel center to create mask<br/>
                  <strong className="text-zinc-400">Place Mode:</strong> Drag rims, use sliders for perspective<br/>
                  <strong className="text-zinc-400">Auto-Blend:</strong> AI analyzes car lighting for realistic compositing
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
