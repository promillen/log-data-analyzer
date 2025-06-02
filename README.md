
# Log Data Analyzer

A professional web application for analyzing and visualizing time series log data. Built with modern web technologies to provide interactive data exploration and statistical analysis capabilities.

## Features

- **File Upload & Processing**: Support for CSV and Excel files containing time series data
- **Interactive Data Visualization**: Dynamic charts with zoom and pan capabilities using Chart.js
- **Statistical Analysis**: Comprehensive statistics including min, max, average, median, standard deviation, and range
- **Multi-Variable Support**: Analyze multiple variables simultaneously with customizable Y-axis groupings
- **Real-time Configuration**: Enable/disable variables, customize colors, and set axis ranges
- **Responsive Design**: Modern UI built with shadcn/ui components and Tailwind CSS

## Technology Stack

- **Frontend**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and building
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Charts**: Chart.js with zoom and pan plugins
- **Data Processing**: XLSX library for Excel file support
- **Icons**: Lucide React icon library

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn package manager

### Installation

1. Clone the repository:
```bash
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

## Usage

1. **Upload Data**: Click the upload area to select CSV or Excel files containing your time series data
2. **Configure Variables**: Use the dataset controls panel to:
   - Enable/disable specific variables for visualization
   - Customize variable colors
   - Set custom Y-axis ranges
   - Group variables on shared Y-axes
3. **Analyze Data**: View your data in the interactive chart with zoom and pan capabilities
4. **Review Statistics**: Check the statistics panel for detailed numerical analysis of your selected variables

## Data Format

Your data files should contain:
- A datetime column (various formats supported)
- One or more numeric data columns for analysis
- Headers in the first row

## Deployment

This project can be deployed to any static hosting service. The built files are generated in the `dist` directory after running:

```bash
npm run build
```

## Contributing

This project was built with [Lovable](https://lovable.dev), an AI-powered web development platform. You can continue development either:
- Using the Lovable editor at: https://lovable.dev/projects/eb275216-2e90-4554-8c01-9fb958b3e8af
- Locally using your preferred IDE (changes sync automatically with Lovable)

## License

This project is open source and available under the MIT License.
