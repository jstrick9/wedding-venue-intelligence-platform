import React, { useRef, useState, useEffect, useCallback } from 'react';

import { DrawingObject } from '../types';
import { showToast } from './Toast';

interface DrawingToolProps {
  onSave: (payload: { 
    imageDataUrl: string, 
    objects: DrawingObject[], 
    name: string, 
    fixtureType: 'venue' | 'architectural' | 'lodging',
    drawingWidth: number,
    drawingHeight: number
  }) => void;
  onClose: () => void;
}

type Tool = 'pen' | 'brush' | 'line' | 'rectangle' | 'circle' | 'triangle' | 'polygon' | 'star' | 'arrow' | 'text' | 'eraser' | 'fill' | 'eyedropper' | 'select' | 'spray';
type BrushStyle = 'solid' | 'dotted' | 'dashed' | 'calligraphy' | 'airbrush' | 'spray';

interface Point {
  x: number;
  y: number;
}

// TextElement interface for future text layer support
// interface TextElement {
//   x: number;
//   y: number;
//   text: string;
//   fontSize: number;
//   color: string;
//   fontFamily: string;
// }

export const DrawingTool: React.FC<DrawingToolProps> = ({ onSave, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [tool, setTool] = useState<Tool>('pen');
  const [brushStyle, setBrushStyle] = useState<BrushStyle>('solid');
  const [color, setColor] = useState('#000000');
  const [fillColor, setFillColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<Point[]>([]);
  const [showGrid, setShowGrid] = useState(false);
  const [gridSize, setGridSize] = useState(20);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [useFill, setUseFill] = useState(false);
  const [featureName, setFeatureName] = useState('');
  const [fixtureType, setFixtureType] = useState<'venue' | 'architectural' | 'lodging'>('venue');
  const [zoom, setZoom] = useState(100);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyIndexRef = useRef(-1);
  const [rotation, setRotation] = useState(0);
  const [opacity, setOpacity] = useState(100);
  // Text elements state (for future use)
  // const [textElements, setTextElements] = useState<TextElement[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Arial');
  const [showTextInput, setShowTextInput] = useState(false);
  const [textPosition, setTextPosition] = useState<Point | null>(null);
  const [starPoints, setStarPoints] = useState(5);
  const [activeTab, setActiveTab] = useState<'tools' | 'brushes' | 'shapes' | 'colors' | 'settings'>('tools');

  const canvasWidth = 500;
  const canvasHeight = 400;

  const saveToHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const currentIndex = historyIndexRef.current;
        setHistory(prev => {
          const newHistory = prev.slice(0, currentIndex + 1);
          newHistory.push(imageData);
          return newHistory.slice(-50); // Keep last 50 states
        });
        const nextIndex = Math.min(currentIndex + 1, 49);
        historyIndexRef.current = nextIndex;
        setHistoryIndex(nextIndex);
      }
    }
  }, []);

  // Initialize the raster and its first undo snapshot exactly once per mount.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        saveToHistory();
      }
    }
  }, [saveToHistory]);

  const undo = () => {
    if (historyIndex > 0) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx && history[historyIndex - 1]) {
          ctx.putImageData(history[historyIndex - 1], 0, 0);
          const nextIndex = historyIndex - 1;
          historyIndexRef.current = nextIndex;
          setHistoryIndex(nextIndex);
        }
      }
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx && history[historyIndex + 1]) {
          ctx.putImageData(history[historyIndex + 1], 0, 0);
          const nextIndex = historyIndex + 1;
          historyIndexRef.current = nextIndex;
          setHistoryIndex(nextIndex);
        }
      }
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        saveToHistory();
      }
    }
    setPolygonPoints([]);
  };

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvasWidth / rect.width;
    const scaleY = canvasHeight / rect.height;
    
    let x = (e.clientX - rect.left) * scaleX;
    let y = (e.clientY - rect.top) * scaleY;
    
    if (snapToGrid) {
      x = Math.round(x / gridSize) * gridSize;
      y = Math.round(y / gridSize) * gridSize;
    }
    
    return { x, y };
  };

  const drawBrushStroke = (ctx: CanvasRenderingContext2D, x: number, y: number, lastX?: number, lastY?: number) => {
    ctx.globalAlpha = opacity / 100;
    
    switch (brushStyle) {
      case 'dotted':
        ctx.beginPath();
        ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'airbrush':
      case 'spray':
        for (let i = 0; i < 20; i++) {
          const offsetX = (Math.random() - 0.5) * brushSize * 2;
          const offsetY = (Math.random() - 0.5) * brushSize * 2;
          const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
          if (distance <= brushSize) {
            ctx.globalAlpha = (opacity / 100) * (1 - distance / brushSize) * 0.3;
            ctx.beginPath();
            ctx.arc(x + offsetX, y + offsetY, 1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = opacity / 100;
        break;
      case 'calligraphy':
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-brushSize / 4, -brushSize, brushSize / 2, brushSize * 2);
        ctx.restore();
        break;
      default:
        if (lastX !== undefined && lastY !== undefined) {
          ctx.beginPath();
          ctx.moveTo(lastX, lastY);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
    }
    
    ctx.globalAlpha = 1;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (tool === 'eyedropper') {
      const imageData = ctx.getImageData(point.x, point.y, 1, 1);
      const [r, g, b] = imageData.data;
      const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
      setColor(hex);
      return;
    }

    if (tool === 'fill') {
      floodFill(ctx, Math.floor(point.x), Math.floor(point.y), color);
      saveToHistory();
      return;
    }

    if (tool === 'text') {
      setTextPosition(point);
      setShowTextInput(true);
      return;
    }

    if (tool === 'polygon') {
      setPolygonPoints(prev => [...prev, point]);
      return;
    }

    setIsDrawing(true);
    setStartPoint(point);

    if (tool === 'pen' || tool === 'brush' || tool === 'eraser' || tool === 'spray') {
      ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
      ctx.fillStyle = tool === 'eraser' ? '#ffffff' : color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (tool === 'spray') {
        drawBrushStroke(ctx, point.x, point.y);
      } else {
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e);
    const overlay = overlayCanvasRef.current;
    
    // Draw preview on overlay canvas
    if (overlay) {
      const ctx = overlay.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        // Draw grid if enabled
        if (showGrid) {
          ctx.strokeStyle = '#ddd';
          ctx.lineWidth = 0.5;
          for (let x = 0; x <= canvasWidth; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvasHeight);
            ctx.stroke();
          }
          for (let y = 0; y <= canvasHeight; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvasWidth, y);
            ctx.stroke();
          }
        }
        
        // Draw polygon preview
        if (tool === 'polygon' && polygonPoints.length > 0) {
          ctx.strokeStyle = color;
          ctx.lineWidth = brushSize;
          ctx.beginPath();
          ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
          polygonPoints.forEach(p => ctx.lineTo(p.x, p.y));
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
        }
        
        // Draw shape preview while dragging
        if (isDrawing && startPoint) {
          ctx.strokeStyle = color;
          ctx.fillStyle = useFill ? fillColor : 'transparent';
          ctx.lineWidth = brushSize;
          ctx.globalAlpha = 0.5;
          
          drawShape(ctx, tool, startPoint, point);
          ctx.globalAlpha = 1;
        }
      }
    }

    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (tool === 'pen' || tool === 'brush' || tool === 'eraser') {
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    } else if (tool === 'spray') {
      drawBrushStroke(ctx, point.x, point.y);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint) {
      setIsDrawing(false);
      return;
    }

    const point = getCanvasPoint(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = color;
    ctx.fillStyle = useFill ? fillColor : 'transparent';
    ctx.lineWidth = brushSize;
    ctx.globalAlpha = opacity / 100;

    drawShape(ctx, tool, startPoint, point, true);
    
    ctx.globalAlpha = 1;
    setIsDrawing(false);
    setStartPoint(null);
    saveToHistory();
    
    // Clear overlay
    const overlay = overlayCanvasRef.current;
    if (overlay) {
      const overlayCtx = overlay.getContext('2d');
      if (overlayCtx) {
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      }
    }
  };

  const drawShape = (ctx: CanvasRenderingContext2D, shapeTool: Tool, start: Point, end: Point, fill = false) => {
    const width = end.x - start.x;
    const height = end.y - start.y;
    
    ctx.beginPath();
    
    switch (shapeTool) {
      case 'line':
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        break;
        
      case 'rectangle':
        if (fill && useFill) {
          ctx.fillRect(start.x, start.y, width, height);
        }
        ctx.strokeRect(start.x, start.y, width, height);
        break;
        
      case 'circle':
        const radiusX = Math.abs(width) / 2;
        const radiusY = Math.abs(height) / 2;
        const centerX = start.x + width / 2;
        const centerY = start.y + height / 2;
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        if (fill && useFill) ctx.fill();
        ctx.stroke();
        break;
        
      case 'triangle':
        ctx.moveTo(start.x + width / 2, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.lineTo(start.x, end.y);
        ctx.closePath();
        if (fill && useFill) ctx.fill();
        ctx.stroke();
        break;
        
      case 'star':
        drawStar(ctx, start.x + width / 2, start.y + height / 2, starPoints, Math.min(Math.abs(width), Math.abs(height)) / 2, Math.min(Math.abs(width), Math.abs(height)) / 4);
        if (fill && useFill) ctx.fill();
        ctx.stroke();
        break;
        
      case 'arrow':
        const angle = Math.atan2(height, width);
        const headLength = Math.min(20, Math.sqrt(width * width + height * height) / 3);
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.lineTo(end.x - headLength * Math.cos(angle - Math.PI / 6), end.y - headLength * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - headLength * Math.cos(angle + Math.PI / 6), end.y - headLength * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
        break;
    }
  };

  const drawStar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number) => {
    let rot = Math.PI / 2 * 3;
    const step = Math.PI / spikes;
    
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
  };

  const floodFill = (ctx: CanvasRenderingContext2D, startX: number, startY: number, fillColorHex: string) => {
    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;
    
    const targetColor = getPixelColor(data, startX, startY);
    const fillRgb = hexToRgb(fillColorHex);
    
    if (!fillRgb || colorsMatch(targetColor, fillRgb)) return;
    
    const stack: [number, number][] = [[startX, startY]];
    const visited = new Set<string>();
    
    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      const key = `${x},${y}`;
      
      if (x < 0 || x >= canvasWidth || y < 0 || y >= canvasHeight) continue;
      if (visited.has(key)) continue;
      
      const currentColor = getPixelColor(data, x, y);
      if (!colorsMatch(currentColor, targetColor)) continue;
      
      visited.add(key);
      setPixelColor(data, x, y, fillRgb);
      
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    
    ctx.putImageData(imageData, 0, 0);
  };

  const getPixelColor = (data: Uint8ClampedArray, x: number, y: number): [number, number, number] => {
    const index = (y * canvasWidth + x) * 4;
    return [data[index], data[index + 1], data[index + 2]];
  };

  const setPixelColor = (data: Uint8ClampedArray, x: number, y: number, rgb: [number, number, number]) => {
    const index = (y * canvasWidth + x) * 4;
    data[index] = rgb[0];
    data[index + 1] = rgb[1];
    data[index + 2] = rgb[2];
    data[index + 3] = 255;
  };

  const colorsMatch = (c1: [number, number, number], c2: [number, number, number]): boolean => {
    return Math.abs(c1[0] - c2[0]) < 10 && Math.abs(c1[1] - c2[1]) < 10 && Math.abs(c1[2] - c2[2]) < 10;
  };

  const hexToRgb = (hex: string): [number, number, number] | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : null;
  };

  const handleDoubleClick = () => {
    if (tool === 'polygon' && polygonPoints.length >= 3) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.strokeStyle = color;
          ctx.fillStyle = useFill ? fillColor : 'transparent';
          ctx.lineWidth = brushSize;
          ctx.beginPath();
          ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
          polygonPoints.forEach(p => ctx.lineTo(p.x, p.y));
          ctx.closePath();
          if (useFill) ctx.fill();
          ctx.stroke();
          saveToHistory();
        }
      }
      setPolygonPoints([]);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              // Scale image to fit canvas while maintaining aspect ratio
              const scale = Math.min(canvasWidth / img.width, canvasHeight / img.height);
              const width = img.width * scale;
              const height = img.height * scale;
              const x = (canvasWidth - width) / 2;
              const y = (canvasHeight - height) / 2;
              
              ctx.drawImage(img, x, y, width, height);
              saveToHistory();
            }
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const rotateCanvas = (degrees: number) => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasWidth;
        tempCanvas.height = canvasHeight;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.putImageData(imageData, 0, 0);
          
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvasWidth, canvasHeight);
          ctx.save();
          ctx.translate(canvasWidth / 2, canvasHeight / 2);
          ctx.rotate((degrees * Math.PI) / 180);
          ctx.drawImage(tempCanvas, -canvasWidth / 2, -canvasHeight / 2);
          ctx.restore();
          
          setRotation(prev => (prev + degrees) % 360);
          saveToHistory();
        }
      }
    }
  };

  const flipCanvas = (direction: 'horizontal' | 'vertical') => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasWidth;
        tempCanvas.height = canvasHeight;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.putImageData(imageData, 0, 0);
          
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvasWidth, canvasHeight);
          ctx.save();
          if (direction === 'horizontal') {
            ctx.translate(canvasWidth, 0);
            ctx.scale(-1, 1);
          } else {
            ctx.translate(0, canvasHeight);
            ctx.scale(1, -1);
          }
          ctx.drawImage(tempCanvas, 0, 0);
          ctx.restore();
          
          saveToHistory();
        }
      }
    }
  };

  const addText = () => {
    if (!currentText.trim() || !textPosition) return;
    
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity / 100;
        ctx.fillText(currentText, textPosition.x, textPosition.y);
        ctx.globalAlpha = 1;
        saveToHistory();
      }
    }
    
    setShowTextInput(false);
    setCurrentText('');
    setTextPosition(null);
  };

  const handleSave = () => {
    if (!featureName.trim()) {
      showToast('Please enter a name for your feature', 'warning');
      return;
    }
    
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      onSave({
        imageDataUrl: dataUrl,
        objects: [], // Legacy raster tool returns empty objects for now
        name: featureName,
        fixtureType,
        drawingWidth: canvasWidth,
        drawingHeight: canvasHeight
      });
    }
  };

  const colorPalette = [
    '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00',
    '#ff00ff', '#00ffff', '#808080', '#c0c0c0', '#800000', '#808000',
    '#008000', '#800080', '#008080', '#000080', '#ff6600', '#ff9900',
    '#99cc00', '#339966', '#33cccc', '#3366ff', '#9933ff', '#ff3399',
    '#4A1942', '#8B4513', '#228B22', '#4682B4', '#DAA520', '#CD853F'
  ];

  const tools: { id: Tool; icon: string; name: string }[] = [
    { id: 'pen', icon: '✏️', name: 'Pen' },
    { id: 'brush', icon: '🖌️', name: 'Brush' },
    { id: 'spray', icon: '💨', name: 'Spray' },
    { id: 'eraser', icon: '🧹', name: 'Eraser' },
    { id: 'fill', icon: '🪣', name: 'Fill' },
    { id: 'eyedropper', icon: '💉', name: 'Color Picker' },
    { id: 'text', icon: '🔤', name: 'Text' },
  ];

  const shapes: { id: Tool; icon: string; name: string }[] = [
    { id: 'line', icon: '📏', name: 'Line' },
    { id: 'rectangle', icon: '⬜', name: 'Rectangle' },
    { id: 'circle', icon: '⭕', name: 'Circle' },
    { id: 'triangle', icon: '🔺', name: 'Triangle' },
    { id: 'polygon', icon: '⬡', name: 'Polygon' },
    { id: 'star', icon: '⭐', name: 'Star' },
    { id: 'arrow', icon: '➡️', name: 'Arrow' },
  ];

  const brushStyles: { id: BrushStyle; icon: string; name: string }[] = [
    { id: 'solid', icon: '━', name: 'Solid' },
    { id: 'dotted', icon: '···', name: 'Dotted' },
    { id: 'dashed', icon: '- -', name: 'Dashed' },
    { id: 'calligraphy', icon: '/', name: 'Calligraphy' },
    { id: 'airbrush', icon: '○', name: 'Airbrush' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] p-4" onClick={onClose}>
      <div 
        ref={containerRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#4A1942] to-[#6B2C5F] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎨</span>
            <div>
              <h2 className="text-xl font-bold">Custom Feature Designer</h2>
              <p className="text-sm opacity-80">Create your own venue fixtures or architectural features</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors text-2xl">×</button>
        </div>

        {/* Feature Type & Name */}
        <div className="p-4 bg-gray-50 border-b flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="font-medium text-gray-700">Type:</label>
            <select
              value={fixtureType}
              onChange={(e) => setFixtureType(e.target.value as 'venue' | 'architectural' | 'lodging')}
              className="px-3 py-2 border rounded-lg bg-white"
            >
              <option value="venue">🏛️ Venue Fixture</option>
              <option value="lodging">🛏️ Lodging/Utilities</option>
              <option value="architectural">🌳 Architectural/Landscape</option>
            </select>
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <label className="font-medium text-gray-700">Name:</label>
            <input
              type="text"
              value={featureName}
              onChange={(e) => setFeatureName(e.target.value)}
              placeholder="Enter feature name..."
              className="flex-1 px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Toolbar */}
          <div className="w-64 bg-gray-100 border-r flex flex-col overflow-y-auto">
            {/* Tabs */}
            <div className="flex border-b bg-white">
              {(['tools', 'shapes', 'brushes', 'colors', 'settings'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 px-1 text-xs font-medium capitalize transition-colors ${
                    activeTab === tab 
                      ? 'bg-[#4A1942] text-white' 
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {/* Tools Tab */}
              {activeTab === 'tools' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-700 mb-2">Drawing Tools</h3>
                    <div className="grid grid-cols-4 gap-1">
                      {tools.map(t => (
                        <button
                          key={t.id}
                          onClick={() => setTool(t.id)}
                          className={`p-2 rounded-lg text-lg transition-all ${
                            tool === t.id 
                              ? 'bg-[#4A1942] text-white shadow-lg scale-105' 
                              : 'bg-white hover:bg-gray-200 border'
                          }`}
                          title={t.name}
                        >
                          {t.icon}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-gray-700 mb-2">Actions</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={undo} disabled={historyIndex <= 0} className="flex items-center justify-center gap-1 px-2 py-2 bg-white border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                        ↩️ Undo
                      </button>
                      <button onClick={redo} disabled={historyIndex >= history.length - 1} className="flex items-center justify-center gap-1 px-2 py-2 bg-white border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                        ↪️ Redo
                      </button>
                      <button onClick={() => rotateCanvas(-90)} className="flex items-center justify-center gap-1 px-2 py-2 bg-white border rounded-lg hover:bg-gray-100 text-sm">
                        🔄 Left
                      </button>
                      <button onClick={() => rotateCanvas(90)} className="flex items-center justify-center gap-1 px-2 py-2 bg-white border rounded-lg hover:bg-gray-100 text-sm">
                        🔃 Right
                      </button>
                      <button onClick={() => flipCanvas('horizontal')} className="flex items-center justify-center gap-1 px-2 py-2 bg-white border rounded-lg hover:bg-gray-100 text-sm">
                        ↔️ Flip H
                      </button>
                      <button onClick={() => flipCanvas('vertical')} className="flex items-center justify-center gap-1 px-2 py-2 bg-white border rounded-lg hover:bg-gray-100 text-sm">
                        ↕️ Flip V
                      </button>
                    </div>
                  </div>

                  <div>
                    <input
                      id="drawing-tool-image-upload"
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="sr-only"
                      aria-label="Upload drawing background image"
                    />
                    <label
                      htmlFor="drawing-tool-image-upload"
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors cursor-pointer"
                    >
                      📷 Upload Image
                    </label>
                  </div>

                  <button
                    onClick={clearCanvas}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    🗑️ Clear All
                  </button>
                </div>
              )}

              {/* Shapes Tab */}
              {activeTab === 'shapes' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-700 mb-2">Shapes</h3>
                    <div className="grid grid-cols-4 gap-1">
                      {shapes.map(s => (
                        <button
                          key={s.id}
                          onClick={() => setTool(s.id)}
                          className={`p-2 rounded-lg text-lg transition-all ${
                            tool === s.id 
                              ? 'bg-[#4A1942] text-white shadow-lg scale-105' 
                              : 'bg-white hover:bg-gray-200 border'
                          }`}
                          title={s.name}
                        >
                          {s.icon}
                        </button>
                      ))}
                    </div>
                  </div>

                  {tool === 'star' && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">Star Points: {starPoints}</label>
                      <input
                        type="range"
                        min="3"
                        max="12"
                        value={starPoints}
                        onChange={(e) => setStarPoints(parseInt(e.target.value))}
                        className="w-full mt-1"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="useFill"
                      checked={useFill}
                      onChange={(e) => setUseFill(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <label htmlFor="useFill" className="text-sm font-medium text-gray-700">Fill Shape</label>
                  </div>

                  {useFill && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Fill Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={fillColor}
                          onChange={(e) => setFillColor(e.target.value)}
                          className="w-10 h-10 rounded cursor-pointer"
                        />
                        <input
                          type="text"
                          value={fillColor}
                          onChange={(e) => setFillColor(e.target.value)}
                          className="flex-1 px-2 py-1 border rounded text-sm"
                        />
                      </div>
                    </div>
                  )}

                  {tool === 'polygon' && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-sm">
                      <p className="font-medium text-yellow-800">Polygon Mode</p>
                      <p className="text-yellow-700 text-xs">Click to add points, double-click to close shape</p>
                    </div>
                  )}
                </div>
              )}

              {/* Brushes Tab */}
              {activeTab === 'brushes' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-700 mb-2">Brush Style</h3>
                    <div className="grid grid-cols-3 gap-1">
                      {brushStyles.map(b => (
                        <button
                          key={b.id}
                          onClick={() => setBrushStyle(b.id)}
                          className={`p-2 rounded-lg text-sm transition-all ${
                            brushStyle === b.id 
                              ? 'bg-[#4A1942] text-white shadow-lg' 
                              : 'bg-white hover:bg-gray-200 border'
                          }`}
                          title={b.name}
                        >
                          <span className="text-lg">{b.icon}</span>
                          <span className="block text-xs">{b.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-bold text-gray-700 block mb-2">Brush Size: {brushSize}px</label>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      value={brushSize}
                      onChange={(e) => setBrushSize(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-center mt-2">
                      <div 
                        style={{ 
                          width: Math.min(brushSize, 50), 
                          height: Math.min(brushSize, 50), 
                          backgroundColor: color,
                          borderRadius: '50%'
                        }} 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-bold text-gray-700 block mb-2">Opacity: {opacity}%</label>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={opacity}
                      onChange={(e) => setOpacity(parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              )}

              {/* Colors Tab */}
              {activeTab === 'colors' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-bold text-gray-700 block mb-2">Stroke Color</label>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="w-12 h-12 rounded cursor-pointer border-2"
                      />
                      <input
                        type="text"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="flex-1 px-2 py-1 border rounded text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-6 gap-1">
                      {colorPalette.map((c, i) => (
                        <button
                          key={i}
                          onClick={() => setColor(c)}
                          className={`w-8 h-8 rounded border-2 transition-transform hover:scale-110 ${
                            color === c ? 'border-[#4A1942] ring-2 ring-[#4A1942]' : 'border-gray-300'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-bold text-gray-700 block mb-2">Fill Color</label>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="color"
                        value={fillColor}
                        onChange={(e) => setFillColor(e.target.value)}
                        className="w-12 h-12 rounded cursor-pointer border-2"
                      />
                      <input
                        type="text"
                        value={fillColor}
                        onChange={(e) => setFillColor(e.target.value)}
                        className="flex-1 px-2 py-1 border rounded text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-6 gap-1">
                      {colorPalette.map((c, i) => (
                        <button
                          key={i}
                          onClick={() => setFillColor(c)}
                          className={`w-8 h-8 rounded border-2 transition-transform hover:scale-110 ${
                            fillColor === c ? 'border-[#4A1942] ring-2 ring-[#4A1942]' : 'border-gray-300'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === 'settings' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-700 mb-2">Grid Settings</h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="showGrid"
                          checked={showGrid}
                          onChange={(e) => setShowGrid(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <label htmlFor="showGrid" className="text-sm text-gray-700">Show Grid</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="snapToGrid"
                          checked={snapToGrid}
                          onChange={(e) => setSnapToGrid(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <label htmlFor="snapToGrid" className="text-sm text-gray-700">Snap to Grid</label>
                      </div>
                      {showGrid && (
                        <div>
                          <label className="text-sm text-gray-700">Grid Size: {gridSize}px</label>
                          <input
                            type="range"
                            min="10"
                            max="50"
                            value={gridSize}
                            onChange={(e) => setGridSize(parseInt(e.target.value))}
                            className="w-full"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-gray-700 mb-2">Text Settings</h3>
                    <div className="space-y-2">
                      <div>
                        <label className="text-sm text-gray-700">Font Family</label>
                        <select
                          value={fontFamily}
                          onChange={(e) => setFontFamily(e.target.value)}
                          className="w-full px-2 py-1 border rounded text-sm"
                        >
                          <option value="Arial">Arial</option>
                          <option value="Times New Roman">Times New Roman</option>
                          <option value="Georgia">Georgia</option>
                          <option value="Verdana">Verdana</option>
                          <option value="Courier New">Courier New</option>
                          <option value="Comic Sans MS">Comic Sans MS</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm text-gray-700">Font Size: {fontSize}px</label>
                        <input
                          type="range"
                          min="8"
                          max="72"
                          value={fontSize}
                          onChange={(e) => setFontSize(parseInt(e.target.value))}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-gray-700 mb-2">Canvas Zoom</h3>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setZoom(Math.max(50, zoom - 10))} className="px-2 py-1 bg-gray-200 rounded">-</button>
                      <span className="flex-1 text-center text-sm">{zoom}%</span>
                      <button onClick={() => setZoom(Math.min(200, zoom + 10))} className="px-2 py-1 bg-gray-200 rounded">+</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Canvas Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto bg-gray-200 p-4 flex items-center justify-center">
              <div 
                className="relative bg-white shadow-lg rounded-lg overflow-hidden"
                style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center' }}
              >
                <canvas
                  ref={canvasRef}
                  width={canvasWidth}
                  height={canvasHeight}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onDoubleClick={handleDoubleClick}
                  className="cursor-crosshair"
                  style={{ display: 'block' }}
                />
                <canvas
                  ref={overlayCanvasRef}
                  width={canvasWidth}
                  height={canvasHeight}
                  className="absolute inset-0 pointer-events-none"
                  style={{ display: 'block' }}
                />
              </div>
            </div>

            {/* Text Input Modal */}
            {showTextInput && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10">
                <div className="bg-white rounded-lg p-4 shadow-xl">
                  <h3 className="font-bold mb-2">Add Text</h3>
                  <input
                    type="text"
                    value={currentText}
                    onChange={(e) => setCurrentText(e.target.value)}
                    placeholder="Enter text..."
                    className="w-full px-3 py-2 border rounded-lg mb-3"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={addText}
                      className="flex-1 px-4 py-2 bg-[#4A1942] text-white rounded-lg hover:bg-[#3a1335]"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setShowTextInput(false); setCurrentText(''); }}
                      className="flex-1 px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-100 border-t flex justify-between items-center">
          <div className="text-sm text-gray-600">
            <span className="font-medium">Current Tool:</span> {tool.charAt(0).toUpperCase() + tool.slice(1)}
            {rotation !== 0 && <span className="ml-3">Rotation: {rotation}°</span>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!featureName.trim()}
              className="px-6 py-2 bg-gradient-to-r from-[#4A1942] to-[#6B2C5F] text-white rounded-lg hover:from-[#3a1335] hover:to-[#5a2350] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              💾 Save Feature
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
