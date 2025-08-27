import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
  selectedDays: number[];
  overlayMode: boolean;
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
  selectedVariables,
  selectedDays,
  overlayMode
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
  
  // Use refs for immediate state tracking in event handlers
  const isDraggingRef = useRef(false);
  const selectionStartRef = useRef<number | null>(null);
  const selectionEndRef = useRef<number | null>(null);

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

    const chartDatasets = selectedVariables.flatMap(variableId => {
      let matchingDatasetKey: string | null = null;
      let matchingDataset: Dataset | null = null;
      
      for (const [datasetKey, dataset] of Object.entries(datasets)) {
        if (variableId.startsWith(datasetKey + '_')) {
          matchingDatasetKey = datasetKey;
          matchingDataset = dataset;
          break;
        }
      }
      
      if (!matchingDatasetKey || !matchingDataset) return [];
      
      const variableName = variableId.substring(matchingDatasetKey.length + 1);
      const config = variableConfigs[variableId];
      const variableData = matchingDataset.variables[variableName];
      
      if (!config || !variableData) return [];

      let data = variableData
        ?.map(d => ({ x: d.datetime.getTime(), y: d.value, date: d.datetime }))
        .filter(d => d.y !== null) || [];

      // Apply day filtering if selectedDays has values
      if (selectedDays.length > 0) {
        data = data.filter(d => {
          const dayOfWeek = d.date.getDay(); // 0 = Sunday, 1 = Monday, etc.
          return selectedDays.includes(dayOfWeek);
        });

        // Sort data by time to ensure proper ordering
        data.sort((a, b) => a.x - b.x);

        // Break connections between non-consecutive days by inserting null values
        if (data.length > 1) {
          const processedData: typeof data = [];
          let currentDayKey = '';
          
          data.forEach((point, index) => {
            const dayKey = point.date.toDateString();
            
            // If this is a new day and not the first point, insert a gap
            if (dayKey !== currentDayKey && index > 0) {
              // Check if there's a time gap > 1 day from the previous point
              const prevPoint = data[index - 1];
              const timeDiff = (point.x - prevPoint.x) / (1000 * 60 * 60); // hours
              
              if (timeDiff > 24) {
                // Insert a null value to break the line
                processedData.push({ x: prevPoint.x + 1, y: null, date: prevPoint.date });
              }
            }
            
            processedData.push(point);
            currentDayKey = dayKey;
          });
          
          data = processedData;
        }
      }

      // Apply overlay mode if enabled - this replaces the filtered data
      if (overlayMode && data.length > 0) {
        // Group data by date
        const groupedByDate: { [dateKey: string]: typeof data } = {};
        
        data.forEach(point => {
          const dateKey = point.date.toDateString();
          if (!groupedByDate[dateKey]) {
            groupedByDate[dateKey] = [];
          }
          groupedByDate[dateKey].push(point);
        });

        // Create separate datasets for each day in overlay mode
        const overlayDatasets: any[] = [];
        const colors = [
          config.color,
          config.color + 'AA', // 66% opacity
          config.color + '77', // 46% opacity
          config.color + '44', // 26% opacity
          config.color + '22'  // 13% opacity
        ];
        
        const lineStyles = [0, [5, 5], [10, 5], [15, 5, 5, 5], [20, 5]]; // Different dash patterns
        
        Object.entries(groupedByDate).forEach(([dateKey, dayData], dayIndex) => {
          // Normalize each day's data to a 24-hour timeline
          const baseDate = new Date('2024-01-01');
          const normalizedData = dayData.map(point => {
            const originalDate = point.date;
            const normalizedTime = new Date(
              baseDate.getFullYear(),
              baseDate.getMonth(), 
              baseDate.getDate(),
              originalDate.getHours(),
              originalDate.getMinutes(),
              originalDate.getSeconds(),
              originalDate.getMilliseconds()
            );
            
            return {
              x: normalizedTime.getTime(),
              y: point.y,
              date: normalizedTime
            };
          }).sort((a, b) => a.x - b.x);

          const dayDate = new Date(dateKey);
          const dayLabel = dayDate.toLocaleDateString('en-GB', { 
            weekday: 'short', 
            day: '2-digit', 
            month: '2-digit' 
          });

          overlayDatasets.push({
            label: cleanLabel + ` (${dayLabel})`,
            data: normalizedData,
            borderColor: colors[dayIndex % colors.length] || config.color,
            backgroundColor: (colors[dayIndex % colors.length] || config.color) + '10',
            borderWidth: dayIndex === 0 ? 2 : 1.5,
            borderDash: lineStyles[dayIndex % lineStyles.length],
            fill: false,
            tension: 0.2,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointBackgroundColor: colors[dayIndex % colors.length] || config.color,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1,
            spanGaps: false,
            yAxisID: config.yAxisGroup || variableId
          });
        });

        return overlayDatasets;
      }

      if (data.length > 3000) {
        const step = Math.ceil(data.length / 1500);
        data = data.filter((_, index) => index % step === 0);
      }

      let cleanLabel = config.label;
      if (cleanLabel.startsWith('deviceData.')) {
        cleanLabel = cleanLabel.substring('deviceData.'.length);
      }

      // Add filtering info to label if filters are active
      let labelSuffix = '';
      if (selectedDays.length > 0 && selectedDays.length < 7) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const selectedDayNames = selectedDays.map(day => dayNames[day]).join(',');
        labelSuffix += ` (${selectedDayNames})`;
      }

      return [{
        label: cleanLabel + labelSuffix,
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
        spanGaps: false, // Don't span gaps to avoid connecting across day boundaries
        yAxisID: config.yAxisGroup || variableId
      }];
    }).filter(dataset => dataset.length > 0).flat();

    if (chartDatasets.length === 0) return;

    // Calculate data time range for smart x-axis formatting
    const allDataPoints = chartDatasets.flatMap(dataset => dataset.data);
    const timeValues = allDataPoints.map(point => point.x);
    const minTime = Math.min(...timeValues);
    const maxTime = Math.max(...timeValues);
    const timeSpanHours = (maxTime - minTime) / (1000 * 60 * 60);
    const timeSpanDays = timeSpanHours / 24;
    
    // Determine appropriate time unit and display format based on data span
    let timeUnit: string;
    let displayFormats: any;
    let maxTicksLimit = 10;
    
    if (overlayMode) {
      // In overlay mode, we're showing a single 24-hour period
      timeUnit = 'hour';
      displayFormats = {
        hour: 'HH:mm',
        minute: 'HH:mm'
      };
      maxTicksLimit = 12;
    } else if (timeSpanDays > 30) {
      // More than a month - show days/months
      timeUnit = 'day';
      displayFormats = {
        day: 'eee dd/MM',
        week: 'dd/MM',
        month: 'MMM yyyy'
      };
      maxTicksLimit = 8;
    } else if (timeSpanDays > 7) {
      // More than a week but less than a month - show date + day name
      timeUnit = 'day';
      displayFormats = {
        day: 'eee dd/MM',
        hour: 'eee dd/MM HH:mm'
      };
      maxTicksLimit = 8;
    } else if (timeSpanDays > 1) {
      // More than a day but less than a week - show date + time + day name
      timeUnit = 'hour';
      displayFormats = {
        hour: 'eee dd/MM HH:mm',
        minute: 'eee HH:mm'
      };
      maxTicksLimit = 10;
    } else {
      // Single day or less - just show time
      timeUnit = 'hour';
      displayFormats = {
        hour: 'HH:mm',
        minute: 'HH:mm'
      };
      maxTicksLimit = 12;
    }

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
              unit: timeUnit,
              displayFormats: displayFormats,
              tooltipFormat: 'dd/MM/yyyy HH:mm'
            },
            title: {
              display: true,
              text: 'Time',
              font: { size: 14, weight: 'bold' }
            },
            ticks: {
              maxTicksLimit: maxTicksLimit,
              color: '#6B7280'
            },
            grid: { color: '#F3F4F6' }
          },
          ...yScales
        },
        plugins: {
          title: {
            display: true,
            text: overlayMode && selectedDays.length > 0 
              ? `Overlaid Data - ${selectedDays.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}`
              : getDateRangeTitle(),
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
          tooltip: { 
            enabled: false,
            external: (context: any) => {
              const { chart, tooltip } = context;
              
              if (tooltip.opacity === 0) {
                setTooltip(prev => ({ ...prev, visible: false }));
                return;
              }

              if (tooltip.dataPoints && tooltip.dataPoints.length > 0) {
                const canvas = chart.canvas;
                const rect = canvas.getBoundingClientRect();
                
                const values = tooltip.dataPoints.map((point: any) => {
                  let cleanLabel = point.dataset.label;
                  return {
                    label: cleanLabel,
                    value: point.parsed.y,
                    color: point.dataset.borderColor
                  };
                });

                const timeStr = new Date(tooltip.dataPoints[0].parsed.x).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: '2-digit', 
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                // Position tooltip next to mouse cursor instead of data point
                const mouseX = chart._lastEvent?.x || tooltip.caretX;
                const mouseY = chart._lastEvent?.y || tooltip.caretY;

                setTooltip({
                  x: mouseX + 15, // Offset from mouse cursor
                  y: mouseY - 10,
                  visible: true,
                  time: timeStr,
                  values
                });
              }
            }
          },
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
              },
              onZoomComplete: ({ chart }: any) => {
                // Recalculate time format based on visible range after zoom
                const xScale = chart.scales.x;
                const visibleMin = xScale.min;
                const visibleMax = xScale.max;
                const visibleSpanHours = (visibleMax - visibleMin) / (1000 * 60 * 60);
                const visibleSpanDays = visibleSpanHours / 24;
                
                let newTimeUnit: string;
                let newDisplayFormats: any;
                let newMaxTicksLimit = 10;
                
                if (visibleSpanDays > 30) {
                  // More than a month visible - show days/months
                  newTimeUnit = 'day';
                  newDisplayFormats = {
                    day: 'eee dd/MM',
                    week: 'dd/MM',
                    month: 'MMM yyyy'
                  };
                  newMaxTicksLimit = 8;
                } else if (visibleSpanDays > 7) {
                  // More than a week visible - show date + day name
                  newTimeUnit = 'day';
                  newDisplayFormats = {
                    day: 'eee dd/MM',
                    hour: 'eee dd/MM HH:mm'
                  };
                  newMaxTicksLimit = 8;
                } else if (visibleSpanDays > 1) {
                  // More than a day visible - show date + time + day name
                  newTimeUnit = 'hour';
                  newDisplayFormats = {
                    hour: 'eee dd/MM HH:mm',
                    minute: 'eee HH:mm'
                  };
                  newMaxTicksLimit = 10;
                } else if (visibleSpanHours > 6) {
                  // More than 6 hours visible - show time with day name
                  newTimeUnit = 'hour';
                  newDisplayFormats = {
                    hour: 'eee HH:mm',
                    minute: 'HH:mm'
                  };
                  newMaxTicksLimit = 12;
                } else {
                  // Less than 6 hours visible - just show detailed time
                  newTimeUnit = 'minute';
                  newDisplayFormats = {
                    minute: 'HH:mm',
                    second: 'HH:mm:ss'
                  };
                  newMaxTicksLimit = 15;
                }
                
                // Update the chart's time configuration
                chart.options.scales.x.time.unit = newTimeUnit;
                chart.options.scales.x.time.displayFormats = newDisplayFormats;
                chart.options.scales.x.ticks.maxTicksLimit = newMaxTicksLimit;
                
                chart.update('none');
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
      console.log('Setting up drag selection listeners for fullscreen chart');
      
      const handleMouseDown = (e: MouseEvent) => {
        console.log('Mouse down event:', { ctrlKey: e.ctrlKey, button: e.button });
        if (e.ctrlKey || e.button !== 0) return; // Let pan handle it or ignore non-left clicks
        
        const rect = canvas.getBoundingClientRect();
        const canvasPosition = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
        const dataX = chartRef.current?.scales.x.getValueForPixel(canvasPosition.x);
        
        console.log('Mouse down - dataX:', dataX);
        if (dataX) {
          e.preventDefault();
          console.log('Starting drag selection');
          
          // Use refs for immediate state
          isDraggingRef.current = true;
          selectionStartRef.current = dataX;
          selectionEndRef.current = dataX;
          
          // Also update state for UI
          setIsSelecting(true);
          setSelectionStart(dataX);
          setSelectionEnd(dataX);
          
          // Clear any existing selection annotation
          if (chartRef.current?.options?.plugins?.annotation?.annotations) {
            chartRef.current.options.plugins.annotation.annotations = {};
          }
        }
      };

      const handleMouseUp = (e: MouseEvent) => {
        console.log('Mouse up event - isDragging:', isDraggingRef.current, 'selectionStart:', selectionStartRef.current, 'selectionEnd:', selectionEndRef.current);
        
        if (isDraggingRef.current && selectionStartRef.current !== null && selectionEndRef.current !== null) {
          const start = Math.min(selectionStartRef.current, selectionEndRef.current);
          const end = Math.max(selectionStartRef.current, selectionEndRef.current);
          
          console.log('Selection range:', { start, end, diff: end - start });
          // Only show stats if there's a meaningful selection (more than 1 minute difference)
          if (end - start > 60000) {
            console.log('Calculating selection stats');
            const stats = calculateSelectionStats(start, end);
            setSelectionStats(stats);
            setShowStats(true);
          } else {
            console.log('Selection too small, not showing stats');
          }
        }
        
        // Reset refs and state
        isDraggingRef.current = false;
        selectionStartRef.current = null;
        selectionEndRef.current = null;
        setIsSelecting(false);
        setSelectionStart(null);
        setSelectionEnd(null);
      };

      const handleMouseMove = (e: MouseEvent) => {
        if (isDraggingRef.current && selectionStartRef.current !== null) {
          const rect = canvas.getBoundingClientRect();
          const canvasPosition = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
          };
          const dataX = chartRef.current?.scales.x.getValueForPixel(canvasPosition.x);
          if (dataX) {
            selectionEndRef.current = dataX;
            setSelectionEnd(dataX);
            
            // Update selection annotation in real-time
            if (chartRef.current?.options?.plugins?.annotation?.annotations) {
              chartRef.current.options.plugins.annotation.annotations.selectionBox = {
                type: 'box',
                xMin: Math.min(selectionStartRef.current, dataX),
                xMax: Math.max(selectionStartRef.current, dataX),
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderColor: 'rgba(59, 130, 246, 0.8)',
                borderWidth: 2,
              };
              chartRef.current.update('none');
            }
          }
        }
      };

      canvas.addEventListener('mousedown', handleMouseDown, { passive: false });
      canvas.addEventListener('mouseup', handleMouseUp);
      canvas.addEventListener('mousemove', handleMouseMove);
      
      // Also listen on document for mouseup to catch when mouse leaves canvas
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('mouseup', handleMouseUp);
        canvas.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
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
  }, [datasets, variableConfigs, selectedVariables, selectedDays, overlayMode]);

  useEffect(() => {
    console.log('=== FULLSCREEN STATE CHANGED ===');
    console.log('isFullscreen:', isFullscreen);
    console.log('fullscreenCanvasRef.current:', fullscreenCanvasRef.current);
    
    if (isFullscreen) {
      // Add a small delay to ensure Dialog content is rendered
      const timer = setTimeout(() => {
        console.log('=== CHECKING FULLSCREEN CANVAS AFTER DELAY ===');
        console.log('fullscreenCanvasRef.current:', fullscreenCanvasRef.current);
        
        if (fullscreenCanvasRef.current) {
          console.log('=== FULLSCREEN CHART SETUP ===');
          console.log('isFullscreen:', isFullscreen);
          console.log('fullscreenCanvasRef.current:', fullscreenCanvasRef.current);
          
          // Use ResizeObserver to detect when the dialog is fully rendered
          const canvas = fullscreenCanvasRef.current;
          const container = canvas.parentElement;
          
          if (container) {
            console.log('Container found, setting up ResizeObserver...');
            
            const resizeObserver = new ResizeObserver((entries) => {
              for (let entry of entries) {
                const { width, height } = entry.contentRect;
                console.log('Container resized to:', width, 'x', height);
                
                if (width > 0 && height > 0) {
                  console.log('Valid size detected, creating chart...');
                  
                  // Set canvas size
                  canvas.width = width;
                  canvas.height = height;
                  canvas.style.width = '100%';
                  canvas.style.height = '100%';
                  
                  console.log('Canvas dimensions set to:', canvas.width, 'x', canvas.height);
                  
                  // Create chart with a small delay
                  setTimeout(async () => {
                    try {
                      console.log('Calling createChart...');
                      await createChart(canvas, fullscreenChartRef, true);
                      console.log('✅ Fullscreen chart created successfully!');
                    } catch (error) {
                      console.error('❌ Error creating fullscreen chart:', error);
                    }
                  }, 100);
                }
              }
            });
            
            resizeObserver.observe(container);
          } else {
            console.warn('No container found for fullscreen canvas');
          }
        } else {
          console.warn('Canvas not available after timeout');
        }
      }, 100); // Delay to ensure DOM is ready
      
      return () => {
        if (fullscreenChartRef.current) {
          fullscreenChartRef.current.destroy();
          fullscreenChartRef.current = null;
        }
        clearTimeout(timer);
      };
    }
  }, [isFullscreen, datasets, variableConfigs, selectedVariables, selectedDays, overlayMode]);

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
              <Dialog open={isFullscreen} onOpenChange={(open) => {
                console.log('=== DIALOG STATE CHANGE ===');
                console.log('Dialog open changed to:', open);
                setIsFullscreen(open);
              }}>
                <DialogContent className="max-w-[95vw] h-[95vh] p-6">
                  <DialogTitle className="sr-only">Chart Fullscreen View</DialogTitle>
                  <DialogDescription className="sr-only">
                    Interactive fullscreen chart with drag selection capabilities
                  </DialogDescription>
                  
                  <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                      <h2 className="text-lg font-semibold">Chart Fullscreen View</h2>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs">
                          <ZoomIn className="h-3 w-3 mr-1" />
                          Scroll to zoom
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          <Calculator className="h-3 w-3 mr-1" />
                          Drag for selection
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          <Move className="h-3 w-3 mr-1" />
                          Ctrl + drag to pan
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          <Maximize2 className="h-3 w-3 mr-1" />
                          Double click for fullscreen
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        isDraggingRef.current = false;
                        selectionStartRef.current = null;
                        selectionEndRef.current = null;
                        setIsSelecting(false);
                        setSelectionStart(null);
                        setSelectionEnd(null);
                        setShowStats(false);
                        
                        // Clear annotation from chart
                        if (fullscreenChartRef.current?.options?.plugins?.annotation?.annotations) {
                          fullscreenChartRef.current.options.plugins.annotation.annotations = {};
                          fullscreenChartRef.current.update('none');
                        }
                      }}
                    >
                      Clear Selection
                    </Button>
                  </div>
                  
                  <div className="relative w-full" style={{ height: 'calc(95vh - 120px)' }}>
                    <canvas 
                      ref={fullscreenCanvasRef} 
                      className="w-full h-full border border-gray-200 rounded" 
                      style={{ minHeight: '400px' }}
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
                Ctrl + drag to pan
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Maximize2 className="h-3 w-3 mr-1" />
                Double click for fullscreen
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
          <DialogTitle>Selection Statistics</DialogTitle>
          <DialogDescription>
            Statistical analysis of the selected time range for each variable
          </DialogDescription>
          
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
