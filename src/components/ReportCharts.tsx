import '../styles/report-charts.css';

type LineSeries = {
  label: string;
  values: number[];
  color: string;
};

type SimpleLineChartProps = {
  categories: string[];
  series: LineSeries[];
  height?: number;
};

export const SimpleLineChart = ({ categories, series, height = 200 }: SimpleLineChartProps) => {
  if (!categories.length || !series.length) {
    return <div className="chart-placeholder">No chart data</div>;
  }

  const flatValues = series.flatMap((entry) => entry.values);
  const max = Math.max(...flatValues, 0);
  const min = Math.min(...flatValues, 0);
  const range = Math.max(max - min, 1);
  const width = Math.max((categories.length - 1) * 120 + 60, 320);

  const buildPath = (values: number[]) => {
    if (values.length === 1) {
      const y = height - ((values[0] - min) / range) * height;
      const x = width / 2;
      return `M ${x} ${y} L ${x} ${y}`;
    }
    return values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * (width - 60) + 30;
        const y = height - ((value - min) / range) * (height - 20) - 10;
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  return (
    <div className="chart-wrapper">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart">
        <line x1="30" x2={width - 30} y1={height - 10} y2={height - 10} className="chart-axis" />
        <line x1="30" x2="30" y1="10" y2={height - 10} className="chart-axis" />
        {series.map((entry) => (
          <path key={entry.label} d={buildPath(entry.values)} className="chart-line" stroke={entry.color} />
        ))}
      </svg>
      <div className="chart-legend">
        {series.map((entry) => (
          <span key={entry.label} className="chart-legend__item">
            <span className="chart-legend__swatch" style={{ background: entry.color }} />
            {entry.label}
          </span>
        ))}
      </div>
      <div className="chart-xlabels">
        {categories.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
};

type BarDatum = {
  label: string;
  value: number;
  color?: string;
};

type HorizontalBarChartProps = {
  data: BarDatum[];
  total?: number;
};

export const HorizontalBarChart = ({ data, total }: HorizontalBarChartProps) => {
  if (!data.length) {
    return <div className="chart-placeholder">No chart data</div>;
  }
  const computedTotal = total ?? data.reduce((sum, entry) => sum + Math.abs(entry.value), 0);
  return (
    <div className="horizontal-bars">
      {data.map((entry) => {
        const share = computedTotal === 0 ? 0 : (Math.abs(entry.value) / computedTotal) * 100;
        return (
          <div key={entry.label} className="horizontal-bars__row">
            <span className="horizontal-bars__label">{entry.label}</span>
            <div className="horizontal-bars__track" aria-hidden>
              <div
                className="horizontal-bars__value"
                style={{ width: `${share}%`, background: entry.color ?? 'var(--accent-blue)' }}
              />
            </div>
            <span className="horizontal-bars__share">{share.toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  );
};

