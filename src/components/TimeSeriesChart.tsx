import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LineChart, ZoomIn, Move, Maximize2, Calculator, X } from 'lucide-react';

interface DataPoint {
  datetime: Date;
  value: number | null;
}

interface Dataset {
  fileName: string;
  headers: string[];
  variables: Record<string, DataPoint[]>;
  dataCount: number;
  colors: Record<string, string>;
}

interface VariableConfig {
  enabled: boolean;
  label: string;
  color: string;
  yMin?: number;
  yMax?: number;
  yAxisGroup?: string;
}

interface TimeSeriesChartProps {
  datasets: Record<string, Dataset>;
  variableConfigs: Record<string, VariableConfig>;
  selectedVariables: string[];
}

interface TooltipData {
  x: number;
  y: number;
  visible: boolean;
  time: string;
  values: Array<{
    label: string;
    value: number;
    color: string;
  }>;
}

interface SelectionStats {
  variable: string;
  label: string;
  color: string;
  min: number;
  max: number;
  avg: number;
  sum: number;
  count: number;
  startTime: Date;
  endTime: Date;
}

export const TimeSeriesChart = ({
  datasets,
  variableConfigs,
  selectedVariables
}: TimeSeriesChartProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fullscreenCanvasRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<any>(null);
  const fullscreenChartRef = useRef<any>(null);
  const [tooltip, setTooltip] = useState<TooltipData>({
    x: 0,
    y: 0,
    visible: false,
    time: '',
    values: []
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [selectionStats, setSelectionStats] = useState<SelectionStats[]>([]);
  const [showStats, setShowStats] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Calculate statistics for selected time range
  const calculateSelectionStats = (startTime: number, endTime: number) => {
    const stats: SelectionStats[] = [];
    
    selectedVariables.forEach(variableId => {
      let matchingDatasetKey: string | null = null;
      let matchingDataset: Dataset | null = null;
      
      for (const [datasetKey, dataset] of Object.entries(datasets)) {
        if (variableId.startsWith(datasetKey + '_')) {
          matchingDatasetKey = datasetKey;
          matchingDataset = dataset;
          break;
        }
      }
      
      if (!matchingDatasetKey || !matchingDataset) return;
      
      const variableName = variableId.substring(matchingDatasetKey.length + 1);
      const variableData = matchingDataset.variables[variableName];
      const config = variableConfigs[variableId];
      
      if (!variableData || !config) return;
      
      // Filter data within selection range
      const filteredData = variableData.filter(point => {
        const time = point.datetime.getTime();
        return time >= startTime && time <= endTime && point.value !== null;
      });
      
      if (filteredData.length === 0) return;
      
      const values = filteredData.map(p => p.value as number);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      
      let cleanLabel = config.label;
      if (cleanLabel.startsWith('deviceData.')) {
        cleanLabel = cleanLabel.substring('deviceData.'.length);
      }
      
      stats.push({
        variable: variableId,
        label: cleanLabel,
        color: config.color,
        min,
        max,
        avg,
        sum,
        count: values.length,
        startTime: new Date(startTime),
        endTime: new Date(endTime)
      });
    });
    
    return stats;
  };

  // Function to calculate date range from selected variables
  const getDateRangeTitle = () => {
    if (selectedVariables.length === 0) {
      return 'Time Series Data Visualization';
    }

    let allDates: Date[] = [];

    selectedVariables.forEach(variableId => {
      // Find the matching dataset
      let matchingDatasetKey: string | null = null;
      let matchingDataset: Dataset | null = null;
      
      for (const [datasetKey, dataset] of Object.entries(datasets)) {
        if (variableId.startsWith(datasetKey + '_')) {
          matchingDatasetKey = datasetKey;
          matchingDataset = dataset;
          break;
        }
      }
      
      if (!matchingDatasetKey || !matchingDataset) return;
      
      // Extract variable name
      const variableName = variableId.substring(matchingDatasetKey.length + 1);
      const variableData = matchingDataset.variables[variableName];
      
      if (variableData) {
        variableData.forEach(point => {
          if (point.value !== null) {
            allDates.push(point.datetime);
          }
        });
      }
    });

    if (allDates.length === 0) {
      return 'Time Series Data Visualization';
    }

    // Sort dates and get min/max
    allDates.sort((a, b) => a.getTime() - b.getTime());
    const minDate = allDates[0];
    const maxDate = allDates[allDates.length - 1];

    // Format dates as DD/MM/YYYY
    const formatDate = (date: Date) => {
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };

    const minDateStr = formatDate(minDate);
    const maxDateStr = formatDate(maxDate);

    // If same date, show just one date, otherwise show range
    if (minDateStr === maxDateStr) {
      return minDateStr;
    } else {
      return `${minDateStr} - ${maxDateStr}`;
    }
  };

  const createChart = async (canvas: HTMLCanvasElement | null, chartRef: React.MutableRefObject<any>, isFullscreenChart: boolean = false) => {
    if (!canvas || selectedVariables.length === 0) return;
    
    const [
      { Chart, registerables },
      { default: zoomPlugin },
      { default: annotationPlugin }
    ] = await Promise.all([
      import('chart.js'),
      import('chartjs-plugin-zoom'),
      import('chartjs-plugin-annotation')
    ]);

    await import('chartjs-adapter-date-fns');
    Chart.register(...registerables, zoomPlugin, annotationPlugin);

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const chartDatasets = selectedVariables.map(variableId => {
      let matchingDatasetKey: string | null = null;
      let matchingDataset: Dataset | null = null;
      
      for (const [datasetKey, dataset] of Object.entries(datasets)) {
        if (variableId.startsWith(datasetKey + '_')) {
          matchingDatasetKey = datasetKey;
          matchingDataset = dataset;
          break;
        }
      }
      
      if (!matchingDatasetKey || !matchingDataset) return null;
      
      const variableName = variableId.substring(matchingDatasetKey.length + 1);
      const config = variableConfigs[variableId];
      const variableData = matchingDataset.variables[variableName];
      
      if (!config || !variableData) return null;

      let data = variableData
        ?.map(d => ({ x: d.datetime.getTime(), y: d.value }))
        .filter(d => d.y !== null) || [];

      if (data.length > 3000) {
        const step = Math.ceil(data.length / 1500);
        data = data.filter((_, index) => index % step === 0);
      }

      let cleanLabel = config.label;
      if (cleanLabel.startsWith('deviceData.')) {
        cleanLabel = cleanLabel.substring('deviceData.'.length);
      }

      return {
        label: cleanLabel,
        data,
        borderColor: config.color,
        backgroundColor: config.color + '10',
        borderWidth: 1.5,
        fill: false,
        tension: 0.2,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointBackgroundColor: config.color,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        spanGaps: true,
        yAxisID: config.yAxisGroup || variableId
      };
    }).filter(Boolean);

    if (chartDatasets.length === 0) return;

    // Create Y-axes
    const yAxisGroups: Record<string, string[]> = {};
    selectedVariables.forEach(variableId => {
      const config = variableConfigs[variableId];
      if (!config) return;
      
      const groupKey = config.yAxisGroup || variableId;
      if (!yAxisGroups[groupKey]) {
        yAxisGroups[groupKey] = [];
      }
      yAxisGroups[groupKey].push(variableId);
    });

    const yScales: any = {};
    const groupKeys = Object.keys(yAxisGroups);
    
    groupKeys.forEach((groupKey, index) => {
      const variablesInGroup = yAxisGroups[groupKey];
      const firstVariable = variablesInGroup[0];
      const config = variableConfigs[firstVariable];
      
      if (!config) return;

      let axisLabel = config.yAxisGroup || config.label;
      if (axisLabel.startsWith('deviceData.')) {
        axisLabel = axisLabel.substring('deviceData.'.length);
      }

      yScales[groupKey] = {
        type: 'linear',
        position: index % 2 === 0 ? 'left' : 'right',
        title: {
          display: true,
          text: axisLabel,
          color: config.color
        },
        min: config.yMin,
        max: config.yMax,
        grid: {
          drawOnChartArea: index === 0
        },
        ticks: {
          color: config.color,
          maxTicksLimit: 8
        }
      };
    });

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const annotations: any = {};
    if (selectionStart !== null && selectionEnd !== null && isFullscreenChart) {
      annotations.selectionBox = {
        type: 'box',
        xMin: Math.min(selectionStart, selectionEnd),
        xMax: Math.max(selectionStart, selectionEnd),
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderColor: 'rgba(59, 130, 246, 0.8)',
        borderWidth: 2,
      };
    }

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: { datasets: chartDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        elements: {
          line: { tension: 0.2, borderWidth: 1.5 },
          point: { radius: 0, hoverRadius: 6 }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'minute',
              displayFormats: {
                minute: 'HH:mm',
                hour: 'HH:mm',
                day: 'DD/MM'
              },
              tooltipFormat: 'DD/MM/YYYY HH:mm'
            },
            title: {
              display: true,
              text: 'Time',
              font: { size: 14, weight: 'bold' }
            },
            ticks: {
              maxTicksLimit: 10,
              color: '#6B7280'
            },
            grid: { color: '#F3F4F6' }
          },
          ...yScales
        },
        plugins: {
          title: {
            display: true,
            text: getDateRangeTitle(),
            font: { size: 18, weight: 'bold' },
            color: '#374151'
          },
          legend: {
            display: true,
            position: 'top',
            labels: {
              usePointStyle: true,
              padding: 20,
              font: { size: 12 }
            }
          },
          tooltip: { enabled: false },
          annotation: {
            annotations
          },
          zoom: {
            pan: { 
              enabled: true, 
              mode: 'x',
              modifierKey: 'ctrl'
            },
            zoom: {
              wheel: { enabled: true, speed: 0.1 },
              pinch: { enabled: true },
              drag: { enabled: false }, // Disable drag zoom
              mode: 'x',
              onZoomStart: () => {
                setTooltip(prev => ({ ...prev, visible: false }));
                return true;
              }
            },
            limits: {
              x: { minRange: 30 * 1000 }
            }
          }
        }
      }
    });

    // Add custom event listeners for fullscreen chart selection
    if (isFullscreenChart) {
      const handleMouseDown = (e: MouseEvent) => {
        if (e.ctrlKey) return; // Let pan handle it
        
        const rect = canvas.getBoundingClientRect();
        const canvasPosition = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
        const dataX = chartRef.current?.scales.x.getValueForPixel(canvasPosition.x);
        
        if (dataX) {
          setIsDragging(true);
          setSelectionStart(dataX);
          setSelectionEnd(dataX);
          setIsSelecting(true);
        }
      };

      const handleMouseUp = () => {
        if (isDragging && selectionStart !== null && selectionEnd !== null) {
          const start = Math.min(selectionStart, selectionEnd);
          const end = Math.max(selectionStart, selectionEnd);
          
          // Only show stats if there's a meaningful selection (more than 1 minute difference)
          if (end - start > 60000) {
            const stats = calculateSelectionStats(start, end);
            setSelectionStats(stats);
            setShowStats(true);
          }
        }
        setIsDragging(false);
        setIsSelecting(false);
      };

      const handleMouseMove = (e: MouseEvent) => {
        if (isDragging && selectionStart !== null) {
          const rect = canvas.getBoundingClientRect();
          const canvasPosition = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
          };
          const dataX = chartRef.current?.scales.x.getValueForPixel(canvasPosition.x);
          if (dataX) {
            setSelectionEnd(dataX);
          }
        }
      };

      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('mouseup', handleMouseUp);
      canvas.addEventListener('mousemove', handleMouseMove);

      return () => {
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('mouseup', handleMouseUp);
        canvas.removeEventListener('mousemove', handleMouseMove);
      };
    }
  };

  const addDoubleClickHandler = (canvas: HTMLCanvasElement) => {
    const handleDoubleClick = () => {
      setIsFullscreen(true);
    };
    
    canvas.addEventListener('dblclick', handleDoubleClick);
    return () => canvas.removeEventListener('dblclick', handleDoubleClick);
  };

  useEffect(() => {
    const loadChartJS = async () => {
      if (typeof window === 'undefined') return;

      const cleanup = await createChart(canvasRef.current, chartInstanceRef, false);
      
      // Add double-click handler for regular chart
      const doubleClickCleanup = canvasRef.current ? addDoubleClickHandler(canvasRef.current) : null;
      
      return () => {
        cleanup?.();
        doubleClickCleanup?.();
      };
    };

    const cleanupPromise = loadChartJS();

    return () => {
      cleanupPromise.then(cleanup => cleanup?.());
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [datasets, variableConfigs, selectedVariables]);

  useEffect(() => {
    if (isFullscreen && fullscreenCanvasRef.current) {
      // Small delay to ensure the dialog is fully rendered
      const timer = setTimeout(() => {
        createChart(fullscreenCanvasRef.current, fullscreenChartRef, true);
      }, 100);
      
      return () => {
        clearTimeout(timer);
        if (fullscreenChartRef.current) {
          fullscreenChartRef.current.destroy();
          fullscreenChartRef.current = null;
        }
      };
    }
    return () => {
      if (fullscreenChartRef.current) {
        fullscreenChartRef.current.destroy();
        fullscreenChartRef.current = null;
      }
    };
  }, [isFullscreen, datasets, variableConfigs, selectedVariables, selectionStart, selectionEnd]);

  if (selectedVariables.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <LineChart className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-600 mb-2">No Variables Selected</h3>
          <p className="text-gray-500">
            Select variables from the dataset configuration panel to visualize your data.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <LineChart className="h-5 w-5" />
              Chart View
            </CardTitle>
            <div className="flex gap-2">
              <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" onDoubleClick={() => setIsFullscreen(true)}>
                    <Maximize2 className="h-4 w-4 mr-1" />
                    Fullscreen
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[95vw] h-[95vh] p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <h2 className="text-lg font-semibold">Chart Fullscreen View</h2>
                      <Badge variant="outline" className="text-xs">
                        <Calculator className="h-3 w-3 mr-1" />
                        Drag to select range
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsDragging(false);
                        setIsSelecting(false);
                        setSelectionStart(null);
                        setSelectionEnd(null);
                        setShowStats(false);
                      }}
                    >
                      Clear Selection
                    </Button>
                  </div>
                  
                  <div className="relative h-[calc(95vh-200px)] w-full">
                    <canvas 
                      ref={fullscreenCanvasRef} 
                      className="w-full h-full" 
                      onMouseLeave={() => setTooltip(prev => ({ ...prev, visible: false }))}
                    />
                    
                    {/* Custom Tooltip for fullscreen */}
                    {tooltip.visible && (
                      <div
                        className="absolute z-50 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-lg border border-gray-700 pointer-events-none"
                        style={{
                          left: `${tooltip.x}px`,
                          top: `${tooltip.y}px`
                        }}
                      >
                        <div className="font-semibold mb-2 text-gray-200">
                          {tooltip.time}
                        </div>
                        <div className="space-y-1">
                          {tooltip.values.map((item, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="text-gray-300">{item.label}:</span>
                              <span className="font-mono font-medium">
                                {typeof item.value === 'number' ? item.value.toFixed(2) : item.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
              
              <Badge variant="outline" className="text-xs">
                <ZoomIn className="h-3 w-3 mr-1" />
                Scroll to zoom
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Move className="h-3 w-3 mr-1" />
                Ctrl+drag to pan
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Calculator className="h-3 w-3 mr-1" />
                Double-click for fullscreen
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative h-96 w-full">
            <canvas 
              ref={canvasRef} 
              className="w-full h-full" 
              onMouseLeave={() => setTooltip(prev => ({ ...prev, visible: false }))}
            />
            
            {/* Custom Tooltip */}
            {tooltip.visible && (
              <div
                className="absolute z-50 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-lg border border-gray-700 pointer-events-none"
                style={{
                  left: `${tooltip.x}px`,
                  top: `${tooltip.y}px`
                }}
              >
                <div className="font-semibold mb-2 text-gray-200">
                  {tooltip.time}
                </div>
                <div className="space-y-1">
                  {tooltip.values.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-gray-300">{item.label}:</span>
                      <span className="font-mono font-medium">
                        {typeof item.value === 'number' ? item.value.toFixed(2) : item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Selection Statistics Modal */}
      <Dialog open={showStats} onOpenChange={setShowStats}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Selection Statistics</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowStats(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {selectionStats.length > 0 && (
            <>
              <div className="mb-4 p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Time Range</div>
                <div className="font-mono text-sm">
                  {selectionStats[0].startTime.toLocaleString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })} - {selectionStats[0].endTime.toLocaleString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
              
              <div className="space-y-4">
                {selectionStats.map((stat, index) => (
                  <Card key={index}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: stat.color }}
                        />
                        {stat.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Min</div>
                          <div className="font-mono">{stat.min.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Max</div>
                          <div className="font-mono">{stat.max.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Average</div>
                          <div className="font-mono">{stat.avg.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Sum</div>
                          <div className="font-mono">{stat.sum.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Count</div>
                          <div className="font-mono">{stat.count}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Range</div>
                          <div className="font-mono">{(stat.max - stat.min).toFixed(2)}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
