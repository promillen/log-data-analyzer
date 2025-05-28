
import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, ZoomIn, Move } from 'lucide-react';

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
  yAxisGroup?: string; // New property for grouping variables on same Y-axis
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

export const TimeSeriesChart = ({
  datasets,
  variableConfigs,
  selectedVariables
}: TimeSeriesChartProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<any>(null);
  const [tooltip, setTooltip] = useState<TooltipData>({
    x: 0,
    y: 0,
    visible: false,
    time: '',
    values: []
  });

  useEffect(() => {
    const loadChartJS = async () => {
      if (typeof window === 'undefined') return;
      
      // Dynamically import Chart.js to avoid SSR issues
      const [
        { Chart, registerables },
        { default: zoomPlugin }
      ] = await Promise.all([
        import('chart.js'),
        import('chartjs-plugin-zoom')
      ]);

      // Import the date adapter separately
      await import('chartjs-adapter-date-fns');

      Chart.register(...registerables, zoomPlugin);

      if (!canvasRef.current) return;

      // Destroy existing chart
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }

      if (selectedVariables.length === 0) {
        return;
      }

      // Group variables by Y-axis
      const yAxisGroups: Record<string, string[]> = {};
      selectedVariables.forEach(variableId => {
        const config = variableConfigs[variableId];
        if (!config) return;
        
        const groupKey = config.yAxisGroup || variableId; // Default to unique axis if no group
        if (!yAxisGroups[groupKey]) {
          yAxisGroups[groupKey] = [];
        }
        yAxisGroups[groupKey].push(variableId);
      });

      // Prepare chart data with optimized data processing
      const chartDatasets = selectedVariables.map(variableId => {
        const [fileName, variableName] = variableId.split('_');
        const dataset = datasets[fileName];
        const config = variableConfigs[variableId];
        
        if (!dataset || !config) return null;

        // Optimize data by filtering out null values and decimating if needed
        let data = dataset.variables[variableName]
          ?.map(d => ({
            x: d.datetime.getTime(),
            y: d.value
          }))
          .filter(d => d.y !== null) || [];

        // Decimate data if there are too many points for better performance
        if (data.length > 3000) {
          const step = Math.ceil(data.length / 1500);
          data = data.filter((_, index) => index % step === 0);
        }

        const yAxisId = config.yAxisGroup || variableId;

        return {
          label: `${config.label} (${fileName})`,
          data,
          borderColor: config.color,
          backgroundColor: config.color + '20',
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: config.color,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          spanGaps: true,
          yAxisID: yAxisId
        };
      }).filter(Boolean);

      // Create Y-axes for each group
      const yScales: any = {};
      const groupKeys = Object.keys(yAxisGroups);
      
      groupKeys.forEach((groupKey, index) => {
        const variablesInGroup = yAxisGroups[groupKey];
        const firstVariable = variablesInGroup[0];
        const config = variableConfigs[firstVariable];
        
        if (!config) return;

        // Determine label for the axis
        let axisLabel = config.label;
        if (variablesInGroup.length > 1) {
          // If multiple variables share this axis, show all labels
          axisLabel = variablesInGroup
            .map(varId => variableConfigs[varId]?.label)
            .filter(Boolean)
            .join(' / ');
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
            drawOnChartArea: index === 0 // Only show grid for first axis
          },
          ticks: {
            color: config.color,
            maxTicksLimit: 8
          }
        };
      });

      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      chartInstanceRef.current = new Chart(ctx, {
        type: 'line',
        data: {
          datasets: chartDatasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: {
            mode: 'index',
            intersect: false
          },
          elements: {
            line: {
              tension: 0.1
            },
            point: {
              radius: 3,
              hoverRadius: 6
            }
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
                font: {
                  size: 14,
                  weight: 'bold'
                }
              },
              ticks: {
                maxTicksLimit: 10,
                color: '#6B7280'
              },
              grid: {
                color: '#F3F4F6'
              }
            },
            ...yScales
          },
          plugins: {
            title: {
              display: true,
              text: 'Time Series Data Visualization',
              font: {
                size: 18,
                weight: 'bold'
              },
              color: '#374151'
            },
            legend: {
              display: true,
              position: 'top',
              labels: {
                usePointStyle: true,
                padding: 20,
                font: {
                  size: 12
                }
              }
            },
            tooltip: {
              enabled: false // Disable default tooltip
            },
            zoom: {
              pan: {
                enabled: true,
                mode: 'x'
              },
              zoom: {
                wheel: {
                  enabled: true,
                  speed: 0.1
                },
                pinch: {
                  enabled: true
                },
                mode: 'x',
                onZoomStart: () => {
                  setTooltip(prev => ({ ...prev, visible: false }));
                  return true;
                }
              },
              limits: {
                x: {
                  minRange: 30 * 1000 // Minimum 30 seconds range
                }
              }
            }
          },
          onHover: (event, elements, chart) => {
            if (!event.native || !canvasRef.current) return;

            const nativeEvent = event.native as MouseEvent;
            const rect = canvasRef.current.getBoundingClientRect();
            const x = nativeEvent.clientX - rect.left;
            const y = nativeEvent.clientY - rect.top;

            // Get the position in chart coordinates
            const canvasPosition = {
              x: nativeEvent.offsetX,
              y: nativeEvent.offsetY
            };
            const dataX = chart.scales.x.getValueForPixel(canvasPosition.x);

            if (!dataX) {
              setTooltip(prev => ({ ...prev, visible: false }));
              return;
            }

            // Find closest data points for all datasets
            const values: Array<{ label: string; value: number; color: string }> = [];
            
            chartDatasets.forEach((dataset: any) => {
              if (!dataset?.data) return;
              
              // Find closest point
              let closest = dataset.data[0];
              let minDiff = Math.abs(closest.x - dataX);
              
              dataset.data.forEach((point: any) => {
                const diff = Math.abs(point.x - dataX);
                if (diff < minDiff) {
                  minDiff = diff;
                  closest = point;
                }
              });

              if (closest && minDiff < 60000) { // Within 1 minute
                values.push({
                  label: dataset.label,
                  value: closest.y,
                  color: dataset.borderColor
                });
              }
            });

            if (values.length > 0) {
              const time = new Date(dataX).toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              });

              setTooltip({
                x: x + 10,
                y: y - 10,
                visible: true,
                time,
                values
              });
            } else {
              setTooltip(prev => ({ ...prev, visible: false }));
            }

            // Update cursor
            canvasRef.current.style.cursor = values.length > 0 ? 'crosshair' : 'default';
          }
        }
      });
    };

    loadChartJS();

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [datasets, variableConfigs, selectedVariables]);

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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5" />
            Chart View
          </CardTitle>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-xs">
              <ZoomIn className="h-3 w-3 mr-1" />
              Scroll to zoom
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Move className="h-3 w-3 mr-1" />
              Drag to pan
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
                top: `${tooltip.y}px`,
                transform: tooltip.x > 200 ? 'translateX(-100%)' : 'translateX(0)'
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
  );
};
