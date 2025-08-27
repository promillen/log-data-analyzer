import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Calendar, Layers } from 'lucide-react';

interface TimeFiltersProps {
  selectedDays: number[];
  onSelectedDaysChange: (days: number[]) => void;
  overlayMode: boolean;
  onOverlayModeChange: (overlay: boolean) => void;
}

const WEEKDAYS = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
  { value: 0, label: 'Sunday', short: 'Sun' }
];

export const TimeFilters = ({
  selectedDays,
  onSelectedDaysChange,
  overlayMode,
  onOverlayModeChange
}: TimeFiltersProps) => {
  const handleDayToggle = (day: number, checked: boolean) => {
    if (checked) {
      onSelectedDaysChange([...selectedDays, day]);
    } else {
      onSelectedDaysChange(selectedDays.filter(d => d !== day));
    }
  };

  const selectAllDays = () => {
    onSelectedDaysChange([0, 1, 2, 3, 4, 5, 6]);
  };

  const clearAllDays = () => {
    onSelectedDaysChange([]);
  };

  const selectWeekdays = () => {
    onSelectedDaysChange([1, 2, 3, 4, 5]);
  };

  const selectWeekends = () => {
    onSelectedDaysChange([0, 6]);
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          <CardTitle className="text-lg">Time Filters</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overlay Mode Toggle */}
        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" />
            <Label htmlFor="overlay-mode" className="text-sm font-medium">
              Overlay Mode
            </Label>
          </div>
          <Switch
            id="overlay-mode"
            checked={overlayMode}
            onCheckedChange={onOverlayModeChange}
          />
        </div>
        
        {overlayMode && (
          <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded border-l-4 border-blue-400">
            <strong>Overlay Mode:</strong> Selected days will be overlaid on a 24-hour timeline, allowing comparison of patterns across different dates.
          </div>
        )}

        {/* Day Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Days of Week</Label>
            <Badge variant="outline">
              {selectedDays.length === 0 ? 'All Days' : `${selectedDays.length} selected`}
            </Badge>
          </div>

          {/* Quick Select Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={selectAllDays}
              className="text-xs"
            >
              All
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={selectWeekdays}
              className="text-xs"
            >
              Weekdays
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={selectWeekends}
              className="text-xs"
            >
              Weekends
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={clearAllDays}
              className="text-xs"
            >
              Clear
            </Button>
          </div>

          {/* Day Checkboxes */}
          <div className="grid grid-cols-2 gap-2">
            {WEEKDAYS.map(day => (
              <div key={day.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`day-${day.value}`}
                  checked={selectedDays.includes(day.value)}
                  onCheckedChange={(checked) => handleDayToggle(day.value, checked as boolean)}
                />
                <Label
                  htmlFor={`day-${day.value}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {day.label}
                </Label>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};