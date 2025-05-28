import { useEffect, useRef } from 'react';
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
}

interface TimeSeriesChartProps {
  datasets: Record<string, Dataset>;
  variableConfigs: Record<string, VariableConfig>;
  selectedVariables: string[];
}

export const TimeSeriesChart = ({
  datasets,
  variableConfigs,
  selectedVariables
}: TimeSeriesChartProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<any>(null);

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

      // Prepare chart data
      const chartDatasets = selectedVariables.map(variableId => {
        const [fileName, variableName] = variableId.split('_');
        const dataset = datasets[fileName];
        const config = variableConfigs[variableId];
        
        if (!dataset || !config) return null;

        const data = dataset.variables[variableName]
          ?.map(d => ({
            x: d.datetime.getTime(),
            y: d.value
          }))
          .filter(d => d.y !== null) || [];

        return {
          label: `${config.label} (${fileName})`,
          data,
          borderColor: config.color,
          backgroundColor: config.color + '20',
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 1,
          pointHoverRadius: 4,
          spanGaps: true,
          yAxisID: variableId
        };
      }).filter(Boolean);

      // Create Y-axes for each variable
      const yScales: any = {};
      selectedVariables.forEach((variableId, index) => {
        const config = variableConfigs[variableId];
        if (!config) return;

        yScales[variableId] = {
          type: 'linear',
          position: index % 2 === 0 ? 'left' : 'right',
          title: {
            display: true,
            text: config.label,
            color: config.color
          },
          min: config.yMin,
          max: config.yMax,
          grid: {
            drawOnChartArea: index === 0 // Only show grid for first axis
          },
          ticks: {
            color: config.color
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
          animation: {
            duration: 750,
            easing: 'easeInOutQuart'
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
                maxTicksLimit: 15,
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
              mode: 'index',
              intersect: false,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              titleColor: '#fff',
              bodyColor: '#fff',
              borderColor: '#374151',
              borderWidth: 1,
              cornerRadius: 8,
              callbacks: {
                title: function(context: any) {
                  if (context.length > 0) {
                    const date = new Date(context[0].parsed.x);
                    return date.toLocaleString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                  }
                  return '';
                }
              }
            },
            zoom: {
              pan: {
                enabled: true,
                mode: 'x'
              },
              zoom: {
                wheel: {
                  enabled: true
                },
                pinch: {
                  enabled: true
                },
                mode: 'x'
              }
            }
          },
          interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false
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
          <canvas ref={canvasRef} className="w-full h-full" />
        </div>
      </CardContent>
    </Card>
  );
};
