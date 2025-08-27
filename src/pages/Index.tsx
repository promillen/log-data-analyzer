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
import { Progress } from '@/components/ui/progress';
import { TimeSeriesChart } from '@/components/TimeSeriesChart';
import { DatasetControls } from '@/components/DatasetControls';
import { TimeFilters } from '@/components/TimeFilters';
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
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [overlayMode, setOverlayMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('');
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
    console.log(`Raw value before cleaning: "${value}"`);
    
    // Handle Excel-exported CSV format with quotes and equals signs
    // Remove = at start, then remove all quotes
    let cleaned = value.replace(/^=/, '').replace(/"/g, '').trim();
    console.log(`After cleaning: "${cleaned}"`);
    
    if (cleaned === '' || cleaned === 'null' || cleaned === 'undefined') {
      console.log('Value is empty/null/undefined, returning null');
      return null;
    }
    
    const parsed = parseFloat(cleaned);
    console.log(`Parsed float: ${parsed}, isNaN: ${isNaN(parsed)}`);
    
    return isNaN(parsed) ? null : parsed;
  };

  const parseTimestamp = (timestampStr: string): Date | null => {
    // Remove any surrounding quotes first
    const cleanTimestamp = timestampStr.replace(/^"?/, '').replace(/"?$/, '').trim();
    
    console.log(`Parsing timestamp: "${timestampStr}" -> cleaned: "${cleanTimestamp}"`);
    
    // Try ISO format first: YYYY-MM-DD HH:MM:SS
    if (cleanTimestamp.includes('-') && cleanTimestamp.length >= 19) {
      const date = new Date(cleanTimestamp);
      if (!isNaN(date.getTime())) {
        console.log(`Successfully parsed ISO format: ${date}`);
        return date;
      }
    }
    
    // Fallback to original format: DD/MM/YYYY HH.MM or DD/MM/YYYY HH.MM.SS
    const parts = cleanTimestamp.split(/\s+/);
    if (parts.length !== 2) {
      console.warn(`Invalid timestamp format - wrong number of parts: ${cleanTimestamp}`);
      return null;
    }
    
    const [dateStr, timeStr] = parts;
    
    // Parse date (DD/MM/YYYY or DD-MM-YYYY)
    const dateParts = dateStr.split(/[\/\-]/);
    if (dateParts.length !== 3) {
      console.warn(`Invalid date format: ${dateStr}`);
      return null;
    }
    
    const day = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1; // JS months are 0-indexed
    const year = parseInt(dateParts[2]);
    
    // Parse time - handle both HH.MM and HH.MM.SS formats
    const timeParts = timeStr.split(/[\.:]/).map(part => parseInt(part));
    if (timeParts.length < 2) {
      console.warn(`Invalid time format: ${timeStr}`);
      return null;
    }
    
    const hour = timeParts[0] || 0;
    const minute = timeParts[1] || 0;
    const second = timeParts[2] || 0; // Default to 0 if no seconds provided
    
    const date = new Date(year, month, day, hour, minute, second);
    
    // Validate the created date
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date created from: ${timestampStr}`);
      return null;
    }
    
    console.log(`Successfully parsed DD/MM/YYYY format: ${date}`);
    return date;
  };

  const parseDataFile = useCallback(async (fileContent: string, fileName: string, onProgress?: (progress: number) => void): Promise<Dataset> => {
    const lines = fileContent.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('File must have at least a header row and one data row');
    }

    const totalRows = lines.length - 1; // Exclude header row
    onProgress?.(2); // 2% for initial setup

    // Detect delimiter - prioritize comma for CSV, then tab, then semicolon
    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.split(',').length < 2) {
      delimiter = '\t';
      if (firstLine.split('\t').length < 2) {
        delimiter = ';';
      }
    }

    console.log(`Detected delimiter: "${delimiter}" for file: ${fileName}`);
    console.log(`First few lines of file:`, lines.slice(0, 3));
    console.log(`Total rows to process: ${totalRows}`);

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
    let lastReportedProgress = 5;
    
    onProgress?.(5); // 5% for setup complete

    // Process data in chunks to allow UI updates
    const CHUNK_SIZE = 200; // Smaller chunks for more frequent updates
    let processedRows = 0;

    for (let startRow = 1; startRow < lines.length; startRow += CHUNK_SIZE) {
      const endRow = Math.min(startRow + CHUNK_SIZE, lines.length);
      
      // Process chunk
      for (let i = startRow; i < endRow; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Log details only for first 5 rows
        if (i <= 5) {
          console.log(`\nProcessing line ${i}: "${line}"`);
        }
        
        const parts = line.split(delimiter).map(part => part.trim());
        
        if (i <= 5) {
          console.log(`Split into ${parts.length} parts:`, parts);
        }
        
        if (parts.length < 2) {
          if (i <= 5) {
            console.warn(`Skipping line ${i + 1}: insufficient columns`);
          }
          continue;
        }

        const [timestampStr, ...values] = parts;
        
        if (i <= 5) {
          console.log(`Timestamp: "${timestampStr}"`);
          console.log(`Values:`, values);
        }
        
        // Parse timestamp
        const datetime = parseTimestamp(timestampStr);
        if (!datetime || isNaN(datetime.getTime())) {
          if (i <= 5) {
            console.warn(`Invalid timestamp on line ${i + 1}: "${timestampStr}"`);
          }
          invalidRows++;
          continue;
        }

        validRows++;

        // Parse values for each variable
        headers.forEach((header, index) => {
          if (index < values.length) {
            if (i <= 5) {
              console.log(`Processing value for header "${header}": "${values[index]}"`);
            }
            const value = cleanValue(values[index]);
            if (i <= 5) {
              console.log(`Cleaned value: ${value}`);
            }
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

      processedRows = endRow - 1;
      // Ensure progress only increases and update less frequently for smoothness
      const newProgress = Math.min(5 + (processedRows / totalRows) * 90, 95); // 5% to 95%
      
      if (newProgress > lastReportedProgress + 1) { // Only update if progress increased by at least 1%
        onProgress?.(newProgress);
        lastReportedProgress = newProgress;
      }

      // Allow UI to update between chunks - slightly longer pause for smoother animation
      if (startRow + CHUNK_SIZE < lines.length) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }

    onProgress?.(98); // 98% for data processing complete

    console.log(`Parsed ${validRows} valid rows, ${invalidRows} invalid rows from ${fileName}`);

    // Log sample data for first variable
    const firstVariable = headers[0];
    if (variables[firstVariable]) {
      console.log(`Sample data for "${firstVariable}":`, variables[firstVariable].slice(0, 3));
    }

    if (validRows === 0) {
      throw new Error('No valid data rows found');
    }

    const colors: Record<string, string> = {};
    headers.forEach(header => {
      colors[header] = getNextColor();
    });

    onProgress?.(100); // 100% complete

    return {
      fileName,
      headers,
      variables,
      dataCount: validRows,
      colors
    };
  }, []);

  const parseExcelFile = useCallback(async (file: File, onProgress?: (progress: number) => void): Promise<Dataset> => {
    const XLSX = await import('xlsx');
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
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
          
          onProgress?.(50); // 50% for Excel conversion
          
          // Convert to CSV-like format
          const csvContent = jsonData.map((row: any[]) => row.join('\t')).join('\n');
          
          // Create progress wrapper for parseDataFile
          const parseProgress = (progress: number) => {
            onProgress?.(50 + (progress / 2)); // Map 0-100% to 50-100%
          };
          
          const dataset = await parseDataFile(csvContent, file.name, parseProgress);
          resolve(dataset);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read Excel file'));
      reader.readAsArrayBuffer(file);
    });
  }, [parseDataFile]);

  const getCleanFileName = (fileName: string): string => {
    // Remove file extension and clean up the name for use as dataset key
    return fileName.replace(/\.(csv|txt|xlsx|xls)$/i, '');
  };

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const totalFiles = files.length;
    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingText(`Processing ${totalFiles} file${totalFiles > 1 ? 's' : ''}...`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const baseProgress = (i / totalFiles) * 100;
      const fileProgressStep = 100 / totalFiles;
      
      setLoadingText(`Reading ${file.name}...`);
      setLoadingProgress(baseProgress);
      
      try {
        let parsedData: Dataset;
        
        if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
          setLoadingText(`Processing Excel file ${file.name}...`);
          
          // Create progress callback for Excel parsing
          const onExcelProgress = (progress: number) => {
            const adjustedProgress = baseProgress + (fileProgressStep * progress / 100) * 0.9;
            setLoadingProgress(adjustedProgress);
          };
          
          parsedData = await parseExcelFile(file, onExcelProgress);
        } else {
          // Handle .txt, .csv, and other text files
          const fileContent = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
          });
          
          setLoadingText(`Parsing ${file.name}...`);
          
          // Create progress callback for parsing
          const onParseProgress = (progress: number) => {
            const adjustedProgress = baseProgress + (fileProgressStep * progress / 100) * 0.9;
            setLoadingProgress(adjustedProgress);
          };
          
          parsedData = await parseDataFile(fileContent, file.name, onParseProgress);
        }
        
        setLoadingText(`Configuring ${file.name}...`);
        setLoadingProgress(baseProgress + fileProgressStep * 0.95);
        
        // Use clean filename as dataset key
        const cleanFileName = getCleanFileName(file.name);
        setDatasets(prev => ({ ...prev, [cleanFileName]: parsedData }));
        
        // Initialize variable configs - use clean filename as key
        const newConfigs: Record<string, VariableConfig> = {};
        parsedData.headers.forEach(header => {
          const variableId = `${cleanFileName}_${header}`;
          newConfigs[variableId] = {
            enabled: false,
            label: header,
            color: parsedData.colors[header]
          };
        });
        
        setVariableConfigs(prev => ({ ...prev, ...newConfigs }));
        successCount++;
        
        setLoadingProgress(baseProgress + fileProgressStep);
      } catch (error) {
        console.error('Error processing file:', file.name, error);
        errorCount++;
        toast.error(`Error in ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setLoadingProgress(baseProgress + fileProgressStep);
      }
    }

    setIsLoading(false);
    setLoadingProgress(0);
    setLoadingText('');

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
      const underscoreIndex = varId.indexOf('_');
      if (underscoreIndex === -1) return;
      
      const fileName = varId.substring(0, underscoreIndex);
      const variableName = varId.substring(underscoreIndex + 1);
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
        const underscoreIndex = varId.indexOf('_');
        if (underscoreIndex === -1) return;
        
        const fileName = varId.substring(0, underscoreIndex);
        const variableName = varId.substring(underscoreIndex + 1);
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
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-3 rounded-lg">
              <TrendingUp className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent leading-tight py-1">
              Log Data Analyzer
            </h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Professional log data analysis and visualization tool for time series datasets
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
                  Supported timestamp format: YYYY-MM-DD HH:MM:SS or DD/MM/YYYY HH.MM.SS
                </p>
              </div>
              
              {/* Loading Progress */}
              {isLoading && (
                <div className="space-y-3 max-w-md mx-auto">
                  <div className="text-sm font-medium text-blue-700">{loadingText}</div>
                  <Progress value={loadingProgress} className="h-3 transition-all duration-300 ease-out" />
                  <div className="text-xs text-blue-600">{Math.round(loadingProgress)}% complete</div>
                </div>
              )}
              
              <div className="flex flex-wrap gap-3 justify-center">
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                  size="lg"
                >
                  <Upload className="h-5 w-5 mr-2" />
                  Choose Files
                </Button>
                {totalDatasets > 0 && (
                  <>
                    <Button 
                      onClick={clearAllData}
                      disabled={isLoading}
                      variant="outline"
                      size="lg"
                      className="border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-5 w-5 mr-2" />
                      Clear All
                    </Button>
                    <Button 
                      onClick={exportData}
                      disabled={isLoading}
                      variant="outline"
                      size="lg"
                      className="border-green-200 text-green-600 hover:bg-green-50 disabled:opacity-50"
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
          <div className="space-y-6">
            {/* Top Row - Controls side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <DatasetControls
                datasets={datasets}
                variableConfigs={variableConfigs}
                selectedVariables={selectedVariables}
                onVariableConfigChange={setVariableConfigs}
                onSelectedVariablesChange={setSelectedVariables}
                onRemoveDataset={removeDataset}
              />
              
              <TimeFilters
                selectedDays={selectedDays}
                onSelectedDaysChange={setSelectedDays}
                overlayMode={overlayMode}
                onOverlayModeChange={setOverlayMode}
              />
            </div>

            {/* Bottom Row - Chart and Statistics full width */}
            <div className="space-y-6">
              <TimeSeriesChart
                datasets={datasets}
                variableConfigs={variableConfigs}
                selectedVariables={selectedVariables}
                selectedDays={selectedDays}
                overlayMode={overlayMode}
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
