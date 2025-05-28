
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, TrendingUp, TrendingDown, Activity } from 'lucide-react';

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

interface StatisticsPanelProps {
  datasets: Record<string, Dataset>;
  variableConfigs: Record<string, VariableConfig>;
  selectedVariables: string[];
}

export const StatisticsPanel = ({
  datasets,
  variableConfigs,
  selectedVariables
}: StatisticsPanelProps) => {
  if (selectedVariables.length === 0) {
    return null;
  }

  const calculateStats = (variableId: string) => {
    // Split only on the first underscore to handle variable names with dots
    const underscoreIndex = variableId.indexOf('_');
    if (underscoreIndex === -1) {
      console.warn('Invalid variable ID format:', variableId);
      return null;
    }
    
    const fileName = variableId.substring(0, underscoreIndex);
    const variableName = variableId.substring(underscoreIndex + 1);
    
    const dataset = datasets[fileName];
    const config = variableConfigs[variableId];
    
    if (!dataset || !config) return null;

    const values = dataset.variables[variableName]
      ?.filter(d => d.value !== null)
      .map(d => d.value!) || [];

    if (values.length === 0) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    
    // Calculate standard deviation
    const variance = values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Calculate median
    const sortedValues = [...values].sort((a, b) => a - b);
    const median = sortedValues.length % 2 === 0
      ? (sortedValues[sortedValues.length / 2 - 1] + sortedValues[sortedValues.length / 2]) / 2
      : sortedValues[Math.floor(sortedValues.length / 2)];

    return {
      min,
      max,
      avg,
      median,
      stdDev,
      count: values.length,
      range: max - min
    };
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Statistics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {selectedVariables.map(variableId => {
            const config = variableConfigs[variableId];
            const stats = calculateStats(variableId);
            
            if (!config || !stats) return null;

            return (
              <Card key={variableId} className="border border-gray-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 rounded-full border-2"
                      style={{ backgroundColor: config.color, borderColor: config.color }}
                    />
                    <h4 className="font-semibold text-sm truncate">{config.label}</h4>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-green-600">
                        <TrendingUp className="h-3 w-3" />
                        <span className="text-xs text-gray-600">Max</span>
                      </div>
                      <p className="font-semibold">{stats.max.toFixed(3)}</p>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-red-600">
                        <TrendingDown className="h-3 w-3" />
                        <span className="text-xs text-gray-600">Min</span>
                      </div>
                      <p className="font-semibold">{stats.min.toFixed(3)}</p>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-blue-600">
                        <Activity className="h-3 w-3" />
                        <span className="text-xs text-gray-600">Average</span>
                      </div>
                      <p className="font-semibold">{stats.avg.toFixed(3)}</p>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-purple-600">
                        <BarChart3 className="h-3 w-3" />
                        <span className="text-xs text-gray-600">Median</span>
                      </div>
                      <p className="font-semibold">{stats.median.toFixed(3)}</p>
                    </div>
                    
                    <div className="space-y-1">
                      <span className="text-xs text-gray-600">Std Dev</span>
                      <p className="font-semibold">{stats.stdDev.toFixed(3)}</p>
                    </div>
                    
                    <div className="space-y-1">
                      <span className="text-xs text-gray-600">Range</span>
                      <p className="font-semibold">{stats.range.toFixed(3)}</p>
                    </div>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <Badge variant="secondary" className="text-xs">
                      {stats.count.toLocaleString()} data points
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
