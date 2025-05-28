
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Trash2, Palette, BarChart } from 'lucide-react';

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

interface DatasetControlsProps {
  datasets: Record<string, Dataset>;
  variableConfigs: Record<string, VariableConfig>;
  selectedVariables: string[];
  onVariableConfigChange: (configs: Record<string, VariableConfig>) => void;
  onSelectedVariablesChange: (variables: string[]) => void;
  onRemoveDataset: (fileName: string) => void;
}

export const DatasetControls = ({
  datasets,
  variableConfigs,
  selectedVariables,
  onVariableConfigChange,
  onSelectedVariablesChange,
  onRemoveDataset
}: DatasetControlsProps) => {
  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(new Set());

  const toggleDataset = (fileName: string) => {
    const newExpanded = new Set(expandedDatasets);
    if (newExpanded.has(fileName)) {
      newExpanded.delete(fileName);
    } else {
      newExpanded.add(fileName);
    }
    setExpandedDatasets(newExpanded);
  };

  const updateVariableConfig = (variableId: string, updates: Partial<VariableConfig>) => {
    const newConfigs = {
      ...variableConfigs,
      [variableId]: { ...variableConfigs[variableId], ...updates }
    };
    onVariableConfigChange(newConfigs);

    // Update selected variables
    if (updates.enabled !== undefined) {
      if (updates.enabled) {
        onSelectedVariablesChange([...selectedVariables, variableId]);
      } else {
        onSelectedVariablesChange(selectedVariables.filter(id => id !== variableId));
      }
    }
  };

  const selectAllVariables = (fileName: string, select: boolean) => {
    const dataset = datasets[fileName];
    if (!dataset) return;

    const updates: Record<string, VariableConfig> = { ...variableConfigs };
    const newSelected = [...selectedVariables];

    dataset.headers.forEach(header => {
      const variableId = `${fileName}_${header}`;
      if (updates[variableId]) {
        updates[variableId] = { ...updates[variableId], enabled: select };
        
        if (select && !newSelected.includes(variableId)) {
          newSelected.push(variableId);
        } else if (!select) {
          const index = newSelected.indexOf(variableId);
          if (index > -1) {
            newSelected.splice(index, 1);
          }
        }
      }
    });

    onVariableConfigChange(updates);
    onSelectedVariablesChange(newSelected);
  };

  if (Object.keys(datasets).length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <BarChart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No datasets loaded. Upload files to get started.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart className="h-5 w-5" />
          Dataset Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-300px)]">
          <div className="p-4 space-y-4">
            {Object.entries(datasets).map(([fileName, dataset]) => {
              const isExpanded = expandedDatasets.has(fileName);
              const datasetVariables = dataset.headers.map(header => `${fileName}_${header}`);
              const selectedInDataset = datasetVariables.filter(varId => 
                variableConfigs[varId]?.enabled
              ).length;

              return (
                <Card key={fileName} className="border border-gray-200">
                  <Collapsible open={isExpanded} onOpenChange={() => toggleDataset(fileName)}>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="pb-2 cursor-pointer hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <div>
                              <p className="font-semibold text-sm truncate max-w-[180px]" title={fileName}>
                                {fileName}
                              </p>
                              <div className="flex gap-2 mt-1">
                                <Badge variant="secondary" className="text-xs">
                                  {dataset.dataCount} points
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {selectedInDataset}/{dataset.headers.length} vars
                                </Badge>
                              </div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveDataset(fileName);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-4">
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7"
                              onClick={() => selectAllVariables(fileName, true)}
                            >
                              Select All
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7"
                              onClick={() => selectAllVariables(fileName, false)}
                            >
                              Clear All
                            </Button>
                          </div>
                          
                          <div className="space-y-3">
                            {dataset.headers.map(header => {
                              const variableId = `${fileName}_${header}`;
                              const config = variableConfigs[variableId];
                              if (!config) return null;

                              return (
                                <div key={variableId} className="space-y-2 p-3 bg-gray-50 rounded-lg">
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      checked={config.enabled}
                                      onCheckedChange={(checked) =>
                                        updateVariableConfig(variableId, { enabled: Boolean(checked) })
                                      }
                                    />
                                    <div className="flex-1 min-w-0">
                                      <Input
                                        value={config.label}
                                        onChange={(e) =>
                                          updateVariableConfig(variableId, { label: e.target.value })
                                        }
                                        className="h-8 text-sm"
                                        placeholder="Variable name"
                                      />
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Palette className="h-3 w-3 text-gray-400" />
                                      <input
                                        type="color"
                                        value={config.color}
                                        onChange={(e) =>
                                          updateVariableConfig(variableId, { color: e.target.value })
                                        }
                                        className="w-8 h-8 rounded border cursor-pointer"
                                      />
                                    </div>
                                  </div>
                                  
                                  {config.enabled && (
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-xs text-gray-600">Y-Min</Label>
                                        <Input
                                          type="number"
                                          value={config.yMin ?? ''}
                                          onChange={(e) =>
                                            updateVariableConfig(variableId, {
                                              yMin: e.target.value ? parseFloat(e.target.value) : undefined
                                            })
                                          }
                                          className="h-7 text-xs"
                                          placeholder="Auto"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs text-gray-600">Y-Max</Label>
                                        <Input
                                          type="number"
                                          value={config.yMax ?? ''}
                                          onChange={(e) =>
                                            updateVariableConfig(variableId, {
                                              yMax: e.target.value ? parseFloat(e.target.value) : undefined
                                            })
                                          }
                                          className="h-7 text-xs"
                                          placeholder="Auto"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
