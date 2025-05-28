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

  const cleanValue = (value: string): number | null => {
    // Handle both quoted values like ="70.8" and plain numbers like 0 or 1722.54
    const cleaned = value.replace(/^=?"?/, '').replace(/"?$/, '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  };

  const parseTimestamp = (timestampStr: string): Date | null => {
    // Handle formats like: 21/05/2025 23.59 or 21/05/2025 23.59.48
    const cleanTimestamp = timestampStr.trim();
    
    // Split by space to separate date and time
    const parts = cleanTimestamp.split(/\s+/);
    if (parts.length !== 2) return null;
    
    const [dateStr, timeStr] = parts;
    
    // Parse date (DD/MM/YYYY or DD-MM-YYYY)
    const dateParts = dateStr.split(/[\/\-]/);
    if (dateParts.length !== 3) return null;
    
    const day = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1; // JS months are 0-indexed
    const year = parseInt(dateParts[2]);
    
    // Parse time - handle both HH.MM and HH.MM.SS formats
    const timeParts = timeStr.split(/[\.:]/).map(part => parseInt(part));
    if (timeParts.length < 2) return null;
    
    const hour = timeParts[0] || 0;
    const minute = timeParts[1] || 0;
    const second = timeParts[2] || 0; // Default to 0 if no seconds provided
    
    const date = new Date(year, month, day, hour, minute, second);
    
    // Validate the created date
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date created from: ${timestampStr}`);
      return null;
    }
    
    return date;
  };

  const parseExcelFile = useCallback(async (file: File): Promise<Dataset> => {
    const XLSX = await import('xlsx');
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Use first sheet
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          
          // Convert to JSON with header row
          const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          
          if (jsonData.length < 2) {
            throw new Error('Excel file must have at least a header row and one data row');
          }
          
          // Convert to CSV-like format
          const csvContent = jsonData.map((row: any[]) => row.join('\t')).join('\n');
          const dataset = parseDataFile(csvContent, file.name);
          resolve(dataset);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read Excel file'));
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const parseDataFile = useCallback((fileContent: string, fileName: string): Dataset => {
    const lines = fileContent.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('File must have at least a header row and one data row');
    }

    // Detect delimiter - try tab first, then comma, then semicolon
    const firstLine = lines[0];
    let delimiter = '\t';
    if (firstLine.split('\t').length < 2) {
      delimiter = ',';
      if (firstLine.split(',').length < 2) {
        delimiter = ';';
      }
    }

    console.log(`Detected delimiter: "${delimiter}" for file: ${fileName}`);

    // Parse header
    const headerParts = lines[0].split(delimiter).map(h => h.trim());
    if (headerParts.length < 2) {
      throw new Error('File must have at least timestamp and one variable column');
    }

    // First column should be timestamp, rest are variables
    const headers = headerParts.slice(1);
    console.log(`Found headers: ${headers.join(', ')}`);
    
    const variables: Record<string, DataPoint[]> = {};
    headers.forEach(header => {
      variables[header] = [];
    });

    let validRows = 0;
    let invalidRows = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(delimiter).map(part => part.trim());
      if (parts.length < 2) {
        console.warn(`Skipping line ${i + 1}: insufficient columns`);
        continue;
      }

      const [timestampStr, ...values] = parts;
      
      // Parse timestamp
      const datetime = parseTimestamp(timestampStr);
      if (!datetime || isNaN(datetime.getTime())) {
        console.warn(`Invalid timestamp on line ${i + 1}: "${timestampStr}"`);
        invalidRows++;
        continue;
      }

      validRows++;

      // Parse values for each variable
      headers.forEach((header, index) => {
        if (index < values.length) {
          const value = cleanValue(values[index]);
          variables[header].push({
            datetime: datetime,
            value: value
          });
        } else {
          variables[header].push({
            datetime: datetime,
            value: null
          });
        }
      });
    }

    console.log(`Parsed ${validRows} valid rows, ${invalidRows} invalid rows from ${fileName}`);

    if (validRows === 0) {
      throw new Error('No valid data rows found');
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

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let successCount = 0;
    let errorCount = 0;
    let processedCount = 0;

    for (const file of Array.from(files)) {
      try {
        let parsedData: Dataset;
        
        if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
          parsedData = await parseExcelFile(file);
        } else {
          // Handle .txt, .csv, and other text files
          const fileContent = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
          });
          
          parsedData = parseDataFile(fileContent, file.name);
        }
        
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
      }
    }

    if (successCount > 0) {
      toast.success(`Successfully loaded ${successCount} file(s)`);
    }

    event.target.value = '';
  }, [parseDataFile, parseExcelFile]);

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
                  Upload .txt, .csv, or Excel files with format: timestamp, variable1, variable2, ...
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Supported timestamp format: DD/MM/YYYY HH.MM.SS
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
                accept=".txt,.csv,.xlsx,.xls"
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
