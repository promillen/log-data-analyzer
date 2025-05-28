
import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Upload, Trash2, Download, BarChart3, Settings, TrendingUp } from 'lucide-react';
import { TimeSeriesChart } from '@/components/TimeSeriesChart';
import { DatasetControls } from '@/components/DatasetControls';
import { StatisticsPanel } from '@/components/StatisticsPanel';

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

const Index = () => {
  const [datasets, setDatasets] = useState<Record<string, Dataset>>({});
  const [variableConfigs, setVariableConfigs] = useState<Record<string, VariableConfig>>({});
  const [selectedVariables, setSelectedVariables] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const colorPalette = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
    '#F97316', '#06B6D4', '#84CC16', '#EC4899', '#6B7280'
  ];
  let colorIndex = 0;

  const getNextColor = () => {
    const color = colorPalette[colorIndex % colorPalette.length];
    colorIndex++;
    return color;
  };

  const parseDataFile = useCallback((fileContent: string, fileName: string): Dataset => {
    const lines = fileContent.trim().split('\n');
    if (lines.length === 0) {
      throw new Error('No data found in file');
    }

    // Detect delimiter
    const firstLine = lines[0];
    let delimiter = '\t';
    let firstLineParts = firstLine.split(delimiter);
    
    if (firstLineParts.length < 3) {
      delimiter = ',';
      firstLineParts = firstLine.split(delimiter);
    }

    let hasHeader = false;
    let headers: string[] = [];
    let dataStartIndex = 0;

    // Check for header
    const effectiveColumns = firstLineParts.filter(col => col.trim() !== '');
    if (effectiveColumns.length >= 3) {
      const potentialValueColumn = effectiveColumns[2];
      if (isNaN(parseFloat(potentialValueColumn))) {
        hasHeader = true;
        headers = effectiveColumns.slice(2);
        dataStartIndex = 1;
      }
    }

    if (!hasHeader) {
      const dataLine = lines[1] || lines[0];
      const dataParts = dataLine.split(delimiter).filter(col => col.trim() !== '');
      for (let i = 2; i < dataParts.length; i++) {
        headers.push(`Variable ${i - 1}`);
      }
    }

    const variables: Record<string, DataPoint[]> = {};
    headers.forEach(header => {
      variables[header] = [];
    });

    let validRows = 0;
    for (let i = dataStartIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(delimiter);
      const effectiveParts = parts.filter(part => part.trim() !== '');
      
      if (effectiveParts.length < 3) continue;

      const [dateStr, timeStr, ...values] = effectiveParts;

      // Parse date and time
      let dateParts = dateStr.split('/');
      if (dateParts.length !== 3) {
        dateParts = dateStr.split('-');
      }

      let timeParts = timeStr.split('.');
      if (timeParts.length !== 2) {
        timeParts = timeStr.split(':');
      }

      if (dateParts.length !== 3 || timeParts.length !== 2) {
        continue;
      }

      const day = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]) - 1;
      const year = parseInt(dateParts[2]);
      const hour = parseInt(timeParts[0]);
      const minute = parseInt(timeParts[1]);

      const datetime = new Date(year, month, day, hour, minute);
      validRows++;

      headers.forEach((header, index) => {
        if (index < values.length) {
          const value = parseFloat(values[index]);
          variables[header].push({
            datetime: datetime,
            value: isNaN(value) ? null : value
          });
        }
      });
    }

    const colors: Record<string, string> = {};
    headers.forEach(header => {
      colors[header] = getNextColor();
    });

    return {
      fileName,
      headers,
      variables,
      dataCount: validRows,
      colors
    };
  }, []);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let successCount = 0;
    let errorCount = 0;
    let processedCount = 0;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const fileContent = e.target?.result as string;
          const parsedData = parseDataFile(fileContent, file.name);
          
          setDatasets(prev => ({ ...prev, [file.name]: parsedData }));
          
          // Initialize variable configs
          const newConfigs: Record<string, VariableConfig> = {};
          parsedData.headers.forEach(header => {
            const variableId = `${file.name}_${header}`;
            newConfigs[variableId] = {
              enabled: false,
              label: header,
              color: parsedData.colors[header]
            };
          });
          
          setVariableConfigs(prev => ({ ...prev, ...newConfigs }));
          successCount++;
        } catch (error) {
          console.error('Error processing file:', file.name, error);
          errorCount++;
          toast.error(`Error in ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
          processedCount++;
          
          if (processedCount === files.length) {
            if (successCount > 0) {
              toast.success(`Successfully loaded ${successCount} file(s)`);
            }
          }
        }
      };
      
      reader.onerror = () => {
        errorCount++;
        processedCount++;
        toast.error(`Error reading ${file.name}`);
      };
      
      reader.readAsText(file);
    });

    event.target.value = '';
  }, [parseDataFile]);

  const clearAllData = () => {
    setDatasets({});
    setVariableConfigs({});
    setSelectedVariables([]);
    colorIndex = 0;
    toast.success('All data cleared');
  };

  const removeDataset = (fileName: string) => {
    setDatasets(prev => {
      const { [fileName]: removed, ...rest } = prev;
      return rest;
    });
    
    // Remove variable configs for this dataset
    setVariableConfigs(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(key => {
        if (key.startsWith(`${fileName}_`)) {
          delete updated[key];
        }
      });
      return updated;
    });
    
    // Remove from selected variables
    setSelectedVariables(prev => 
      prev.filter(varId => !varId.startsWith(`${fileName}_`))
    );
    
    toast.success(`Removed dataset: ${fileName}`);
  };

  const exportData = () => {
    if (selectedVariables.length === 0) {
      toast.error('Please select variables to export');
      return;
    }

    const csvData = [];
    const headers = ['Date', 'Time', ...selectedVariables.map(varId => variableConfigs[varId]?.label || varId)];
    csvData.push(headers.join(','));

    // Get all unique timestamps
    const allTimestamps = new Set<number>();
    selectedVariables.forEach(varId => {
      const [fileName, variableName] = varId.split('_');
      const dataset = datasets[fileName];
      if (dataset && dataset.variables[variableName]) {
        dataset.variables[variableName].forEach(point => {
          allTimestamps.add(point.datetime.getTime());
        });
      }
    });

    const sortedTimestamps = Array.from(allTimestamps).sort();

    sortedTimestamps.forEach(timestamp => {
      const date = new Date(timestamp);
      const row = [
        date.toLocaleDateString('en-GB'),
        date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      ];

      selectedVariables.forEach(varId => {
        const [fileName, variableName] = varId.split('_');
        const dataset = datasets[fileName];
        const dataPoint = dataset?.variables[variableName]?.find(
          point => point.datetime.getTime() === timestamp
        );
        row.push(dataPoint?.value?.toString() || '');
      });

      csvData.push(row.join(','));
    });

    const blob = new Blob([csvData.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timeseries_data.csv';
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success('Data exported successfully');
  };

  const totalDatasets = Object.keys(datasets).length;
  const totalVariables = Object.values(datasets).reduce((sum, dataset) => sum + dataset.headers.length, 0);
  const totalDataPoints = Object.values(datasets).reduce((sum, dataset) => sum + dataset.dataCount, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <div className="p-3 bg-blue-600 rounded-xl">
              <TrendingUp className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Time Series Visualizer
            </h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Advanced multi-variable time series data visualization with customizable charts and comprehensive analytics
          </p>
        </div>

        {/* Stats Cards */}
        {totalDatasets > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-8 w-8" />
                  <div>
                    <p className="text-blue-100">Datasets</p>
                    <p className="text-2xl font-bold">{totalDatasets}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <Settings className="h-8 w-8" />
                  <div>
                    <p className="text-green-100">Variables</p>
                    <p className="text-2xl font-bold">{totalVariables}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-8 w-8" />
                  <div>
                    <p className="text-purple-100">Data Points</p>
                    <p className="text-2xl font-bold">{totalDataPoints.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Upload Section */}
        <Card className="border-2 border-dashed border-blue-300 bg-blue-50/50">
          <CardContent className="p-8">
            <div className="text-center space-y-4">
              <Upload className="h-12 w-12 text-blue-500 mx-auto" />
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Load Data Files</h3>
                <p className="text-gray-600 mt-2">
                  Upload comma or tab-separated files with format: Date, Time, Variable1, Variable2, ...
                </p>
              </div>
              <div className="flex flex-wrap gap-3 justify-center">
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-blue-600 hover:bg-blue-700"
                  size="lg"
                >
                  <Upload className="h-5 w-5 mr-2" />
                  Choose Files
                </Button>
                {totalDatasets > 0 && (
                  <>
                    <Button 
                      onClick={clearAllData}
                      variant="outline"
                      size="lg"
                      className="border-red-200 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-5 w-5 mr-2" />
                      Clear All
                    </Button>
                    <Button 
                      onClick={exportData}
                      variant="outline"
                      size="lg"
                      className="border-green-200 text-green-600 hover:bg-green-50"
                    >
                      <Download className="h-5 w-5 mr-2" />
                      Export Data
                    </Button>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        {totalDatasets > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Controls Panel */}
            <div className="lg:col-span-1">
              <DatasetControls
                datasets={datasets}
                variableConfigs={variableConfigs}
                selectedVariables={selectedVariables}
                onVariableConfigChange={setVariableConfigs}
                onSelectedVariablesChange={setSelectedVariables}
                onRemoveDataset={removeDataset}
              />
            </div>

            {/* Chart and Statistics */}
            <div className="lg:col-span-3 space-y-6">
              <TimeSeriesChart
                datasets={datasets}
                variableConfigs={variableConfigs}
                selectedVariables={selectedVariables}
              />
              
              <StatisticsPanel
                datasets={datasets}
                variableConfigs={variableConfigs}
                selectedVariables={selectedVariables}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
